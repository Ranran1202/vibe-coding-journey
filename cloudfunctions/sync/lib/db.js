// ⚠️ 本文件由 scripts/sync-shared.js 从 shared/db.js 自动复制生成，**不要手改**。
//    要改数据库操作请改 shared/db.js，然后重新跑：node scripts/sync-shared.js
//    再部署：tcb fn deploy <函数名> -e "$ENV" --force

// shared/db.js —— **数据访问层（DAO，Data Access Object）· 唯一真源**
//
// ============================================================
// 这个文件解决什么问题（Day 19 重构）
//
// 重构前：每个云函数里都各写一份「连库 + 查库」的代码——
//   - `getDb()` 连带那句容易写错的 `rdb({ database: "public" })`，5 个函数 5 份一模一样；
//   - `pick()`（驼峰列兜底）、`toIso()`（时间统一 UTC）也是复制粘贴；
//   - 真正的查询（`.from().select().eq()`）跟参数校验、业务判断混在 `exports.main` 里，
//     一个函数上百行，改一个字段名要在 5 个文件里找。
//
// 重构后：**「查数据库」这件事只在这个文件里发生一次**。
//   云函数（接口层）负责：解析请求 → 校验参数 → 调这里的函数拿数据 → 拼响应；
//   本文件（数据层）负责：连库、写查询、把库里的行整理成统一形态。
//   契约（路径、字段名、响应形状）一行没动 —— 重构只挪代码位置，不改对外行为。
//
// ============================================================
// 怎么被云函数用到（CloudBase 的部署现实）
//
// CloudBase 云函数是**按目录整体打包上传**的，跨目录的 `require("../shared/db")` 在云端会找不到文件。
// 所以流程是：改这个文件 → 跑一次 `node scripts/sync-shared.js`
// → 脚本把本文件原样复制到每个云函数目录下的 `lib/db.js` → 再 `tcb fn deploy`。
// 云函数里一律 `require("./lib/db")`。
// ⚠️ 因此 **改数据库操作只改本文件**，不要去改 `cloudfunctions/*/lib/db.js`（那是生成的副本）。
//
// ============================================================
// 两条铁律（Day 16 定下，重构后照旧）
//
// 1) 列名一律加英文双引号：PostgreSQL 会把无引号标识符折叠成小写，
//    `trendId` → `trendid`，接口吐出的 JSON 键就跟契约对不上了。
//    `"order"` 还是 SQL 保留字，不加引号直接语法错误。
// 2) SQL 必须参数化：只用 SDK 查询构造器（PostgREST 风格），筛选值由 SDK 走 HTTP 参数传给网关，
//    全文件没有任何一处 SQL 字符串拼接，因此不存在注入面。
//
// 错误处理约定：**查询类函数遇到数据库错误直接抛中文 Error**（云函数 catch 后统一回 500）；
// 只有 `insertTrend` 例外——主键冲突是同步时预期内的情况，返回 `{ok:false,error}` 交给调用方计数，不抛。
// ============================================================

"use strict";

const cloudbase = require("@cloudbase/node-sdk");

// rdb 的 database 参数其实是 PostgreSQL 的 **schema 名**（SDK 塞进 PostgREST 的 Accept-Profile 头）。
// 不传时默认取 envId，而 envId 不是合法 schema → 上游报 Invalid schema → 接口 500。
const SCHEMA = "public";

// 数据库客户端做模块级缓存：云函数实例复用时不必每次重新 init。
let dbClient = null;
function getDb(envId) {
  if (!dbClient) {
    dbClient = cloudbase.init({ env: envId }).rdb({ database: SCHEMA });
  }
  return dbClient;
}

// 每个表要取哪些列，集中在这里维护：以后加字段只改一处。
const COLUMNS = {
  trends: '"id","rank","title","heat","platform","url","date","createdAt"',
  trendsForSync: '"id","title","rank"',
  trendsCreatedAt: '"createdAt"',
  favorites: '"id","trendId","title","platform","note","createdAt","updatedAt"',
  favoritesId: '"id","trendId"',
  episodes:
    '"id","order","title","status","duration","durationSec","summary","scene","videoUrl","cast","updatedAt"',
  watchLogs: '"id","episodeId","viewer","progress","device","watchedAt"',
};

// ------------------------------------------------------------
// 通用小工具（本来在每个云函数里各写一份，现在只有一份）
// ------------------------------------------------------------

/**
 * 驼峰列兜底读取。
 * 网关某一层如果把 `trendId` 悄悄折叠成 `trendid`，接口不会报错、只会静默返回 undefined——
 * 这种失败最难查，所以两种写法都认。
 */
function pick(row, camelKey) {
  if (row[camelKey] !== undefined && row[camelKey] !== null) return row[camelKey];
  return row[camelKey.toLowerCase()];
}

/** 时间统一序列化成 ISO 8601 UTC（形如 2026-10-08T11:51:34.442Z），跟契约 §1.4 一致。 */
function toIso(v) {
  if (v === null || v === undefined || v === "") return v === undefined ? null : v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

/** 统一抛错文案，让云函数的 500 能直接暴露是哪张表出的问题。 */
function dbError(table, res) {
  return new Error(
    "读取" + table + "失败：" + ((res && res.error && res.error.message) || "数据库返回了错误")
  );
}

// ------------------------------------------------------------
// 今日热搜线 · trends（热搜记录表）
// ------------------------------------------------------------

/** 按日期（可选平台）取热搜行。排序由调用方决定：热度是 TEXT，得解析成数值才能倒序。 */
async function listTrends(envId, options) {
  const opts = options || {};
  let q = getDb(envId).from("trends").select(COLUMNS.trends).eq("date", opts.date);
  if (opts.platform) q = q.eq("platform", opts.platform);
  const res = await q;
  if (res.error) throw dbError("trends", res);
  return Array.isArray(res.data) ? res.data : [];
}

/** 按主键取单条热搜（写入收藏前用它确认「这条热搜真的存在」）。 */
async function findTrendById(envId, id) {
  const res = await getDb(envId)
    .from("trends")
    .select('"id","title","platform"')
    .eq("id", id);
  if (res.error) throw dbError("trends", res);
  return Array.isArray(res.data) && res.data.length ? res.data[0] : null;
}

/** 同步用：取某平台某天的已有行（应用层 upsert 的判重依据）。 */
async function findTrendsByPlatformDate(envId, platform, date) {
  const res = await getDb(envId)
    .from("trends")
    .select(COLUMNS.trendsForSync)
    .eq("platform", platform)
    .eq("date", date);
  if (res.error) throw dbError("trends", res);
  return Array.isArray(res.data) ? res.data : [];
}

/** 同步用：更新已有行的名次/热度/链接。返回 {ok, error}。 */
async function updateTrend(envId, id, patch) {
  const res = await getDb(envId).from("trends").update(patch).eq("id", id);
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, error: null };
}

/**
 * 同步用：插入一条热搜。
 * 主键冲突（跨天存在相同 platform-rank 的行）是**预期内**的情况，不抛错，返回 {ok:false} 让调用方计数跳过。
 */
async function insertTrend(envId, row) {
  const res = await getDb(envId).from("trends").insert(row);
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, error: null };
}

/** 同步节流用：该平台当天最近一次入库时间（毫秒时间戳，没有则返回 null）。 */
async function latestTrendCreatedAt(envId, platform, date) {
  const res = await getDb(envId)
    .from("trends")
    .select(COLUMNS.trendsCreatedAt)
    .eq("platform", platform)
    .eq("date", date);
  if (res.error || !Array.isArray(res.data) || !res.data.length) return null;
  let latest = null;
  res.data.forEach(function (r) {
    const t = r.createdAt ? Date.parse(r.createdAt) : NaN;
    if (!Number.isNaN(t) && (latest === null || t > latest)) latest = t;
  });
  return latest;
}

// ------------------------------------------------------------
// 今日热搜线 · favorites（收藏表）
// ------------------------------------------------------------

/** 收藏列表（全量，排序由调用方做）。 */
async function listFavorites(envId) {
  const res = await getDb(envId).from("favorites").select(COLUMNS.favorites);
  if (res.error) throw dbError("favorites", res);
  return Array.isArray(res.data) ? res.data : [];
}

/** 按收藏 id 取一条（幂等键命中时用它回读第一次的结果）。 */
async function findFavoriteById(envId, id) {
  const res = await getDb(envId).from("favorites").select(COLUMNS.favorites).eq("id", id);
  if (res.error) throw dbError("favorites", res);
  return Array.isArray(res.data) && res.data.length ? res.data[0] : null;
}

/** 按 trendId 查「这条热搜被收藏了吗」（业务判重）。 */
async function findFavoriteByTrendId(envId, trendId) {
  const res = await getDb(envId).from("favorites").select(COLUMNS.favoritesId).eq("trendId", trendId);
  if (res.error) throw dbError("favorites", res);
  return Array.isArray(res.data) && res.data.length ? res.data[0] : null;
}

/** 新增一条收藏。主键冲突时返回 {ok:false}（并发幂等场景要据此回读，不视为错误）。 */
async function insertFavorite(envId, row) {
  const res = await getDb(envId).from("favorites").insert(row);
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, error: null };
}

// ------------------------------------------------------------
// AI 漫剧线（另一条业务线，表与上面完全隔离）
// ------------------------------------------------------------

/** 剧集列表，按第几集升序；可按状态筛选。cast 在库里是 JSONB，这里顺手归一成数组。 */
async function listEpisodes(envId, options) {
  const opts = options || {};
  let q = getDb(envId).from("drama_episodes").select(COLUMNS.episodes);
  if (opts.status) q = q.eq("status", opts.status);
  q = q.order("order", { ascending: true });
  const res = await q;
  if (res.error) throw dbError("drama_episodes", res);
  return (Array.isArray(res.data) ? res.data : []).map(normalizeEpisode);
}

function normalizeEpisode(r) {
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
}

/** 观看记录（一次观看 = 一次打卡），按观看时间倒序：最近的排最前。 */
async function listWatchLogs(envId, options) {
  const opts = options || {};
  let q = getDb(envId).from("drama_watch_logs").select(COLUMNS.watchLogs);
  if (opts.episodeId) q = q.eq("episodeId", opts.episodeId);
  if (opts.viewer) q = q.eq("viewer", opts.viewer);
  q = q.order("watchedAt", { ascending: false });
  const res = await q;
  if (res.error) throw dbError("drama_watch_logs", res);
  return (Array.isArray(res.data) ? res.data : []).map(function (r) {
    return {
      id: r.id,
      episodeId: pick(r, "episodeId"),
      viewer: r.viewer == null ? "" : r.viewer,
      progress: r.progress == null ? 0 : r.progress,
      device: r.device == null ? "" : r.device,
      watchedAt: pick(r, "watchedAt"),
    };
  });
}

module.exports = {
  getDb: getDb,
  COLUMNS: COLUMNS,
  pick: pick,
  toIso: toIso,
  listTrends: listTrends,
  findTrendById: findTrendById,
  findTrendsByPlatformDate: findTrendsByPlatformDate,
  updateTrend: updateTrend,
  insertTrend: insertTrend,
  latestTrendCreatedAt: latestTrendCreatedAt,
  listFavorites: listFavorites,
  findFavoriteById: findFavoriteById,
  findFavoriteByTrendId: findFavoriteByTrendId,
  insertFavorite: insertFavorite,
  listEpisodes: listEpisodes,
  listWatchLogs: listWatchLogs,
};
