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

const cloudbase = require("@cloudbase/node-sdk");

let dbClient = null;
function getDb(envId) {
  if (!dbClient) {
    // database 参数其实是 PostgreSQL 的 **schema 名**，不传默认取 envId → Invalid schema → 500
    dbClient = cloudbase.init({ env: envId }).rdb({ database: "public" });
  }
  return dbClient;
}

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
    // ---- 参数化查询（构造器写法，无 SQL 字符串拼接）----
    let q = getDb(envId)
      .from("drama_episodes")
      .select('"id","order","title","status","duration","durationSec","summary","scene","videoUrl","cast","updatedAt"');

    if (status) q = q.eq("status", status);
    q = q.order("order", { ascending: true }); // 按第几集升序

    const res = await q;
    if (res.error) {
      return fail(500, "读取剧集数据失败：" + (res.error.message || "数据库返回了错误"));
    }

    let rows = Array.isArray(res.data) ? res.data : [];

    // cast 在库里是 JSONB，正常情况下 SDK 直接给数组；
    // 万一网关把它序列化成字符串，这里兜一下，避免前端拿到 "[object Object]" 或字符串。
    const data = rows.map(function (r) {
      let cast = r.cast;
      if (typeof cast === "string") {
        try {
          cast = JSON.parse(cast);
        } catch (e) {
          cast = [];
        }
      }
      return {
        id: r.id,
        order: r.order,
        title: r.title,
        status: r.status,
        duration: r.duration == null ? "" : r.duration,
        durationSec: r.durationSec == null ? 0 : r.durationSec,
        summary: r.summary == null ? "" : r.summary,
        scene: r.scene == null ? "" : r.scene,
        videoUrl: r.videoUrl == null ? "" : r.videoUrl,
        cast: Array.isArray(cast) ? cast : [],
        updatedAt: r.updatedAt,
      };
    });

    return ok(limit ? data.slice(0, limit) : data);
  } catch (err) {
    return fail(500, "读取剧集数据失败：" + String((err && err.message) || err));
  }
};
