// ⚠️ 本文件由 scripts/sync-shared.js 从 shared/ 自动复制生成，**不要手改**。
//    要改数据库操作请改 shared/ 下的源文件（db.js 或 *Repository.js），然后重新跑：
//    node scripts/sync-shared.js  →  tcb fn deploy <函数名> -e "$ENV" --force

// shared/favoritesRepository.js —— favorites 表（收藏表）的**唯一数据出口**
//
// 这个表的所有数据库查询都集中在这里，只对外暴露函数：
//   listFavorites(envId)                 收藏列表（已归一化，排序由调用方做）
//   findFavoriteById(envId, id)          按收藏 id 取一条（幂等键命中时回读，已归一化）
//   findFavoriteByTrendId(envId, trendId) 按热搜 id 查「收藏了吗」（业务判重，返回原始行）
//   insertFavorite(envId, row)           新增一条收藏（row 由调用方拼好，含 id 与时间戳）
//
// 谁在用：favorites（GET 列表 + POST 写入）。
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

/** 收藏列表（全量已归一化，排序由调用方做）。 */
async function listFavorites(envId) {
  const res = await getDb(envId).from("favorites").select(COLUMNS.all);
  if (res.error) throw dbError("favorites", res);
  return (Array.isArray(res.data) ? res.data : []).map(normalizeFavorite);
}

/** 按收藏 id 取一条（幂等键命中时用它回读第一次的结果）。已归一化；没有则 null。 */
async function findFavoriteById(envId, id) {
  const res = await getDb(envId).from("favorites").select(COLUMNS.all).eq("id", id);
  if (res.error) throw dbError("favorites", res);
  return Array.isArray(res.data) && res.data.length ? normalizeFavorite(res.data[0]) : null;
}

/** 按 trendId 查「这条热搜被收藏了吗」（业务判重）。返回原始行（调用方只看存在性与 id）。 */
async function findFavoriteByTrendId(envId, trendId) {
  const res = await getDb(envId).from("favorites").select(COLUMNS.idOnly).eq("trendId", trendId);
  if (res.error) throw dbError("favorites", res);
  return Array.isArray(res.data) && res.data.length ? res.data[0] : null;
}

/** 新增一条收藏。主键冲突时返回 {ok:false}（并发幂等场景要据此回读，不视为错误）。 */
async function insertFavorite(envId, row) {
  const res = await getDb(envId).from("favorites").insert(row);
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, error: null };
}

module.exports = {
  listFavorites: listFavorites,
  findFavoriteById: findFavoriteById,
  findFavoriteByTrendId: findFavoriteByTrendId,
  insertFavorite: insertFavorite,
};
