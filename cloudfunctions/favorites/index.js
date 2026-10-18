// cloudfunctions/favorites/index.js
// Day 17 · GET  /api/favorites  —— 读收藏列表
// Day 18 · POST /api/favorites  —— 新增收藏（第一个写入接口）
// Day 22 · PATCH /api/favorites/:id —— 改收藏备注（软更新的典型：只动 note + updatedAt）
// Day 22 · DELETE /api/favorites/:id —— 取消收藏（★软删除：只打 is_deleted 标记，不真删，删错可找回）
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
//   PATCH /api/favorites/:id
//     路径参数：收藏记录 id（如 fav-xxxx）；请求体：{ "note": "新备注" }
//     成功 200：{ "ok": true, "data": { id, trendId, title, platform, note, createdAt, updatedAt } }（note 已更新）
//     找不到该 id → 404「收藏不存在」
//
//   DELETE /api/favorites/:id
//     路径参数：收藏记录 id；无请求体
//     成功 200：{ "ok": true, "data": { "id": "fav-xxxx", "deleted": true, "softDeleted": true } }
//     ★ 软删除：只把 is_deleted 置 true，数据不真删，删错用 db/recover_favorite.sql 找回；GET 列表自动跳过
//     找不到该 id → 404「收藏不存在」
//

//   失败一律：{ "ok": false, "data": null, "error": "人能看懂的中文说明" }   ← 三键恒定（Day 23 补齐 data）
//   400 参数缺失/格式不对 ｜ 404 热搜不存在 ｜ 409 已经收藏过 ｜ 405 方法不允许 ｜ 500 服务端错误
//   Day 23 安全审计：500 不再把数据库原始报错（可能是英文）透传给前端，
//   原文只进 log() 日志（带 requestId），用户只看到「……失败，请稍后重试」。
// ============================================================
//
// ============================================================
// 二、分层之后，这个文件还剩什么（Day 19 分层、Day 20 按表细拆）
//
//   ✅ 留在这里（接口层/业务层）：解析请求体、校验必填与格式、判重决策、幂等策略、拼响应、写日志。
//   ❌ 搬走了（数据访问层）：`cloudbase.init().rdb({database:"public"})`、
//      `.from("favorites").select(...).eq(...)`、列清单、驼峰兜底 `pick`、时间归一化 `toIso`。
//      收藏表 → shared/favoritesRepository.js；确认热搜存在 → shared/trendsRepository.js。
//
//   一句话：**这个文件不再出现任何 SQL 查询**——想知道收藏表怎么查，去 shared/favoritesRepository.js。
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

// 数据访问层（Day 20 按表拆分）：收藏表的查询在 favoritesRepository，
// 确认热搜存在要用 trendsRepository（跨表的一次只读检查）。
// 两者都由 scripts/sync-shared.js 复制到本目录的 lib/ 下。
const favoritesRepository = require("./lib/favoritesRepository");
const trendsRepository = require("./lib/trendsRepository");

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
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
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
  return json(statusCode, { ok: false, data: null, error: message }, {
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

// 从请求路径解析收藏 id：CloudBase HTTP 访问服务把请求路径放进 event.path，
// 但绑定前缀可能被网关剥离，所以这里兼容多种形态：
//   /api/favorites/fav-xxxx  → 取 favorites 之后那段
//   /favorites/fav-xxxx      → 剥离了 /api 前缀
//   /fav-xxxx                → 整段前缀都被剥离（直接取最后一段）
function parseIdFromPath(event) {
  const raw =
    (event && (event.path || (event.requestContext && event.requestContext.path))) || "";
  const p = String(raw).replace(/\/+$/, "");
  const m1 = p.match(/\/api\/favorites\/(.+)$/);
  if (m1) return safeDecode(m1[1]);
  const m2 = p.match(/\/favorites\/(.+)$/);
  if (m2) return safeDecode(m2[1]);
  const segs = p.split("/").filter(Boolean);
  const last = segs[segs.length - 1];
  if (last && last !== "favorites") return safeDecode(last);
  return null;
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch (e) {
    return s;
  }
}

// 行 → 契约形状的归一化（驼峰兜底、时间统一 UTC、note 兜底空串）
// Day 20 起下沉到 favoritesRepository：它返回的行已经是这个形状，接口层直接用，不再做字段处理。

// ------------------------------------------------------------
// GET：读收藏列表
// ------------------------------------------------------------
async function handleGet(envId, query, requestId) {
  const limitRaw = Number(query.limit);
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : Infinity;

  try {
    // 查询在 favoritesRepository（返回的行已是契约形状）；这里只负责排序与截断
    const rows = (await favoritesRepository.listFavorites(envId)).slice();
    rows.sort(function (a, b) {
      return String(a.id).localeCompare(String(b.id));
    });

    const data = rows.slice(0, limit);
    log("read_done", { requestId: requestId, count: data.length });
    return ok(200, { data: data, count: data.length }, requestId);
  } catch (err) {
    log("read_throw", { requestId: requestId, detail: String((err && err.message) || err) });
    return fail(500, "读取收藏列表失败，请稍后重试", requestId);
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
      const dupRow = await favoritesRepository.findFavoriteById(envId, id);
      if (dupRow) {
        log("idempotent_hit", { requestId: requestId, id: id, ms: Date.now() - startedAt });
        return ok(200, { data: dupRow }, requestId);
      }
    }

    // ---- 4. 这条热搜真的存在吗？（先查再插，避免外键违规变成一句看不懂的 500）----
    const trend = await trendsRepository.findTrendById(envId, trendId);
    if (!trend) {
      log("reject_trend_not_found", { requestId: requestId, trendId: trendId });
      return fail(404, "没有找到这条热搜（可能链接已失效）", requestId);
    }

    // ---- 5. 业务判重：同一条热搜收藏两次 → 409 ----
    const existed = await favoritesRepository.findFavoriteByTrendId(envId, trendId);
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
    const ins = await favoritesRepository.insertFavorite(envId, row);
    if (!ins.ok) {
      const msg = String((ins.error && ins.error.message) || ins.error);
      // 并发下两个同 key 请求同时插 → 后到的会撞主键；这不是错误，按幂等处理
      if (idemKey && /duplicate|unique|already exists|conflict/i.test(msg)) {
        const dupRow = await favoritesRepository.findFavoriteById(envId, id);
        if (dupRow) {
          log("idempotent_race_hit", { requestId: requestId, id: id, ms: Date.now() - startedAt });
          return ok(200, { data: dupRow }, requestId);
        }
      }
      log("insert_failed", { requestId: requestId, detail: msg });
      return fail(500, "收藏写入失败，请稍后重试", requestId);
    }

    // ---- 7. 写回读一遍：既保证返回的就是库里的真实值，也顺手验证「真的写进去了」----
    const back = await favoritesRepository.findFavoriteById(envId, id);
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
    return ok(201, { data: back }, requestId);
  } catch (err) {
    log("post_throw", { requestId: requestId, detail: String((err && err.message) || err) });
    return fail(500, "收藏失败，请稍后重试", requestId);
  }
}

// ------------------------------------------------------------
// PATCH：改收藏备注（Day 22）
// ------------------------------------------------------------
async function handlePatch(envId, event, id, requestId) {
  if (!id) {
    return fail(400, "路径缺少收藏 id，应为 /api/favorites/<id>", requestId);
  }

  const body = parseBody(event);
  if (body === null || body === undefined) {
    return fail(400, "请求体不能为空，请传 JSON，例如 {\"note\":\"新备注\"}", requestId);
  }
  if (typeof body.note !== "string") {
    return fail(400, "note 必填且必须是字符串", requestId);
  }
  const note = body.note.trim();
  if (note.length > MAX_NOTE) {
    return fail(400, "note 太长，最多 " + MAX_NOTE + " 个字符", requestId);
  }

  try {
    // 先查：这条收藏还在吗？（软删除行会被 visible() 过滤掉，查不到就按不存在处理）
    const existed = await favoritesRepository.findFavoriteById(envId, id);
    if (!existed) {
      log("patch_not_found", { requestId: requestId, id: id });
      return fail(404, "收藏不存在", requestId);
    }
    const before = existed.note;

    // 只改 note + updatedAt；.select() 让网关直接返回更新后的行
    const upd = await favoritesRepository.updateFavorite(envId, id, {
      note: note,
      updatedAt: new Date().toISOString(),
    });
    if (!upd.ok) {
      const msg = String((upd.error && upd.error.message) || upd.error);
      log("patch_failed", { requestId: requestId, id: id, detail: msg });
      return fail(500, "修改备注失败，请稍后重试", requestId);
    }

    log("patched", {
      requestId: requestId,
      id: id,
      beforeLen: before.length,
      afterLen: note.length,
    });
    return ok(200, { data: upd.row }, requestId);
  } catch (err) {
    log("patch_throw", { requestId: requestId, detail: String((err && err.message) || err) });
    return fail(500, "修改备注失败，请稍后重试", requestId);
  }
}

// ------------------------------------------------------------
// DELETE：取消收藏（Day 22 · 软删除）
//   为什么删除比新增更容易出事？新增顶多重了/重复了，可判重可忽略；删除一旦真删，数据就没了，
//   还可能在别的关联处留下缺口。所以这里的三重「确认」：
//     ① 必须精确指定 id（路径参数），绝不批量删；
//     ② 删前先查，不存在就 404，不静默成功；
//     ③ 软删除 —— 只打 is_deleted 标记，数据不真删，删错用 db/recover_favorite.sql 翻回 false 找回。
// ------------------------------------------------------------
async function handleDelete(envId, id, requestId) {
  if (!id) {
    return fail(400, "路径缺少收藏 id，应为 /api/favorites/<id>", requestId);
  }

  try {
    const existed = await favoritesRepository.findFavoriteById(envId, id);
    if (!existed) {
      log("delete_not_found", { requestId: requestId, id: id });
      return fail(404, "收藏不存在", requestId);
    }

    const del = await favoritesRepository.softDeleteFavorite(envId, id);
    if (!del.ok) {
      const msg = String((del.error && del.error.message) || del.error);
      log("delete_failed", { requestId: requestId, id: id, detail: msg });
      return fail(500, "取消收藏失败，请稍后重试", requestId);
    }

    log("soft_deleted", { requestId: requestId, id: id });
    return ok(200, { data: { id: id, deleted: true, softDeleted: true } }, requestId);
  } catch (err) {
    log("delete_throw", { requestId: requestId, detail: String((err && err.message) || err) });
    return fail(500, "取消收藏失败，请稍后重试", requestId);
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

  // 浏览器的跨域预检（PATCH/DELETE 带自定义头时一定会有），直接放行
  if (method === "OPTIONS") return json(204, {}, {});

  // PATCH / DELETE 都带路径参数 /api/favorites/:id，先解析出 id
  const id = parseIdFromPath(e);

  if (method === "GET") return handleGet(envId, query, requestId);
  if (method === "POST") return handlePost(envId, e, requestId);
  if (method === "PATCH") return handlePatch(envId, e, id, requestId);
  if (method === "DELETE") return handleDelete(envId, id, requestId);

  log("reject_method", { requestId: requestId, method: method });
  return fail(405, "只支持 GET、POST、PATCH、DELETE 四种方法", requestId);
};
