// shared/db.js —— 数据访问层·**核心模块**（连库 + 通用工具）
//
// ============================================================
// 这个文件管什么、不管什么（Day 20 细分后）
//
//   Day 19 把「查数据库」从 5 个云函数搬进了 shared/db.js；
//   Day 20 再细拆一层：**按表分家**——
//     shared/db.js                     → 只留「连库 + 通用工具」，不含任何一张表的查询
//     shared/trendsRepository.js       → trends 表的全部查询（热搜记录表）
//     shared/favoritesRepository.js    → favorites 表的全部查询（收藏表）
//     shared/dramaEpisodesRepository.js    → drama_episodes 表（漫剧·核心表）
//     shared/dramaWatchLogsRepository.js   → drama_watch_logs 表（漫剧·记录表）
//
//   为什么要按表拆：db.js 全包时，改一个表的查询要在 270 行里找；
//   拆开后「这张表能做什么查询」打开对应 Repository 一目了然，
//   而且每个文件里只有自己表的列清单，改表不会牵连别的表。
//
//   接口层（cloudfunctions/*/index.js）只 require 自己用到的 Repository，
//   一行 SQL 查询都看不到 —— 这就是「数据访问层」的对外边界。
//
// ============================================================
// 怎么被云函数用到（CloudBase 的部署现实，Day 19 已验证）
//
// CloudBase 云函数是**按目录整体打包上传**的，跨目录的 `require("../shared/...")` 在云端会找不到文件。
// 流程：改 shared/ 下任一文件 → `node scripts/sync-shared.js`
//   → 脚本把每个云函数**用到的**文件复制进它的 `lib/` 目录 → `tcb fn deploy <函数名> -e "$ENV" --force`。
// 云函数里一律 `require("./lib/<xxx>Repository")` 或 `require("./lib/db")`。
// ⚠️ 因此 **改数据访问只改 shared/ 下的源文件**，不要改 `cloudfunctions/*/lib/`（那是生成的副本）。
//
// ============================================================
// 两条铁律（Day 16 定下，重构后照旧）
//
// 1) 列名一律加英文双引号：PostgreSQL 会把无引号标识符折叠成小写，
//    `trendId` → `trendid`，接口吐出的 JSON 键就跟契约对不上了。
//    `"order"` 还是 SQL 保留字，不加引号直接语法错误。
//    （各表的列清单现在放在各自的 Repository 里维护。）
// 2) SQL 必须参数化：只用 SDK 查询构造器（PostgREST 风格），筛选值由 SDK 走 HTTP 参数传给网关，
//    全部数据访问代码没有任何一处 SQL 字符串拼接，因此不存在注入面。
//
// 错误处理约定：**Repository 的查询函数遇到数据库错误直接抛中文 Error**（云函数 catch 后统一回 500）；
// 只有 insert 类函数例外——主键冲突是同步/并发幂等的预期内情况，返回 `{ok:false,error}` 交给调用方，不抛。
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

// ------------------------------------------------------------
// 通用小工具（Repository 们共用；本来在每个云函数里各写一份，现在只有一份）
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

module.exports = {
  getDb: getDb,
  pick: pick,
  toIso: toIso,
  dbError: dbError,
};
