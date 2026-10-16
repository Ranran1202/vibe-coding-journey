# 第 3 周（Day 15–21）周验收表 · 今日热搜

> 判定只允许三种：**PASS / FAIL / 未执行**。不允许「基本完成」「基本可用」这类模糊表述。
> 取证时间：2026-10-16 21:10（北京时间）
> 取证脚本：`bash scripts/week3-verify.sh`（6 项逐条自动取证，可复跑）
> 环境：CloudBase · 静态托管 + 云函数 + PostgreSQL

## 汇总

| # | 验收项 | 状态 |
|---|---|---|
| A1 | 建表和种子脚本可重复执行（有 select 证据） | **PASS** |
| A2 | GET 接口公网可访问且返回真实数据库数据 | **PASS** |
| A3 | POST 接口完成真实写入并读回 | **PASS** |
| A4 | 数据访问层重构完成且接口行为不变 | **PASS** |
| A5-1 | 检查台公网可访问 | **PASS** |
| A5-2 | 同伴从自己设备打开成功 | **未执行** |
| A6 | 响应形状与 api-contract.md 一致 | **PASS** |
| A7 | （附加·如实标记）收藏接口返回值不含示例种子数据 | **FAIL** |

自动化 6 项：**PASS 6 · FAIL 0 · 未执行 1 · 附加 FAIL 1**

---

## A1　建表和种子脚本可重复执行（有 select 证据）

**状态：PASS**

**怎么验证**
```bash
# 连跑两次，第二次必须「Affected rows: 0」且无报错
tcb db execute -e "$ENV" --sql "$(cat db/schema.sql)"
tcb db execute -e "$ENV" --sql "$(cat db/schema.sql)"
tcb db execute -e "$ENV" --sql "$(cat db/seed.sql)"
tcb db execute -e "$ENV" --sql "$(cat db/seed.sql)"

# select 证据：种子行必须存在
tcb db execute -e "$ENV" --sql "SELECT 'HIT=' || count(*)::text FROM trends
  WHERE \"id\" IN ('weibo-1','baidu-2','douyin-3','weibo-4','baidu-5');"
```
判定标准：两次执行均不报错；第二次 0 行改动；SELECT 命中 5 条。

**证据**
```
schema.sql 两次 = [Affected rows: 0][Affected rows: 0]
seed.sql   两次 = [Affected rows: 0][Affected rows: 0]
SELECT 种子 id 命中 = HIT=5
trends 总数 = 545（执行前后未变）
```
幂等来源：`schema.sql` 全部用 `CREATE TABLE / INDEX IF NOT EXISTS`；`seed.sql` 用 `ON CONFLICT ("id") DO NOTHING`。

**证据链接**：`db/schema.sql`、`db/seed.sql`、`scripts/week3-verify.sh`（A1 段）

⚠️ **本次执行的副作用（如实记录）**：首次跑 `seed.sql` 时受影响 2 行（`favorites` 14 → 16），
把此前已被删掉的种子收藏 `fav-2`、`fav-5` **又插了回去**。见 A7。

---

## A2　GET 接口公网可访问且返回真实数据库数据

**状态：PASS**

**怎么验证**
```bash
curl "https://<env-id>.service.tcloudbase.com/api/hot"
```
断言四条：HTTP 200；`ok===true`；`source==="synced"`（= 当日同步的真实数据，不是 seed 兜底）；
`date` = 今天（北京时间）；`data[].title` 不含「示例」字样。
再逐个平台查一次，确认三平台都能读出：
```bash
for p in weibo douyin bilibili; do
  curl "https://<env-id>.service.tcloudbase.com/api/hot?platform=$p&limit=1"; done
```

**证据**
```
HTTP 200 · ok=true · count=20 · source=synced · date=2026-10-16（今天=2026-10-16）
默认前 20 条（按热度倒序）：平台 = douyin / weibo，0 条含「示例」
三平台逐个查：
  weibo    → platform=weibo    2026-10-16  首条「徐艺洋 孩子是我自己生的」
  douyin   → platform=douyin   2026-10-16  首条「英雄联盟S16世界赛开赛」
  bilibili → platform=bilibili 2026-10-16  首条「北京WB 南通Hero久…」
```
库内当日实有：微博 50 条 / 抖音 50 条 / B站 50 条。
说明：默认列表按热度倒序取前 20，B站热度值偏低常被挤出前 20，**必须单独按平台查才能证明它在**。

**证据链接**：
`https://wb-test01-d6gp6u2pjd3393af3.service.tcloudbase.com/api/hot`
`https://wb-test01-d6gp6u2pjd3393af3.service.tcloudbase.com/api/hot?platform=bilibili&limit=1`

---

## A3　POST 接口完成真实写入并读回

**状态：PASS**

**怎么验证**
```bash
# 先取一条当日真实热搜
curl "https://<env-id>.service.tcloudbase.com/api/hot?limit=1"
# 写入（带固定 Idempotency-Key，重复运行不会污染库）
curl -X POST "https://<env-id>.service.tcloudbase.com/api/favorites" \
  -H "Content-Type: application/json" -H "Idempotency-Key: week3-verify-20261016" \
  -d '{"trendId":"<上一步的 id>","platform":"douyin","title":"…","note":"第3周验收写入"}'
# 读回
curl "https://<env-id>.service.tcloudbase.com/api/favorites?limit=200"
```
判定标准：HTTP 201（新写入）或 200（幂等命中同一条）；且**以 POST 返回的 `data.id` 为准**，
能在 `GET /api/favorites` 的结果里找到同一条。

**证据**
```
HTTP 201（本日首次运行实测）· 重复运行转 200（幂等命中，不新增行）
读回命中：id=fav-idem-week3-verify-20261016 · trendId=douyin-5-d1016 · title=新闻联播
幂等键：week3-verify-20261016
```

⚠️ 这里踩过一个**断言错误**（不是接口 bug）：幂等键复用时接口返回的是**上一次**那条记录，
如果拿「本次新挑的 trendId」去比对，必然读不回来、误判成 FAIL。
正确做法是**以 POST 实际返回的 id 为准**去读回。

**证据链接**：`cloudfunctions/favorites/index.js`、`scripts/week3-verify.sh`（A3 段）

---

## A4　数据访问层重构完成且接口行为不变

**状态：PASS**

**怎么验证**
1. 去头部注释后比对 `shared/*.js` 与各云函数 `lib/` 副本的 md5（直接比 md5 会永远不一致——
   `scripts/sync-shared.js` 会自动加 4 行「不要手改」头注释）
2. 在 `hot / favorites / sync` 三个入口文件里 grep 裸 SQL
3. 行为不变由 A2 + A3 全 PASS 佐证：同样的请求，仍返回契约中的形状与字段

**证据**
```
shared/db.js、shared/trendsRepository.js、shared/favoritesRepository.js
  → hot/lib、sync/lib、favorites/lib 副本：去头部后 md5 全一致（0 处漂移）
三个云函数入口文件内裸 SQL：0 处（SQL 全部下沉到 Repository）
A2 / A3 均 PASS → 重构后接口行为未变
```

**证据链接**：`shared/`、`scripts/sync-shared.js`、`cloudfunctions/*/lib/`

---

## A5　检查台公网可访问 / 同伴从自己设备打开成功

清单里这是**一项**，但它由「可访问」和「同伴打开」两件事组成，后者 AI 无法代替，
因此**拆成两条如实标记**，不做合并模糊化。

### A5-1　检查台公网可访问 —— **PASS**

**怎么验证**：`curl` 静态托管根路径返回 200，且线上 `index.html` 与本地 md5 一致
（证明部署的确实是含检查台的最新版本，而不是旧缓存）。

**证据**
```
HTTP 200 · 线上 index.html md5=e6ba9c4cf0e0ac9e157e56c7124db76f 与本地一致
app.js 含 view-check 视图 ×1
```
**地址**：`https://wb-test01-d6gp6u2pjd3393af3-1500247035.tcloudbaseapp.com/#/check`
（首次打开会有 CloudBase 测试域名确认页，点「确定访问」进入）

### A5-2　同伴从自己设备打开成功 —— **未执行**

**怎么验证**：同伴用自己的设备（非本机、最好换一个网络）打开上面的检查台地址，
按 `week3-peer-check.md` 的三行结论模板回报。

**证据**：需真人执行，AI 代替不了，如实标记未执行。
自动化替代：`bash scripts/day21-peer-check.sh`（13 项检查 + 三行结论，同伴无需装依赖）。

---

## A6　响应形状与 api-contract.md 一致

**状态：PASS**

**怎么验证**：按契约 §3.3（`GET /api/hot`）与 §3.5（`GET /api/favorites`）的字段表，
逐键校验**存在性 + 类型**，包括 `heatNum`、`source`、`date` 这些**接口层计算、表里没有**的字段。

**证据**
```
GET /api/hot      顶层 5 键：ok, data, count, source, date
                  行内 9 键：id(string) rank(number) title(string) heat(string)
                             heatNum(number) platform(string) url(string)
                             date(string) createdAt(string)   —— 类型全对
GET /api/favorites 顶层 3 键：ok, data, count
                  行内 7 键：id, trendId, title, platform, note, createdAt, updatedAt
```

**证据链接**：`api-contract.md` §3.3 / §3.5（契约版本 v0.9.0）

---

## A7　（附加·如实标记）收藏接口返回值不含示例种子数据 —— **FAIL**

这一项不在清单的 6 项里，但它是 Day 20 收尾要求的直接结果，且**当前不成立**，所以如实记入。

**怎么验证**
```bash
curl "https://<env-id>.service.tcloudbase.com/api/favorites?limit=200" \
  | node -e "…过滤 title 含「示例」的行…"
```

**证据**
```
favorites 表中仍有 5 条种子行，标题为「示例热搜一」～「示例热搜五」：
  fav-1 / fav-2 / fav-3 / fav-4 / fav-5
GET /api/favorites 不过滤日期，这 5 条会原样返回 → 收藏页仍会出现「示例」字样
```

**这是 FAIL，且我在本次验收中让它变更糟了**：Day 21 自查时是 3 条（fav-1/3/4），
本次为验证 A1「种子脚本可重复执行」而重跑 `seed.sql`，
`ON CONFLICT DO NOTHING` 把此前缺失的 `fav-2`、`fav-5` **补了回来**，从 3 条变 **5 条**。

**修复 SQL（未执行，等你确认——DELETE 属破坏性操作）**
```sql
DELETE FROM favorites WHERE "id" IN ('fav-1','fav-2','fav-3','fav-4','fav-5');
```
另：`favorites` 表还堆了 11 条本周各天验证留下的 `fav-idem-*` 测试行，一并清理需你确认。

---

## 说明：为什么没有「基本完成」

本表所有 PASS 项都对应一条**可复跑的命令**和一段**真实输出**，不是「跑通了」这种印象。
其中 A1、A3 两项在取证过程中各抓到一个**误判**：

- A1 的 select 命中数曾取到空值，却因为没有校验「证据文件是否存在」而显示为通过；
- A3 的读回断言拿错 id，把幂等重放误判成写入失败。

两个都已修正，方法也写进了脚本注释——静默的假通过比 FAIL 更危险。
