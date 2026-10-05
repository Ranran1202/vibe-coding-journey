# db/ —— 数据库脚本与执行手册

数据库：**CloudBase PostgreSQL 17.11**。表结构是**从 `api-contract.md` §2 推导**出来的，
不是另造的一套 —— 契约是唯一事实源，本目录只是它的落地实现。

## 一、脚本清单

| 文件 | 作用 | 会删数据吗 | 什么时候用 |
|---|---|---|---|
| `schema.sql` | **建表**：`trends` / `favorites` 的 DDL（主键、外键、索引，逐字段注释） | ❌ 不会（全是 `IF NOT EXISTS`） | 首次建表；或改完结构重新执行 |
| `seed.sql` | **补种子**：纯 `INSERT` + `ON CONFLICT DO NOTHING` | ❌ 不会（已有记录会跳过） | 日常补齐示例数据。**保留已有数据时用这个** |
| `reset.sql` | **重置**：先 `DROP` → 再 `CREATE` → 再 `INSERT` | ⚠️ **会**（两张表清空重建） | 开发期把库恢复成「干净的种子状态」 |
| `case-demo/` | 训练营的**案例演示**脚本，**与本项目无关** | ⚠️ 会 | 别用。见 `case-demo/README.md` |

> `seed.sql` 与 `reset.sql` 灌进去的**数据完全一致**（5 条热搜 + 5 条收藏，时间字段都是固定值），
> 区别只在于：前者不动已有数据，后者先清空。

---

## 二、前置：拿到环境 ID

环境 ID **不写进仓库**（敏感信息），只存在你本机的 `cloudbaserc.json`（已被 `.gitignore` 排除）：

```bash
cd /c/Users/86153/WorkBuddy/vibe-coding-journey
ENV=$(node -p "require('./cloudbaserc.json').envId")   # 不打印，只放进变量
```

---

## 三、执行方式

### 路线 A：控制台 SQL 编辑器（最直观）

1. 打开 CloudBase 控制台 → 选中环境 → 左侧「**数据库**」→「**SQL 编辑器**」
   （等效路径：数据库设置 → 账号管理 → 建账号 →「数据库管理」进 DMC 工具 → **SQL 窗口**）
2. 把**整个文件**粘贴进编辑器（`schema.sql` / `seed.sql` / `reset.sql` 都是独立可跑的，多语句可一次执行）
3. 点「执行」，看返回的**影响行数**：建表/种子分别应是 `5`（最后一次 INSERT 的影响行数）
4. 用下面的「四、验证」语句核对

> 注意：`reset.sql` 会先删表再重建 —— 执行前先确认你真的想清空数据。

### 路线 B：命令行（我在本机验证时用的就是这条）

```bash
cd /c/Users/86153/WorkBuddy/vibe-coding-journey
export MSYS_NO_PATHCONV=1
export PATH="$PATH:/c/Users/86153/.workbuddy/binaries/node/workspace/node_modules/.bin"
ENV=$(node -p "require('./cloudbaserc.json').envId")

# 建表（可重复执行）
tcb db execute -e "$ENV" --sql "$(cat db/schema.sql)" < /dev/null

# 灌种子（可重复执行，不动已有数据）
tcb db execute -e "$ENV" --sql "$(cat db/seed.sql)" < /dev/null

# 重置（⚠️ 会清空两张表后重建）
# tcb db execute -e "$ENV" --sql "$(cat db/reset.sql)" < /dev/null
```

- `SQL=$(cat 文件名)` 这种写法是为了避开 shell 对 SQL 里双引号的转义问题。
- 末尾 `< /dev/null` 让命令非交互（否则可能卡在等待输入）。

---

## 四、验证（用 select 查插入的行）

### 1）行数 —— 预期两张表各 5 行

```sql
SELECT 'trends' AS tbl, count(*) AS rows FROM trends
UNION ALL
SELECT 'favorites', count(*) FROM favorites
ORDER BY tbl;
```

```
 tbl       | rows
-----------+------
 favorites |   5
 trends    |   5
```

### 2）热搜全量 —— 按 `rank` 排，顺序必须是 1,2,3,4,5

```sql
SELECT "id", "rank", "title", "heat", "platform", "date"
FROM trends ORDER BY "rank";
```

| id | rank | title | heat | platform | date |
|---|---|---|---|---|---|
| `weibo-1` | 1 | 示例热搜一：某地迎来初雪刷屏 | 523 万 | weibo | 2026-10-05 |
| `baidu-2` | 2 | 示例热搜二：新款手机今日正式发布 | 412 万 | baidu | 2026-10-05 |
| `douyin-3` | 3 | 示例热搜三：这部剧大结局引热议 | 388 万 | douyin | 2026-10-05 |
| `weibo-4` | 4 | 示例热搜四：周末周边游攻略走红 | 301 万 | weibo | 2026-10-05 |
| `baidu-5` | 5 | 示例热搜五：一杯奶茶的热量真相 | 276 万 | baidu | 2026-10-05 |

> 这个顺序就是 `rank` 选 `INTEGER` 而不是 `TEXT` 的价值：文本排序会排成 `1,10,2`。

### 3）收藏 JOIN 原热搜 —— 验证 `trendId` 这个外键真的能用

```sql
SELECT f."id", f."trendId", t."title", t."rank", f."note"
FROM favorites f
JOIN trends t ON t."id" = f."trendId"
ORDER BY f."id";
```

| f.id | trendId | title | rank | note |
|---|---|---|---|---|
| `fav-1` | `weibo-1` | 示例热搜一：某地迎来初雪刷屏 | 1 | 周末去看看原文 |
| `fav-2` | `baidu-2` | 示例热搜二：新款手机今日正式发布 | 2 | *(空)* |
| `fav-3` | `douyin-3` | 示例热搜三：这部剧大结局引热议 | 3 | 据说结局有反转 |
| `fav-4` | `weibo-4` | 示例热搜四：周末周边游攻略走红 | 4 | *(空)* |
| `fav-5` | `baidu-5` | 示例热搜五：一杯奶茶的热量真相 | 5 | 同事推荐看的 |

### 4）控制台图形化看数据

控制台 →「数据库」→ **表管理** → 选 `trends` / `favorites` → **数据页签**。

---

## 五、为什么这两个脚本能重复执行

**`schema.sql` / `seed.sql`（幂等，不清空数据）**
- `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` → 已存在就跳过，不报错
- `INSERT ... ON CONFLICT ("id") DO NOTHING` → 主键已存在就跳过，不报错也不产生重复行
- 已验证：连跑两遍，第 2 遍影响行数为 `0`，行数仍是 5 / 5

**`reset.sql`（可重复执行 + 可复现）**
- `DROP TABLE IF EXISTS` → 表不存在也不报错
- DROP 会连索引一起删掉，`CREATE` 时重建 —— 永远是全新结构
- 表刚建好必为空，所以 `INSERT` 不可能冲突
- 时间字段写的是**固定值**而不是 `now()`，所以每次执行后**全表内容逐字节一致**

---

## 六、三个必须记住的注意点

1. **⚠️ PG 标识符折叠**：列名不加英文双引号会被 PostgreSQL 折叠成小写（`trendId` → `trendid`），
   那 Day 17 接口返回的 JSON 键就跟前端期待的 `trendId` 对不上。
   **所有 SQL 里的驼峰列名都必须加双引号**（`"id"` 加不加都行，但统一加更省心）。
2. **⚠️ DROP 顺序**：`favorites."trendId"` 是指向 `trends` 的外键，
   删表必须先 `favorites` 再 `trends`，反过来会因外键依赖报错。
3. **⚠️ 别动 `case-demo/`**：那是训练营给的案例演示脚本，表名跟本项目真表重名，
   在 public 下执行会清掉你的真表。

---

## 七、实测记录（2026-10-05）

| 验证项 | 结果 |
|---|---|
| 首次建表（`schema.sql`） | ✅ 6 个字段列名驼峰全部保住，索引、外键建成 |
| 灌种子（`seed.sql`）第 1 遍 / 第 2 遍 | ✅ `Affected rows` 5 → 0，幂等成立 |
| 行数 | ✅ `trends` 5 / `favorites` 5 |
| `ORDER BY "rank"` | ✅ 1,2,3,4,5 |
| `favorites JOIN trends` | ✅ 5 条全部反查到原热搜 |
| 重置（`reset.sql`）连跑两遍 | ✅ 结果一致，行数稳定 5 / 5 |
