-- ============================================================
-- 《我的AI不预测股价，它预测人性》· AI 漫剧线建表 DDL
-- Day 17：为「我的AI漫」实现第一个读取接口 —— 先有自己的表
--
-- 为什么建这两张表（按「数据从哪来」三问的结论）：
--   ① 剧集/角色/工具是**我自己产出的**，不是外部公开数据（不是热搜、天气那一类）；
--   ② 要能回看过去（第 3 集什么时候定稿的，得查得到）；
--   ③ 现在只写在 assets/js/data.js 的前端常量里，换设备清缓存就没了 → **必须落库**。
-- 结论：用户产出 → 存数据库，这是项目的核心资本。不需要去找任何外部 API。
--
-- 表设计（对应打卡应用的 plan_days + checkins）：
--   drama_episodes   = 核心表（内容本体：剧集）
--   drama_watch_logs = 记录表（用户行为：每一次观看，类似「打卡」）
--
-- ⚠️ 两条铁律（与 trends / favorites 一致）：
--   1) 列名一律加英文双引号，否则 PostgreSQL 折叠成小写，接口返回的 JSON 键就对不上；
--   2) "order" 是 SQL 保留字，不加引号会直接语法错误。
-- ============================================================

CREATE TABLE IF NOT EXISTS "drama_episodes" (
  "id"          TEXT        PRIMARY KEY,           -- 'ep01' 形式
  "order"       INTEGER     NOT NULL,              -- 第几集（保留字，必须引号）
  "title"       TEXT        NOT NULL,              -- 集标题，如「群里的光」
  "status"      TEXT        NOT NULL DEFAULT '剧本定稿',  -- 剧本定稿 / 制作中 / 已发布
  "duration"    TEXT        NOT NULL DEFAULT '',   -- 展示用时长，如 '约 90 秒'
  "durationSec" INTEGER     NOT NULL DEFAULT 0,    -- 数值时长，便于排序/统计
  "summary"     TEXT        NOT NULL DEFAULT '',   -- 一句话简介
  "scene"       TEXT        NOT NULL DEFAULT '',   -- 主要场景
  "videoUrl"    TEXT        NOT NULL DEFAULT '',   -- 成片外链（视频不进仓库）
  "cast"        JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- 出场角色 id 数组
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  "drama_episodes"            IS 'AI漫剧·核心表：剧集（内容本体，创作者产出）';
COMMENT ON COLUMN "drama_episodes"."order"     IS '第几集（列名是保留字，所有 SQL 必须带引号）';
COMMENT ON COLUMN "drama_episodes"."cast"      IS '出场角色 id 数组（JSONB）';
COMMENT ON COLUMN "drama_episodes"."videoUrl"  IS '成片外链；视频本体不进仓库';

-- 记录表：一次观看 = 一次「打卡」
CREATE TABLE IF NOT EXISTS "drama_watch_logs" (
  "id"         TEXT        PRIMARY KEY,            -- 'log-1'
  "episodeId"  TEXT        NOT NULL REFERENCES "drama_episodes"("id") ON DELETE CASCADE,
  "viewer"     TEXT        NOT NULL DEFAULT 'me',  -- 观众标识（暂无用户系统，先记 'me'）
  "progress"   INTEGER     NOT NULL DEFAULT 0,     -- 观看进度百分比 0-100
  "device"     TEXT        NOT NULL DEFAULT '',    -- 设备/来源
  "watchedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()  -- 什么时候看的（回看历史靠它）
);

COMMENT ON TABLE  "drama_watch_logs"             IS 'AI漫剧·记录表：观看记录（用户行为，一次观看=一次打卡）';
COMMENT ON COLUMN "drama_watch_logs"."episodeId"  IS '关联 drama_episodes.id，级联删除';
COMMENT ON COLUMN "drama_watch_logs"."watchedAt"   IS '观看时间，用于回看历史';

CREATE INDEX IF NOT EXISTS "idx_drama_episodes_order"    ON "drama_episodes" ("order");
CREATE INDEX IF NOT EXISTS "idx_drama_episodes_status"   ON "drama_episodes" ("status");
CREATE INDEX IF NOT EXISTS "idx_drama_watchlogs_episode" ON "drama_watch_logs" ("episodeId");
CREATE INDEX IF NOT EXISTS "idx_drama_watchlogs_time"    ON "drama_watch_logs" ("watchedAt");
