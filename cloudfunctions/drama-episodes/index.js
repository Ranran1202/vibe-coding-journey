// cloudfunctions/drama-episodes/index.js
// GET /api/drama/episodes —— AI 漫剧线的**第一个读取接口**（核心表）
//
// 它在整个作品里的位置：
//   漫剧站此前是纯静态站，剧集数据写在 ai-drama/assets/js/data.js 的前端常量里
//   （换设备、清缓存就没了）。今天把 6 集内容落进 drama_episodes 表，
//   这个接口让页面第一次从**自己的数据库**里读出真实内容。
//
// 完整契约见 ai-drama/api-contract.md §3.1
//
// ============================================================
// 两条必须守住的规则
//
// 1) 【SQL 必须参数化】
//    云函数里**不手写 SQL 字符串**，一律用官方 SDK 的查询构造器
//    （PostgREST 风格）：.from().select().eq().order().limit()
//    筛选值由 SDK 走 HTTP 参数传给数据网关，不存在字符串拼 SQL，因此没有注入面。
//
// 2) 【列名一律加英文双引号】
//    "order" 既是驼峰敏感列又是 SQL 保留字；不加引号 PostgreSQL 会折叠成小写/直接语法错误，
//    接口返回的 JSON 键就会跟契约对不上。
// ============================================================

"use strict";

// 数据访问层（Day 19 重构）：连库、写查询、cast 归一化都在 shared/db.js（复制到 lib/db.js）
const dao = require("./lib/db");

// 统一响应：三个键恒定出现（ok / data / error），与契约 §1.2 完全一致
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

  // ---- 参数校验 ----
  const status = query.status ? String(query.status) : null;

  let limit = null;
  if (query.limit !== undefined && query.limit !== null && query.limit !== "") {
    const n = Number(query.limit);
    if (!Number.isInteger(n) || n <= 0) {
      return fail(400, "limit 必须是正整数，例如 limit=3");
    }
    limit = Math.min(n, 100);
  }

  try {
    // 查询、按集数排序、cast 归一化都在数据访问层，这里只按契约截断条数
    const data = await dao.listEpisodes(envId, { status: status });
    return ok(limit ? data.slice(0, limit) : data);
  } catch (err) {
    return fail(500, "读取剧集数据失败：" + String((err && err.message) || err));
  }
};
