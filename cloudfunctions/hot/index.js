// cloudfunctions/hot/index.js
// GET /api/hot —— 「今日热搜」案例的**第一个读取接口**
//
// 职责：查 trends 表，**按热度倒序**返回前 20 条。
//
// ============================================================
// 一、对外契约（统一形状，成功/失败结构对称）
//
//   成功：{ "ok": true,  "data": [ ...20 条... ], "count": 20, "source": "...", "date": "..." }
//   失败：{ "ok": false, "error": "人能看懂的中文说明" }        ← error 是**字符串**，不是对象
//
//   失败时 HTTP 状态码也一起给：参数错 400、数据库错 500。
// ============================================================
//
// ============================================================
// 二、三条硬性要求怎么落地的
//
// 1) 【SQL 必须参数化，禁止字符串拼接】
//    本项目是 CloudBase + PostgreSQL，云函数里**不手写 SQL 字符串**，
//    一律用官方 SDK 的查询构造器（PostgREST 风格）：
//        db.from("trends").select(...).eq("date", date).limit(n)
//    构造器的筛选值由 SDK 走 HTTP 参数传给数据网关，不做字符串拼 SQL，
//    因此不存在 SQL 注入面。全文件没有任何一处 "SELECT ... " + 变量 的写法。
//
// 2) 【按热度倒序】⚠️ 这里有个真实的坑
//    trends."heat" 是 TEXT（存的是 '781 万'、'523 万' 这种带中文单位的字符串），
//    如果直接让数据库 ORDER BY heat DESC，PostgreSQL 会按**字典序**排：
//    '9 万' > '781 万' > '523 万'（因为 '9' > '7'），结果是错的。
//    正确做法：把热度**解析成数值**再排序（见下面的 heatToNumber）。
//    排序放在应用层做，数据库只负责按 (date, platform) 把行取回来。
//
// 3) 【前 20 条】
//    默认 limit=20，可用 ?limit=N 调整（上限 100）。
// ============================================================
//
// ============================================================
// 三、连库姿势（本项目踩过坑，别改）
//    app.rdb({ database: "public" }) —— database 参数其实是 PostgreSQL 的 **schema 名**，
//    不传时默认取 envId，而 envId 不是合法 schema → 上游报 Invalid schema → 接口 500。
//    ⚠️ Day 19：连库搬到数据访问层；Day 20 细拆：trends 表的查询都在 shared/trendsRepository.js。
//       要改数据库操作 → 改 shared/ 下对应文件 → node scripts/sync-shared.js → tcb fn deploy。
// ============================================================

"use strict";

// 数据访问层（Day 20 按表拆分）：trends 表的查询全部在 shared/trendsRepository.js，
// 由 scripts/sync-shared.js 复制到本目录的 lib/trendsRepository.js。这里只管「要什么数据」。
const trendsRepository = require("./lib/trendsRepository");

// 统一响应：失败时 error 一律是「人能看懂的中文说明」（字符串）
function ok(payload) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(Object.assign({ ok: true }, payload)),
  };
}

function fail(statusCode, message) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ ok: false, error: message }),
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
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 把 TEXT 热度解析成数值，用于正确排序。
 *
 * 之所以需要它：trends."heat" 是 TEXT，形如 '781 万' / '1.2 亿' / '7957710' / '热'。
 * 数据库按字典序排会得出错误名次，所以统一在这里换算成数字。
 *
 * 支持：'781 万' → 7810000；'1.2 亿' → 120000000；'7957710' → 7957710；
 *      '523.5 万' → 5235000；'' / '热' / '爆' → 0（排最后）。
 */
function heatToNumber(s) {
  if (s === null || s === undefined) return 0;
  const str = String(s).trim();
  if (!str) return 0;
  const m = str.match(/^(\d+(?:\.\d+)?)\s*(亿|万|w|W|k|K)?$/);
  if (!m) return 0; // 纯中文标记（如「热」「爆」）无法换算，排最后
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  const unit = m[2];
  if (unit === "亿") return n * 1e8;
  if (unit === "万" || unit === "w" || unit === "W") return n * 1e4;
  if (unit === "k" || unit === "K") return n * 1e3;
  return n;
}

// 热度数值排在返回体里一并给前端，便于页面核对「倒序」是否真的生效
function withHeatNumber(row) {
  return {
    id: row.id,
    rank: row.rank,
    title: row.title,
    heat: row.heat,
    heatNum: heatToNumber(row.heat),
    platform: row.platform,
    url: row.url == null ? "" : row.url,
    date: row.date,
    createdAt: row.createdAt,
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

  // ---- 1. 参数校验：不对就明确报 400，而不是静默返回空列表 ----
  const dateRaw = query.date;
  let date;
  if (dateRaw !== undefined && dateRaw !== null && dateRaw !== "") {
    if (!isValidDate(String(dateRaw))) {
      return fail(400, "date 参数格式不对，应该写成 YYYY-MM-DD，例如 2026-10-06");
    }
    date = String(dateRaw);
  } else {
    date = todayInBeijing(); // 缺省 = 当天（北京时间）
  }

  const platformRaw = query.platform;
  const platform = platformRaw ? String(platformRaw) : null;

  // limit：默认 20（题目要求「前 20 条」），上限 100
  const limitRaw = Number(query.limit);
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;

  try {
    // ---- 2. 取数据：查询本身在 trendsRepository（数据访问层），这里只传筛选条件 ----
    const rows = await trendsRepository.listTrends(envId, { date: date, platform: platform });

    // ---- 3. 按热度倒序（数值比较），同热度时按名次升序，保证结果稳定可复现 ----
    const sorted = rows
      .map(withHeatNumber)
      .sort(function (a, b) {
        if (b.heatNum !== a.heatNum) return b.heatNum - a.heatNum;
        return a.rank - b.rank;
      });

    const data = sorted.slice(0, limit);

    // source：让前端一眼看出这批数据是「当日同步的真实数据」还是「历史种子兜底」
    const isRealToday = data.some(function (r) {
      return r.date === todayInBeijing();
    });

    return ok({
      data: data,
      count: data.length,
      source: isRealToday ? "synced" : "seed",
      date: date,
    });
  } catch (err) {
    return fail(500, "读取热搜数据失败：" + String((err && err.message) || err));
  }
};
