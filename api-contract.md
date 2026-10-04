# API 契约（api-contract.md）

> 本文件是**前后端「说好了」的唯一凭证**：前端按这里调用，后端按这里实现。
> 任何一方要改字段、改路径、改返回结构，**先改本文件，再改代码**。
>
> 本版按「今日热搜」案例 Day 15 的任务要求登记全部接口；除 `GET /api/health` 外，
> **均为占位**（只登记形状，不实现）。

| 项目 | 内容 |
|---|---|
| 项目 | 今日热搜（`vibe-coding-journey` 的 `my-app`） |
| 阶段 | Phase 2 —— 从「纯静态」接入真实后端 |
| 后端形态 | 腾讯云 CloudBase（云开发）· 普通云函数 + HTTP 访问服务 |
| 前端形态 | 原生 JS 静态站（无构建步骤），托管于 CloudBase 静态网站托管 |
| 契约版本 | **v0.2.0** |
| 最后更新 | 2026-10-04 |
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
- **例外**：探针接口 `GET /api/health` 直接把 `service` / `time` **平铺**在顶层，不再包 `data`（见 2.1）。

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
| `404` | `NOT_FOUND` | 资源不存在（如收藏 id 不存在） | 提示「没有找到」 |
| `409` | `CONFLICT` | 冲突（如重复收藏同一条热搜） | 提示「已经收藏过了」 |
| `500` | `INTERNAL_ERROR` | 服务端错误 | 提示「暂时拿不到数据，请稍后重试」+ 重试按钮，**不白屏** |
| `502` | `UPSTREAM_UNAVAILABLE` | 上游公开数据源不可用 | 该来源显示「数据暂不可用」，其余正常 |

> HTTP 状态码与 `error.code` **一一对应**：上面同一行的两者同时出现。

### 1.4 通用约束

- **编码 / 格式**：UTF-8；请求与响应体均为 JSON（`Content-Type: application/json`）。
- **时间**：ISO 8601，UTC，例：`2026-10-04T07:47:10.946Z`。
- **认证**：当前无用户系统，**接口暂不需要鉴权**；后续加登录时在本节补充。
- **跨域（CORS）**：**暂不配置**（今天只验证「公网能直接打开返回 JSON」），由后续 Day 处理。
- **分页**：暂不需要（数据量小）；接入真实数据源后如有需要，在对应接口补 `page` / `pageSize`。
- **数据来源**：只从**免费公开来源**取数，**绝不自建爬虫**。

---

## 2. 接口明细

> 图例：✅ 已实现 ｜ 📝 占位（只登记形状，尚未实现）

### 2.1 `GET /api/health` —— 健康检查 ✅ 已实现

**用途**：探针接口。确认「后端在线、公网可达、返回格式正确」。后续接口都照它的套路新增。

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
| `service` | string | 服务标识，固定 `"hot-search-demo"`，前端可据此核对「连对了后端」 |
| `time` | string | 服务器当前时间（ISO 8601，UTC） |

**错误返回**：本接口无入参，正常不会返回业务错误；访问不存在的路径由 HTTP 访问服务直接返回 `404`。

**验证方式**：浏览器地址栏直接打开 `https://<env-id>.service.tcloudbase.com/api/health`，
应看到上面那段 JSON，其中 `ok` 为 `true`、`service` 为 `"hot-search-demo"`、`time` 是当前时间。
（截图时保留**地址栏 + 返回的 JSON**。）

---

### 2.2 `GET /api/hot` —— 热搜列表 📝 占位

**用途**：返回热搜列表（今日热搜主页的数据来源）。

**实现计划**：接入真实数据后实现（依赖 `trends` 表）。

**请求**

| 项 | 值 |
|---|---|
| 方法 | `GET` |
| 路径 | `/api/hot` |
| 查询参数 | `platform`（可选，如 `weibo` / `baidu` / `douyin`；缺省返回全部/合并）<br>`date`（可选，`YYYY-MM-DD`；缺省为当天） |

**成功响应**（HTTP `200`）

```json
{
  "ok": true,
  "data": [
    { "id": "weibo-1", "rank": 1, "title": "示例标题", "heat": "523万", "platform": "weibo", "url": "https://..." }
  ],
  "count": 1
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `data[].id` | string | 唯一标识 |
| `data[].rank` | number | 排名 |
| `data[].title` | string | 热搜标题 |
| `data[].heat` | string | 热度（保留原样字符串，如 `"523万"`） |
| `data[].platform` | string | 来源平台 |
| `data[].url` | string | 原文链接 |
| `count` | number | 本次返回条数 |

**错误返回**

| 场景 | HTTP | body |
|---|---|---|
| 参数格式不对（如 `date` 非 `YYYY-MM-DD`） | `400` | `{ "ok": false, "error": { "code": "BAD_REQUEST", "message": "date 格式应为 YYYY-MM-DD" } }` |
| 服务端错误 | `500` | `{ "ok": false, "error": { "code": "INTERNAL_ERROR", "message": "暂时拿不到数据" } }` |

---

### 2.3 `GET /api/favorites` —— 收藏列表 📝 占位

**用途**：返回当前用户的收藏列表。

**实现计划**：依赖 `favorites` 表。

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
    { "id": "fav-1", "trendId": "weibo-1", "title": "示例标题", "platform": "weibo", "note": "备注", "createdAt": "2026-10-04T07:47:10.946Z" }
  ],
  "count": 1
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `data[].id` | string | 收藏记录 id |
| `data[].trendId` | string | 关联的热搜 id |
| `data[].title` / `platform` | string | 收藏时的热搜标题 / 来源（冗余存一份，防止原条目变动） |
| `data[].note` | string | 备注，可为空字符串 |
| `data[].createdAt` | string | 收藏时间（ISO 8601，UTC） |
| `count` | number | 本次返回条数 |

**错误返回**：`500 INTERNAL_ERROR`。

---

### 2.4 `POST /api/sync` —— 手动拉取当日真实热搜 📝 占位

**用途**：从**免费公开来源**拉取当日真实热搜，写入 `trends` 表（**手动触发**，本课程**不做定时自动同步**）。

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

### 2.5 `POST /api/favorites` —— 新增收藏 📝 占位

**用途**：把一条热搜加入收藏。

**实现计划**：依赖 `favorites` 表。

**请求**

| 项 | 值 |
|---|---|
| 方法 | `POST` |
| 路径 | `/api/favorites` |
| 请求体 | `{ "trendId": "weibo-1", "title": "示例标题", "platform": "weibo", "url": "https://...", "note": "" }` |

- 必填：`trendId`、`title`、`platform`；`url`、`note` 可选。

**成功响应**（HTTP `201`）

```json
{
  "ok": true,
  "data": { "id": "fav-1", "trendId": "weibo-1", "title": "示例标题", "platform": "weibo", "note": "", "createdAt": "2026-10-04T07:47:10.946Z" }
}
```

**错误返回**

| 场景 | HTTP | body |
|---|---|---|
| 缺必填字段 | `400` | `{ "ok": false, "error": { "code": "BAD_REQUEST", "message": "缺少必填字段 trendId" } }` |
| 重复收藏同一条 | `409` | `{ "ok": false, "error": { "code": "CONFLICT", "message": "已经收藏过了" } }` |
| 服务端错误 | `500` | `{ "ok": false, "error": { "code": "INTERNAL_ERROR", "message": "收藏失败" } }` |

---

### 2.6 `PATCH /api/favorites/:id` —— 修改收藏备注 📝 占位

**用途**：修改某条收藏的备注。

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
  "data": { "id": "fav-1", "trendId": "weibo-1", "title": "示例标题", "platform": "weibo", "note": "新备注", "createdAt": "2026-10-04T07:47:10.946Z" }
}
```

**错误返回**

| 场景 | HTTP | body |
|---|---|---|
| `note` 缺失或非字符串 | `400` | `{ "ok": false, "error": { "code": "BAD_REQUEST", "message": "note 必填且为字符串" } }` |
| 收藏不存在 | `404` | `{ "ok": false, "error": { "code": "NOT_FOUND", "message": "收藏不存在" } }` |

---

### 2.7 `DELETE /api/favorites/:id` —— 取消收藏 📝 占位

**用途**：从收藏中移除一条。

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

## 3. 变更记录

| 版本 | 日期 | 变更 | 影响 |
|---|---|---|---|
| v0.1.0 | 2026-10-04 | 建立契约；定义统一信封 `{code,data,message}`；实现 `GET /api/health` | 新增（Day 15 初版） |
| v0.2.0 | 2026-10-04 | **响应结构由 `{code,data,message}` 信封改为顶层 `ok` 结构**；`/api/health` 返回改为 `{ok, service, time}`；登记 6 个后续接口占位（hot / favorites / sync） | 破坏性变更（无消费方，仅本地）；接口清单以本版为准 |

---

## 4. 与 `TECH_DESIGN.md` 的差异说明

本契约按「今日热搜」案例的任务要求登记接口，与 `TECH_DESIGN.md` §5 早期草拟的命名有出入，**以本文件为准**：

| TECH_DESIGN.md §5 早期写法 | 本契约（现行） | 说明 |
|---|---|---|
| `GET /api/hot-search?platform=&date=` | `GET /api/hot?platform=&date=` | 路径统一为 `/api/hot` |
| `GET /api/platforms` | （暂未登记） | 平台清单暂并入 `/api/hot` 的查询参数；如后续独立区分再加 |
| `POST /api/sync` | `POST /api/sync`（Day 17） | 一致 |
| — | `GET/POST/PATCH/DELETE /api/favorites*` | 本版新增：收藏相关接口（第 4 周实现） |
