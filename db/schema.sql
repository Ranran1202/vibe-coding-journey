-- ============================================================
-- 今日热搜（hot-search-demo）· 数据库表结构
-- 环境：腾讯云 CloudBase · PostgreSQL 17
-- 依据：api-contract.md v0.3.0 §2「数据表（第 3 周建表依据）」
-- 执行：可重复执行（CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS）
-- 说明：列名全部加英文双引号，是为了精确保留驼峰写法（trendId / createdAt）。
--       PostgreSQL 默认会把没加引号的标识符折叠成小写（trendId → trendid），
--       那将来接口返回的 JSON 键就会变成 trendid，跟前端期待的 trendId 对不上。
-- ============================================================


-- ------------------------------------------------------------
-- 1. trends —— 热搜记录表
--    存什么：某一天、某个平台上的热搜条目。
--    数据从哪来：现在写死在前端 js/data.js 的 HOT_DATA；
--                Day 17 的 POST /api/sync 会从公开来源拉真实数据写进来。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trends (
  "id"        TEXT        NOT NULL,  -- 主键：形如 'weibo-1' = 平台 + '-' + 排名，跟前端 itemId() 完全一致
  "platform"  TEXT        NOT NULL,  -- 来源平台 key：weibo / baidu / douyin（对应 config.js 的 PLATFORMS）
  "rank"      INTEGER     NOT NULL,  -- 排名
  "title"     TEXT        NOT NULL,  -- 热搜标题
  "heat"      TEXT        NOT NULL,  -- 热度，原样字符串如 '523 万'（不转数字，因为带中文单位）
  "url"       TEXT        NOT NULL DEFAULT '',  -- 去原平台查看的链接
  "date"      TEXT        NOT NULL,  -- 数据日期 'YYYY-MM-DD'（纯文本，跟前端、契约保持一致，避免时区换算）
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),  -- 入库时间（带时区，统一 UTC 存储）
  CONSTRAINT trends_pkey PRIMARY KEY ("id")
);

COMMENT ON TABLE  trends IS '热搜记录表：一天里各平台的热搜条目。来源：前端 HOT_DATA → Day 17 的 POST /api/sync 写入。';
COMMENT ON COLUMN trends."id"        IS '主键。形如 weibo-1（platform-rank），与前端 app.js 的 itemId() 一致，收藏和详情页都靠它定位。';
COMMENT ON COLUMN trends."platform"  IS '来源平台 key：weibo / baidu / douyin，对应 my-app/js/config.js 的 PLATFORMS。';
COMMENT ON COLUMN trends."rank"      IS '在该平台当天的排名。选 INTEGER（而非 TEXT）是为了能正确按数字排序（1,2,10 而不是 1,10,2）。';
COMMENT ON COLUMN trends."title"     IS '热搜标题。选 TEXT 而非 VARCHAR(n)：热搜标题长短不可控，TEXT 不限长度，省得以后爆长度报错。';
COMMENT ON COLUMN trends."heat"      IS '热度原始字符串（如 "523 万"）。刻意保留 TEXT：平台热度带中文单位且在变，转数字容易失真，也违背 api-contract 的约定。';
COMMENT ON COLUMN trends."url"       IS '跳转到原平台查看该热搜的链接。给默认空串，避免 Day 17 拿不到链接时 NOT NULL 报错。';
COMMENT ON COLUMN trends."date"      IS '数据日期 YYYY-MM-DD。用 TEXT 而非 DATE：与契约/前端完全一致；需要按日期范围查询时再改 DATE 也不迟。';
COMMENT ON COLUMN trends."createdAt" IS '入库时间。选 TIMESTAMPTZ（带时区）而非 TIMESTAMP：服务器在云端、用户在本地，带时区才不会把 UTC 当成北京时间。';

CREATE INDEX IF NOT EXISTS idx_trends_date     ON trends ("date");      -- GET /api/hot?date= 会按日期查
CREATE INDEX IF NOT EXISTS idx_trends_platform ON trends ("platform");  -- GET /api/hot?platform= 和平台计数会用到


-- ------------------------------------------------------------
-- 2. favorites —— 收藏表（含「我的备注」）
--    存什么：用户收藏了哪条热搜、备注写了什么。
--    数据从哪来：现在存在浏览器 localStorage（store.js）；
--                第 4 周写 POST/PATCH/DELETE /api/favorites 后搬进这张表。
--    怎么跟 trends 关联：favorites.trendId → trends.id（多对一：多条收藏可以指向同一条热搜）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
  "id"        TEXT        NOT NULL,  -- 主键：收藏记录 id，形如 'fav-1'
  "trendId"   TEXT        NOT NULL,  -- ← 关联字段：指向 trends.id（如 'weibo-1'）
  "title"     TEXT        NOT NULL,  -- 冗余存一份标题（原热搜变动/下架后，收藏列表仍能显示）
  "platform"  TEXT        NOT NULL,  -- 冗余存一份平台 key
  "note"      TEXT        NOT NULL DEFAULT '',  -- 我的备注（对应 store.js 的 note），没有就空字符串
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),  -- 收藏时间
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),  -- 备注最近更新时间（第 4 周 PATCH 会改它）
  CONSTRAINT favorites_pkey PRIMARY KEY ("id"),
  CONSTRAINT favorites_trendid_fkey FOREIGN KEY ("trendId") REFERENCES trends ("id") ON DELETE CASCADE
);

COMMENT ON TABLE  favorites IS '收藏表：用户收藏的热搜 + 我的备注。「有没有这条记录」本身就代表是否收藏，不需要额外的是否收藏字段。';
COMMENT ON COLUMN favorites."id"        IS '主键：收藏记录自身的 id（形如 fav-1）。注意跟 trendId 区分——这是收藏的 id，不是热搜的 id。';
COMMENT ON COLUMN favorites."trendId"   IS '★关联字段★ 指向 trends.id。靠它才能从收藏反查原热搜（标题、排名、热度）。ON DELETE CASCADE：原热搜被删除时，这条收藏跟着删，不留孤儿数据。';
COMMENT ON COLUMN favorites."title"     IS '冗余存一份当时的标题。冗余的代价是可能跟原表不一致，好处是热搜下架后收藏列表不至于空白——列表显示场景值这个代价。';
COMMENT ON COLUMN favorites."platform"  IS '冗余存一份平台 key，收藏页按平台筛选时不用每次回头查 trends。';
COMMENT ON COLUMN favorites."note"      IS '我的备注。NOT NULL + 默认空串：省得前端每次判断 null，读出来就是字符串。';
COMMENT ON COLUMN favorites."createdAt" IS '收藏时间。';
COMMENT ON COLUMN favorites."updatedAt" IS '备注最近更新时间。第 4 周的 PATCH /api/favorites/:id 会更新它（前端据此显示「最近修改」）。';

CREATE INDEX IF NOT EXISTS idx_favorites_trendid ON favorites ("trendId");  -- 按 trendId 查「这条热搜被收藏了吗」会用到
