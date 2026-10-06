// cloudfunctions/favorites/index.js
// Day 17 · 第二个读取接口：GET /api/favorites
//
// 它在整个作品里的位置：
//   「我的收藏」视图（#/fav）目前读的是浏览器 localStorage，刷新只在本地、换设备就没了。
//   今天这个接口先把收藏列表从库里读出来；写接口（新增/取消收藏）留到 Day 18。
//
// 对外接口：GET /api/favorites?limit=   （完整契约见仓库根目录 api-contract.md §3.5）
// 成功返回：{ "ok": true, "data": [ {id,trendId,title,platform,note,createdAt,updatedAt}, ... ], "count": N }
// 失败返回：{ "ok": false, "error": { "code": "INTERNAL_ERROR", "message": "..." } }
//
// 技术说明：
//   1) 连库方式同 cloudfunctions/hot：用 @cloudbase/node-sdk 的 app.rdb()，
//      因为本项目是 CloudBase 免费（个人版）环境，TCP 直连不可用。
//   2) ★ rdb() 必须传 { database: "public" } ★
//      这个参数其实是 PostgreSQL 的 schema 名（SDK 内部塞进 PostgREST 的 Accept-Profile 头），
//      不传时默认取 envId，而 envId 不是合法 schema → 上游报 Invalid schema → 接口 500。
//      这就是 Day 17 最初这个接口 500 的根因，细节见 cloudfunctions/hot/index.js 顶部注释。
//   3) 返回的是「集成响应」{ statusCode, headers, body }，body 必须是字符串。

"use strict";

const cloudbase = require("@cloudbase/node-sdk");

let dbClient = null;
function getDb(envId) {
  if (!dbClient) {
    dbClient = cloudbase.init({ env: envId }).rdb({ database: "public" });
  }
  return dbClient;
}

// favorites 表里有三个驼峰列名（trendId / createdAt / updatedAt）。
// PostgreSQL 的规则是「没加双引号的标识符会被折叠成小写」，Day 16 建表时统一加了双引号所以是安全的；
// 但 API 网关这一层会不会原样保留大小写，我在动手前无法确认 ——
// 稳妥起见读值时同时认两种写法，避免真·驼峰被悄悄改成 trendid 而接口静默返回 undefined。
// （这种失败不报错、只是字段变 undefined，正是本项目反复强调要盯的“静默不一致”。）
function pick(row, camelKey) {
  if (row[camelKey] !== undefined && row[camelKey] !== null) return row[camelKey];
  return row[camelKey.toLowerCase()];
}

function reply(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  };
}

/**
 * 云函数入口。
 * event  ：HTTP 访问服务把请求放进这里，查询参数在 event.queryStringParameters。
 * context：运行时上下文，context.namespace 就是当前环境 ID（不用写死在代码里）。
 */
exports.main = async (event, context) => {
  const envId = (context && context.namespace) || "";
  const query = (event && event.queryStringParameters) || {};

  // 余力加练：返回条数限制，上限 100。
  const limitRaw = Number(query.limit);
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : Infinity;

  try {
    const res = await getDb(envId)
      .from("favorites")
      .select('"id","trendId","title","platform","note","createdAt","updatedAt"');
    if (res.error) throw new Error(res.error.message || JSON.stringify(res.error));

    const rows = (Array.isArray(res.data) ? res.data : []).slice();
    // 按收藏记录 id 升序，让返回顺序稳定可预期（seed 里是 fav-1 ~ fav-5）。
    rows.sort(function (a, b) {
      return String(a.id).localeCompare(String(b.id));
    });

    const data = rows.slice(0, limit).map(function (r) {
      return {
        id: r.id,
        trendId: pick(r, "trendId"),
        title: r.title,
        platform: r.platform,
        note: r.note == null ? "" : r.note,
        createdAt: pick(r, "createdAt"),
        updatedAt: pick(r, "updatedAt"),
      };
    });

    return reply(200, { ok: true, data: data, count: data.length });
  } catch (err) {
    return reply(500, {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "暂时拿不到数据",
        detail: String((err && err.message) || err),
      },
    });
  }
};
