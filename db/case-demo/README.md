# db/case-demo/ —— 【案例演示】数据模型（请勿用于本项目）

这里放的是训练营「案例演示」用的 `trends` / `favorites` 脚本，**不是本项目的建表脚本**。

本项目的真表在上一级目录：`db/schema.sql`、`db/seed.sql`（列名带双引号、驼峰命名，已建好并已推送）。

## ⚠️ 头号警告：不要在 public schema 上执行本目录的脚本

案例版的表名**恰好也叫 `trends` / `favorites`**，而且 `seed.sql` 第一步就是
`DROP TABLE IF EXISTS`。如果你在本项目环境里直接粘贴执行，会：

1. 先删掉 public 下你 Day 16 建好的真表（连带里面的种子数据）；
2. 再按案例结构重建，字段完全不同 —— Day 17 的读接口就会对不上号。

**所以：要么按下面的「安全执行」切到独立 schema，要么干脆不跑。**

---

## 一、案例版表结构

### trends（热搜记录）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | BIGSERIAL PK | 主键，数据库自增 |
| `title` | TEXT | 标题 |
| `heat` | TEXT | 热度（如 `'523 万'`） |
| `platform` | TEXT | 来源平台 |
| `rank` | INTEGER | 排名 |
| `trend_date` | DATE | 日期 |
| `fetched_at` | TIMESTAMPTZ | 抓取时间 |

唯一索引 `ux_trends_platform_title_date (platform, title, trend_date)`：
同一天、同一平台上，同一条标题只能有一行 —— 重复抓取时靠它幂等。

### favorites（收藏）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | BIGSERIAL PK | 主键 |
| `trends_id` | BIGINT FK → trends.id | 关联字段，`ON DELETE CASCADE` |
| `note` | TEXT NOT NULL DEFAULT '' | 备注 |
| `created_at` | TIMESTAMPTZ | 创建时间 |

**关联字段：`favorites.trends_id` → `trends.id`**（多对一）

---

## 二、安全执行（二选一）

### 路线 A：控制台 SQL 编辑器（推荐，最直观）

1. 打开 CloudBase 控制台 →「**数据库**」→「**SQL 编辑器**」
   （另一条等效路径：数据库设置 → 账号管理 → 建账号 →「**数据库管理**」进 DMC 工具 → **SQL 窗口**）
2. **先单独执行这一行**，把独立 schema 建出来：

   ```sql
   CREATE SCHEMA IF NOT EXISTS case_demo;
   ```

3. **再一次性**把下面这段（`SET search_path` + `seed.sql` 全文）粘进编辑器、**只执行一次**：

   ```sql
   SET search_path TO case_demo;
   -- ↓↓↓ 这里接 db/case-demo/seed.sql 的全文 ↓↓↓
   ```

   > 关键：`SET search_path` 必须和脚本**在同一次执行里**，不能分两次跑。
   > 因为 `SET` 只对当前连接有效，分两次很可能落到不同的连接上，`search_path` 就白设了。
   > 这样所有 `trends` / `favorites` 都会被解析成 `case_demo.trends` / `case_demo.favorites`，
   > 碰不到 public 下的真表。

4. 跑完**立刻用这条兜底自查**（预期两行都是 `5`）：

   ```sql
   SELECT 'public.trends' AS tbl, count(*) FROM public.trends
   UNION ALL SELECT 'public.favorites', count(*) FROM public.favorites;
   ```

   只要这里还是 5 / 5，说明真表没被动过。

### 路线 B：命令行（我在本机验证时用的就是这条）

```bash
cd /c/Users/86153/WorkBuddy/vibe-coding-journey
export MSYS_NO_PATHCONV=1
export PATH="$PATH:/c/Users/86153/.workbuddy/binaries/node/workspace/node_modules/.bin"
ENV=$(node -p "require('./cloudbaserc.json').envId")

# 1) 建独立 schema
tcb db execute -e "$ENV" --sql "CREATE SCHEMA IF NOT EXISTS case_demo"

# 2) 把表名加上 case_demo. 前缀后再执行（关键的一步，保证不碰 public）
SQL=$(sed -e 's/\btrends\b/case_demo.trends/g' \
           -e 's/\bfavorites\b/case_demo.favorites/g' db/case-demo/seed.sql)
tcb db execute -e "$ENV" --sql "$SQL"
```

> `sed` 里用 `\b...\b` 词边界，是为了**只改表名**、不动索引名
> （`ux_trends_platform_title_date`、`idx_favorites_trends_id` 里的 `trends`/`favorites`
> 后面紧跟 `_`，属于同一单词，不会被替换）。

---

## 三、验证方法

### 1）用 select 查插入的行

```sql
-- 热搜：预期 5 行，且按 rank 从小到大（1,2,3,4,5 —— INTEGER 排序的效果）
SELECT id, title, heat, platform, rank, trend_date, fetched_at
FROM case_demo.trends ORDER BY rank;

-- 收藏：预期 5 行，JOIN 出原热搜标题（这就是 trends_id 这个外键的用途）
SELECT f.id, f.trends_id, t.title, t.rank, t.heat, f.note, f.created_at
FROM case_demo.favorites f
JOIN case_demo.trends t ON t.id = f.trends_id
ORDER BY f.id;

-- 行数统计：预期两张表各 5
SELECT 'trends' AS tbl, count(*) FROM case_demo.trends
UNION ALL SELECT 'favorites', count(*) FROM case_demo.favorites;
```

### 2）验证「重复执行不报错」

把路线 A 第 3 步再执行一遍，应当**依然成功**、行数**依然是 5**（不翻倍）。
原理：`DROP TABLE` 会连表上的唯一索引和自增序列一起删掉，重建后 id 又从 1 开始，
所以每次跑完结果完全一致。

### 3）验证唯一索引真的生效

插入一条与已有记录「同平台 + 同标题 + 同日期」的数据，应当**报错**：

```sql
INSERT INTO case_demo.trends (title, heat, platform, rank, trend_date)
VALUES ('案例热搜一：某地迎来初雪刷屏', '1 万', 'weibo', 9, DATE '2026-10-05');
-- 预期：ERROR: duplicate key value violates unique constraint "ux_trends_platform_title_date" (SQLSTATE 23505)
```

### 4）控制台里看数据（图形界面）

控制台 →「数据库」→ 表管理 → 选中 `case_demo` 下的 `trends` / `favorites` → 数据页签。

---

## 四、实测记录（2026-10-05，本机 CLI 执行）

| 验证项 | 结果 |
|---|---|
| 第 1 遍执行 seed.sql | ✅ `Affected rows: 5` |
| 第 2 遍执行（幂等） | ✅ 成功，且 `trends` 5 行 / `favorites` 5 行，未翻倍 |
| `SELECT ... ORDER BY rank` | ✅ 1,2,3,4,5 顺序正确 |
| `favorites JOIN trends` | ✅ 5 条收藏全部反查到原热搜 |
| 唯一索引挡重复 | ✅ 报 `SQLSTATE 23505` |
| 本项目 public 真表 | ✅ 仍为 5 / 5，未受影响 |

## 五、清理（如需）

```bash
tcb db execute -e "$ENV" --sql "DROP SCHEMA IF EXISTS case_demo CASCADE"
```

一句话：**这两个文件只是作业里的演示，你项目的表用 `db/schema.sql`。**
