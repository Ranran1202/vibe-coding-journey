// shared/dramaWatchLogsRepository.js —— drama_watch_logs 表（漫剧·记录表）的**唯一数据出口**
//
// 这个表的所有数据库查询都集中在这里，只对外暴露函数：
//   listWatchLogs(envId, {episodeId, viewer})   观看记录，按观看时间倒序；可按剧集/观众筛选
//   findWatchLogById(envId, id)                 按记录 id 取一条（PATCH/DELETE 前做存在性校验，已归一化）
//   updateWatchLog(envId, id, patch)            Day 22：PATCH 改记录（只改 progress / device），返回更新后整行
//   deleteWatchLog(envId, id)                   Day 22：DELETE 硬删除一条记录（用户未选软删除，故不加 is_deleted 列）
//
// 谁在用：drama-watchlogs（GET 列表 + PATCH 改 + DELETE 删）。
//
// 归一化说明：返回的行已经过归一——驼峰列兜底读值（"episodeId"/"watchedAt"），
// viewer/device 兜底空串、progress 兜底 0。接口层拿到即可直接放进响应。
// 列名注意："episodeId"/"watchedAt" 是驼峰，必须带英文双引号（见 db.js 头部铁律）。

"use strict";

const { getDb, pick, dbError } = require("./db");

// 本表的列清单：加字段只改这里
const COLUMNS = {
  all: '"id","episodeId","viewer","progress","device","watchedAt"',
};

/** 库里的行 → 契约形状。驼峰兜底、空值兜底，都在这一处做完。 */
function normalize(row) {
  return {
    id: row.id,
    episodeId: pick(row, "episodeId"),
    viewer: row.viewer == null ? "" : row.viewer,
    progress: row.progress == null ? 0 : row.progress,
    device: row.device == null ? "" : row.device,
    watchedAt: pick(row, "watchedAt"),
  };
}

/** 观看记录（一次观看 = 一次打卡），按观看时间倒序：最近的排最前。 */
async function listWatchLogs(envId, options) {
  const opts = options || {};
  let q = getDb(envId).from("drama_watch_logs").select(COLUMNS.all);
  if (opts.episodeId) q = q.eq("episodeId", opts.episodeId);
  if (opts.viewer) q = q.eq("viewer", opts.viewer);
  q = q.order("watchedAt", { ascending: false });
  const res = await q;
  if (res.error) throw dbError("drama_watch_logs", res);
  return (Array.isArray(res.data) ? res.data : []).map(normalize);
}

/** 按记录 id 取一条（PATCH/DELETE 前做存在性校验）。已归一化；没有则 null。 */
async function findWatchLogById(envId, id) {
  const res = await getDb(envId).from("drama_watch_logs").select(COLUMNS.all).eq("id", id);
  if (res.error) throw dbError("drama_watch_logs", res);
  return Array.isArray(res.data) && res.data.length ? normalize(res.data[0]) : null;
}

/**
 * Day 22 · PATCH 改记录。只改调用方给定的字段（当前契约允许 progress / device）。
 * 用 `.update(patch).eq("id", id).select(COLUMNS.all)` 让网关直接返回更新后的行，省一次回读。
 */
async function updateWatchLog(envId, id, patch) {
  const res = await getDb(envId)
    .from("drama_watch_logs")
    .update(patch)
    .eq("id", id)
    .select(COLUMNS.all);
  if (res.error) return { ok: false, error: res.error };
  const row = Array.isArray(res.data) && res.data.length ? res.data[0] : null;
  if (!row) return { ok: false, error: new Error("更新后读不到该行") };
  return { ok: true, row: normalize(row), error: null };
}

/**
 * Day 22 · DELETE 硬删除一条记录。
 * 说明：本线未选软删除（没有 is_deleted 列），故这里是真删除；删错不可找回。
 * 若将来想可恢复，可参照 favorites 加 is_deleted 标记 + db/add_soft_delete.sql。
 */
async function deleteWatchLog(envId, id) {
  const res = await getDb(envId).from("drama_watch_logs").delete().eq("id", id);
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, error: null };
}

module.exports = {
  listWatchLogs: listWatchLogs,
  findWatchLogById: findWatchLogById,
  updateWatchLog: updateWatchLog,
  deleteWatchLog: deleteWatchLog,
};
