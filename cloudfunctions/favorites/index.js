// cloudfunctions/favorites/index.js
// Day 17 · GET  /api/favorites  —— 读收藏列表（已实现）
// Day 18 · POST /api/favorites  —— 新增收藏（今天的主角：第一个写入接口）
//
// ============================================================
// 一、对外契约（完整版见仓库根目录 api-contract.md §3.5 / §3.7）
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
// 二、今天防的是哪两种「重复提交 / 错误输入」（核心题答案）
//
// ① 业务上的重复：同一条热搜收藏两次
//    判重键 = favorites."trendId"（一条热搜只能有一条收藏，跟前端 store.js 的收藏键语义一致）。
//    先查后插 → 命中就返回 409 + 中文「已经收藏过了」，库里不会出现两行指向同一热搜的记录。
//
// ② 手抖连点 / 网络重试：同一个请求被提交两次
//    客户端可带请求头 Idempotency-Key（或请求体 clientRequestId，二选一）。
//    服务端把它编进主键：id = "fav-idem-<key>"。
//    第二次带同一个 key 进来 → 主键已存在 → 直接把第一次那条读出来返回 200，
//    **既不重复插入，也不报错**（幂等：同样的请求，效果等于只做一次）。
//    这样连点两下、前端超时自动重试，都不会多出一行脏数据。
//
// ③ 顺带挡住的错误输入：body 不是 JSON / 缺字段 / 字段类型不对 / 超长 /
//    platform 不在白名单 / trendId 在 trends 表里根本不存在（挡住外键报错，给中文 404）。
// ============================================================
//
// ============================================================
// 三、连库姿势（本项目踩过坑，别改）
//    app.rdb({ database: "public" }) —— database 参数其实是 PostgreSQL 的 **schema 名**，
//    不传时默认取 envId，而 envId 不是合法 schema → 上游报 Invalid schema → 接口 500。
//    写入同样用 SDK 的构造器（.insert() / .select().eq()），不拼 SQL 字符串，因此没有注入面。
// ============================================================

"use strict";

const cloudbase = require("@cloudbase/node-sdk");

// 数据库客户端做模块级缓存：云函数实例复用时不必每次重新 init。
let dbClient = null;
function getDb(envId) {
  if (!dbClient) {
    dbClient = cloudbase.init({ env: envId }).rdb({ database: "public" });
  }
  return dbClient;
}

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
// 小工具
// ------------------------------------------------------------
// favorites 表里有三个驼峰列名（trendId / createdAt / updatedAt）。
// PostgreSQL 会把没加双引号的标识符折叠成小写；稳妥起见读值时两种写法都认，
// 避免真·驼峰被悄悄改成 trendid 而接口静默返回 undefined（这种失败不报错，最难查）。
function pick(row, camelKey) {
  if (row[camelKey] !== undefined && row[camelKey] !== null) return row[camelKey];
  return row[camelKey.toLowerCase()];
}

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

// 时间统一序列化成 ISO 8601 **UTC**（形如 2026-10-08T11:51:34.442Z），跟契约 §1.4 一致。
// 不这么做的话，PostgreSQL 的 TIMESTAMPTZ 会原样吐出 '2026-10-08T19:51:34.442+08:00'
// （会话时区是 +08），语义等价但格式跟契约示例对不上，前端若按字符串比较/排序就会踩坑。
function toIso(v) {
  if (v === null || v === undefined || v === "") return v === undefined ? null : v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function shape(row) {
  return {
    id: row.id,
    trendId: pick(row, "trendId"),
    title: row.title,
    platform: row.platform,
    note: row.note == null ? "" : row.note,
    createdAt: toIso(pick(row, "createdAt")),
    updatedAt: toIso(pick(row, "updatedAt")),
  };
}

const FAV_COLUMNS =
  '"id","trendId","title","platform","note","createdAt","updatedAt"';

// ------------------------------------------------------------
// GET：读收藏列表（Day 17 已实现，逻辑不变，只把失败响应统一成字符串 error）
// ------------------------------------------------------------
async function handleGet(envId, query, requestId) {
  const limitRaw = Number(query.limit);
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : Infinity;

  try {
    const res = await getDb(envId).from("favorites").select(FAV_COLUMNS);
    if (res.error) {
      log("db_error_on_read", { requestId: requestId, detail: String(res.error.message || res.error) });
      return fail(500, "读取收藏列表失败：" + (res.error.message || "数据库返回了错误"), requestId);
    }

    const rows = (Array.isArray(res.data) ? res.data : []).slice();
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
// POST：新增收藏（今天的主任务）
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
    const db = getDb(envId);

    // ---- 3. 幂等：同一个 key 已经处理过 → 直接回第一次的结果，不再插一行 ----
    if (idemKey) {
      const dup = await db.from("favorites").select(FAV_COLUMNS).eq("id", id);
      if (!dup.error && Array.isArray(dup.data) && dup.data.length > 0) {
        log("idempotent_hit", { requestId: requestId, id: id, ms: Date.now() - startedAt });
        return ok(200, { data: shape(dup.data[0]) }, requestId);
      }
    }

    // ---- 4. 这条热搜真的存在吗？（先查再插，避免外键违规变成一句看不懂的 500）----
    const trend = await db.from("trends").select('"id","title","platform"').eq("id", trendId);
    if (trend.error) {
      return fail(500, "查询热搜失败：" + (trend.error.message || "数据库返回了错误"), requestId);
    }
    if (!Array.isArray(trend.data) || trend.data.length === 0) {
      log("reject_trend_not_found", { requestId: requestId, trendId: trendId });
      return fail(404, "没有找到这条热搜（可能链接已失效）", requestId);
    }

    // ---- 5. 业务判重：同一条热搜收藏两次 → 409 ----
    const existed = await db.from("favorites").select('"id","trendId"').eq("trendId", trendId);
    if (existed.error) {
      return fail(500, "查询收藏失败：" + (existed.error.message || "数据库返回了错误"), requestId);
    }
    if (Array.isArray(existed.data) && existed.data.length > 0) {
      log("reject_duplicate_favorite", {
        requestId: requestId,
        trendId: trendId,
        existedId: existed.data[0].id,
      });
      return fail(409, "已经收藏过了", requestId);
    }

    // ---- 6. 写入（构造器写法，不拼 SQL 字符串）----
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
    const ins = await db.from("favorites").insert(row);
    if (ins.error) {
      const msg = String(ins.error.message || ins.error);
      // 并发下两个同 key 请求同时插 → 后到的会撞主键；这不是错误，按幂等处理
      if (idemKey && /duplicate|unique|already exists|conflict/i.test(msg)) {
        const dup = await db.from("favorites").select(FAV_COLUMNS).eq("id", id);
        if (!dup.error && Array.isArray(dup.data) && dup.data.length > 0) {
          log("idempotent_race_hit", { requestId: requestId, id: id, ms: Date.now() - startedAt });
          return ok(200, { data: shape(dup.data[0]) }, requestId);
        }
      }
      log("insert_failed", { requestId: requestId, detail: msg });
      return fail(500, "收藏写入失败：" + msg, requestId);
    }

    // ---- 7. 写回读一遍：既保证返回的就是库里的真实值，也顺手验证「真的写进去了」----
    const back = await db.from("favorites").select(FAV_COLUMNS).eq("id", id);
    if (back.error || !Array.isArray(back.data) || back.data.length === 0) {
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
    return ok(201, { data: shape(back.data[0]) }, requestId);
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
