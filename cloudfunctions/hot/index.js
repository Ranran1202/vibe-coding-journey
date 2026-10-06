// cloudfunctions/hot/index.js
// Day 17 · 第一个读取接口：GET /api/hot
//
// 它在整个作品里的位置：
//   前 16 天的作品数据全写在浏览器里（my-app/js/data.js 的 HOT_DATA）。
//   今天这个接口把「热搜列表」搬到云端数据库，前端改成 fetch 它 —— 作品第一次真正联网取业务数据。
//
// 对外接口：GET /api/hot?date=&platform=&limit=   （完整契约见仓库根目录 api-contract.md §3.3）
// 成功返回：{ "ok": true, "data": [ {id,rank,title,heat,platform,url,date,createdAt}, ... ], "count": N }
// 失败返回：{ "ok": false, "error": { "code": "...", "message": "..." } }
//
// ============================================================
// ★ 今天最关键的一行：app.rdb({ database: "public" })
//
// 这里的 database 参数**不是数据库名，而是 PostgreSQL 的 schema 名**。
// 依据（读 @cloudbase/node-sdk 3.18.3 源码 dist/cloudbase.js 第 98–120 行）：
//     const { instance = 'default', database = envId } = options || {};
//     headers: { 'X-Db-Instance': instance, 'Accept-Profile': database, 'Content-Profile': database }
//   —— 它被塞进 PostgREST 的 Accept-Profile 头。不传时默认取 envId，
//   而 envId（形如 wb-test01-xxxx）不是合法 schema 名 → 上游返回 Invalid schema → 500。
// 这就是 Day 17 最初 hot / favorites 两个接口都 500 的根因。
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

function reply(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  };
}

// 只认 YYYY-MM-DD，挡住 2026-13-45 这类看着像日期其实无效的值
function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function todayInBeijing() {
  // 服务器时钟是 UTC，而「当日热搜」按北京时间算，所以手动 +8 小时。
  // 用 toISOString 再截前 10 位，拿到 UTC 的 YYYY-MM-DD（与 trends."date" 的存储格式一致）。
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 云函数入口。
 * event  ：HTTP 访问服务把请求放进这里，查询参数在 event.queryStringParameters。
 * context：运行时上下文，context.namespace 就是当前环境 ID（不用写死在代码里）。
 */
exports.main = async (event, context) => {
  const envId = (context && context.namespace) || "";
  const query = (event && event.queryStringParameters) || {};

  // ---- 1. 参数校验：date 格式不对要明确报 400，而不是静默返回空列表 ----
  const dateRaw = query.date;
  let date;
  if (dateRaw !== undefined && dateRaw !== null && dateRaw !== "") {
    if (!isValidDate(String(dateRaw))) {
      return reply(400, {
        ok: false,
        error: { code: "BAD_REQUEST", message: "date 格式应为 YYYY-MM-DD" },
      });
    }
    date = String(dateRaw);
  } else {
    date = todayInBeijing(); // 缺省 = 当天
  }

  // platform 是可选筛选（前端也会在本地筛，这里只是让接口更完整）
  const platformRaw = query.platform;
  const platform = platformRaw ? String(platformRaw) : null;

  // ---- 2. 余力加练：limit 限制返回条数，上限 100 ----
  const limitRaw = Number(query.limit);
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : Infinity;

  try {
    let q = getDb(envId)
      .from("trends")
      .select('"id","rank","title","heat","platform","url","date","createdAt"')
      .eq("date", date);

    if (platform) q = q.eq("platform", platform);
    // 按 rank 数字升序（rank 列建表时特意选 INTEGER 而不是 TEXT，
    // 就是为了保证 1,2,10 的顺序，而不是字符串排序的 1,10,2）
    q = q.order("rank", { ascending: true });

    const res = await q;
    if (res.error) {
      throw new Error(res.error.message || JSON.stringify(res.error));
    }

    const rows = Array.isArray(res.data) ? res.data : [];
    const data = rows.slice(0, limit).map(function (r) {
      return {
        id: r.id,
        rank: r.rank,
        title: r.title,
        heat: r.heat,
        platform: r.platform,
        url: r.url == null ? "" : r.url,
        date: r.date,
        createdAt: r.createdAt,
      };
    });

    // source = 数据哪天入库的，便于一眼看出「页面上显示的是不是今天同步进来的真实数据」。
    // 判据：任何一行的 date 等于今天 → 是当日真实数据；否则是历史 seed 兜底数据。
    const isRealToday = data.some(function (r) {
      return r.date === todayInBeijing();
    });

    return reply(200, {
      ok: true,
      data: data,
      count: data.length,
      source: isRealToday ? "synced" : "seed", // seed 时前端会标注「示例数据」
      date: date,
    });
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
