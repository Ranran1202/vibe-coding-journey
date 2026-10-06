# 《我的AI不预测股价，它预测人性》· 接口契约（AI 漫剧线）

> 本文件是 **AI 漫剧线（`ai-drama/`）** 的接口契约，与仓库根目录的 `api-contract.md`（今日热搜线）**互相独立**。
> 两条线共用同一个 CloudBase 环境，但表、接口路径、文档各自隔离。

| 项 | 值 |
|---|---|
| 项目 | `ai-drama` —— AI 漫剧展示站（原生 JS 静态站 + CloudBase 云函数） |
| 契约版本 | **v0.1.0** |
| 最后更新 | 2026-10-06 |
| 数据库 | CloudBase **PostgreSQL 17.11**；建表 `db/drama_schema.sql`、种子 `db/drama_seed.sql`（均幂等） |
| 关联文档 | `ai-drama/TECH_DESIGN.md`（§三 数据对象、§4.2 方案 B 的 API 列表） |

---

## 0. 动手前的三个问题：我的数据从哪来

| 问题 | 本项目的答案 |
|---|---|
| ① 数据是「别人产出的」还是「我的用户产出的」？ | **我自己产出的**。剧集剧本、角色设定、制作工具清单都是创作者写的 —— 不是热搜、天气、汇率那种外部公开数据。 |
| ② 只看当前，还是要能回看过去？ | **要能回看过去**。剧集列表要一直能看到全部集数；「第 3 集什么时候定稿」「某一集被看过几次、最近一次是什么时候」都要查得到。 |
| ③ 这份数据明天还在原地吗？ | **不存就没了**。原先只写在 `assets/js/data.js` 的前端常量里，换设备、清缓存就没了，更无法记录用户行为。 |

**结论：用户产出 → 必须存进数据库，这是项目的核心资本。**

因此本次**不接任何外部 API**（剧集数据不是外部公开信息），路径是：
把 `data.js` 的内容落库 → 接口从**自己建的表**里读出真实数据。
只有当项目确实要展示外部信息（天气、课程表、汇率）时，才需要按附录 F 去找合法公开接口。

---

## 1. 通用约定

### 1.1 基础地址

`https://<env-id>.service.tcloudbase.com`

> ⚠️ 环境 ID 属敏感信息：只留本地 `cloudbaserc.json`（已 gitignore），不进仓库、不贴聊天。

### 1.2 统一响应形状

**三个键恒定出现**：`ok` / `data` / `error`。

| 场景 | 响应 |
|---|---|
| 成功 | `{ "ok": true,  "data": [ ... ], "count": N, "error": null }` |
| 失败 | `{ "ok": false, "data": null, "error": "人能看懂的中文说明" }` |

- `error` 是**字符串**（与今日热搜线 v0.7.0 的约定一致），可直接展示给用户；成功时恒为 `null`。
- 失败语义由 **HTTP 状态码**承担：`400` 参数错、`500` 服务端错。
- 列表类接口额外给 `count`（本次返回条数）。

### 1.3 约束

- **SQL 必须参数化**：云函数内一律用官方 SDK 查询构造器（`.from().select().eq().order().limit()`），
  **禁止字符串拼接 SQL**。筛选值由 SDK 走 HTTP 参数传给数据网关，无注入面。
- **列名一律加英文双引号**：`"order"`、`"episodeId"`、`"watchedAt"` …
  PostgreSQL 会把无引号标识符折叠成小写，那样接口返回的 JSON 键会变成 `episodeid`，与契约对不上。
  另外 `"order"` 是 SQL 保留字，不加引号直接语法错误。
- 编码 UTF-8；响应 `Content-Type: application/json; charset=utf-8`。

---

## 2. 数据表

### 2.1 `drama_episodes` —— **核心表**（内容本体）

对应打卡应用的 `plan_days`：这是项目的主体内容，创作者产出。

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | `ep01` 形式 |
| `order` | INTEGER | NOT NULL | 第几集（**SQL 保留字，必须加引号**） |
| `title` | TEXT | NOT NULL | 集标题 |
| `status` | TEXT | NOT NULL | `剧本定稿` / `制作中` / `已发布` |
| `duration` | TEXT | DEFAULT `''` | 展示用时长，如 `约 90 秒` |
| `durationSec` | INTEGER | DEFAULT 0 | 数值时长（便于排序统计） |
| `summary` | TEXT | DEFAULT `''` | 一句话简介 |
| `scene` | TEXT | DEFAULT `''` | 主要场景 |
| `videoUrl` | TEXT | DEFAULT `''` | 成片外链（视频本体不进仓库） |
| `cast` | JSONB | DEFAULT `[]` | 出场角色 id 数组 |
| `updatedAt` | TIMESTAMPTZ | DEFAULT `now()` | 更新时间 |

### 2.2 `drama_watch_logs` —— **记录表**（用户行为）

对应打卡应用的 `checkins`：一次观看 = 一次打卡，是「回看历史」的依据。

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | TEXT | PK | `log-1` |
| `episodeId` | TEXT | NOT NULL, **FK → `drama_episodes(id)` ON DELETE CASCADE** | 看了哪一集 |
| `viewer` | TEXT | NOT NULL | 观众标识（暂无用户系统，先记 `me`） |
| `progress` | INTEGER | NOT NULL | 观看进度 0–100 |
| `device` | TEXT | DEFAULT `''` | 设备/来源 |
| `watchedAt` | TIMESTAMPTZ | NOT NULL | 观看时间（回看历史靠它） |

> 索引：`idx_drama_episodes_order`、`idx_drama_episodes_status`、`idx_drama_watchlogs_episode`、`idx_drama_watchlogs_time`。

---

## 3. 接口明细

### 3.1 `GET /api/drama/episodes` —— 剧集列表 ✅ 已实现

> **实现记录（2026-10-06）**
> - 云函数：`cloudfunctions/drama-episodes/`（Nodejs18.15），HTTP 路由 `/api/drama/episodes`。
> - 实测：`ok:true`、`count:6`、`data[].order` 为 1→6 升序、`cast` 为数组 `["linmo","aqiang"]`。
> - `?limit=3` → 3 条；`?status=已发布` 无匹配时 `count:0`（空 ≠ 错误）；`?limit=abc` → `400` + `error:"limit 必须是正整数，例如 limit=3"`。
> - 改库验证：把 `ep01` 改成「已发布」并填 `videoUrl` 后，接口立刻返回新值与新外链（已还原）。

**用途**：剧集页（`#/episodes`）与首页「前 3 集」的数据源。

| 项 | 值 |
|---|---|
| 方法 / 路径 | `GET /api/drama/episodes` |
| 查询参数 | `status`（可选，精确匹配）；`limit`（可选，正整数，上限 100，缺省不限） |

**成功响应**

```json
{
  "ok": true,
  "data": [
    {
      "id": "ep01", "order": 1, "title": "群里的光", "status": "剧本定稿",
      "duration": "约 90 秒", "durationSec": 90,
      "summary": "一个群几百人同时说同一句话时…",
      "scene": "宿舍深夜 · 班级群聊", "videoUrl": "",
      "cast": ["linmo", "aqiang"], "updatedAt": "2026-09-27T10:00:00+08:00"
    }
  ],
  "count": 6,
  "error": null
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `data[].order` | number | 第几集，结果**按它升序** |
| `data[].cast` | array | 出场角色 id（JSONB 直接是数组） |
| `count` | number | 本次返回条数 |

**失败**：`400`（`limit` 不是正整数）/ `500`（读取失败），
形如 `{ "ok": false, "data": null, "error": "读取剧集数据失败：……" }`。

---

### 3.2 `GET /api/drama/watch-logs` —— 观看记录 ✅ 已实现

> **实现记录（2026-10-06）**
> - 云函数：`cloudfunctions/drama-watchlogs/`（Nodejs18.15），HTTP 路由 `/api/drama/watch-logs`。
> - 实测：`ok:true`、`count:6`，`watchedAt` **倒序**（最近一次 `2026-10-06T09:20` 排最前），
>   `?episodeId=ep01` → 2 条（同一集被看过两次，正是「回看过去」的意义）。

**用途**：记录表读取。回答「哪几集被看过、看了几次、最近一次是什么时候」。

| 项 | 值 |
|---|---|
| 方法 / 路径 | `GET /api/drama/watch-logs` |
| 查询参数 | `episodeId`（可选，只看某集）；`viewer`（可选，只看某人）；`limit`（可选，上限 100，缺省不限） |

**成功响应**

```json
{
  "ok": true,
  "data": [
    { "id": "log-1", "episodeId": "ep01", "viewer": "me", "progress": 100,
      "device": "Edge / Windows", "watchedAt": "2026-10-01T21:10:00+08:00" }
  ],
  "count": 6,
  "error": null
}
```

结果**按 `watchedAt` 倒序**（最近的观看排最前），便于「回看过去」。

**失败**：`400` / `500`，形状同上。

---

## 4. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1.0 | 2026-10-06 | 建立漫剧线契约。按「数据从哪来」三问判定为**用户产出 → 必须入库**，新建核心表 `drama_episodes` 与记录表 `drama_watch_logs`，登记并**实现**两个 GET 接口（`GET /api/drama/episodes`、`GET /api/drama/watch-logs`），统一响应形状 `{ok, data, error}`。 |
