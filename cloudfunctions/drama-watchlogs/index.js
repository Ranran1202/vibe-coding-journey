// cloudfunctions/drama-watchlogs/index.js
// GET /api/drama/watch-logs —— AI 漫剧线的**记录表**读取接口
//
// 它在整个作品里的位置：
//   drama_episodes 是「内容本体」，这张表记录的是**用户行为**——一次观看 = 一次打卡。
//   它回答的问题是：哪几集被看过？看了几次？最近一次是什么时候？
//   （对应打卡应用的 checkins：没有它，就只有「计划」没有「执行记录」。）
//
// 完整契约见 ai-drama/api-contract.md §3.2
//
// 与核心表接口一样守住两条：
//   ① SQL 参数化（SDK 查询构造器，不拼字符串）；
//   ② 列名加双引号（"episodeId" / "watchedAt" 都是驼峰，会被折叠成小写）。

"use strict";

const cloudbase = require("@cloudbase/node-sdk");

let dbClient = null;
function getDb(envId) {
  if (!dbClient) {
    dbClient = cloudbase.init({ env: envId }).rdb({ database: "public" });
  }
  return dbClient;
}

function reply(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  };
}

function ok(data) {
  return reply(200, { ok: true, data: data, count: data.length, error: null });
}

function fail(statusCode, message) {
  return reply(statusCode, { ok: false, data: null, error: message });
}

/**
 * 云函数入口。
 * event  ：HTTP 访问服务把请求放进这里，查询参数在 event.queryStringParameters。
 * context：运行时上下文，context.namespace 就是当前环境 ID。
 */
exports.main = async (event, context) => {
  const envId = (context && context.namespace) || "";
  const query = (event && event.queryStringParameters) || {};

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
    let q = getDb(envId)
      .from("drama_watch_logs")
      .select('"id","episodeId","viewer","progress","device","watchedAt"');

    if (episodeId) q = q.eq("episodeId", episodeId); // 参数化筛选
    if (viewer) q = q.eq("viewer", viewer);

    // 按观看时间倒序：最近的一次排最前 —— 「回看过去」的入口
    q = q.order("watchedAt", { ascending: false });

    const res = await q;
    if (res.error) {
      return fail(500, "读取观看记录失败：" + (res.error.message || "数据库返回了错误"));
    }

    const rows = Array.isArray(res.data) ? res.data : [];

    // 驼峰列兜底：万一网关把 episodeId 折叠成 episodeid，这里同时认两种写法，
    // 避免字段静默变成 undefined（这种失败不报错，最容易被当成「接口没问题」）。
    function pick(row, camelKey) {
      if (row[camelKey] !== undefined && row[camelKey] !== null) return row[camelKey];
      return row[camelKey.toLowerCase()];
    }

    const data = rows.map(function (r) {
      return {
        id: r.id,
        episodeId: pick(r, "episodeId"),
        viewer: r.viewer == null ? "" : r.viewer,
        progress: r.progress == null ? 0 : r.progress,
        device: r.device == null ? "" : r.device,
        watchedAt: pick(r, "watchedAt"),
      };
    });

    return ok(limit ? data.slice(0, limit) : data);
  } catch (err) {
    return fail(500, "读取观看记录失败：" + String((err && err.message) || err));
  }
};
