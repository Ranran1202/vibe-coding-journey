# Day 25｜发布前检查 Skill（verify-project）· 交付记录

日期：2026-10-18 ｜ 任务：产出可复用的「发布前检查 Skill」，今日要掌握「故意弄坏哪一项来验证 Skill 不会虚报通过」。

## 一、交付物与文件结构

Skill 本体（纯文档，与仓库另两个 Skill 一致）：

```
.workbuddy/skills/verify-project/SKILL.md    ← 检查项定义 / 调用方法 / 已知边界（v2.0.0）
```

执行体在仓库 `scripts/`（与 day21/day23 等验证脚本同目录，避免 Skill 目录藏可执行物）：

```
scripts/verify-project.sh       ← 主执行体：13 项，用法 bash scripts/verify-project.sh [all|hot|drama]
scripts/vp-secret-scan.cjs      ← A4 密钥扫描执行体（可单跑：node scripts/vp-secret-scan.cjs）
scripts/verify-project-shot.js  ← 把 tmp/vp-records.txt 渲染成取证页 tmp/verify-project-shot.html
scripts/day25-shot.js           ← Playwright + Chrome 给取证页截图（交作业用）
```

调用方法（对话中）：对 AI 说「跑一次发布前检查 / verify-project 全查 / 只查 hot / 只查 drama」。
退出码：**0 = 无 FAIL（可发布）；1 = 有 FAIL（先修再发）；2 = 环境错误**（读不到 envId / 缺 tcb/curl/node）。

## 二、13 项检查（全部来自本项目真实踩坑）

### A 组 · 今日热搜（my-app）+ 仓库级

| 项 | 检查内容 | 通过标准（摘要） | 踩坑来源 |
|---|---|---|---|
| A1 | 公网首页 + 真实数据 | HTTP 200 且含挂载点 `id="hotList"`；hot ok=true、data 非空、source=synced、date=今天 | Day 24：当天没跑 sync，数据是 seed 兜底被误判「页面坏了」；首页 200 但挂载点丢了同样白屏 |
| A2 | health 接口 | 200 + ok=true + service=hot-search-demo + time 合法且时钟差 ≤5 分钟 | Day 15 建立；配置/环境没生效时它先挂 |
| A3 | favorites 读写闭环 + 判重 | 开头清理残留 → POST（幂等键）201 → **同 trendId 重复 POST（不带幂等键）409** → 读回命中 → PATCH 200 且 note 变 → DELETE 200 且 deleted=true → 删后不可见 | Day 22：判重键 trendId，重复写入不许静默成功；软删除后 GET 要看不见 |
| A4 | 硬编码密钥 | 三路扫描（已跟踪 + 全历史 + 未跟踪未忽略，排除 tmp/）过排除清单与「像真密钥」启发式后真实命中 0 | Day 23 安全审计：白名单逐条给理由 |
| A5 | .env 治理 | .gitignore 含 .env 规则 + .env.example 存在且被跟踪 + .env 未跟踪且被 check-ignore | Day 23：`.env.*` 曾把模板一起误杀 |
| A6 | 数据库连通 + 核心表 | trends / favorites 两表 count 都返回数字 | Day 22：表结构与 anon 授权是两条线的根 |
| A7 | favicon 可用 | index.html 声明 icon 或 /favicon.ico 返回 200 | Day 24 记录：**当前已知待修**（KNOWN_ISSUES=A7） |

### B 组 · 我的AI漫（ai-drama）

| 项 | 检查内容 | 通过标准（摘要） | 踩坑来源 |
|---|---|---|---|
| B1 | CORS 跨域头 | GET 与 PATCH/DELETE 逐方法预检都回显本站 Origin 且 allow-methods 含所求方法 | Day 22：CORS 方法集不全；平台网关只回所求方法，必须逐方法预检 |
| B2 | 前端无硬编码域名 | 0 处硬编码 envId / 接口域 / 租户号（app.js 118–130 行推导块按已知误报排除） | Day 22：写死域名换环境即全站 404 |
| B3 | 读接口字段契约 | episodes 非空且 11 字段齐全；watch-logs 6 字段齐全 | 契约 v0.2.1 §3.1/§3.2 |
| B4 | 写路径与防重 | SQL 插测试行 → PATCH 88 回读 88 → 重复 PATCH 不产生第二行 → 999 被 400 → DELETE 200 → 消失；退出自动清理 | Day 22：anon UPDATE 授权（permission denied）回归 |
| B5 | 错误处理三键恒定 | 不存在 id → 404；空 body / progress=abc → 400；四例都含 ok/data/error 且 error 中文 | 契约 §3.3/§3.4 + Day 23：500 不透传原文 |
| B6 | 漫剧核心表 | drama_episodes / drama_watch_logs count 都返回数字 | Day 22 |

## 三、运行记录（合并版 v2.0.0，三轮闭环）

| 轮次 | 场景 | 结果 | 退出码 |
|---|---|---|---|
| 第一轮 | 合并后基线（新 A1 挂载点 / 新 A3 判重 / 新 A4 未跟踪扫描首次同场） | **PASS 12 · FAIL 1**（仅 A7） | 1 |
| 第二轮 | 故意留问题：plant 假密钥文件 `scripts/verify-plant-demo.js`（**不 git add**，专测未跟踪扫描） | **PASS 11 · FAIL 2**：A4 精确报 `[未跟踪] scripts/verify-plant-demo.js:5 const API_KEY = "sk-d\*\*\*(38位)"` + A7 | 1 |
| 第三轮 | 删除 plant 文件后终跑 | **PASS 12 · FAIL 1**（仅 A7），明细无 plant 残留 | 1 |

证据截图（`tmp/`，PNG 二进制不被密钥扫描误伤）：
- `tmp/day25-verify-project-plant.png` — 第二轮：A4 红框抓住故意留的假密钥（今日作业截图）
- `tmp/day25-verify-project-final.png` — 第三轮：还原后仅剩 A7 已知待修

终端原文存档：`tmp/vp-plant-run.txt`（第二轮）、`tmp/vp-final-run.txt`（第三轮）。

## 四、误报与漏报修正记录（用户要求的「先跑一次→反馈修正→二跑确认」）

| # | 问题 | 定性 | 修正 |
|---|---|---|---|
| 1 | 首跑 A4 FAIL 46 处，全是 `ai-drama/TECH_DESIGN.md:213` 的 `.env.example` 模板块占位符 `postgres://user:pass@host:5432/db` | **误报** | 启发式增 `isPlaceholderCreds()`：user:pass / your-xxx / <…> / changeme 等文档占位凭据判 benign；二跑 A4 转 PASS |
| 2 | 首跑 B4 FAIL：`jval progress` 键路径写错（应为 `data.progress`），接口实际正确返回 88 | **检查自身缺陷**（接口无辜） | 修正键路径；二跑 PASS |
| 3 | `MSYS_NO_PATHCONV` 全局 export 连带禁用 curl `-D/-o` 路径转换，Windows curl 打不开输出文件，8 项假 FAIL（HTTP 000） | **环境坑** | 该变量只给 tcb 命令行内加；curl 文件输出统一相对路径 `tmp/vp-*` |
| 4 | `REPO_ROOT` 少爬一层，读不到 cloudbaserc.json 直接 exit 2 | **设计正确**（fail-fast，没有虚报） | 改为上溯 4 层；另加环境预检（tcb/curl/node/envId 缺失即 exit 2） |
| 5 | 旧版 check.sh 与新 13 项版并存，双执行体 | **结构问题** | 合并为 v2.0.0：吸收旧版三项真本事（A4 未跟踪扫描、A3 残留清理+409、A1 挂载点断言），旧 scripts/ 删除，Skill 目录保持纯文档 |

合并时 additionally 核实过的接口事实：favorites 判重按 trendId（409「已经收藏过了」），幂等键同键回放返回 200 不插第二行——故 A3 的 409 断言必须**不带**幂等键发第二次，否则测的是幂等不是判重。

## 五、已知边界（不藏灰）

- A7 favicon FAIL 是**真问题**（Day 24 已知待修：index.html 无 icon 声明 + /favicon.ico 404），判定为抓对了，保持红，修完从 `KNOWN_ISSUES` 移除即转绿
- A1 是 curl 级验证；SPA 全页面浏览器验证属以后可加项
- A4 未跟踪扫描排除 `tmp/`（本 Skill 与历史验证的运行产物目录，扫它等于自我引用）；Git 全历史扫描不受影响
- B4 经 CLI（service 角色）插测试行——anon 无 INSERT 是 Day 22 的权限设计，不是缺陷
- 输出中 envId / 租户号一律打码（`wb-te***` / `***`）

## 六、今日复盘（要掌握的那一问）

**「故意弄坏哪一项来验证 Skill 不会虚报通过？」** —— 弄坏的是 A4：放一个含假密钥 `sk-day25fake…`（38 位高熵串，格式与真密钥同构）的文件进工作区。结果：A4 在三路扫描里精确点名文件、行号、掩码值，FAIL 2（A4+A7）而其余 11 项不受影响——说明检查是逐项独立取证，不是「大概没问题就全过」。清理后三轮复跑还原 12 PASS，无残留。
