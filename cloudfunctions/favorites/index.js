// cloudfunctions/favorites/index.js
// Day 17 · GET  /api/favorites  —— 读收藏列表
// Day 18 · POST /api/favorites  —— 新增收藏（第一个写入接口）
// Day 19 · 重构：把「连库 + 查库」搬到 shared/db.js，本文件只留参数校验与业务判断
//
// ============================================================
// 一、对外契约（完整版见仓库根目录 api-contract.md §3.5 / §3.7）★重构不改契约★
//
//   GET  /api/favorites?limit=N
//     成功 200：{ "ok": true,  "data": [ {id,trendId,title,platform,note,createdAt,updatedAt}, ... ], "count": N }
//
//   POST /api/favorites
//     请求体：{ "trendId": "weibo-1", "title": "标题", "platform": "weibo", "note": "" }
//            必填 trendId / title / platform；note 可选（默认空字符串）
//     成功 201：{ "ok": true, "data": { id, trendId, title, platform, note, createdAt, updatedAt } }
//     重复提交（带同一个 Idempotency-Key）→ 200 + 同一条数据，不产生第二行
//
//   失败一律：{ "ok": false, "error": "人能看懂的中文说明" }   ← error 是字符串（v0.7.0 起）
//   400 参数缺失/格式不对 ｜ 404 热搜不存在 ｜ 409 已经收藏过 ｜ 405 方法不允许 ｜ 500 服务端错误
// ============================================================
//
// ============================================================
// 二、分层之后，这个文件还剩什么（Day 19 的重点）
//
//   ✅ 留在这里（接口层/业务层）：解析请求体、校验必填与格式、判重决策、幂等策略、拼响应、写日志。
//   ❌ 搬走了（数据层 shared/db.js）：`cloudbase.init().rdb({database:"public"})`、
//      `.from("favorites").select(...).eq(...)`、驼峰兜底 `pick`、时间归一化 `toIso`、列清单。
//
//   一句话：**这个文件不再出现任何表名和列名**——想知道收藏表长什么样，去 shared/db.js 看。
//
// ============================================================
// 三、防了哪两种「重复提交 / 错误输入」（Day 18 的成果，重构后行为不变）
//
// ① 业务重复：同一条热搜收藏两次 → 判重键 favorites."trendId" → 409「已经收藏过了」
// ② 手抖连点/超时重试：Idempotency-Key 编进主键 id = fav-idem-<key> → 同键再发返回 200 + 同一条，不多一行
// ③ 错误输入：空 body / 非 JSON / 缺字段（一次列全）/ 类型不对 / 超长 / platform 不在白名单 /
//    trendId 在 trends 表里不存在（404 中文，不让外键约束抛成看不懂的 500）
// ============================================================

"use strict";

// 数据访问层（Day 19）：连库、写查询都在 shared/db.js，由 scripts/sync-shared.js 复制到 lib/db.js
const dao = require("./lib/db");

// ------------------------------------------------------------
// 常量：输入上限与平台白名单
// ------------------------------------------------------------
const MAX_TITLE = 200; // 热搜标题最长 200 字，够用；超了说明是脏数据或攻击
const MAX_NOTE = 200; // 备注同理由
const MAX_TREND_ID = 100; // trends.id 形如 weibo-1，最长也就十几个字符
const PLATFORMS = ["weibo", "baidu", "douyin", "bilibili"];

// ------------------------------------------------------------
// 响应封装：失败时 error 一律是「人能看懂的中文说明」（字符串）
// ------------------------------------------------------------
// CORS：Day 18 为了让「浏览器里直接 POST」能验证（本案例的页面是静态站，域名跟接口不同源），
// 这里对 favorites 开放跨域。当前无用户系统、数据也不敏感，允许所有来源是可以接受的；
// 将来加了登录态，要改成只允许自己的站点域名，并带上凭证相关配置。
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Idempotency-Key",
};

function json(statusCode, payload, extraHeaders) {
  return {
    statusCode: statusCode,
    headers: Object.assign(
      { "Content-Type": "application/json; charset=utf-8" },
      CORS_HEADERS,
      extraHeaders || {}
    ),
    body: JSON.stringify(payload),
  };
}

function ok(statusCode, payload, requestId) {
  return json(statusCode, Object.assign({ ok: true }, payload), {
    "X-Request-Id": requestId,
  });
}

function fail(statusCode, message, requestId) {
  return json(statusCode, { ok: false, error: message }, {
    "X-Request-Id": requestId,
  });
}

// ------------------------------------------------------------
// 服务端日志（Day 18「余力加练」）
//   为什么要有：接口部署在云上，出问题看不到现场；只能靠日志还原「谁在什么时候发了什么、我们怎么处理」。
//   写法：一行一个 JSON（便于 CloudBase 日志检索里按字段搜），带 requestId 把同一次请求串起来。
//   注意：只记必要的定位信息，**不记用户隐私**；note 只记长度不记内容。
// ------------------------------------------------------------
function log(msg, fields) {
  try {
    console.log(
      "[favorites] " +
        JSON.stringify(
          Object.assign(
            {
              ts: new Date().toISOString(),
              msg: msg,
              fn: "favorites",
            },
            fields || {}
          )
        )
    );
  } catch (e) {
    // 日志本身绝不能把接口搞挂
  }
}

function newRequestId() {
  return (
    "req-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 6)
  );
}

// ------------------------------------------------------------
// 小工具（纯请求/响应层面的，跟数据库无关，所以留在本文件）
// ------------------------------------------------------------
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function headerOf(headers, name) {
  if (!headers) return "";
  const target = name.toLowerCase();
  const keys = Object.keys(headers);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === target) return headers[keys[i]];
  }
  return "";
}

/**
 * 解析请求体。
 * 返回：null = 没传 body；undefined = body 不是合法 JSON；否则是对象。
 */
function parseBody(event) {
  const raw = event && event.body;
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "object") return raw; // 网关已经帮忙解析过
  if (typeof raw !== "string") return undefined;
  let text = raw;
  if (event.isBase64Encoded) {
    try {
      text = Buffer.from(raw, "base64").toString("utf8");
    } catch (e) {
      return undefined;
    }
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : undefined;
  } catch (e) {
    return undefined;
  }
}

// 行 → 契约形状。驼峰兜底读值（dao.pick）与时间统一 UTC（dao.toIso）都来自数据访问层。
function shape(row) {
  return {
    id: row.id,
    trendId: dao.pick(row, "trendId"),
    title: row.title,
    platform: row.platform,
    note: row.note == null ? "" : row.note,
    createdAt: dao.toIso(dao.pick(row, "createdAt")),
    updatedAt: dao.toIso(dao.pick(row, "updatedAt")),
  };
}

// ------------------------------------------------------------
// GET：读收藏列表
// ------------------------------------------------------------
async function handleGet(envId, query, requestId) {
  const limitRaw = Number(query.limit);
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : Infinity;

  try {
    // 查询在数据访问层；这里只负责排序与截断
    const rows = (await dao.listFavorites(envId)).slice();
    rows.sort(function (a, b) {
      return String(a.id).localeCompare(String(b.id));
    });

    const data = rows.slice(0, limit).map(shape);
    log("read_done", { requestId: requestId, count: data.length });
    return ok(200, { data: data, count: data.length }, requestId);
  } catch (err) {
    log("read_throw", { requestId: requestId, detail: String((err && err.message) || err) });
    return fail(500, "读取收藏列表失败：" + String((err && err.message) || err), requestId);
  }
}

// ------------------------------------------------------------
// POST：新增收藏
// ------------------------------------------------------------
async function handlePost(envId, event, requestId) {
  const startedAt = Date.now();
  const headers = (event && event.headers) || {};
  const body = parseBody(event);

  log("post_in", {
    requestId: requestId,
    ua: String(headerOf(headers, "user-agent") || "").slice(0, 80),
    hasIdempotencyKey: Boolean(headerOf(headers, "idempotency-key")),
    bodyLen: event && typeof event.body === "string" ? event.body.length : -1,
  });

  // ---- 1. 请求体校验 ----
  if (body === null) {
    return fail(400, "请求体不能为空，请传 JSON，例如 {\"trendId\":\"weibo-1\",\"title\":\"标题\",\"platform\":\"weibo\"}", requestId);
  }
  if (body === undefined) {
    return fail(400, "请求体不是合法的 JSON，请检查格式", requestId);
  }

  // 必填字段：一次把缺的都列出来，别让用户一个个试
  const missing = [];
  ["trendId", "title", "platform"].forEach(function (key) {
    if (!isNonEmptyString(body[key])) missing.push(key);
  });
  if (missing.length > 0) {
    log("reject_missing_fields", { requestId: requestId, missing: missing });
    return fail(400, "缺少必填字段 " + missing.join("、"), requestId);
  }

  // 存在但类型不对，也要说清楚（这里不静默强转，避免「传了数字也能过」的假象）
  const wrongType = [];
  ["trendId", "title", "platform"].forEach(function (key) {
    if (typeof body[key] !== "string") wrongType.push(key);
  });
  if (wrongType.length > 0) {
    return fail(400, wrongType.join("、") + " 必须是字符串", requestId);
  }
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
    return fail(400, "note 必须是字符串", requestId);
  }

  const trendId = body.trendId.trim();
  const title = body.title.trim();
  const platform = body.platform.trim();
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (trendId.length > MAX_TREND_ID) {
    return fail(400, "trendId 太长，最多 " + MAX_TREND_ID + " 个字符", requestId);
  }
  if (title.length > MAX_TITLE) {
    return fail(400, "title 太长，最多 " + MAX_TITLE + " 个字符", requestId);
  }
  if (note.length > MAX_NOTE) {
    return fail(400, "note 太长，最多 " + MAX_NOTE + " 个字符", requestId);
  }
  if (PLATFORMS.indexOf(platform) === -1) {
    return fail(400, "platform 只支持：" + PLATFORMS.join(" / "), requestId);
  }

  // ---- 2. 幂等键（防手抖连点 / 超时重试）----
  let idemKey = String(headerOf(headers, "idempotency-key") || "").trim();
  if (!idemKey && body.clientRequestId !== undefined && body.clientRequestId !== null) {
    idemKey = String(body.clientRequestId).trim();
  }
  let id;
  if (idemKey) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(idemKey)) {
      return fail(400, "Idempotency-Key 只能包含字母、数字、下划线和连字符，且不超过 64 个字符", requestId);
    }
    id = "fav-idem-" + idemKey;
  } else {
    id = "fav-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
  }

  try {
    // ---- 3. 幂等：同一个 key 已经处理过 → 直接回第一次的结果，不再插一行 ----
    if (idemKey) {
      const dupRow = await dao.findFavoriteById(envId, id);
      if (dupRow) {
        log("idempotent_hit", { requestId: requestId, id: id, ms: Date.now() - startedAt });
        return ok(200, { data: shape(dupRow) }, requestId);
      }
    }

    // ---- 4. 这条热搜真的存在吗？（先查再插，避免外键违规变成一句看不懂的 500）----
    const trend = await dao.findTrendById(envId, trendId);
    if (!trend) {
      log("reject_trend_not_found", { requestId: requestId, trendId: trendId });
      return fail(404, "没有找到这条热搜（可能链接已失效）", requestId);
    }

    // ---- 5. 业务判重：同一条热搜收藏两次 → 409 ----
    const existed = await dao.findFavoriteByTrendId(envId, trendId);
    if (existed) {
      log("reject_duplicate_favorite", {
        requestId: requestId,
        trendId: trendId,
        existedId: existed.id,
      });
      return fail(409, "已经收藏过了", requestId);
    }

    // ---- 6. 写入（参数化，不拼 SQL 字符串）----
    const now = new Date().toISOString();
    const row = {
      id: id,
      trendId: trendId,
      title: title,
      platform: platform,
      note: note,
      createdAt: now,
      updatedAt: now,
    };
    const ins = await dao.insertFavorite(envId, row);
    if (!ins.ok) {
      const msg = String((ins.error && ins.error.message) || ins.error);
      // 并发下两个同 key 请求同时插 → 后到的会撞主键；这不是错误，按幂等处理
      if (idemKey && /duplicate|unique|already exists|conflict/i.test(msg)) {
        const dupRow = await dao.findFavoriteById(envId, id);
        if (dupRow) {
          log("idempotent_race_hit", { requestId: requestId, id: id, ms: Date.now() - startedAt });
          return ok(200, { data: shape(dupRow) }, requestId);
        }
      }
      log("insert_failed", { requestId: requestId, detail: msg });
      return fail(500, "收藏写入失败：" + msg, requestId);
    }

    // ---- 7. 写回读一遍：既保证返回的就是库里的真实值，也顺手验证「真的写进去了」----
    const back = await dao.findFavoriteById(envId, id);
    if (!back) {
      log("insert_but_readback_empty", { requestId: requestId, id: id });
      return fail(500, "收藏写入后读不回来，请稍后重试", requestId);
    }

    log("created", {
      requestId: requestId,
      id: id,
      trendId: trendId,
      platform: platform,
      noteLen: note.length,
      ms: Date.now() - startedAt,
    });
    return ok(201, { data: shape(back) }, requestId);
  } catch (err) {
    log("post_throw", { requestId: requestId, detail: String((err && err.message) || err) });
    return fail(500, "收藏失败：" + String((err && err.message) || err), requestId);
  }
}

/**
 * 云函数入口。
 * event  ：HTTP 访问服务把请求放进这里；method 在 event.httpMethod（个别网关是 event.method）。
 * context：运行时上下文，context.namespace 就是当前环境 ID（不用写死在代码里）。
 */
exports.main = async (event, context) => {
  const envId = (context && context.namespace) || "";
  const e = event || {};
  const method = String(e.httpMethod || e.method || "GET").toUpperCase();
  const query = e.queryStringParameters || {};
  const requestId = newRequestId();

  // 浏览器的跨域预检（POST 带自定义头时一定会有），直接放行
  if (method === "OPTIONS") return json(204, {}, {});

  if (method === "GET") return handleGet(envId, query, requestId);
  if (method === "POST") return handlePost(envId, e, requestId);

  log("reject_method", { requestId: requestId, method: method });
  return fail(405, "只支持 GET 和 POST 两种方法", requestId);
};
