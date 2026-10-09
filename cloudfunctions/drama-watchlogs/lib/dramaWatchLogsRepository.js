// ⚠️ 本文件由 scripts/sync-shared.js 从 shared/ 自动复制生成，**不要手改**。
//    要改数据库操作请改 shared/ 下的源文件（db.js 或 *Repository.js），然后重新跑：
//    node scripts/sync-shared.js  →  tcb fn deploy <函数名> -e "$ENV" --force

// shared/dramaWatchLogsRepository.js —— drama_watch_logs 表（漫剧·记录表）的**唯一数据出口**
//
// 这个表的所有数据库查询都集中在这里，只对外暴露函数：
//   listWatchLogs(envId, {episodeId, viewer})   观看记录，按观看时间倒序；可按剧集/观众筛选
//
// 谁在用：drama-watchlogs（GET /api/drama/watch-logs）。
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

/** 观看记录（一次观看 = 一次打卡），按观看时间倒序：最近的排最前。 */
async function listWatchLogs(envId, options) {
  const opts = options || {};
  let q = getDb(envId).from("drama_watch_logs").select(COLUMNS.all);
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
  listWatchLogs: listWatchLogs,
};
