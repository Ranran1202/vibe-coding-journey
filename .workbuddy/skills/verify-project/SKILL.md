---
name: verify-project
description: 发布前检查（Day 25 产出，可复用）。对 vibe-coding-journey 两条主线执行发布前自动检查（13 项）：今日热搜（my-app）查公网首页与挂载点、health 接口、favorites 读写闭环与 409 判重、硬编码密钥（代码 + Git 全历史 + 未跟踪文件三路扫描）、.env 忽略与模板、数据库连通与核心表、favicon；我的AI漫（ai-drama）查 CORS 跨域头（逐方法预检）、前端无硬编码域名、剧集/观看记录字段契约、写入闭环与防重、错误处理三键恒定中文、漫剧核心表。检查项全部来自本项目真实踩坑，逐项输出 PASS/FAIL + 可核证据，退出码即结论。当用户说「发布前检查」「pre-release check」「verify-project」，或准备部署/发布 my-app、ai-drama、commit 收口前使用。
agent_created: true
---

# verify-project — 发布前检查

## 一句话
一条命令跑完两条主线的发布前检查（13 项），逐项 PASS/FAIL + 可核证据，退出码即结论；检查项全部来自本项目真实踩过的坑——不虚报通过，也不放过真问题。

## 何时使用
- 每次部署 / 发布 my-app 或 ai-drama 之前
- 用户说「发布前检查」「pre-release check」「verify-project」
- Day 24 测试清单重跑后、git commit 前的收口验证
- 改完云函数 / 数据库授权 / 前端后，确认没踩回老坑

## 文件结构
```
.workbuddy/skills/verify-project/
└── SKILL.md                ← 本文件：检查项定义、调用方法、已知边界（Skill 目录保持纯文档）

scripts/                    ← 执行体在仓库 scripts/（与 day21/day23 等验证脚本同目录）
├── verify-project.sh       ← 主执行体（13 项；退出码 0/1/2）
├── vp-secret-scan.cjs      ← A4 密钥扫描执行体（可单跑）
└── verify-project-shot.js  ← 把 tmp/vp-records.txt 渲染成取证页 tmp/verify-project-shot.html（截图用）
```

## 怎么调用

### 在对话中
对 AI 说：「跑一次发布前检查」「verify-project 全查」「只查 hot」「只查 drama」。
AI 必须执行脚本并**原样附上输出**，不得口头转述「通过了」——没有输出就没有结论。

### 命令行（仓库根目录）
```bash
bash scripts/verify-project.sh          # 两条线全查（默认，13 项）
bash scripts/verify-project.sh hot      # 只查今日热搜 + 仓库级（A1–A7）
bash scripts/verify-project.sh drama    # 只查我的AI漫（B1–B6）
node scripts/vp-secret-scan.cjs         # A4 密钥扫描单跑
node scripts/day25-shot.js <输出名>      # 用 Playwright 给取证页截图（交作业用）
```
退出码：**0 = 无 FAIL（可发布）；1 = 有 FAIL（先修再发）；2 = 环境错误**（读不到 envId / 缺 tcb/curl/node / 参数错）。

### 环境依赖（脚本自备，无需手工准备）
tcb CLI（脚本自动把 `~/.workbuddy/binaries/node/workspace/node_modules/.bin` 加入 PATH）、node（解析 JSON，不依赖 jq）、curl、git。
静态站租户号在 `verify-project.sh` 顶部 `TENANT`，域名变更时只改这一处；envId 从 `cloudbaserc.json` 读取，输出中打码为 `wb-te***` / `***`（AGENTS.md：环境 ID 不打印）。

## 检查项与通过标准

### A 组 · 今日热搜（my-app）+ 仓库级

| 项 | 检查内容 | 执行命令 | 通过标准 | 踩坑来源 |
|---|---|---|---|---|
| A1 | 公网首页 + 真实数据 | `curl <静态站>/`；`GET /api/hot` | 首页 HTTP 200 且含挂载点 `id="hotList"`；hot `ok=true`、`data` 非空、`source="synced"`、`date=今天`（北京时间） | Day 24：用户误判「页面坏了」，实为当天没跑 sync，数据是 seed 历史兜底；首页 200 但挂载点丢了同样白屏，只看 HTTP 码发现不了 |
| A2 | 健康接口 | `GET /api/health` | 200 且 `ok=true` 且 `service=hot-search-demo` 且 `time` 为合法 ISO 且与本地时钟差 ≤5 分钟 | Day 15 建立；配置/环境没生效时它先挂 |
| A3 | 读写闭环 + 判重 | `GET/POST/PATCH/DELETE /api/favorites` | 开头清理 note 含 `verify-project` 的历史残留；POST 一条未收藏的真实热搜（带幂等键）→ 201 且返回 id；**同一 trendId 再 POST（不带幂等键）→ 409「已经收藏过了」**；GET 读回命中同一 id；PATCH 改 note → 200 且回读已变；DELETE → 200 且 `deleted=true`；删后 GET 列表不含该 id | Day 22：判重键 trendId，重复写入不许静默成功；软删除后 GET 要看不见。异常退出留下的残留会占候选位，故开头先清理 |
| A4 | 硬编码密钥 | 三路扫描：`git grep -n -I -E <模式>`（已跟踪）+ `git ls-files --others --exclude-standard`（未跟踪未忽略，排除 `tmp/`）+ `git grep ... $(git rev-list --all)`（全历史）；模式与排除清单见 `scripts/vp-secret-scan.cjs` | 三路命中过「排除清单（逐条带理由）」与「像真密钥」启发式后，真实命中 **0** 处；未入清单的新命中一律 FAIL | Day 23 安全审计：白名单逐条给理由，不静默放行；文档占位符（`user:pass@host`）不算真密钥（Day 25 一轮误报的修正） |
| A5 | .env 治理 | 读 `.gitignore`；`git ls-files .env.example`；`git ls-files .env`；`git check-ignore .env` | 四条全过：① `.gitignore` 含 `.env` 或 `.env.*` 规则 ② `.env.example` 存在 ③ 其被 git 跟踪 ④ `.env` 未被跟踪且被 check-ignore 命中 | Day 23：`.env.*` 曾把 `.env.example` 模板一起误杀 |
| A6 | 数据库连通 + 核心表 | `tcb db execute -e <envId> --sql "SELECT count(*) FROM trends;"` 及 `favorites` | 连接成功且两表 count 都返回数字（表存在且可查） | Day 22：表结构与 anon 授权是两条线的根 |
| A7 | favicon 可用 | `grep -c 'rel=icon' my-app/index.html`；`curl <静态站>/favicon.ico` | index.html 声明了 icon（link rel=icon 或 data-URI），或 GET /favicon.ico 返回 200（页面不产生 404 噪音） | Day 24 记录：首页无 icon 声明且 /favicon.ico 404，**当前已知待修**（KNOWN_ISSUES=A7，修复后移除即转绿） |

### B 组 · 我的AI漫（ai-drama）

| 项 | 检查内容 | 执行命令 | 通过标准 | 踩坑来源 |
|---|---|---|---|---|
| B1 | CORS 跨域头 | 带本站 Origin 的 `GET /api/drama/watch-logs`；`OPTIONS` 预检同路径（分别带 `Access-Control-Request-Method: PATCH` / `DELETE`） | GET 与两次预检都回 `access-control-allow-origin`（回显本站 Origin）；预检的 `allow-methods` 分别含 PATCH / DELETE | Day 22：CORS 方法集不全，浏览器里 PATCH/DELETE 直接跨域报错；平台网关只回所求方法，故必须逐方法预检 |
| B2 | 前端无硬编码域名 | `grep -rnE 'wb-test01\|service\.tcloudbase\.com\|-1500247035\.tcloudbaseapp\.com' my-app/js ai-drama/assets/js` | 0 处硬编码 envId / 接口域 / 静态域租户号（域名必须由 `currentApiBase` 从主机名推导；`my-app/js/app.js` 第 118–130 行推导块本体按已知误报排除） | Day 22：写死域名换环境即全站 404 |
| B3 | 读接口字段契约 | `GET /api/drama/episodes`；`GET /api/drama/watch-logs` | 两接口 200、`ok=true`、data 为数组；episodes 非空且行内 11 个契约字段齐全（id/order/title/status/duration/durationSec/summary/scene/videoUrl/cast/updatedAt）；watch-logs 行内 6 个字段齐全（id/episodeId/viewer/progress/device/watchedAt） | 契约 v0.2.1 §3.1/§3.2 |
| B4 | 写路径与防重 | `tcb db execute` INSERT 专用测试行；`PATCH /api/drama/watch-logs/<id>` ×3；`DELETE` 同路径 | ① SQL 插入影响 1 行 ② PATCH progress=88 → 200 且回读 88 ③ 重复 PATCH 不产生第二行（行数=1）④ progress=999 → 400 且 error 提到 progress ⑤ DELETE → 200 且 `deleted=true` ⑥ 删后列表不含该 id；脚本退出时自动清理测试行 | Day 22：anon 原先只有 SELECT，PATCH 报 `permission denied`，GRANT 后才通；重复写入防护 |
| B5 | 错误处理三键恒定 | `PATCH`/`DELETE /api/drama/watch-logs/vp-no-such-id`；`PATCH` 空 body；`PATCH progress=abc` | 不存在 id 的 PATCH/DELETE → 404；空 body / progress=abc → 400；四个失败响应都含 `ok`/`data`/`error` 三键且 error 为中文字符串（无英文原文/堆栈） | 契约 §3.3/§3.4 + Day 23：失败响应三键恒定、500 不透传数据库原文 |
| B6 | 数据库连通 + 漫剧核心表 | `tcb db execute -e <envId> --sql "SELECT count(*) FROM \"drama_episodes\";"` 及 `drama_watch_logs` | 连接成功且两表 count 都返回数字 | Day 22：表结构与 anon 授权是两条线的根 |

## 输出格式（脚本契约）
每项固定四行 + 结论行（`tmp/vp-records.txt` 同款记录，供取证页渲染）：
```
[PASS] 读写接口各调用一次且结果正确
      通过标准：POST 201 + 读回命中 + 重复 POST 409 + PATCH 200 且 note 更新 + DELETE 200 且 deleted=true + 删除后不可见
      证据：清理历史残留 0 条 · POST(幂等键 verify-project-...) → HTTP 201 · 重复POST(不带幂等键) → HTTP 409「已经收藏过了」· 读回命中 id=fav-xxx · PATCH → HTTP 200 note="verify-project 自检·已改" · DELETE → HTTP 200 deleted=true · 已不可见
```
末尾汇总：合计 PASS/FAIL/未执行、已知待修项、结论与退出码。
证据只放可核值（状态码、条数、命中行、表名）；FAIL 时必须能从证据行看出是哪条通过标准没达到。禁止「看起来正常」「基本没问题」这类无证据表述。

## 已知边界（不藏灰）
- A1 是 curl 级验证（HTML 挂载点 + 接口数据）；SPA 全页面浏览器验证（playwright）属以后可加项
- A4 的三路扫描中，未跟踪扫描排除 `tmp/`——那是本 Skill 与历史验证的运行产物目录（接口响应体、自产明细），扫它等于自我引用；Git 全历史扫描不受影响。截图/渲染等验证产物不要留在仓库目录内（PNG 可留，grep -I 不扫二进制；含回显的 HTML 不要留）
- A4 排除清单与启发式判定在 `scripts/vp-secret-scan.cjs`；新增文档若含模式串，须同步登记排除理由，不静默放行
- A3 会写一条 note 含 `verify-project` 的测试收藏，正常流程末尾删除，开头也会清理以往残留；删除失败会报告残留 id
- B4 经 CLI（service 角色）插测试行——anon 无 INSERT 是 Day 22 的权限设计，不是缺陷；PATCH/DELETE 走公网 anon 接口，验证的正是授权
- 输出中 envId / 租户号一律打码（AGENTS.md：环境 ID 不打印）
- ComfyUI 的 `COMFY_URL` 等本地工具变量不在发布链路，本 Skill 不查（见 `ai-drama/.env.example` 说明）

## FAIL 时怎么处置
| FAIL | 先做什么 |
|---|---|
| A1 `source=seed` 或挂载点 0 | `POST /api/sync` 拉当日数据 / 查 my-app/index.html 渲染容器，再重跑 |
| A2 time 超差 | 对比云函数运行时时钟，排查 NTP；service 不对说明部署错函数 |
| A3 某步状态码不符 | 把该步证据行带回给 AI 定位（favorites 云函数 + 数据库）；409 缺失优先怀疑判重键被改 |
| A4 新命中 | 按 `day23-security-audit.md` 流程清除；若已进 Git 历史，评估处理方式；确认误报则登记排除清单（带理由） |
| A5 某条不过 | 补 `.gitignore` 规则 / 补 `.env.example` 并 `git add` |
| A6 / B6 连不上 | 单独跑 `tcb db execute` 确认 CLI 与网络，再看云函数日志 |
| A7 favicon | Day 24 已知待修：补 icon 声明或 favicon.ico（修完从 KNOWN_ISSUES 移除） |
| B1 缺 CORS 头 | 逐方法预检对照；平台网关自动回 CORS，缺头先查是否走了自定义响应覆盖 |
| B4 PATCH 失败 | 优先怀疑 anon 的 UPDATE 授权，见 `db/grant_watchlogs_write.sql` |

## 变更记录
| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0.0 | 2026-10-18 | Day 25 首版：A 组 6 项 + B 组 5 项，执行体在 Skill 目录 scripts/check.sh；经「首跑 → 误报/漏报修正 → 二跑确认」两轮实跑定稿 |
| v2.0.0 | 2026-10-18 | 与仓库 scripts/ 下的 13 项版合并：执行体移至 `scripts/verify-project.sh` + `vp-secret-scan.cjs` + `verify-project-shot.js`（Skill 目录保持纯文档，与另两个 Skill 一致）；A4 增未跟踪文件扫描（排除 tmp/）与文档占位符识别；A3 增 409 判重断言与残留清理；A1 增挂载点断言；B 组扩为 6 项（CORS 逐方法预检、字段契约、防重、错误三键）；增 A7 favicon 与取证页渲染；退出码 2 = 环境预检失败 |
