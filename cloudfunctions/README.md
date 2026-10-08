# 云函数部署与验证手册（Day 17 起 · Day 18 增补写入接口）

本仓库有**两条独立的业务线**，表与接口各自隔离，共用同一个 CloudBase 环境：

| 线 | 目录 | 契约 | 接口 |
|---|---|---|---|
| 今日热搜 | `my-app/` | 根目录 `api-contract.md` | `/api/hot`、`/api/favorites`、`/api/sync` |
| AI 漫剧 | `ai-drama/` | `ai-drama/api-contract.md` | `/api/drama/episodes`、`/api/drama/watch-logs` |

本文第 1–5 节是**今日热搜线**，第 6 节是 **AI 漫剧线**，第 7 节是 **Day 18 的写入接口（POST /api/favorites）**。
另有 `health`（GET /api/health，两条线共用）作为健康检查探针。

> 命令里的环境 ID **不写死**，一律从本地 `cloudbaserc.json` 读取：
> `ENV=$(node -p "require('./cloudbaserc.json').envId")`
> 该文件已 gitignore，环境 ID 不进仓库、不进聊天。

---

## 0. 一次性准备

```bash
# tcb CLI 不在 PATH 里，先加上（Git Bash / MINGW64）
export PATH="$PATH:/c/Users/86153/.workbuddy/binaries/node/workspace/node_modules/.bin"

cd /c/Users/86153/WorkBuddy/vibe-coding-journey
ENV=$(node -p "require('./cloudbaserc.json').envId")
```

---

## 1. 部署步骤

### 1.1 部署云函数

```bash
tcb fn deploy hot -e "$ENV" --force
```

```bash
tcb fn deploy sync -e "$ENV" --force
```

> ⚠️ **`--force` 必须带**：函数已存在时 CLI 会弹
> `Cloud function with same name exists ... overwrite? (y/N)` 交互确认，
> 在脚本/AI 执行环境下没人应答 → 命令卡住不结束（不是部署失败，是等输入）。

依赖由平台侧安装（`cloudbaserc.json` 里 `installDependency: true`），
**本地不需要 `node_modules`**。

### 1.2 配置 HTTP 访问路径（只需一次）

首次部署后在控制台「HTTP 访问服务」里加路由，或用 CLI：

```bash
tcb service create -e "$ENV" --path /api/hot --name hot
```

```bash
tcb service create -e "$ENV" --path /api/sync --name sync
```

查看已有路由：

```bash
tcb service list -e "$ENV"
```

### 1.3 部署前端静态站

```bash
tcb hosting deploy my-app -e "$ENV"
```

接口地址（复制到浏览器打开即可看 JSON 返回）：

```bash
node -p "'https://'+require('./cloudbaserc.json').envId+'.service.tcloudbase.com/api/hot'"
```

页面地址：

```bash
node -p "'https://'+require('./cloudbaserc.json').envId+'-1500247035.tcloudbaseapp.com/'"
```

---

## 2. 浏览器验证方法

### 2.1 接口本身

浏览器打开 `/api/hot` 的地址，应看到：

```json
{"ok":true,"data":[{"id":"douyin-1","rank":1,"title":"2026诺贝尔物理学奖公布",
"heat":"1203 万","heatNum":12030000,"platform":"douyin","url":"...",
"date":"2026-10-06","createdAt":"..."}, ...],"count":20,"source":"synced","date":"2026-10-06"}
```

要确认的三件事：

| 看什么 | 期望 |
|---|---|
| `ok` | `true` |
| `count` | 20（默认前 20 条） |
| `data[].heatNum` | **从大到小**（7810000 → 7710000 → …），这是热度倒序的证据 |

加参数试：

```
?limit=5        只返回 5 条
?platform=weibo 只要微博
?date=2026-10-06 指定日期
```

传坏参数 `?date=2026-13-45` 应返回 **HTTP 400** 且 `error` 是可读中文：

```json
{"ok":false,"error":"date 参数格式不对，应该写成 YYYY-MM-DD，例如 2026-10-06"}
```

### 2.2 页面

打开静态站地址 → 首次会弹 CloudBase 测试域名提示页，点「确定访问」→ 页面应显示：

- 顶部绿色标注：**「真实数据 · 来源：抖音 · 2026-10-06 · 按热度倒序前 20 条」**
- 列表 20 条，第 1 条热度最高

> 若标注变成琥珀色「示例数据」，说明接口没连通（本地预览 / 接口 5xx），页面自动退回本地兜底数据。

---

## 3. 验证「读的是真数据库」

**方法：改一条数据库记录 → 重新请求 → 返回值必须跟着变。**

① 记下当前第一名：

```bash
curl -s "https://$ENV.service.tcloudbase.com/api/hot?limit=1"
```

② 改库里一条记录的热度（把 B站第 30 名改成 9999 万）：

```bash
tcb db execute -e "$ENV" --sql 'UPDATE "trends" SET "heat" = '"'"'9999 万'"'"' WHERE "id" = '"'"'bilibili-30'"'"' AND "date" = '"'"'2026-10-06'"'"';' < /dev/null
```

③ 重新请求，这条必须变成第 1 名：

```bash
curl -s "https://$ENV.service.tcloudbase.com/api/hot?limit=3"
```

预期：`9999 万 | bilibili-30` 排到第 1（改之前它在 30 名开外）。
**这一步同时证明两件事：数据来自真库（不是写死的假数据），且热度倒序真的生效。**

④ 还原（重新同步该平台）：

```bash
curl -s -X POST "https://$ENV.service.tcloudbase.com/api/sync" -H "Content-Type: application/json" -d '{"source":"bilibili","force":1}'
```

> 数据库操作也可以直接在控制台做：CloudBase 控制台 → 数据库 → trends 表 → 编辑某一行的 `heat`。

---

## 4. 同步云函数 POST /api/sync

### 4.1 三个平台的来源、必需请求头、字段映射（附录 F）

| 平台 | 接口 | 取数路径 | 标题 | 热度 | 名次 | 必需请求头 |
|---|---|---|---|---|---|---|
| 微博 `weibo` | `https://weibo.com/ajax/side/hotSearch` | `data.realtime[]` | `word` | `num` | `realpos` | 桌面 UA + `Referer: https://weibo.com/` |
| B站 `bilibili` | `https://api.bilibili.com/x/web-interface/search/square?limit=50` | `data.trending.list[]` | `keyword` | `heat_score` | 下标+1 | 桌面 UA + `Referer: https://www.bilibili.com/` |
| 抖音 `douyin` | `https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383` | `data.word_list[]` | `word` | `hot_value` | `position` | 桌面 UA + `Referer: https://www.douyin.com/` |

**请求头缺一不可（附录 F 实测）**：

- 微博缺 `Referer` → **403**
- B站缺桌面 UA → **412**（B站经典风控码）
- 抖音缺 `Referer` → **HTTP 200 但列表为空**（最坑：不报错，静默返回 0 条）

只用 Node 18 内置 `fetch`，**不引第三方依赖**。

### 4.2 判重规则

判重键 = **`(platform, title, date)`**：同一平台、同一天、同一标题只保留一条，
已存在则更新热度与名次，不存在才插入。

当前 `trends` 表只有主键 `id`（= `platform-rank`），没有 `(platform,title,date)` 唯一索引，
因此实现为**等价的应用层 upsert**：先按 `(platform, date)` 查出已有行并按 title 索引 →
命中则 update、未命中则 insert；插入若撞上主键则跳过并计数，不中断整批。

**可选增强（需授权改表）**——换成数据库层约束即可，语义完全等价：

```sql
ALTER TABLE "trends" ADD COLUMN IF NOT EXISTS "fetched_at" TIMESTAMPTZ DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS uq_trends_platform_title_date
  ON "trends" ("platform", "title", "date");
-- 之后写入改为 INSERT ... ON CONFLICT ("platform","title","date") DO UPDATE ...
```

### 4.3 合规约束（不绕过任何反爬 / 登录 / 频率限制）

- 只用**无需登录**的公开榜单接口，不抓 HTML、不解析签名参数、不模拟登录态；
- 不带 Cookie / Authorization，UA 只是常规桌面浏览器标识；
- 单源单次请求、8 秒超时，**失败不重试**，避免对上游形成高频冲击；
- 自带 **60 秒同步节流**：同一平台 60 秒内重复触发直接跳过，`force=1` 才能强制；
- 全部失败 → 返回中文说明，且**不动库里已有数据**。

### 4.4 手动触发方法

```bash
curl -s -X POST "https://$ENV.service.tcloudbase.com/api/sync" \
  -H "Content-Type: application/json" \
  -d '{"source":"weibo"}'
```

`source` 取值 `weibo` / `bilibili` / `douyin`（缺省 `weibo`）；可选 `date`、`force`。

三个平台各同步一次：

```bash
for s in weibo bilibili douyin; do
  curl -s -X POST "https://$ENV.service.tcloudbase.com/api/sync" \
    -H "Content-Type: application/json" -d "{\"source\":\"$s\"}"
  echo
done
```

### 4.5 验证步骤

① 首次同步 → `inserted` 接近 `fetched`：

```json
{"ok":true,"data":{"date":"2026-10-06","detail":[{"source":"weibo","name":"微博",
"status":"ok","fetched":51,"inserted":48,"updated":0,"skipped":3}],"changed":48},"count":48}
```

② 60 秒内再触发 → 被节流：

```json
{"ok":true,"data":{"detail":[{"source":"weibo","status":"skipped",
"reason":"距上次同步不足 60 秒，已跳过（如需强制请传 force=1）"}],"changed":0},"count":0}
```

③ `force=1` 再同步 → **`inserted` 应为 0、`updated` 变大**（判重命中，没有重复插入）：

```json
{"ok":true,"data":{"detail":[{"source":"weibo","name":"微博","status":"ok",
"fetched":50,"inserted":0,"updated":45,"skipped":5}],"changed":45},"count":45}
```

④ 数据库核对条数：

```bash
tcb db execute -e "$ENV" --sql 'SELECT "platform",count(*) FROM "trends" WHERE "date"='"'"'2026-10-06'"'"' GROUP BY "platform";' < /dev/null
```

⑤ 前端核对：`/api/hot` 的 `count` 与来源标注随同步结果变化。

---

## 5. 常见坑

| 症状 | 原因与处理 |
|---|---|
| 部署命令卡住不动 | 缺 `--force`，在等覆盖确认 |
| 接口 500 `Invalid schema` | `app.rdb()` 必须传 `{ database: "public" }`，该参数是 **schema 名**不是库名 |
| `tcb fn log` 报 topic not exist | CLS 日志未开通，**改用 `tcb fn invoke <name>` 直接调用排查** |
| 页面显示「示例数据」 | 接口没连通（本地预览 / 5xx），前端自动退回本地兜底 |
| 抖音返回 200 但 0 条 | 缺 `Referer` 头 |
| B站 412 | 缺桌面 UA |
| 同步有 `skipped` | 跨天存在相同 `platform-rank` 撞主键（表主键没带 date），已按条跳过不影响整体；根治见 §4.2 改表 |
| 静态站首次访问弹提示页 | 测试域名提示，点「确定访问」即可（不写 cookie，重新导航会再弹） |

---

# 6. AI 漫剧线（ai-drama）

> 完整契约见 `ai-drama/api-contract.md`。数据来源判定：
> **我自己产出的内容**（不是外部公开数据）+ **要能回看过去** + **不存就没了**
> → 结论是「用户产出 → 必须入库」，所以**不接任何外部 API**，接口读的是自己的表。

## 6.1 表

| 表 | 角色 | 对应打卡应用 | 说明 |
|---|---|---|---|
| `drama_episodes` | **核心表** | `plan_days` | 剧集内容本体（6 集，来自 `assets/js/data.js`） |
| `drama_watch_logs` | **记录表** | `checkins` | 观看记录，一次观看 = 一次打卡 |

建表 / 种子（幂等，可重复执行）：

```bash
SQL=$(cat db/drama_schema.sql); tcb db execute -e "$ENV" --sql "$SQL" < /dev/null
```

```bash
SQL=$(cat db/drama_seed.sql); tcb db execute -e "$ENV" --sql "$SQL" < /dev/null
```

> ⚠️ `"order"` 是 **SQL 保留字**，所有 SQL 里必须写成带引号的 `"order"`；
> 其余驼峰列（`episodeId` / `watchedAt`）同理要加引号，否则会被折叠成小写。

## 6.2 部署步骤

```bash
tcb fn deploy drama-episodes -e "$ENV" --force
```

```bash
tcb fn deploy drama-watchlogs -e "$ENV" --force
```

配置 HTTP 路由（**必须加 `MSYS_NO_PATHCONV=1`**）：

```bash
MSYS_NO_PATHCONV=1 tcb service create -e "$ENV" -p /api/drama/episodes -f drama-episodes
```

```bash
MSYS_NO_PATHCONV=1 tcb service create -e "$ENV" -p /api/drama/watch-logs -f drama-watchlogs
```

> ⚠️ **Git Bash 会把 `/api/...` 转成 Windows 绝对路径**，不加 `MSYS_NO_PATHCONV=1` 会创建出
> `/C:/Users/.../api/drama/episodes` 这种废路由（看着"创建成功"，实际访问 404）。
> 中招后用 `tcb service delete -e "$ENV" -n drama-episodes` 按函数名删掉重来。

## 6.3 浏览器验证方法

接口地址：

```bash
node -p "'https://'+require('./cloudbaserc.json').envId+'.service.tcloudbase.com/api/drama/episodes'"
```

```bash
node -p "'https://'+require('./cloudbaserc.json').envId+'.service.tcloudbase.com/api/drama/watch-logs'"
```

期望（`GET /api/drama/episodes`）：

```json
{"ok":true,"data":[{"id":"ep01","order":1,"title":"群里的光","status":"剧本定稿",
"duration":"约 90 秒","durationSec":90,"summary":"…","scene":"…","videoUrl":"",
"cast":["linmo","aqiang"],"updatedAt":"…"}],"count":6,"error":null}
```

要确认的三件事：

| 看什么 | 期望 |
|---|---|
| `count` | 6（6 集全在） |
| `data[].order` | 1→6 **升序** |
| `data[].cast` | 是**数组** `["linmo","aqiang"]`（不是字符串） |

`GET /api/drama/watch-logs` 期望：`count` 6，且 `watchedAt` **倒序**（最近的排最前）。

参数与错误：

```
/api/drama/episodes?limit=3          前 3 集
/api/drama/episodes?status=已发布     按状态筛（无匹配时 count=0，不是错误）
/api/drama/watch-logs?episodeId=ep01 只看某一集的观看记录
/api/drama/episodes?limit=abc        → HTTP 400 + {"ok":false,"data":null,"error":"limit 必须是正整数，例如 limit=3"}
```

## 6.4 验证「改一条数据库数据、接口跟着变」

① 记下改前状态：

```bash
curl -s "https://$ENV.service.tcloudbase.com/api/drama/episodes?limit=1"
```

② 改库（把第 1 集改成「已发布」并填外链）：

```bash
tcb db execute -e "$ENV" --sql 'UPDATE "drama_episodes" SET "status" = '"'"'已发布'"'"', "videoUrl" = '"'"'https://b23.tv/demo-ep01'"'"' WHERE "id" = '"'"'ep01'"'"';' < /dev/null
```

③ 重新请求 → `status` 必须变成「已发布」、`videoUrl` 必须出现：

```bash
curl -s "https://$ENV.service.tcloudbase.com/api/drama/episodes?limit=1"
```

④ 顺带验证筛选也跟着变（`?status=已发布` 应能筛出这一集）：

```bash
curl -s "https://$ENV.service.tcloudbase.com/api/drama/episodes?status=%E5%B7%B2%E5%8F%91%E5%B8%83"
```

⑤ 还原：

```bash
tcb db execute -e "$ENV" --sql 'UPDATE "drama_episodes" SET "status" = '"'"'剧本定稿'"'"', "videoUrl" = '"'"''"'"' WHERE "id" = '"'"'ep01'"'"';' < /dev/null
```

> 也可以在 CloudBase 控制台 → 数据库 → `drama_episodes` 表里直接改一行，效果相同。

---

## 7. Day 18 ｜`POST /api/favorites`（新增收藏 · 写入接口）

> 实现在 `cloudfunctions/favorites/index.js`，跟 `GET /api/favorites` **共用一个云函数**（按 `method` 分发），路由 **不需要** 新建 —— `/api/favorites` 这条路由 Day 17 已建，POST 自动走它。
> 契约见根目录 `api-contract.md` §3.7。

### 7.1 这个接口防了哪两种「重复提交 / 错误输入」（今日核心题）

| 类型 | 防法 | 表现 |
|---|---|---|
| **业务重复**：同一条热搜收藏两次 | 判重键 = `favorites."trendId"`，先查后插 | `409` + 「已经收藏过了」，库里不会有两行指向同一条热搜 |
| **手抖连点 / 网络超时重试** | 请求头 `Idempotency-Key`（或请求体 `clientRequestId`）被编进主键 `id = fav-idem-<key>` | 同一个 key 再发 → `200` + 返回**同一条**数据，**不多一行** |

顺带挡住的错误输入：空 body / 非 JSON / 缺必填字段（一次列全）/ 字段类型不对 / 超长（title、note ≤ 200，trendId ≤ 100）/ `platform` 不在白名单 / `trendId` 在 `trends` 表里不存在（先查再插 → `404` 中文提示，不让外键约束抛成看不懂的 500）。

### 7.2 部署

```bash
tcb fn deploy favorites -e "$ENV" --force
```

> 路由已存在（Day 17 建的 `/api/favorites`），**不用** 再 `tcb service create`。
> 不确定就 `tcb service list` 看一眼。

### 7.3 命令行验证六连（curl，每条都能直接粘贴）

```bash
curl -s -m 40 -w "\n[HTTP %{http_code}]\n" -X POST "https://$ENV.service.tcloudbase.com/api/favorites" -H "Content-Type: application/json" -H "Idempotency-Key: my-test-001" -d '{"trendId":"weibo-2","title":"诺贝尔物理学奖","platform":"weibo","note":"Day 18 写入"}'
```

```bash
curl -s -m 40 -w "\n[HTTP %{http_code}]\n" -X POST "https://$ENV.service.tcloudbase.com/api/favorites" -H "Content-Type: application/json" -H "Idempotency-Key: my-test-001" -d '{"trendId":"weibo-2","title":"诺贝尔物理学奖","platform":"weibo","note":"Day 18 写入"}'
```

```bash
curl -s -m 40 -w "\n[HTTP %{http_code}]\n" -X POST "https://$ENV.service.tcloudbase.com/api/favorites" -H "Content-Type: application/json" -d '{"trendId":"weibo-2","title":"诺贝尔物理学奖","platform":"weibo"}'
```

```bash
curl -s -m 40 -w "\n[HTTP %{http_code}]\n" -X POST "https://$ENV.service.tcloudbase.com/api/favorites" -H "Content-Type: application/json" -d '{"trendId":"weibo-3","platform":"weibo"}'
```

```bash
curl -s -m 40 -w "\n[HTTP %{http_code}]\n" -X POST "https://$ENV.service.tcloudbase.com/api/favorites" -H "Content-Type: application/json" -d '{"trendId":"weibo-9999","title":"不存在的热搜","platform":"weibo"}'
```

```bash
curl -s -m 40 -w "\n[HTTP %{http_code}]\n" -X POST "https://$ENV.service.tcloudbase.com/api/favorites" -H "Content-Type: application/json" -d '{"trendId":"weibo-3","title":"国庆假期返程天气指南","platform":"zhihu"}'
```

期望依次是：`201`（成功，`data` 是收藏对象）→ `200`（同一个幂等键，返回同一条）→ `409`「已经收藏过了」→ `400`「缺少必填字段 title」→ `404`「没有找到这条热搜（可能链接已失效）」→ `400`「platform 只支持：weibo / baidu / douyin / bilibili」。

> `trendId` 要选 `trends` 表里**真实存在**的 id（形如 `weibo-2`）。
> 查当前可用 id：`tcb db execute -e "$ENV" --sql 'SELECT "id","title","platform" FROM trends WHERE "date" = '"'"'2026-10-06'"'"' ORDER BY "platform","rank" LIMIT 10' < /dev/null`

### 7.4 浏览器验证（交截图用）

打开本地页面（**未入库**，只在 `tmp/`）：

```
C:\Users\86153\WorkBuddy\vibe-coding-journey\tmp\day18-post-verify.html
```

- 填一次接口地址（页面会记住），然后：
  - 「发送 POST」→ 期望 **HTTP 201** + `data` 是收藏对象（**第一张截图**：含返回的 JSON 形状）；
  - 「场景：同键重复提交」→ 期望 **HTTP 200** + 同一条数据；
  - 「场景：缺 title」→ 期望 **HTTP 400** + 中文提示；
  - 「读回核对」→ 收藏列表里出现刚写的那条。
- 一键批量跑 + 自动截图：

```bash
"C:/Users/86153/.workbuddy/binaries/node/versions/22.22.2-3/node.exe" tmp/day18-browser-verify.js
```

  截图输出在 `C:\Users\86153\WorkBuddy\day18-shots\`（在仓库外面，不会误提交）。

### 7.5 数据库核对（**第二张截图**：表里新增的那一行）

```bash
tcb db execute -e "$ENV" --sql 'SELECT "id","trendId","title","platform","note","createdAt" FROM favorites ORDER BY "id"' < /dev/null
```

- 幂等重复提交后行数**不增加**（这是「防重复提交」的实锤：请求发了两次，表里只有一行）。
- 想清掉验证写入的行（`id` 以 `fav-idem-` 开头的就是）：

```bash
tcb db execute -e "$ENV" --sql 'DELETE FROM favorites WHERE "id" LIKE '"'"'fav-idem-%'"'"'' < /dev/null
```

### 7.6 服务端日志怎么看（Day 18 余力加练）

- 日志格式：**一行一个 JSON**，带 `ts` / `msg` / `fn` / `requestId`，以及定位所需字段（`id`、`trendId`、`platform`、耗时 `ms` 等）；**备注只记长度不记内容**，不存隐私。
- 每次响应都带 `X-Request-Id` 响应头，用它在日志里把同一次请求串起来。
- 查看位置：**CloudBase 控制台 → 云函数 → `favorites` → 日志**。
  ⚠️ CLI 的 `tcb fn log favorites` 在当前环境会报 `topic not exist`（这个环境的 CLS 日志服务没开通，Day 17 已确认过），**只能去控制台看**。
- 想造一条日志：`curl` 发一次 POST（或 405/400 也行），几秒后控制台里就能看到 `post_in` / `created`（或 `reject_*`）这几条。

### 7.7 本节新增的坑与决策

| 事项 | 说明 |
|---|---|
| CORS | favorites 上**已开放** `Access-Control-Allow-Origin: *` + `OPTIONS` 预检（Day 18 为浏览器验证 POST 而加，契约 §1.4 已更新）；加登录态后要收窄 |
| 时间格式 | PostgreSQL 的 `TIMESTAMPTZ` 会按会话时区吐 `2026-10-08T19:51:34.442+08:00`；接口已在应用层统一转成 UTC `...Z`（契约 §1.4） |
| 级联删除 | Day 17 遗留的 `ON DELETE CASCADE` 问题已定**方案 b（去外键）**，脚本 `db/fix_favorites_fk.sql` **写好未执行**（改表要等确认）；写入接口已用「先查 trends 再插」绕开外键报错 |
| `Idempotency-Key` 格式 | 只允许 `[A-Za-z0-9_-]` 且 ≤ 64 字符（因为它要进主键），不合法直接 `400` |
