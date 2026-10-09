// shared/dramaEpisodesRepository.js —— drama_episodes 表（漫剧·核心表）的**唯一数据出口**
//
// 这个表的所有数据库查询都集中在这里，只对外暴露函数：
//   listEpisodes(envId, {status})   剧集列表，按「第几集」升序；可按状态筛选
//
// 谁在用：drama-episodes（GET /api/drama/episodes）。
//
// 归一化说明：返回的行已经过 normalizeEpisode——
// cast 字段在库里是 JSONB（个别网关会给成字符串），统一归一成数组；
// duration/summary 等空值兜底成空串/0。接口层拿到即可直接放进响应。
// 列名注意："order" 是 SQL 保留字，必须带英文双引号（见 db.js 头部铁律）。

"use strict";

const { getDb, dbError } = require("./db");

// 本表的列清单：加字段只改这里
const COLUMNS = {
  all:
    '"id","order","title","status","duration","durationSec","summary","scene","videoUrl","cast","updatedAt"',
};

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

/** 剧集列表，按第几集升序；可按状态筛选。cast 在库里是 JSONB，这里顺手归一成数组。 */
async function listEpisodes(envId, options) {
  const opts = options || {};
  let q = getDb(envId).from("drama_episodes").select(COLUMNS.all);
  if (opts.status) q = q.eq("status", opts.status);
  q = q.order("order", { ascending: true });
  const res = await q;
  if (res.error) throw dbError("drama_episodes", res);
  return (Array.isArray(res.data) ? res.data : []).map(normalizeEpisode);
}

module.exports = {
  listEpisodes: listEpisodes,
};
