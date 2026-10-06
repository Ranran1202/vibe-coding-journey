# API 契约（api-contract.md）

> 本文件是**前后端「说好了」的唯一凭证**，也是**第 3 周建表、写接口的唯一依据**：
> 前端按这里调用，后端按这里实现；任何一方要改字段/路径/返回结构，**先改本文件，再改代码**。
>
> 本版**从 `my-app`（今日热搜）第 2 周页面的真实需求推导**得出，按训练营模板实例化：
> 模板里的「打卡应用 `plan_days` / `checkins`」是**别人的示例**，本项目对应的是 **`trends` / `favorites`** 两张表。
>
> **除 `GET /api/health` 已实现外，其余接口今日只登记占位，不实现。**

| 项目 | 内容 |
|---|---|
| 项目名称 | **今日热搜** |
| 项目英文名（`service` 标识） | **`hot-search-demo`** |
| 前端 | `my-app` —— **原生 JS 静态站**（`index.html` + `js/*.js`，**无构建步骤**），托管于 CloudBase 静态网站托管 |
| 后端 | 腾讯云 CloudBase（云开发）· 普通云函数 + HTTP 访问服务 |
| 数据库 | CloudBase **PostgreSQL 17.11**（真 SQL）。**2026-10-05（Day 16）已建表**。脚本：`db/schema.sql`（建表）、`db/seed.sql`（补种子·幂等）、`db/reset.sql`（重置·先删后建）；执行与验证步骤见 `db/README.md` |
| 契约版本 | **v0.7.0** |
| 最后更新 | 2026-10-06 |
| 推导依据 | `my-app/index.html` 的 4 个视图 + `js/app.js` 的数据加载逻辑 + `js/data.js` / `js/config.js` / `js/store.js` 的数据结构 |
| 关联文档 | `TECH_DESIGN.md`（§4 数据模型、§5 API、§6.2 Phase 2 数据流） |

---

## 1. 通用约定（所有接口都遵守）

### 1.1 基础地址 Base URL

| 环境 | Base URL |
|---|---|
| 生产（CloudBase HTTP 访问服务） | `https://<env-id>.service.tcloudbase.com` |

- `<env-id>` = 你的 CloudBase **环境 ID**（控制台「环境 → 概览 / 环境设置」可查）。
- **⚠️ 安全红线：环境 ID 属敏感信息，只记在本地，不要写进仓库、不要贴到聊天里。**
  本文件一律用占位符 `<env-id>`，不写真实值。
- 举例：`GET https://<env-id>.service.tcloudbase.com/api/health`

### 1.2 统一响应结构

所有接口统一以**顶层 `ok` 布尔字段**标识成败。

**成功**（`ok: true`）

```json
{ "ok": true, "data": {} }
```

- 业务数据统一放在 `data` 字段（对象或数组）。
- **例外**：探针接口 `GET /api/health` 直接把 `service`（及 `time`）**平铺**在顶层，不再包 `data`（见 3.1）。

**失败**（`ok: false`）

```json
{ "ok": false, "error": "date 参数格式不对，应该写成 YYYY-MM-DD，例如 2026-10-06" }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `ok` | boolean | `true` = 成功，`false` = 失败 |
| `error` | string | **人能看懂的中文说明**，可直接展示给用户 |

> ⚠️ **v0.7.0 起 `error` 由对象改为字符串**（成功/失败结构对称，前端少一层判空）。
> 仍**兼容**读 `error.message` 的旧消费方：后端只发字符串，前端两种形状都认
> （见 `my-app/js/app.js`）。错误码改由 **HTTP 状态码**承担语义，见 1.3。

### 1.3 错误码

> v0.7.0 起 `error` 是字符串，**机器可读语义由 HTTP 状态码承担**（下表 `error.code` 列为历史字段，仅供旧版本对照）。

| HTTP | `error.code` | 含义 | 前端表现 |
|---|---|---|---|
| `400` | `BAD_REQUEST` | 参数缺失 / 格式不对 | 提示「请求参数有误」 |
| `404` | `NOT_FOUND` | 资源不存在（如热搜 id / 收藏 id 不存在） | 提示「没有找到这条热搜（可能链接已失效）」 |
| `409` | `CONFLICT` | 冲突（如重复收藏同一条热搜） | 提示「已经收藏过了」 |
| `500` | `INTERNAL_ERROR` | 服务端错误 | 提示「暂时拿不到数据，请稍后重试」+ 重试按钮，**不白屏** |
| `502` | `UPSTREAM_UNAVAILABLE` | 上游公开数据源不可用 | 该来源显示「数据暂不可用」，其余正常 |

> HTTP 状态码与 `error.code` **一一对应**：上面同一行的两者同时出现。
> 前端四态（加载中 / 加载成功 / 没有结果 / 请求失败）分别对应：请求进行中 / `ok:true` / `ok:true` 且 `data` 为空数组 / `ok:false`。

### 1.4 通用约束

- **编码 / 格式**：UTF-8；请求与响应体均为 JSON（`Content-Type: application/json`）。
- **时间**：ISO 8601，UTC，例：`2026-10-04T07:47:10.946Z`。
- **认证**：当前无用户系统，**接口暂不需要鉴权**；后续加登录时在本节补充。
- **跨域（CORS）**：**暂不配置**（今天只验证「公网能直接打开返回 JSON」），由后续 Day 处理。
- **分页**：暂不需要（数据量小）；接入真实数据源后如有需要，在对应接口补 `page` / `pageSize`。
- **数据来源**：只从**免费公开来源**取数，**绝不自建爬虫**。

---

## 2. 数据表（第 3 周建表依据 · **已落地**）

> 前端目前把数据写在 `js/data.js`（热搜）与 `localStorage`（收藏）里。
> 第 3 周要把它们搬进数据库，**只需要下面这两张表**。

> ✅ **2026-10-05（Day 16）落地记录**
> - CloudBase 环境实测为 **PostgreSQL 17.11**，DDL 落 `db/schema.sql`（每字段带注释），种子落 `db/seed.sql`（**幂等**，重复执行不报错）。
> - **列名一律加双引号**以保留驼峰（`trendId` / `createdAt` / `updatedAt`）：PostgreSQL 会把没引号的标识符折叠成小写，
>   那样 Day 17 接口返回的 JSON 键会变成 `trendid`，跟前端期待的 `trendId` 对不上。**后续所有 SQL 都要带引号。**
> - 当前数据：两张表**各 5 行**（沿用 `js/data.js` 的 5 条示例热搜），JOIN 验证通过。

> ✅ **2026-10-05 · v0.5.0 一致性回写**
> 本章表结构**完全由本契约推导**，未另造字段。脚本与执行手册：
>
> | 文件 | 作用 | 会清数据吗 |
> |---|---|---|
> | `db/schema.sql` | 建表 DDL（主键 / 外键 / 索引，`IF NOT EXISTS`） | ❌ |
> | `db/seed.sql` | 补种子（纯 `INSERT` + `ON CONFLICT DO NOTHING`） | ❌ |
> | `db/reset.sql` | 重置（先 `DROP` → 再 `CREATE` → 再 `INSERT`） | ⚠️ 会 |
> | `db/README.md` | 控制台/CLI 执行步骤 + select 验证步骤 | — |
>
> - 三个脚本都**可重复执行**；`reset.sql` 与 `seed.sql` 灌入的数据完全一致，且时间字段用**固定值**（非 `now()`），因此**可复现**。
> - 结构一致性见下一节 §2.4。

### 2.4 契约字段 ↔ 数据库列（一致性核对）

契约写的是**接口 JSON 的类型**，数据库列是**存储类型**，映射规则：`string → TEXT`、`number → INTEGER`、时间 → `TIMESTAMPTZ`（接口序列化为 ISO 8601）。

| 表 | 契约 §2 字段 | 数据库列 | 存储类型 | 约束 | 一致 |
|---|---|---|---|---|---|
| `trends` | `id` | `"id"` | `TEXT` | **PK** | ✅ |
| `trends` | `platform` | `"platform"` | `TEXT` | NOT NULL | ✅ |
| `trends` | `rank` | `"rank"` | `INTEGER` | NOT NULL | ✅ |
| `trends` | `title` | `"title"` | `TEXT` | NOT NULL | ✅ |
| `trends` | `heat` | `"heat"` | `TEXT` | NOT NULL | ✅ |
| `trends` | `url` | `"url"` | `TEXT` | DEFAULT `''` | ✅ |
| `trends` | `date` | `"date"` | `TEXT` | NOT NULL | ✅ |
| `trends` | `createdAt` | `"createdAt"` | `TIMESTAMPTZ` | DEFAULT `now()` | ✅ |
| `favorites` | `id` | `"id"` | `TEXT` | **PK** | ✅ |
| `favorites` | `trendId` | `"trendId"` | `TEXT` | **FK → `trends."id"`** `ON DELETE CASCADE` | ✅ |
| `favorites` | `title` | `"title"` | `TEXT` | NOT NULL | ✅ |
| `favorites` | `platform` | `"platform"` | `TEXT` | NOT NULL | ✅ |
| `favorites` | `note` | `"note"` | `TEXT` | DEFAULT `''` | ✅ |
| `favorites` | `createdAt` | `"createdAt"` | `TIMESTAMPTZ` | DEFAULT `now()` | ✅ |
| `favorites` | `updatedAt` | `"updatedAt"` | `TIMESTAMPTZ` | DEFAULT `now()` | ✅ |

> 索引：`idx_trends_date`、`idx_trends_platform`、`idx_favorites_trendid`。
> **改任何一边都要先改本契约**（见文首规则）。

### 2.1 `trends`（热搜记录表）

对应 `js/data.js` 的 `HOT_DATA`（字段名保持一致，便于前端平滑切换）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 主键，形如 `weibo-1`（= `platform` + `-` + `rank`），**与前端 `app.js` 的 `itemId()` 完全一致** |
| `platform` | string | 来源平台 key：`weibo` / `baidu` / `douyin` / `bilibili`（Day 17 同步源按附录 F 为微博 / B站 / 抖音） |
| `rank` | number | 排名 |
| `title` | string | 标题 |
| `heat` | string | 热度（**原样字符串**，如 `"523 万"`，不转数字） |
| `url` | string | 去原平台查看的链接 |
| `date` | string | 数据日期 `YYYY-MM-DD` |
| `createdAt` | string | 入库时间（ISO 8601，UTC） |

### 2.2 `favorites`（收藏表）

对应前端 `js/store.js` 的收藏与备注（目前存在 `localStorage`，键为 `platform|title`）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 主键（收藏记录 id） |
| `trendId` | string | 关联 `trends.id`（如 `weibo-1`） |
| `title` | string | 冗余存一份标题（防止原条目变动后收藏显示不出来） |
| `platform` | string | 冗余存一份平台 |
| `note` | string | **我的备注**（对应 `store.js` 的 `note`），可为空字符串 |
| `createdAt` | string | 收藏时间 |
| `updatedAt` | string | 备注最近更新时间 |

> **迁移提示**：前端 `store.js` 现在用 `platform|title` 当收藏键，而路由/详情用的是 `platform-rank`。
> 接入后端时**统一采用 `trends.id`（`platform-rank`）作为 `trendId`**，前端 `store.js` 的 `idOf()` 需同步改成同一规则，否则「收藏」和「详情」会对不上号。
> 另外，「是否已收藏」不需要单独字段 —— **`favorites` 表里有没有这条记录**就代表收藏与否（对应前端 `fav: true/false`）。

### 2.3 表 ↔ 接口 对照

| 表 | 读 | 写 |
|---|---|---|
| `trends` | `GET /api/platforms`、`GET /api/hot`、`GET /api/hot/:id` | `POST /api/sync`（从公开源写入） |
| `favorites` | `GET /api/favorites` | `POST /api/favorites`、`PATCH /api/favorites/:id`、`DELETE /api/favorites/:id` |

---

## 3. 接口明细

> 图例：✅ 已实现 ｜ 📝 占位（只登记形状，尚未实现）

### 3.1 `GET /api/health` —— 健康检查 ✅ 已实现

**用途**：探针接口。确认「后端在线、公网可达、返回格式正确」。

**实现**：`cloudfunctions/health/index.js`

**请求**

| 项 | 值 |
|---|---|
| 方法 | `GET` |
| 路径 | `/api/health` |
| 入参 | 无 |
| 请求头 | 无特殊要求 |

**成功响应**（HTTP `200`，`Content-Type: application/json`）

```json
{
  "ok": true,
  "service": "hot-search-demo",
  "time": "2026-10-04T07:47:10.946Z"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `ok` | boolean | 固定 `true` |
| `service` | string | 服务标识，固定 `"hot-search-demo"` |
| `time` | string | 服务器当前时间（ISO 8601，UTC） |

**错误返回**：本接口无入参，正常不会返回业务错误；访问不存在的路径由 HTTP 访问服务直接返回 `404`。

**验证方式**：浏览器地址栏直接打开 `https://<env-id>.service.tcloudbase.com/api/health`，
应看到上面那段 JSON，其中 `ok` 为 `true`、`service` 为 `"hot-search-demo"`。
（截图时保留**地址栏 + 返回的 JSON**。）

---

### 3.2 `GET /api/platforms` —— 平台清单 📝 占位

**用途**：首页的**平台切换标签** + 「平台列表页」的**平台卡片**（卡片还要显示每个平台的条数）。
数据目前来自 `js/config.js` 的 `PLATFORMS`，条数来自 `HOT_DATA.filter(...)`。

**请求**

| 项 | 值 |
|---|---|
| 方法 | `GET` |
| 路径 | `/api/platforms` |
| 入参 | 无 |

**成功响应**（HTTP `200`）

```json
{
  "ok": true,
  "data": [
    { "key": "weibo", "name": "微博", "count": 2 },
    { "key": "baidu", "name": "百度", "count": 2 },
    { "key": "douyin", "name": "抖音", "count": 1 }
  ],
  "count": 3
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `data[].key` | string | 平台 key，与 `trends.platform` 对应 |
| `data[].name` | string | 平台中文名 |
| `data[].count` | number | 该平台当前热搜条数（平台列表页要显示「N 条热搜」） |
| `count` | number | 平台总数 |

**错误返回**：`500 INTERNAL_ERROR`。

---

### 3.3 `GET /api/hot` —— 热搜列表 ✅ 已实现

**用途**：首页（`#/home`）与「我的收藏」（`#/fav`）共用的**热搜列表读取接口**。
前端拿到后在本地做平台筛选与关键词筛选（`filteredItems()`），所以**筛选参数是可选优化，不作为必需**。

**请求**

| 项 | 值 |
|---|---|
| 方法 | `GET` |
| 路径 | `/api/hot` |
| 查询参数 | `platform`（可选，`weibo`/`baidu`/`douyin`/`bilibili`；缺省返回全部）<br>`date`（可选，`YYYY-MM-DD`；缺省为当天，按北京时间）<br>`limit`（可选，正整数，上限 100，**缺省 20**） |

**排序**：**按热度倒序**，同热度按名次升序（结果稳定可复现）。
⚠️ `trends."heat"` 是 TEXT（`'781 万'`），直接 `ORDER BY heat DESC` 会按**字典序**排
（`'9 万' > '781 万'`），必须解析成数值再排；接口把换算结果一并放在 `heatNum` 里，便于核对。

**成功响应**（HTTP `200`）

```json
{
  "ok": true,
  "data": [
    { "id": "douyin-1", "rank": 1, "title": "2026诺贝尔物理学奖公布", "heat": "1203 万", "heatNum": 12030000, "platform": "douyin", "url": "https://www.douyin.com/search/...", "date": "2026-10-06", "createdAt": "2026-10-06T17:52:11.123456+08:00" }
  ],
  "count": 20,
  "source": "synced",
  "date": "2026-10-06"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `data[].id` | string | 唯一标识，= `platform-rank`，**与前端 `itemId()` 一致**，收藏/详情都靠它 |
| `data[].rank` | number | 排名 |
| `data[].title` | string | 标题 |
| `data[].heat` | string | 热度（原样字符串，如 `"781 万"`） |
| `data[].heatNum` | number | ⚠️ **接口层换算，表里没有这一列**：`heat` 解析出的数值，排序依据，便于前端核对倒序是否生效 |
| `data[].platform` | string | 来源平台（`weibo` / `baidu` / `douyin` / `bilibili`） |
| `data[].url` | string | 去原平台查看的链接 |
| `data[].date` | string | 数据日期 `YYYY-MM-DD`（= 查询参数回显） |
| `data[].createdAt` | string | 入库时间，TIMESTAMPTZ 序列化（ISO 8601 带时区偏移） |
| `count` | number | 本次返回条数（`limit` 生效后的实际条数） |
| `source` | string | ⚠️ **接口层计算，表里没有这一列**：`synced` = 当日同步的真实数据；`seed` = 历史种子兜底（前端据此标注「示例数据」） |
| `date` | string | ⚠️ **接口层回显，表里没有这一列**：本次查询的数据日期（缺省 = 当天北京时间） |

> **Day 17 发现的两个「对不上」**（实现后回写）：
> ① `source` / `date` 在**响应顶层**而 `data[]` 里也有 `date`——两者含义不同，前者是查询口径、后者是行数据；
> ② `favorites.trendId` 指向的 trends 行被 `POST /api/sync` 的「先删当日再插」连带**外键级联删除**
>   （详见 §3.6 的「⚠️ 已知数据一致性问题」）。

**错误返回**

| 场景 | HTTP | body |
|---|---|---|
| `date` 格式不对 | `400` | `{ "ok": false, "error": "date 参数格式不对，应该写成 YYYY-MM-DD，例如 2026-10-06" }` |
| 服务端错误 | `500` | `{ "ok": false, "error": "读取热搜数据失败：……" }` |

---

### 3.4 `GET /api/hot/:id` —— 单条热搜 📝 占位

**用途**：热搜详情页（`#/detail/:id`，如 `#/detail/weibo-1`）**可独立访问/直接刷新**，需要按 id 取单条。
（若前端继续沿用「先取整个列表再本地查找」的做法（`findItemById()`），本接口可暂不实现；列在这里是为了让契约完整。）

**请求**

| 项 | 值 |
|---|---|
| 方法 | `GET` |
| 路径 | `/api/hot/:id`（`:id` 形如 `weibo-1`） |
| 入参 | 无 |

**成功响应**（HTTP `200`）

```json
{
  "ok": true,
  "data": { "id": "weibo-1", "rank": 1, "title": "示例热搜一：某地迎来初雪刷屏", "heat": "523 万", "platform": "weibo", "url": "https://s.weibo.com/top/summary" }
}
```

**错误返回**

| 场景 | HTTP | body |
|---|---|---|
| 该热搜不存在 | `404` | `{ "ok": false, "error": { "code": "NOT_FOUND", "message": "没有找到这条热搜" } }` |
| 服务端错误 | `500` | `{ "ok": false, "error": { "code": "INTERNAL_ERROR", "message": "暂时拿不到数据" } }` |

---

### 3.5 `GET /api/favorites` —— 收藏列表 ✅ 已实现

**用途**：「我的收藏」视图（`#/fav`）的**列表读取接口**。前端在此视图下还会对**标题与备注**做关键词筛选。

**请求**

| 项 | 值 |
|---|---|
| 方法 | `GET` |
| 路径 | `/api/favorites` |
| 查询参数 | `limit`（可选，正整数，**上限 100**；缺省返回全部）—— 见下方「余力加练」 |
| 入参 | 无（后续加用户系统后补 `userId`） |

**成功响应**（HTTP `200`）

```json
{
  "ok": true,
  "data": [
    { "id": "fav-1", "trendId": "weibo-1", "title": "示例热搜一：某地迎来初雪刷屏", "platform": "weibo", "note": "周末看看", "createdAt": "2026-10-04T07:47:10.946Z", "updatedAt": "2026-10-04T07:47:10.946Z" }
  ],
  "count": 1
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `data[].id` | string | 收藏记录 id |
| `data[].trendId` | string | 关联的热搜 id（`trends.id`） |
| `data[].title` / `platform` | string | 收藏时的标题 / 来源 |
| `data[].note` | string | 我的备注，可为空字符串 |
| `data[].createdAt` / `updatedAt` | string | 收藏时间 / 备注更新时间 |
| `count` | number | 本次返回条数（= `limit` 生效后的实际条数） |

**余力加练 · `limit` 查询参数**：`?limit=2` 只返回前 2 条收藏。
超出上限或非正整数时**不报错**，按「不限条数」处理；`limit=1000` 会被夹到 100。
（`GET /api/hot` 的 `limit` 同理。）

**错误返回**：`500 INTERNAL_ERROR`。

---

### 3.6 `POST /api/sync` —— 手动拉取当日真实热搜 ✅ 已实现

**用途**：从**免费公开来源**拉取当日真实热搜，写入 `trends` 表（**手动触发**，对应首页的「手动刷新」按钮；本课程**不做定时自动同步**）。

**实现计划**：**Day 17 实现**。

**数据源（免费公开 JSON 接口，不自建爬虫）**

> **v0.7.0 起同步源按附录 F 换轨为微博 / B站 / 抖音**（原百度源下线，Day 17 早些时候的百度实现已废弃）。

| 平台 | 接口 | 取数路径 | 标题 | 热度 | 名次 | 必需请求头 |
|---|---|---|---|---|---|---|
| 微博 `weibo` | `https://weibo.com/ajax/side/hotSearch` | `data.realtime[]` | `word` | `num` | `realpos` | 桌面 UA + `Referer: https://weibo.com/` |
| B站 `bilibili` | `https://api.bilibili.com/x/web-interface/search/square?limit=50` | `data.trending.list[]` | `keyword` | `heat_score` | 下标+1 | 桌面 UA + `Referer: https://www.bilibili.com/` |
| 抖音 `douyin` | `https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383` | `data.word_list[]` | `word` | `hot_value` | `position` | 桌面 UA + `Referer: https://www.douyin.com/` |

**请求头缺一不可（附录 F 实测）**：微博缺 `Referer` → 403；B站缺桌面 UA → 412；
抖音缺 `Referer` → HTTP 200 但列表为空（静默失败，最易误判）。
只用 Node 18 内置 `fetch`，**不引第三方依赖**。

**合规约束**：只用无需登录的公开榜单接口，不抓 HTML、不解析签名参数、不模拟登录态、
不带 Cookie/Authorization；单源单次请求、8 秒超时、**失败不重试**；同一平台 **60 秒节流**
（`force=1` 可强制）。全部失败 → `502` + 中文说明，**且不动库里已有数据**。

**判重规则（附录 F）**：`(platform, title, date)` 唯一 —— 已存在则更新热度与名次，不存在才插入。
当前表无该唯一索引，实现为**等价的应用层 upsert**；改表 SQL 见 `cloudfunctions/README.md` §4.2。

> **⚠️ 已知数据一致性问题（Day 17 实测发现，Day 18 处理）**
>
> 同步采用「先删当日旧数据再插入」（保证榜单语义干净），其中按 `id IN (baidu-1..baidu-50)` 清理旧行时，
> `favorites."trendId"` 上的外键 **`ON DELETE CASCADE`** 会把指向这些行的收藏**连带删掉**：
> Day 16 灌入的 5 条种子收藏（`fav-1`~`fav-5`）里，`fav-2`（baidu-2）、`fav-5`（baidu-5）
> 在首次同步真实数据后被级联删除，只剩 3 条 —— 收藏静默丢了 2 条。
>
> 这就是「接口返回的数据里，哪一项和你建的表对不上」的实例：
> `GET /api/favorites` 的 `count`（3）与建表时的 5 条对不上。
> 候选修法（Day 18 定）：a) 外键改 `ON DELETE RESTRICT` + 同步时先改写收藏指向；
> b) 收藏表去掉外键、靠应用层维护（`title` 本来就是冗余快照，条目没了也能显示）。
> 今天不改表结构（任务清单明确「今日不做」），先记录。

**请求**

| 项 | 值 |
|---|---|
| 方法 | `POST` |
| 路径 | `/api/sync` |
| 请求体 | `{ "source": "baidu" }`（`source` 可选，只认 `baidu`/`weibo`/`douyin`；**缺省只同步 `baidu`** —— 微博源稳定性差，缺省只保证一条可靠链路）<br>`{ "date": "2026-10-06" }`（`date` 可选；缺省为当天，便于补数/回放） |

**成功响应**（HTTP `200`）

```json
{
  "ok": true,
  "data": {
    "date": "2026-10-06", "source": "baidu", "fetched": 50, "inserted": 50, "updated": 0,
    "detail": [ { "source": "baidu", "fetched": 50, "inserted": 50, "favoritesRefreshed": 0 } ]
  },
  "count": 50
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.source` | string | 本次实际使用的来源（主源失败降级时 ≠ 请求里的 source） |
| `data.date` | string | 同步的数据日期 |
| `data.fetched` | number | 从上游拉到的条数 |
| `data.inserted` | number | 写入 `trends` 的条数 |
| `data.updated` | number | 预留字段，当前恒为 0（写入策略是「整批重插」而非逐条更新） |
| `data.detail[].favoritesRefreshed` | number | 顺带刷新了收藏表里多少条冗余标题 |

**错误返回**

| 场景 | HTTP | body |
|---|---|---|
| `source` 非法 | `400` | `{ "ok": false, "error": "不支持的来源，目前只支持：weibo / bilibili / douyin" }` |
| 公开数据源不可用 | `502` | `{ "ok": false, "error": "数据源暂不可用：……" }`（**库里已有数据保持原样**） |
| 服务端错误 | `500` | `{ "ok": false, "error": "同步失败：……" }` |

---

### 3.7 `POST /api/favorites` —— 新增收藏 📝 占位

**用途**：把一条热搜加入收藏（对应列表/详情页的「☆ 收藏」按钮）。

**请求**

| 项 | 值 |
|---|---|
| 方法 | `POST` |
| 路径 | `/api/favorites` |
| 请求体 | `{ "trendId": "weibo-1", "title": "示例标题", "platform": "weibo", "note": "" }` |

- 必填：`trendId`、`title`、`platform`；`note` 可选（默认空字符串）。

**成功响应**（HTTP `201`）

```json
{
  "ok": true,
  "data": { "id": "fav-1", "trendId": "weibo-1", "title": "示例标题", "platform": "weibo", "note": "", "createdAt": "2026-10-04T07:47:10.946Z", "updatedAt": "2026-10-04T07:47:10.946Z" }
}
```

**错误返回**

| 场景 | HTTP | body |
|---|---|---|
| 缺必填字段 | `400` | `{ "ok": false, "error": { "code": "BAD_REQUEST", "message": "缺少必填字段 trendId" } }` |
| 重复收藏同一条 | `409` | `{ "ok": false, "error": { "code": "CONFLICT", "message": "已经收藏过了" } }` |
| 服务端错误 | `500` | `{ "ok": false, "error": { "code": "INTERNAL_ERROR", "message": "收藏失败" } }` |

---

### 3.8 `PATCH /api/favorites/:id` —— 修改收藏备注 📝 占位

**用途**：修改某条收藏的备注（对应详情页的「我的备注」输入框）。

**实现计划**：**第 4 周实现**。

**请求**

| 项 | 值 |
|---|---|
| 方法 | `PATCH` |
| 路径 | `/api/favorites/:id`（`:id` 为收藏记录 id） |
| 请求体 | `{ "note": "新备注" }` |

**成功响应**（HTTP `200`）

```json
{
  "ok": true,
  "data": { "id": "fav-1", "trendId": "weibo-1", "title": "示例标题", "platform": "weibo", "note": "新备注", "createdAt": "2026-10-04T07:47:10.946Z", "updatedAt": "2026-10-04T08:10:00.000Z" }
}
```

**错误返回**

| 场景 | HTTP | body |
|---|---|---|
| `note` 缺失或非字符串 | `400` | `{ "ok": false, "error": { "code": "BAD_REQUEST", "message": "note 必填且为字符串" } }` |
| 收藏不存在 | `404` | `{ "ok": false, "error": { "code": "NOT_FOUND", "message": "收藏不存在" } }` |

---

### 3.9 `DELETE /api/favorites/:id` —— 取消收藏 📝 占位

**用途**：从收藏中移除一条（对应「★ 已收藏」按钮的取消）。

**实现计划**：**第 4 周实现**。

**请求**

| 项 | 值 |
|---|---|
| 方法 | `DELETE` |
| 路径 | `/api/favorites/:id`（`:id` 为收藏记录 id） |
| 入参 | 无 |

**成功响应**（HTTP `200`）

```json
{ "ok": true, "data": { "id": "fav-1", "deleted": true } }
```

**错误返回**

| 场景 | HTTP | body |
|---|---|---|
| 收藏不存在 | `404` | `{ "ok": false, "error": { "code": "NOT_FOUND", "message": "收藏不存在" } }` |
| 服务端错误 | `500` | `{ "ok": false, "error": { "code": "INTERNAL_ERROR", "message": "取消失败" } }` |

---

## 4. 页面 ↔ 接口 对照（本契约的推导依据）

| 页面 / 视图（`my-app`） | 前端现在怎么拿数据 | 接入后端后调用 |
|---|---|---|
| 首页 `#/home`（热搜列表 + 平台标签 + 关键词筛选） | `HOT_DATA` + `PLATFORMS` | `GET /api/hot`、`GET /api/platforms` |
| 平台列表页 `#/platforms`（平台卡片 + 「N 条热搜」） | `PLATFORMS` + `HOT_DATA.filter()` 计数 | `GET /api/platforms`（含 `count`） |
| 热搜详情页 `#/detail/:id`（可独立访问） | `findItemById()` 从列表里找 | `GET /api/hot/:id`（或继续从列表派生） |
| 我的收藏 `#/fav`（收藏列表，按标题/备注筛选） | `localStorage`（`store.js`） | `GET /api/favorites` |
| 收藏按钮「☆/★」 | `FavStore.toggleFav()` | `POST /api/favorites` / `DELETE /api/favorites/:id` |
| 详情页「我的备注」输入框 | `FavStore.setNote()` | `PATCH /api/favorites/:id` |
| 首页「手动刷新」按钮 | `loadData()`（当前是假延迟） | `POST /api/sync` + `GET /api/hot` |
| 全局探针（确认后端在线） | 无 | `GET /api/health` |

> 说明：页面上的**复制标题**（Day 11）是纯前端能力，**不需要后端接口**；关键词筛选、平台筛选在数据量小时**由前端本地完成**，因此不单列接口。

---

## 5. 变更记录

| 版本 | 日期 | 变更 | 影响 |
|---|---|---|---|
| v0.1.0 | 2026-10-04 | 建立契约；统一信封 `{code,data,message}`；实现 `GET /api/health` | 新增（Day 15 初版） |
| v0.2.0 | 2026-10-04 | 响应结构改为顶层 `ok`；`/api/health` 改为 `{ok, service, time}`；登记 6 个接口占位 | 破坏性变更（无消费方，仅本地） |
| v0.3.0 | 2026-10-04 | **按 `my-app` 页面需求推导重写**：新增 `GET /api/platforms`（平台清单，页面需要）、`GET /api/hot/:id`（详情页可独立访问）；新增 §2 数据表（`trends` / `favorites`）与 §4 页面↔接口对照；补 `favorites.updatedAt`、`trendId` 迁移提示 | 占位阶段，无代码影响 |
| v0.4.0 | 2026-10-05 | **数据表落地**：CloudBase PostgreSQL 17.11 已建 `trends` / `favorites` 两表（各 5 行种子），DDL 落 `db/schema.sql`、种子落 `db/seed.sql`（幂等）；明确「列名必须加双引号保留驼峰」这条 SQL 书写规则 | **表结构定稿**，Day 17 读接口按此实现；接口数量与字段未变 |
| v0.5.0 | 2026-10-05 | **一致性回写**：新增 §2.4「契约字段 ↔ 数据库列」逐字段核对表（15 个字段全部一致）；补齐脚本清单（新增 `db/reset.sql` 先删后建的重置脚本、`db/README.md` 执行与 select 验证手册）；`seed.sql` / `reset.sql` 的时间字段改为固定值以满足「可复现」 | 无接口变更；表结构未变。**契约与数据库从此互为依据，改一边必须先改契约** |
| v0.6.0 | 2026-10-06 | **GET 读接口落地**：`/api/hot`（§3.3）与 `/api/favorites`（§3.5）由占位转**已实现**，补 `data[].date` / `data[].createdAt` / 顶层 `source` 字段与 `limit` 查询参数；`/api/sync`（§3.6）落地：百度源 URL 修正为 `platform=pc`、请求体缺省语义改为「只同步 baidu」、响应补 `fetched` / `detail[].favoritesRefreshed`；新增 §3.6「已知数据一致性问题」：同步的级联删除会连带清掉指向被删热搜的收藏（5 条种子收藏剩 3 条），Day 18 定修法。**前端另行修复** `Promise.all` 结果未解构导致页面永远显示示例数据的 bug（接口与契约一致、页面取数姿势错） | `GET /api/hot`、`GET /api/favorites`、`POST /api/sync` 正式可用；表结构未变 |
| v0.7.0 | 2026-10-06 | **响应形状统一 + 同步源换轨**：失败响应 `error` 由对象 `{code,message}` 改为**中文字符串**（成功/失败结构对称）；`/api/hot` 排序改为**按热度倒序返回前 20 条**（`heat` 是 TEXT，须解析成数值排，字典序是错的），新增 `data[].heatNum`；`/api/sync` 按附录 F 换轨为**微博 / B站 / 抖音**三平台（原百度源下线），补齐各源必需请求头与字段映射，判重键 `(platform,title,date)` 落地为应用层 upsert（改表 SQL 见 `cloudfunctions/README.md`），新增 60 秒节流与 `force` 参数；前端平台清单补 `bilibili` | **破坏性变更**：消费方读 `error.message` 的地方要改成读 `error` 字符串（前端已兼容两种）；表结构未变 |

---

## 6. 与 `TECH_DESIGN.md` 的差异说明

本契约按「今日热搜」页面的实际需求推导，与 `TECH_DESIGN.md` §5 早期草拟的命名有出入，**以本文件为准**：

| TECH_DESIGN.md §5 早期写法 | 本契约（现行） | 说明 |
|---|---|---|
| `GET /api/hot-search?platform=&date=` | `GET /api/hot?platform=&date=` | 路径统一为 `/api/hot` |
| `GET /api/platforms` | `GET /api/platforms` | **保留**（平台列表页确实需要） |
| `POST /api/sync` | `POST /api/sync`（Day 17） | 一致 |
| — | `GET /api/hot/:id` | 新增：详情页可独立访问 |
| — | `GET/POST/PATCH/DELETE /api/favorites*` | 新增：收藏与备注（第 4 周实现后三个） |
