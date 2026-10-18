// cloudfunctions/drama-watchlogs/index.js
// GET    /api/drama/watch-logs      —— AI 漫剧线「记录表」读取接口
// Day 22 PATCH  /api/drama/watch-logs/:id —— 改一条观看记录（只允许 progress / device）
// Day 22 DELETE /api/drama/watch-logs/:id —— 删除一条观看记录（硬删除）
//
// 它在整个作品里的位置：
//   drama_episodes 是「内容本体」，这张表记录的是**用户行为**——一次观看 = 一次打卡。
//   它回答的问题是：哪几集被看过？看了几次？最近一次是什么时候？
//   （对应打卡应用的 checkins：没有它，就只有「计划」没有「执行记录」。）
//
// 完整契约见 ai-drama/api-contract.md §3.2 / §3.3 / §3.4
//
// 与核心表接口一样守住两条：
//   ① SQL 参数化（SDK 查询构造器，不拼字符串）；
//   ② 列名加双引号（"episodeId" / "watchedAt" 都是驼峰，会被折叠成小写）。

"use strict";

// 数据访问层（Day 20 按表拆分）：drama_watch_logs 表的查询、按观看时间倒序、驼峰列兜底
// 全部在 shared/dramaWatchLogsRepository.js（复制到本目录 lib/ 下）
const watchLogsRepository = require("./lib/dramaWatchLogsRepository");

function reply(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  };
}

// 列表类成功：带 count
function ok(data) {
  return reply(200, { ok: true, data: data, count: data.length, error: null });
}

// 单对象成功（PATCH 返回更新后的行 / DELETE 返回 {id,deleted}）：不带 count
function okObj(obj) {
  return reply(200, { ok: true, data: obj, error: null });
}

function fail(statusCode, message) {
  return reply(statusCode, { ok: false, data: null, error: message });
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

// 从请求路径解析记录 id：CloudBase HTTP 访问服务可能剥离绑定前缀，
// 兼容 /api/drama/watch-logs/<id>、/watch-logs/<id>、/<id> 三种形态。
function parseIdFromPath(event) {
  const raw = (event && (event.path || (event.requestContext && event.requestContext.path))) || "";
  const p = String(raw).replace(/\/+$/, "");
  const m1 = p.match(/\/api\/drama\/watch-logs\/(.+)$/);
  if (m1) return safeDecode(m1[1]);
  const m2 = p.match(/\/watch-logs\/(.+)$/);
  if (m2) return safeDecode(m2[1]);
  const segs = p.split("/").filter(Boolean);
  const last = segs[segs.length - 1];
  if (last && last !== "watch-logs") return safeDecode(last);
  return null;
}

/** 解析请求体：null = 没传；undefined = 不是合法 JSON；否则对象。 */
function parseBody(event) {
  const raw = event && event.body;
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return undefined;
  let text = raw;
  if (event.isBase64Encoded) {
    try { text = Buffer.from(raw, "base64").toString("utf8"); } catch (e) { return undefined; }
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch (e) {
    return undefined;
  }
}

// ------------------------------------------------------------
// PATCH：改一条观看记录（Day 22）
//   可改字段按契约：progress（0-100 整数，即「完成状态/进度」）、device（自由文本，兼作来源/备注）。
//   至少改其中一个；其它字段（id/episodeId/viewer/watchedAt）不允许改。
// ------------------------------------------------------------
async function handlePatch(envId, event, id) {
  if (!id) return fail(400, "路径缺少记录 id，应为 /api/drama/watch-logs/<id>");

  const body = parseBody(event);
  if (body === null || body === undefined) {
    return fail(400, "请求体不能为空，请传 JSON，例如 {\"progress\":88,\"device\":\"Edge / Windows\"}");
  }

  const hasProgress = body.progress !== undefined;
  const hasDevice = body.device !== undefined;
  if (!hasProgress && !hasDevice) {
    return fail(400, "没有可修改的字段，目前只支持修改 progress（0-100）和 device");
  }

  const patch = {};
  if (hasProgress) {
    const p = Number(body.progress);
    if (!Number.isInteger(p) || p < 0 || p > 100) {
      return fail(400, "progress 必须是 0-100 的整数");
    }
    patch.progress = p;
  }
  if (hasDevice) {
    if (typeof body.device !== "string") {
      return fail(400, "device 必须是字符串");
    }
    patch.device = body.device;
  }

  try {
    const existed = await watchLogsRepository.findWatchLogById(envId, id);
    if (!existed) return fail(404, "观看记录不存在");
    const upd = await watchLogsRepository.updateWatchLog(envId, id, patch);
    if (!upd.ok) {
      console.error("[drama-watchlogs] patch_failed " + JSON.stringify({ id: id, detail: String((upd.error && upd.error.message) || upd.error) }));
      return fail(500, "修改观看记录失败，请稍后重试");
    }
    return okObj(upd.row);
  } catch (err) {
    console.error("[drama-watchlogs] patch_throw " + JSON.stringify({ id: id, detail: String((err && err.message) || err) }));
    return fail(500, "修改观看记录失败，请稍后重试");
  }
}

// ------------------------------------------------------------
// DELETE：删除一条观看记录（Day 22 · 硬删除）
//   本线未选软删除（没有 is_deleted 列），故这里是真删除，删错不可找回。
// ------------------------------------------------------------
async function handleDelete(envId, id) {
  if (!id) return fail(400, "路径缺少记录 id，应为 /api/drama/watch-logs/<id>");
  try {
    const existed = await watchLogsRepository.findWatchLogById(envId, id);
    if (!existed) return fail(404, "观看记录不存在");
    const del = await watchLogsRepository.deleteWatchLog(envId, id);
    if (!del.ok) {
      console.error("[drama-watchlogs] delete_failed " + JSON.stringify({ id: id, detail: String((del.error && del.error.message) || del.error) }));
      return fail(500, "删除观看记录失败，请稍后重试");
    }
    return okObj({ id: id, deleted: true });
  } catch (err) {
    console.error("[drama-watchlogs] delete_throw " + JSON.stringify({ id: id, detail: String((err && err.message) || err) }));
    return fail(500, "删除观看记录失败，请稍后重试");
  }
}

/**
 * 云函数入口。
 * event  ：HTTP 访问服务把请求放进这里，查询参数在 event.queryStringParameters，方法在 event.httpMethod。
 * context：运行时上下文，context.namespace 就是当前环境 ID。
 */
exports.main = async (event, context) => {
  const envId = (context && context.namespace) || "";
  const e = event || {};
  const method = String(e.httpMethod || e.method || "GET").toUpperCase();
  const query = (e.queryStringParameters) || {};
  const id = parseIdFromPath(e);

  if (method === "GET") {
    const episodeId = query.episodeId ? String(query.episodeId) : null;
    const viewer = query.viewer ? String(query.viewer) : null;

    let limit = null;
    if (query.limit !== undefined && query.limit !== null && query.limit !== "") {
      const n = Number(query.limit);
      if (!Number.isInteger(n) || n <= 0) {
        return fail(400, "limit 必须是正整数，例如 limit=5");
      }
      limit = Math.min(n, 100);
    }

    try {
      // 查询、按观看时间倒序、驼峰列兜底都在 watchLogsRepository，这里只按契约截断条数
      const data = await watchLogsRepository.listWatchLogs(envId, {
        episodeId: episodeId,
        viewer: viewer,
      });
      return ok(limit ? data.slice(0, limit) : data);
    } catch (err) {
      console.error("[drama-watchlogs] read_throw " + JSON.stringify({ detail: String((err && err.message) || err) }));
      return fail(500, "读取观看记录失败，请稍后重试");
    }
  }

  if (method === "PATCH") return handlePatch(envId, e, id);
  if (method === "DELETE") return handleDelete(envId, id);

  return fail(405, "只支持 GET、PATCH、DELETE 三种方法");
};
