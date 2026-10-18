// ⚠️ 本文件由 scripts/sync-shared.js 从 shared/ 自动复制生成，**不要手改**。
//    要改数据库操作请改 shared/ 下的源文件（db.js 或 *Repository.js），然后重新跑：
//    node scripts/sync-shared.js  →  tcb fn deploy <函数名> -e "$ENV" --force

// shared/favoritesRepository.js —— favorites 表（收藏表）的**唯一数据出口**
//
// 这个表的所有数据库查询都集中在这里，只对外暴露函数：
//   listFavorites(envId)                     收藏列表（已归一化，排序由调用方做；**自动跳过软删除行**）
//   findFavoriteById(envId, id)              按收藏 id 取一条（幂等键命中时回读，已归一化；**跳过软删除行**）
//   findFavoriteByTrendId(envId, trendId)    按热搜 id 查「收藏了吗」（业务判重，返回原始行；**跳过软删除行**）
//   insertFavorite(envId, row)               新增一条收藏（row 由调用方拼好，含 id 与时间戳）
//   updateFavorite(envId, id, patch)         Day 22：PATCH 改备注（只改 note + updatedAt），返回更新后整行
//   softDeleteFavorite(envId, id)            Day 22：软删除（置 is_deleted=true + deletedAt，数据不真删）
//   findFavoriteIncludingDeleted(envId, id)  「找回」用：直接看那条标记行是否还在（is_deleted 应为 true）；正常业务不调用
//
// Day 22 软删除约定：
//   favorites 表加了 "is_deleted" BOOLEAN NOT NULL DEFAULT FALSE + "deletedAt" TIMESTAMPTZ（见 db/add_soft_delete.sql）。
//   - 一切「正常业务读」都先 .eq("is_deleted", false)，保证 GET 列表里不会出现已删除项；
//   - 软删除只打标记，不真删 —— 删错了用 db/recover_favorite.sql 把标记翻回 false 即可找回；
//   - findFavoriteIncludingDeleted 用于找回场景，正常业务读不到它。
//
// 谁在用：favorites（GET 列表 + POST 写入 + PATCH 改备注 + DELETE 软删除）。
//
// 归一化说明：listFavorites / findFavoriteById 返回的行已经过 normalizeFavorite——
// 驼峰兜底读值（pick）、时间统一 UTC（toIso）、note 空值兜底成空字符串。
// 接口层拿到即可直接放进响应，不用再做任何字段处理；
// findFavoriteByTrendId 只用于判重（调用方只看它存不存在），保持返回原始行。

"use strict";

const { getDb, pick, toIso, dbError } = require("./db");

// 本表的列清单：加字段只改这里（驼峰列必须带英文双引号，见 db.js 头部铁律）
const COLUMNS = {
  all: '"id","trendId","title","platform","note","createdAt","updatedAt"',
  idOnly: '"id","trendId"',
  // 找回场景专用：只看标记列，不暴露业务字段
  deletedFlag: '"id","is_deleted","deletedAt"',
};

/** 库里的行 → 契约形状。驼峰兜底、时间归一 UTC、note 兜底空串，都在这一处做完。 */
function normalizeFavorite(row) {
  return {
    id: row.id,
    trendId: pick(row, "trendId"),
    title: row.title,
    platform: row.platform,
    note: row.note == null ? "" : row.note,
    createdAt: toIso(pick(row, "createdAt")),
    updatedAt: toIso(pick(row, "updatedAt")),
  };
}

/**
 * 一切「正常业务读」的查询都先过滤掉软删除的行。
 * 这样 GET 列表 / 按 id 取 / 按 trendId 判重 三处都不会再看到已删除项，
 * 软删除对调用方完全透明（表现跟真删除一模一样，只是数据还在库里）。
 */
function visible(query) {
  return query.eq("is_deleted", false);
}

/** 收藏列表（全量已归一化，排序由调用方做；已跳过软删除行）。 */
async function listFavorites(envId) {
  const res = await visible(getDb(envId).from("favorites").select(COLUMNS.all));
  if (res.error) throw dbError("favorites", res);
  return (Array.isArray(res.data) ? res.data : []).map(normalizeFavorite);
}

/** 按收藏 id 取一条（幂等键命中时用它回读第一次的结果）。已归一化；软删除行视为不存在 → null。 */
async function findFavoriteById(envId, id) {
  const res = await visible(getDb(envId).from("favorites").select(COLUMNS.all).eq("id", id));
  if (res.error) throw dbError("favorites", res);
  return Array.isArray(res.data) && res.data.length ? normalizeFavorite(res.data[0]) : null;
}

/** 按 trendId 查「这条热搜被收藏了吗」（业务判重）。返回原始行；软删除行不算「已收藏」，可再次收藏。 */
async function findFavoriteByTrendId(envId, trendId) {
  const res = await visible(getDb(envId).from("favorites").select(COLUMNS.idOnly).eq("trendId", trendId));
  if (res.error) throw dbError("favorites", res);
  return Array.isArray(res.data) && res.data.length ? res.data[0] : null;
}

/** 新增一条收藏。主键冲突时返回 {ok:false}（并发幂等场景要据此回读，不视为错误）。 */
async function insertFavorite(envId, row) {
  const res = await getDb(envId).from("favorites").insert(row);
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, error: null };
}

/**
 * Day 22 · PATCH 改备注。只改 note + updatedAt，按 id 定位。
 * 用 `.update(patch).eq("id", id).select(COLUMNS.all)` 让网关把更新后的行直接返回，省一次回读；
 * 返回前再 normalize，保证接口拿到的是库里真实值。
 */
async function updateFavorite(envId, id, patch) {
  const res = await getDb(envId)
    .from("favorites")
    .update(patch)
    .eq("id", id)
    .select(COLUMNS.all);
  if (res.error) return { ok: false, error: res.error };
  const row = Array.isArray(res.data) && res.data.length ? res.data[0] : null;
  if (!row) return { ok: false, error: new Error("更新后读不到该行") };
  return { ok: true, row: normalizeFavorite(row), error: null };
}

/**
 * Day 22 · 软删除：不打真 DELETE，只把 is_deleted 置 true、deletedAt 写上时间。
 * 数据不丢，删错了用 db/recover_favorite.sql 翻回 false 即可找回。
 */
async function softDeleteFavorite(envId, id) {
  const res = await getDb(envId)
    .from("favorites")
    .update({ is_deleted: true, deletedAt: new Date().toISOString() })
    .eq("id", id);
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, error: null };
}

/** 「找回」用：直接看那条标记行是否还在（is_deleted 应为 true）。正常业务不调用。 */
async function findFavoriteIncludingDeleted(envId, id) {
  const res = await getDb(envId).from("favorites").select(COLUMNS.deletedFlag).eq("id", id);
  if (res.error) throw dbError("favorites", res);
  return Array.isArray(res.data) && res.data.length ? res.data[0] : null;
}

module.exports = {
  listFavorites: listFavorites,
  findFavoriteById: findFavoriteById,
  findFavoriteByTrendId: findFavoriteByTrendId,
  insertFavorite: insertFavorite,
  updateFavorite: updateFavorite,
  softDeleteFavorite: softDeleteFavorite,
  findFavoriteIncludingDeleted: findFavoriteIncludingDeleted,
};
