-- ============================================================================
-- 【案例演示】今日热搜 · 种子数据（seed.sql）
-- 数据库：PostgreSQL 17（腾讯云 CloudBase）
-- ----------------------------------------------------------------------------
-- ⚠️ 案例演示脚本，不要在本项目的 public schema 上跑（理由见 schema.sql 顶部）。
--    本文件会 DROP 掉 trends / favorites 两张表，落在 public 下会清空你 Day 16 的真表。
--    要试跑先切到独立 schema：
--        CREATE SCHEMA IF NOT EXISTS case_demo;
--        SET search_path TO case_demo;
-- ----------------------------------------------------------------------------
-- 结构：先 DROP → 再 CREATE → 再 INSERT（本文件自成一体，不依赖 schema.sql 先跑）
-- 可重复执行：连跑两遍不报错、也不会翻倍。原理有三层：
--   1) DROP TABLE IF EXISTS —— 表不存在时也不报错（第一次执行就靠它）
--   2) DROP 会连表上的唯一索引、自增序列一起删掉，CREATE 时重新生成
--      → 所以每次执行完 id 都从 1 开始，结果完全可复现
--   3) 因为表是全新的，INSERT 里没有任何冲突可能
-- ============================================================================


-- ============================================================ 第 1 步：DROP
-- 先删 favorites 再删 trends。
-- 顺序不能反：favorites.trends_id 是指向 trends 的外键，
-- 先删父表 trends 会因为「还有子表依赖它」报错。
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS trends;


-- ============================================================ 第 2 步：CREATE
-- 与 schema.sql 完全一致（本文件独立可跑，所以 DDL 在这里重写一遍）

CREATE TABLE IF NOT EXISTS trends (
  id          BIGSERIAL   PRIMARY KEY,
  title       TEXT        NOT NULL,
  heat        TEXT        NOT NULL,
  platform    TEXT        NOT NULL,
  rank        INTEGER     NOT NULL,
  trend_date  DATE        NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_trends_platform_title_date
  ON trends (platform, title, trend_date);

CREATE INDEX IF NOT EXISTS idx_trends_trend_date
  ON trends (trend_date);

CREATE TABLE IF NOT EXISTS favorites (
  id         BIGSERIAL   PRIMARY KEY,
  trends_id  BIGINT      NOT NULL,
  note       TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT favorites_trends_id_fkey
    FOREIGN KEY (trends_id) REFERENCES trends (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_favorites_trends_id
  ON favorites (trends_id);


-- ============================================================ 第 3 步：INSERT

-- 3.1 热搜：5 条（标题按平台区分，故意用「案例热搜」开头，跟本项目的「示例热搜」区分开）
INSERT INTO trends (title, heat, platform, rank, trend_date, fetched_at) VALUES
  ('案例热搜一：某地迎来初雪刷屏',     '523 万', 'weibo',  1, DATE '2026-10-05', now() - INTERVAL '5 minutes'),
  ('案例热搜二：新款手机今日正式发布', '412 万', 'baidu',  2, DATE '2026-10-05', now() - INTERVAL '4 minutes'),
  ('案例热搜三：这部剧大结局引热议',   '388 万', 'douyin', 3, DATE '2026-10-05', now() - INTERVAL '3 minutes'),
  ('案例热搜四：周末周边游攻略走红',   '301 万', 'weibo',  4, DATE '2026-10-05', now() - INTERVAL '2 minutes'),
  ('案例热搜五：一杯奶茶的热量真相',   '276 万', 'baidu',  5, DATE '2026-10-05', now() - INTERVAL '1 minutes');

-- 3.2 收藏：5 条，每条都指向上面真实存在的热搜
--     这里不写死 trends_id = 1/2/3...，而是「按标题去找那一行的 id」：
--     因为 id 是数据库自增生成的，写死数字一旦对不上就会触发外键报错。
INSERT INTO favorites (trends_id, note)
SELECT t.id, v.note
FROM (VALUES
  ('案例热搜一：某地迎来初雪刷屏',     '周末去看看原文'),
  ('案例热搜二：新款手机今日正式发布', ''),
  ('案例热搜三：这部剧大结局引热议',   '据说结局有反转'),
  ('案例热搜四：周末周边游攻略走红',   ''),
  ('案例热搜五：一杯奶茶的热量真相',   '同事推荐看的')
) AS v(title, note)
JOIN trends t ON t.title = v.title;


-- ============================================================================
-- 附：验证语句（不自动执行，手动跑）
--
--   1) 各有多少行（预期 trends 5 行、favorites 5 行）
--      SELECT 'trends' AS 表名, count(*) AS 行数 FROM trends
--      UNION ALL
--      SELECT 'favorites', count(*) FROM favorites;
--
--   2) 看热搜全部内容（排名按数字从小到大，这正是 rank 用 INTEGER 的意义）
--      SELECT id, title, heat, platform, rank, trend_date, fetched_at
--      FROM trends ORDER BY rank;
--
--   3) 看收藏 + 反查原热搜（JOIN 就是 trends_id 这个外键的用途）
--      SELECT f.id, f.trends_id, t.title, t.rank, t.heat, f.note, f.created_at
--      FROM favorites f
--      JOIN trends t ON t.id = f.trends_id
--      ORDER BY f.id;
--
--   4) 验证唯一索引真的生效（这条应该报错：duplicate key value violates unique constraint）
--      INSERT INTO trends (title, heat, platform, rank, trend_date)
--      VALUES ('案例热搜一：某地迎来初雪刷屏', '1 万', 'weibo', 9, DATE '2026-10-05');
-- ============================================================================
