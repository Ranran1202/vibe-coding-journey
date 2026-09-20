# TECH_DESIGN.md —「今日热搜」网站技术设计

> 本文档依据 `PRD.md`（今日热搜网站，Day 4 产出）编写，并与 PRD 严格对齐。
> 已对齐的真实 PRD 关键约束（来自第一节 / 第八节 / 第九节 AC7·AC10）：
> **MVP（D7 上线）必须是纯静态站点，无后端、无数据库、无用户系统；收藏/备注用浏览器 localStorage；部署用 GitHub Pages / Vercel；仓库不含 `.env`、密钥、`node_modules`。**

---

## 0. 与 PRD 的对齐说明（重要）

- 真实 `PRD.md` 已获取（来源：GitHub `Ranran1202/vibe-coding-journey`）。
- **MVP 默认路线 = 纯静态**：前端原生 HTML/CSS/JS（或 React/Vite 构建为静态产物），数据来自本地示例文件，收藏/备注用 `localStorage`，静态托管部署。此路线满足 AC7（无后端/无数据库/无用户系统）。
- 你最初在请求中举例的 **React/Vite + CloudBase 云函数 + PostgreSQL + CloudBase 静态托管** 作为「示范路线」已纳入对比，但它**违反 MVP 的 AC7**，因此定位为 **Phase 2（D15 后接真实公开 API）的升级路线**，而非 MVP 默认。
- 若你希望 MVP 就上 CloudBase 后端+数据库，需先回头修改 PRD 的 AC7 与第八节范围，否则技术设计与产品验收标准冲突。

---

## 1. 技术选型比较（2–3 套方案）

| 维度 | 方案 A（MVP 推荐 · 纯静态） | 方案 B（Phase 2 · CloudBase 全家桶） | 方案 C（Phase 2 · 通用云自托管） |
|---|---|---|---|
| 前端 | 原生 HTML/CSS/JS（或 React+Vite 静态构建） | React + Vite | React + Vite |
| 后端 | **无** | CloudBase Node.js 云函数 | Node.js + Express |
| 数据库 | **无**（localStorage 存收藏） | CloudBase PostgreSQL | MySQL / SQLite |
| 部署 | GitHub Pages / Vercel 静态托管 | CloudBase 静态网站托管 | Vercel + Railway |
| 零基础友好 | ⭐⭐⭐ 最高（零构建/零运维） | ⭐⭐ 需学云函数+SQL | ⭐ 步骤多、概念多 |
| 上线速度 | 最快（推到仓库即上线） | 中（需配云环境） | 慢（需配服务器） |
| 扩展性 | 低（难做真实聚合/多端同步） | 高（真后端+DB） | 高（最通用） |
| 与 PRD AC7 兼容 | ✅ 完全兼容 | ❌ 引入后端+DB，违反 AC7 | ❌ 同上 |

**三方案取舍一句话**：
- **A（纯静态）**：用「不能做真实数据聚合 / 不能跨设备同步」换「零基础 28 天可做、零运维、满足 AC7」——MVP 唯一合规路线。
- **B（CloudBase）**：用「少量厂商锁定 + 偶发冷启动」换「真后端 + 标准 DB + 统一控制台」——适合 D15 后接真实 API。
- **C（通用云）**：用「更高学习成本」换「技术最通用、无强锁定、简历友好」——适合想系统学全栈时采用。

---

## 2. 推荐默认路线与取舍

**MVP 默认 = 方案 A（纯静态）。**

取舍逻辑：PRD 把"需要后端 / 账号 / 算法 / 爬虫 / 花钱"一律砍掉（第八节），MVP 只要"一个静态页面 + 本地收藏"的最小闭环。纯静态方案零构建、零运维、推仓库即上线，是零基础在 D7 交出合格品的最稳路径。收藏/备注用 `localStorage`，天然满足 AC6（刷新/重开仍保留、无需登录）。

Phase 2（D15 后）若接真实公开 API，再从 A 升级到 B 或 C；届时需同步把 PRD 第八节与 AC7 改为"含后端/数据库"版本，保持文档一致。

---

## 3. 项目结构（方案 A · 原生 HTML/CSS/JS）

```
vibe-coding-journey/
├── index.html            # 首页：平台切换标签 + 热搜列表 + 我的收藏入口 + 手动刷新
├── css/
│   └── style.css         # 列表/标签高亮/详情/响应式样式
├── js/
│   ├── data.js           # Phase 1 本地示例数据（HotItem[]，手写几条先把页面撑起来）
│   ├── config.js         # 平台清单与基础配置（纯前端常量，无需 .env）
│   ├── store.js          # localStorage 收藏/备注封装（get/add/remove/updateNote）
│   ├── api.js            # 数据读取封装：MVP 读 data.js；Phase2 可替换为 fetch
│   ├── app.js            # 首页逻辑：渲染 / 平台切换 / 刷新
│   └── detail.js         # 详情视图逻辑（排名/标题/热度/来源/原链接/收藏备注）
├── assets/               # 图标等静态资源
├── .gitignore            # 排除 .env / 密钥 / node_modules（AC10）
├── AGENTS.md
├── PRD.md
├── TECH_DESIGN.md
└── README.md
```

> 若选用 React+Vite：把 `index.html` + `js/` 替换为 `web/`（Vite 工程），`npm run build` 产出 `dist/` 仍为纯静态，可同样部署到 GitHub Pages / Vercel，依旧满足 AC7。代价是引入 `node_modules` 与构建步骤（需 `.gitignore` 覆盖，见 AC10）。

---

## 4. 数据模型

### 4.1 热搜条目 HotItem（来源 PRD 6.1，无数据库，存于 `data.js`）
```js
// 示例：data.js 中导出的数组元素
{
  id: "weibo-1",        // 稳定标识 = platform + "-" + rank（用于收藏关联）
  rank: 1,              // 排名（整数）
  title: "今日热搜是什么", // 热搜标题
  heat: "523 万",       // 热度值（字符串/数字，由来源决定）
  platform: "微博",      // 来源平台名
  url: "https://weibo.com/..." // 原平台对应页面链接
}
```

### 4.2 收藏 / 备注 Collection（仅本机浏览器，来源 PRD 6.2）
```js
// localStorage key: "trending:collection"，值为数组
{
  itemRef: "weibo-1",   // 关联热搜条目标识（平台 + 排名）
  note: "关注一下后续",  // 用户备注文字（可为空）
  createdAt: "2026-09-20T20:00:00Z" // 收藏/备注创建时间
}
```

### 4.3 Phase 2 数据库模型（仅当升级到方案 B/C 时启用，MVP 不用）
```sql
CREATE TABLE platform (
  code VARCHAR(32) PRIMARY KEY, name VARCHAR(64) NOT NULL,
  color VARCHAR(7), enabled BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE hot_search (
  id BIGSERIAL PRIMARY KEY, platform VARCHAR(32) REFERENCES platform(code),
  rank INT, title TEXT NOT NULL, url TEXT, heat BIGINT, category VARCHAR(32),
  fetched_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE user_favorite (
  id BIGSERIAL PRIMARY KEY, user_id VARCHAR(64) NOT NULL,
  hot_search_id BIGINT REFERENCES hot_search(id), note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(user_id, hot_search_id)
);
```

---

## 5. API 列表

**MVP（方案 A）没有后端 API**——数据在前端模块内读取。以"前端数据模块接口"描述：

| 函数 | 说明 | 入参 | 返回 |
|---|---|---|---|
| `getHotItems(platform?)` | 取热搜列表（可筛选平台） | 平台名（可选） | `HotItem[]` |
| `getPlatforms()` | 平台清单（从 data.js 推导） | — | `{code,name,color}[]` |
| `getCollection()` | 读本地收藏 | — | `Collection[]` |
| `addToCollection(itemRef, note?)` | 加收藏/备注 | 条目标识、备注 | 更新后的 `Collection[]` |
| `removeFromCollection(itemRef)` | 取消收藏 | 条目标识 | 更新后的 `Collection[]` |
| `updateNote(itemRef, note)` | 改备注 | 条目标识、新备注 | 更新后的 `Collection[]` |

**Phase 2（升级到方案 B/C 后才有真实 HTTP API）**，统一前缀 `/api`：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/platforms` | 平台清单 |
| GET | `/api/hot-search?platform=&date=` | 热搜列表（真实数据） |
| POST | `/api/sync` | 触发从公开源同步（绝不自建爬虫） |
| GET | `/api/health` | 健康检查 |

> Phase 2 统一响应信封：`{ code:0, data, message:"ok" }`；错误 `{ code:非0, message }`。

---

## 6. 前后端数据流

### 6.1 MVP（纯静态，无后端）
```mermaid
flowchart TD
    U[用户浏览器] -->|打开 index.html| P[静态托管页面]
    P -->|JS 读取 data.js| D[(本地示例数据 HotItem)]
    P -->|渲染列表/详情| U
    U -->|点击平台标签| P
    P -->|前端按 platform 筛选| D
    U -->|收藏/备注| LS[(localStorage 本机)]
    LS -->|刷新后读回| P
    U -->|去原平台查看| EXT[原平台 新标签打开]
```

### 6.2 Phase 2（升级到 CloudBase 后）
```mermaid
flowchart TD
    U[用户浏览器] -->|静态托管加载| S[静态网站]
    S -->|fetch /api/*| F[云函数]
    F -->|SQL 查询| DB[(PostgreSQL)]
    DB -->|结果集| F
    F -->|JSON 信封| S
    S -->|渲染| U
    U -->|收藏/备注| DB
```

---

## 7. 错误处理（对齐 PRD 第七节异常状态）

| 场景（PRD） | 用户看到什么 | 系统应如何处理 |
|---|---|---|
| 数据加载失败 / 网络异常 | 不白屏，显示"暂时拿不到数据" + 重试按钮 | 回退展示 `data.js` 示例数据，或提示错误并允许手动重试 |
| 点击"去原平台查看"但外站打不开 | 新标签打开失败 / 无响应 | 提示"原平台可能暂不可用"，不影响本站 |
| 浏览器禁用本地存储（隐私模式） | 收藏/备注提示"当前无法保存" | 明确告知功能受限，**不报错崩溃** |
| 某平台数据缺失（Phase 2） | 该平台列表显示"数据暂不可用" | 其余平台正常展示，不整体崩溃 |
| 收藏区为空 | 空状态引导文案（"还没有收藏，去首页挑几条吧"） | 引导去首页收藏 |
| 示例数据缺失 / 格式错误 | 提示"示例数据异常" | 给出明确报错，便于排查 |

实现要点：所有 `localStorage` 读写包 `try/catch`（隐私模式会抛异常）；外链跳转失败用 `window.open` 返回值判断并提示；渲染前校验 `data.js` 结构与字段，缺字段时进入"示例数据异常"分支。

---

## 8. 环境变量（对齐 PRD：MVP 不需要）

- **MVP（方案 A）无需任何环境变量**：示例数据直接内嵌 `data.js`，平台配置写在 `config.js`（纯前端常量，非密钥）。PRD 明确 Day 23 才引入 `.env` 做"简单配置"，AC10 要求仓库不包含 `.env`、密钥、`node_modules`。
- **Phase 2（若升级到方案 B/C）** 才需要 `.env`（**绝不入仓**，由 `.gitignore` 排除）：
  ```bash
  CLOUDBASE_ENV_ID=your-env-id
  DATABASE_URL=postgresql://user:pass@host:5432/dbname
  HOTSEARCH_API_KEY=          # 仅用免费公开 API，绝不自建爬虫
  HOTSEARCH_API_BASE=
  VITE_API_BASE=/api          # 前端仅暴露 VITE_ 前缀变量
  ```
- 仓库保留 `.env.example` 模板；密钥只存在于本地 `.env` 与云平台配置。

---

## 9. 迁移注意事项

- **MVP → Phase 2（收藏上云）**：把 `localStorage` 中的 `Collection` 在首次登录时合并进 `user_favorite` 表；`data.js` 示例数据过渡到真实 API 时注意按 `platform + title + date` 去重。**注意：引入后端/DB 会改动 PRD 的 AC7 与第八节范围，需先更新 PRD。**
- **引入构建工具（原生 → React/Vite）**：会增加 `node_modules` 与构建步骤，必须确保 `.gitignore` 覆盖 `node_modules/`（AC10），只提交源码与 `dist/` 产物由 CI 生成。
- **部署迁移**：纯静态产物（`index.html` + `css/` + `js/` 或 `dist/`）可一键从 GitHub Pages 搬到 Vercel / OSS / CloudBase 静态托管，零耦合。
- **数据备份**：MVP 无服务端数据，无需备份；Phase 2 才需定时 `pg_dump`，且热搜属可重建数据，重点备份用户收藏。
- **合规底线**：无论哪阶段，均不抓取、不存储原文、不商用；Phase 2 只接免费公开 API，绝不自建爬虫（PRD 6.3 / 第八节）。

---

> 校准说明：本版已用真实 `PRD.md`（含 AC1–AC10、第八节砍功能清单、6.1/6.2 数据字段）逐节对齐。原草稿误将 CloudBase 推荐为 MVP 默认，此处已纠正为「纯静态=MVP 默认、CloudBase=Phase 2」。如你确实想 MVP 就上 CloudBase，请先改 PRD 第八节与 AC7，我再同步调整本节。
