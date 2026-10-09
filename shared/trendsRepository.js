// shared/trendsRepository.js —— trends 表（热搜记录表）的**唯一数据出口**
//
// 这个表的所有数据库查询都集中在这里，只对外暴露函数：
//   listTrends(envId, {date, platform})              按日期（可选平台）取行，原样返回
//   findTrendById(envId, id)                         按主键取一条（收藏前确认热搜存在）
//   findTrendsByPlatformDate(envId, platform, date)  同步用：某平台某天的已有行
//   updateTrend(envId, id, patch)                    同步用：更新热度/名次/链接
//   insertTrend(envId, row)                          同步用：插入新行
//   latestTrendCreatedAt(envId, platform, date)      同步节流：最近一次入库时间（毫秒）
//
// 谁在用：hot（读列表）、favorites（收藏前确认热搜存在）、sync（upsert 写入）。
// 返回值约定：查询返回**库里的原始行**（不做归一化）——排序、热度换算这些
// 仍然是调用方的业务逻辑；错误统一抛中文 Error（insertTrend 的主键冲突除外，返回 {ok:false}）。
// 排序注意：heat 是 TEXT（'781 万'），数据库字典序会排错，应用层用 heatToNumber 换算（在 hot 接口里）。

"use strict";

const { getDb, dbError } = require("./db");

// 本表的列清单：加字段只改这里（驼峰列必须带英文双引号，见 db.js 头部铁律）
const COLUMNS = {
  all: '"id","rank","title","heat","platform","url","date","createdAt"',
  forSync: '"id","title","rank"',
  createdAt: '"createdAt"',
};

/** 按日期（可选平台）取热搜行。排序由调用方决定：热度是 TEXT，得解析成数值才能倒序。 */
async function listTrends(envId, options) {
  const opts = options || {};
  let q = getDb(envId).from("trends").select(COLUMNS.all).eq("date", opts.date);
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
    .select(COLUMNS.forSync)
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
    .select(COLUMNS.createdAt)
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

module.exports = {
  listTrends: listTrends,
  findTrendById: findTrendById,
  findTrendsByPlatformDate: findTrendsByPlatformDate,
  updateTrend: updateTrend,
  insertTrend: insertTrend,
  latestTrendCreatedAt: latestTrendCreatedAt,
};
