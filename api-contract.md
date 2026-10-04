# API 契约（api-contract.md）

> 本文件是**前后端「说好了」的唯一凭证**：前端按这里调用，后端按这里实现。
> 任何一方要改字段、改路径、改返回结构，**先改本文件，再改代码**。

| 项目 | 内容 |
|---|---|
| 项目 | 今日热搜（`vibe-coding-journey` 的 `my-app`） |
| 阶段 | Phase 2 —— Day 15 起从「纯静态」接入真实后端 |
| 后端形态 | 腾讯云 CloudBase（云开发）· 普通云函数 + HTTP 访问服务 |
| 契约版本 | **v0.1.0** |
| 最后更新 | 2026-10-04（Day 15） |
| 关联文档 | `TECH_DESIGN.md` §5（API 列表）、§6.2（Phase 2 数据流）、§4.3（Phase 2 数据模型） |

---

## 1. 通用约定（所有接口都遵守）

### 1.1 基础地址 Base URL

| 环境 | Base URL |
|---|---|
| 生产（CloudBase HTTP 访问服务） | `https://<env-id>.service.tcloudbase.com` |

- `<env-id>` = 你的 CloudBase **环境 ID**（控制台「环境 → 概览 / 环境设置」可查，形如 `xxx-1a2b3c4d`）。
- **⚠️ 安全红线：环境 ID 属敏感信息，只记在本地，不要写进仓库、不要贴到聊天里。**
  本文件里一律用占位符 `<env-id>`，不写真实值。
- 举例：`GET https://<env-id>.service.tcloudbase.com/api/health`

### 1.2 统一响应信封

所有接口共用同一层外壳（对齐 `TECH_DESIGN.md` §5）：

```json
{
  "code": 0,
  "data": {},
  "message": "ok"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | number | `0` = 成功；非 `0` = 失败（见 1.3） |
| `data` | object \| array \| null | 业务数据；失败时为 `null` |
| `message` | string | 人类可读说明；成功固定为 `"ok"` |

### 1.3 错误码

| code | 含义 | 前端表现（对齐 `TECH_DESIGN.md` §7） |
|---|---|---|
| `0` | 成功 | 正常渲染 |
| `400` | 参数错误（缺必填 / 格式不对） | 提示「请求参数有误」 |
| `404` | 资源不存在 | 提示「没有找到」 |
| `500` | 服务端错误 | 提示「暂时拿不到数据，请稍后重试」+ 重试按钮，**不白屏** |
| `1001` | 数据源不可用（某平台抓不到） | 该平台显示「数据暂不可用」，其余平台正常 |

### 1.4 通用约束

- **编码 / 格式**：UTF-8；请求与响应体均为 JSON（`Content-Type: application/json`）。
- **时间**：ISO 8601，UTC，例：`2026-10-04T07:20:14.963Z`。
- **认证**：Day 15 无用户系统，**接口不需要鉴权**；后续加登录时在本节补充。
- **跨域（CORS）**：Day 15 **暂不配置**，由 Day 16–20 处理（今天只验证「公网能直接打开返回 JSON」）。
- **分页**：暂不需要（数据量小）；接入真实数据源后如有需要，在对应接口里补 `page` / `pageSize`。

---

## 2. 接口明细

### 2.1 `GET /api/health` —— 健康检查 ✅ 已实现（Day 15）

**用途**：探针接口。确认「后端在线、公网可达、返回格式正确」。Day 16+ 所有业务接口都照它的套路新增。

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
  "code": 0,
  "message": "ok",
  "data": {
    "service": "hot-search-api",
    "status": "healthy",
    "version": "0.1.0",
    "envId": "<env-id>",
    "requestMethod": "GET",
    "serverTime": "2026-10-04T07:20:14.963Z",
    "uptimeSeconds": 0
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.service` | string | 服务标识，固定 `"hot-search-api"`，用于前端核对「连对了后端」 |
| `data.status` | string | `"healthy"` 表示服务正常 |
| `data.version` | string | 接口版本，与本文档 §4 变更记录对应 |
| `data.envId` | string | 当前 CloudBase 环境 ID（截图时可按需打码） |
| `data.requestMethod` | string | 本次实际收到的 HTTP 方法，应为 `"GET"` |
| `data.serverTime` | string | 服务器当前时间（ISO 8601，UTC） |
| `data.uptimeSeconds` | number | 当前函数实例已运行秒数；值很小说明刚冷启动 |

**错误响应**：本接口无入参，正常不会返回业务错误；若访问到不存在的路径会被 HTTP 访问服务直接返回 `404`（非信封格式）。

**验证方式**（Day 15 完成标准）

1. 浏览器地址栏直接打开 `https://<env-id>.service.tcloudbase.com/api/health`
2. 页面应显示上面那段 JSON，且 `code` 为 `0`、`status` 为 `"healthy"`
3. 截图时保留**地址栏 + 返回的 JSON**

---

## 3. 规划中的接口（Day 16 起，先立契约定方向）

> 以下接口来自 `TECH_DESIGN.md` §5，**Day 15 不实现**，先在此列明以便前后端「提前说好」。

| 方法 | 路径 | 说明 | 计划接入 |
|---|---|---|---|
| `GET` | `/api/platforms` | 平台清单（微博 / 百度 / 抖音…） | Day 16–17 |
| `GET` | `/api/hot-search` | 热搜列表（真实数据），入参 `platform`、`date` | Day 17 |
| `POST` | `/api/sync` | 触发从**免费公开源**同步（绝不自建爬虫） | Day 18+ |

**示例：`GET /api/hot-search?platform=weibo&date=2026-10-04`**

```json
{
  "code": 0,
  "message": "ok",
  "data": [
    { "id": "weibo-1", "rank": 1, "title": "示例标题", "heat": "523万", "platform": "weibo", "url": "https://..." }
  ]
}
```

> 数据字段与 `TECH_DESIGN.md` §4.1 的 `HotItem` 保持一致。

---

## 4. 变更记录

| 版本 | 日期 | 变更 | 影响 |
|---|---|---|---|
| v0.1.0 | 2026-10-04 | 建立契约；定义统一信封、错误码；实现 `GET /api/health` | 新增（Day 15） |
