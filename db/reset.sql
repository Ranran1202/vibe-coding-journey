-- ============================================================
-- 今日热搜（hot-search-demo）· 重置脚本（先删后建再插入）
-- 环境：腾讯云 CloudBase · PostgreSQL 17.11
-- 依据：api-contract.md §2「数据表」+ db/schema.sql
-- ----------------------------------------------------------------------------
-- 用途：把 trends / favorites 两张表**恢复成干净的种子状态**。
--       结构照抄 db/schema.sql，数据与 db/seed.sql 完全一致。
--
-- ⚠️⚠️ 本脚本第一步就是 DROP TABLE —— 两张表的**现有数据会被全部清空**。
--       只适合开发期重置。Day 17 用 POST /api/sync 灌进真实热搜、
--       第 4 周有了真实收藏数据之后，**不要再随手跑这个脚本**。
--       日常只想补种子、不想清空数据的话，用 db/seed.sql（它是纯 INSERT + ON CONFLICT）。
--
-- 可重复执行：DROP → CREATE → INSERT，跑多少遍结果都完全一样。
--   1) DROP TABLE IF EXISTS       → 表不存在也不报错
--   2) DROP 会连索引一起删掉，CREATE 时重建
--   3) 表刚建好必为空，所以 INSERT 不可能冲突
-- 可复现：时间字段写死固定值（不用 now()），所以每次执行后**全表内容逐字节一致**。
-- ============================================================


-- ============================================================ 第 1 步：DROP
-- 顺序不能反：favorites."trendId" 是指向 trends 的外键，
-- 先删父表 trends 会因「还有子表依赖它」报错。
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS trends;


-- ============================================================ 第 2 步：CREATE
-- 与 db/schema.sql 完全一致（本脚本独立可跑，所以 DDL 在这里重写一遍）
-- ⚠️ 列名全部加英文双引号：PostgreSQL 会把没引号的标识符折叠成小写
--    （trendId → trendid），那样 Day 17 接口返回的 JSON 键就跟前端对不上。

CREATE TABLE IF NOT EXISTS trends (
  "id"        TEXT        NOT NULL,
  "platform"  TEXT        NOT NULL,
  "rank"      INTEGER     NOT NULL,
  "title"     TEXT        NOT NULL,
  "heat"      TEXT        NOT NULL,
  "url"       TEXT        NOT NULL DEFAULT '',
  "date"      TEXT        NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trends_pkey PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS idx_trends_date     ON trends ("date");
CREATE INDEX IF NOT EXISTS idx_trends_platform ON trends ("platform");

CREATE TABLE IF NOT EXISTS favorites (
  "id"        TEXT        NOT NULL,
  "trendId"   TEXT        NOT NULL,
  "title"     TEXT        NOT NULL,
  "platform"  TEXT        NOT NULL,
  "note"      TEXT        NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT favorites_pkey PRIMARY KEY ("id"),
  CONSTRAINT favorites_trendid_fkey FOREIGN KEY ("trendId") REFERENCES trends ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_favorites_trendid ON favorites ("trendId");


-- ============================================================ 第 3 步：INSERT
-- 表刚建好、必为空，所以直接 INSERT 不会有主键冲突。
-- 时间字段给固定值（不用 now()）——这样任何一次执行的结果都完全相同，可复现。

-- 3.1 trends：5 条（沿用 my-app/js/data.js 的 5 条示例热搜）
INSERT INTO trends ("id", "platform", "rank", "title", "heat", "url", "date", "createdAt") VALUES
  ('weibo-1',  'weibo',  1, '示例热搜一：某地迎来初雪刷屏',   '523 万', 'https://s.weibo.com/top/summary', '2026-10-05', '2026-10-05 00:00:00+00'),
  ('baidu-2',  'baidu',  2, '示例热搜二：新款手机今日正式发布', '412 万', 'https://top.baidu.com/board',     '2026-10-05', '2026-10-05 00:00:00+00'),
  ('douyin-3', 'douyin', 3, '示例热搜三：这部剧大结局引热议',   '388 万', 'https://www.douyin.com/hot',      '2026-10-05', '2026-10-05 00:00:00+00'),
  ('weibo-4',  'weibo',  4, '示例热搜四：周末周边游攻略走红',   '301 万', 'https://s.weibo.com/top/summary', '2026-10-05', '2026-10-05 00:00:00+00'),
  ('baidu-5',  'baidu',  5, '示例热搜五：一杯奶茶的热量真相',   '276 万', 'https://top.baidu.com/board',     '2026-10-05', '2026-10-05 00:00:00+00');

-- 3.2 favorites：5 条，trendId 全部指向上面真实存在的 trends.id
--     note 留两条空字符串，验证「没有备注」也能正常存
INSERT INTO favorites ("id", "trendId", "title", "platform", "note", "createdAt", "updatedAt") VALUES
  ('fav-1', 'weibo-1',  '示例热搜一：某地迎来初雪刷屏',   'weibo',  '周末去看看原文', '2026-10-05 01:00:00+00', '2026-10-05 01:00:00+00'),
  ('fav-2', 'baidu-2',  '示例热搜二：新款手机今日正式发布', 'baidu',  '',               '2026-10-05 01:00:00+00', '2026-10-05 01:00:00+00'),
  ('fav-3', 'douyin-3', '示例热搜三：这部剧大结局引热议',   'douyin', '据说结局有反转', '2026-10-05 01:00:00+00', '2026-10-05 01:00:00+00'),
  ('fav-4', 'weibo-4',  '示例热搜四：周末周边游攻略走红',   'weibo',  '',               '2026-10-05 01:00:00+00', '2026-10-05 01:00:00+00'),
  ('fav-5', 'baidu-5',  '示例热搜五：一杯奶茶的热量真相',   'baidu',  '同事推荐看的',   '2026-10-05 01:00:00+00', '2026-10-05 01:00:00+00');


-- ============================================================
-- 附：验证语句（不自动执行，手动跑；详细步骤见 db/README.md）
--
--   1) 各有多少行（预期 5 / 5）
--      SELECT 'trends' AS tbl, count(*) FROM trends
--      UNION ALL SELECT 'favorites', count(*) FROM favorites;
--
--   2) 热搜全量（rank 必须是 1,2,3,4,5 的顺序 —— 这是 rank 用 INTEGER 的意义）
--      SELECT "id", "rank", "title", "heat", "platform", "date" FROM trends ORDER BY "rank";
--
--   3) 收藏 JOIN 反查原热搜（trendId 这个外键的用途）
--      SELECT f."id", f."trendId", t."title", t."rank", f."note"
--      FROM favorites f JOIN trends t ON t."id" = f."trendId" ORDER BY f."id";
-- ============================================================
