-- ============================================================================
-- 【案例演示】今日热搜 · 数据模型（schema.sql）
-- 数据库：PostgreSQL 17（腾讯云 CloudBase）
-- ----------------------------------------------------------------------------
-- ⚠️ 这是训练营给的「案例演示」脚本，*不是*本项目的建表脚本。
--    本项目真正的表在上一级目录的 ../schema.sql，字段与命名都不一样
--    （项目用 "trendId"/"createdAt" 驼峰 + 双引号，本文件用 trends_id 等下划线命名）。
--
-- ⚠️ 请不要在本项目的 public schema 里执行本文件！
--    本文件操作的表名恰好也叫 trends / favorites，一旦落在 public 下，
--    会覆盖并清空 Day 16 已经建好、已经灌了种子的真表。
--    要试跑请单独开一个 schema，例如：
--        CREATE SCHEMA IF NOT EXISTS case_demo;
--        SET search_path TO case_demo;
--    然后再执行本文件内容。
-- ----------------------------------------------------------------------------
-- 可重复执行：全部语句都带 IF NOT EXISTS，跑第二遍不会报错。
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 表 1：trends —— 热搜记录
--   一行 = 某一天、某个平台上的一条热搜
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trends (
  id          BIGSERIAL   PRIMARY KEY,              -- ① 主键
  title       TEXT        NOT NULL,                 -- ② 标题
  heat        TEXT        NOT NULL,                 -- ③ 热度
  platform    TEXT        NOT NULL,                 -- ④ 来源平台
  rank        INTEGER     NOT NULL,                 -- ⑤ 排名
  trend_date  DATE        NOT NULL,                 -- ⑥ 日期
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()     -- ⑦ 抓取时间
);

-- 唯一索引：(来源平台, 标题, 日期)
--   含义：同一天、同一平台上，同一条标题只能存在一行。
--   作用：重复抓取时让数据库本身挡住重复数据 —— Day 17 的 POST /api/sync
--        做「重复执行不产生重复行」靠的就是它。
CREATE UNIQUE INDEX IF NOT EXISTS ux_trends_platform_title_date
  ON trends (platform, title, trend_date);

-- 普通索引：按日期查「今天的热搜」时用得上。
-- 唯一索引的最左列是 platform，单查日期帮不上忙，所以日期单独再建一个。
CREATE INDEX IF NOT EXISTS idx_trends_trend_date
  ON trends (trend_date);


-- ----------------------------------------------------------------------------
-- 表 2：favorites —— 收藏（含「我的备注」）
--   一行 = 用户收藏的某一条热搜 + 自己写的备注
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
  id         BIGSERIAL   PRIMARY KEY,                -- ① 主键
  trends_id  BIGINT      NOT NULL,                   -- ② 关联 trends.id
  note       TEXT        NOT NULL DEFAULT '',        -- ③ 备注
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),     -- ④ 创建时间
  -- 外键：favorites.trends_id → trends.id
  --   ON DELETE CASCADE：原热搜被删时，指向它的收藏跟着删，不留孤儿数据。
  CONSTRAINT favorites_trends_id_fkey
    FOREIGN KEY (trends_id) REFERENCES trends (id) ON DELETE CASCADE
);

-- 普通索引：按 trends_id 反查「这条热搜被谁收藏了」时会用到；
-- 外键本身不会自动建索引，手建一个。
CREATE INDEX IF NOT EXISTS idx_favorites_trends_id
  ON favorites (trends_id);


-- ============================================================================
-- 附：每个字段为什么选这个类型
-- ----------------------------------------------------------------------------
-- 【trends】
--   id          BIGSERIAL    自增整数当主键。交给数据库生成，不用手写、不会撞号。
--                            选 bigint 而不是 int：int 上限约 21 亿，热搜是天天累积的数据，
--                            用 bigint 一劳永逸。（BIGSERIAL = bigint + 自增序列）
--   title       TEXT         TEXT 不限长度，热搜标题长短不可控；
--                            VARCHAR(n) 一旦超长就会插入失败，没必要给自己埋雷。
--   heat        TEXT         热度保留成文本（如 '523 万'）。各平台热度带「万/亿」等中文单位，
--                            有的还会写成「热」这样的标记，转成数字会失真。
--   platform    TEXT         平台标识用一个短字符串（weibo / baidu / douyin）。
--                            可以另建平台字典表再存外键，但只有三个固定值，这里不值得多一张表。
--   rank        INTEGER       排名是要比较大小的：integer 排出来是 1,2,10；
--                            用 TEXT 排会变成 1,10,2（按字符比），所以必须用数字类型。
--   trend_date  DATE         只关心「哪一天」，不需要时分秒，用 DATE 最贴合语义，
--                            也顺带省掉时区换算的麻烦（DATE 无时区概念）。
--   fetched_at  TIMESTAMPTZ  「什么时候抓到的」必须精确到时刻，所以用时间戳。
--                            选 TIMESTAMPTZ（带时区）而不是 TIMESTAMP：
--                            服务器在云端（可能是 UTC），用户在本地，带时区才不会把 UTC 误当北京时间。
--
-- 【favorites】
--   id          BIGSERIAL    收藏记录自己的编号，跟 trends_id 是两回事：
--                            这是「哪一条收藏」，不是「哪一条热搜」。
--   trends_id   BIGINT       外键，类型必须跟被引用的 trends.id 完全一致（bigint），
--                            类型不一致 PostgreSQL 会直接拒绝建外键。命名沿用任务的写法。
--   note        TEXT         「我的备注」可以为空。用 TEXT + NOT NULL + 默认空串：
--                            读出来永远是字符串，前端不用每次判断 null（不会拿到 None / undefined）。
--   created_at  TIMESTAMPTZ  记录收藏发生的时刻，理由同 fetched_at。
-- ============================================================================
