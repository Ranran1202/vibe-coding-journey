# 云函数部署与验证手册（今日热搜 · Day 17）

覆盖 `hot`（GET /api/hot）、`favorites`（GET /api/favorites）、`sync`（POST /api/sync）、`health`（GET /api/health）四个云函数。

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
