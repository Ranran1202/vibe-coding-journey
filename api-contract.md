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
| 数据库 | CloudBase **PostgreSQL 17.11**（真 SQL）。**2026-10-05（Day 16）已建表**，DDL 见 `db/schema.sql`，种子见 `db/seed.sql` |
| 契约版本 | **v0.4.0** |
| 最后更新 | 2026-10-05 |
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
{ "ok": false, "error": { "code": "BAD_REQUEST", "message": "缺少必填参数 trendId" } }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `ok` | boolean | `true` = 成功，`false` = 失败 |
| `error.code` | string | 机器可读错误码（见 1.3） |
| `error.message` | string | 人类可读说明（中文，可直接展示给用户） |

### 1.3 错误码

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

### 2.1 `trends`（热搜记录表）

对应 `js/data.js` 的 `HOT_DATA`（字段名保持一致，便于前端平滑切换）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 主键，形如 `weibo-1`（= `platform` + `-` + `rank`），**与前端 `app.js` 的 `itemId()` 完全一致** |
| `platform` | string | 来源平台 key：`weibo` / `baidu` / `douyin` |
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

### 3.3 `GET /api/hot` —— 热搜列表 📝 占位

**用途**：首页（`#/home`）与「我的收藏」（`#/fav`）共用的**热搜列表读取接口**。
前端拿到后在本地做平台筛选与关键词筛选（`filteredItems()`），所以**筛选参数是可选优化，不作为必需**。

**请求**

| 项 | 值 |
|---|---|
| 方法 | `GET` |
| 路径 | `/api/hot` |
| 查询参数 | `platform`（可选，`weibo`/`baidu`/`douyin`；缺省返回全部）<br>`date`（可选，`YYYY-MM-DD`；缺省为当天） |

**成功响应**（HTTP `200`）

```json
{
  "ok": true,
  "data": [
    { "id": "weibo-1", "rank": 1, "title": "示例热搜一：某地迎来初雪刷屏", "heat": "523 万", "platform": "weibo", "url": "https://s.weibo.com/top/summary" }
  ],
  "count": 1
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `data[].id` | string | 唯一标识，= `platform-rank`，**与前端 `itemId()` 一致**，收藏/详情都靠它 |
| `data[].rank` | number | 排名 |
| `data[].title` | string | 标题 |
| `data[].heat` | string | 热度（原样字符串，如 `"523 万"`） |
| `data[].platform` | string | 来源平台 |
| `data[].url` | string | 去原平台查看的链接 |
| `count` | number | 本次返回条数 |

**错误返回**

| 场景 | HTTP | body |
|---|---|---|
| `date` 格式不对 | `400` | `{ "ok": false, "error": { "code": "BAD_REQUEST", "message": "date 格式应为 YYYY-MM-DD" } }` |
| 服务端错误 | `500` | `{ "ok": false, "error": { "code": "INTERNAL_ERROR", "message": "暂时拿不到数据" } }` |

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

### 3.5 `GET /api/favorites` —— 收藏列表 📝 占位

**用途**：「我的收藏」视图（`#/fav`）的**列表读取接口**。前端在此视图下还会对**标题与备注**做关键词筛选。

**请求**

| 项 | 值 |
|---|---|
| 方法 | `GET` |
| 路径 | `/api/favorites` |
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
| `count` | number | 本次返回条数 |

**错误返回**：`500 INTERNAL_ERROR`。

---

### 3.6 `POST /api/sync` —— 手动拉取当日真实热搜 📝 占位

**用途**：从**免费公开来源**拉取当日真实热搜，写入 `trends` 表（**手动触发**，对应首页的「手动刷新」按钮；本课程**不做定时自动同步**）。

**实现计划**：**Day 17 实现**。

**请求**

| 项 | 值 |
|---|---|
| 方法 | `POST` |
| 路径 | `/api/sync` |
| 请求体 | `{ "source": "weibo" }`（`source` 可选；缺省同步全部来源） |

**成功响应**（HTTP `200`）

```json
{
  "ok": true,
  "data": { "source": "weibo", "date": "2026-10-04", "inserted": 50, "updated": 0 }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.source` | string | 本次同步的来源 |
| `data.date` | string | 同步的数据日期 |
| `data.inserted` | number | 新增条数 |
| `data.updated` | number | 更新条数 |

**错误返回**

| 场景 | HTTP | body |
|---|---|---|
| `source` 非法 | `400` | `{ "ok": false, "error": { "code": "BAD_REQUEST", "message": "不支持的来源" } }` |
| 公开数据源不可用 | `502` | `{ "ok": false, "error": { "code": "UPSTREAM_UNAVAILABLE", "message": "数据源暂不可用" } }` |
| 服务端错误 | `500` | `{ "ok": false, "error": { "code": "INTERNAL_ERROR", "message": "同步失败" } }` |

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
