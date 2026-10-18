# Day 23｜两条线错误处理与安全审计报告

> 范围：「今日热搜」（`my-app/` + 6 个云函数）与「我的AI漫剧」（`ai-drama/` + 2 个云函数）。
> 方法：先审计（只读，逐项列出）→ 后修复（代码 + 文档）→ 自查清单（每项含「怎么算通过」）。
> 日期：2026-10-18。

---

## 一、审计发现（修复前）

### A. 硬编码密钥 / 连接串 / 敏感标识

| # | 发现 | 位置 | 风险 |
|---|---|---|---|
| A1 | **真实环境 ID 写进被跟踪的文档**：验收报告 3 行 URL 含完整 `<env-id>.service.tcloudbase.com` 与 `<env-id>-<租户号>.tcloudbaseapp.com` | `week3-acceptance.md` 第 88/89/163 行 | 中。环境 ID 按项目宪法属敏感信息（不打印、不进仓库）；URL 本身是公开地址，但暴露了环境全貌 |
| A2 | **测试夹具写死真实托管域名**（含环境 ID + 租户号） | `my-app/tests/mock-api.cjs` 第 11 行（用户已先行修复为 `MOCK_HOST` 环境变量 + 假域名默认值） | 中。同 A1 |
| A3 | ComfyUI 脚本硬编码公共服务地址（**不含凭据**） | `ai-drama/comfyui/scenes/submit_to_cloud.py` 等，`os.environ.get("COMFY_URL", "<默认地址>")` | 低。无账号密码，仅域名 |
| A4 | 全仓库（含 git 全历史）搜索 password / secret / token / api_key / AKID / 私钥 / 带凭据连接串（`postgres://user:pass@…`） | —— | **0 命中**（4 处词汇命中均为误报：.gitignore 规则行、AGENTS.md 安全约定文本、comfyui 文档「token」指提示词 token） |
| A5 | `.env` 文件 | —— | 工作区不存在、未被 git 跟踪；`.gitignore` 第 2–4 行已覆盖 `.env` / `.env.*` / `*.env`（git check-ignore 实测通过） |
| A6 | **`.gitignore` 规则自身误杀模板**：`.env.*` 把 `.env.example` 也忽略了，密钥治理模板根本进不了仓库 | `.gitignore` 第 3 行 | 低（但直接违背「提供 .env.example」的要求）。已加否定规则 `!.env.example` / `!ai-drama/.env.example`，实测真 `.env` 仍被忽略 |

**结论：无真实密钥泄露**（无 API Key、无连接串、无凭据）；A1/A2 是「环境标识」级泄露，已清理；历史提交 `2d57e8b`、`41e6e38` 中曾含上述环境 ID（见 §五 处置说明）。

### B. 裸报错 / 未处理的错误路径（「哪句裸报错改成了人话」）

| # | 位置 | 改前（半裸：人话前缀 + 英文原文） | 改后（人话） |
|---|---|---|---|
| B1 | `hot` 500 | `"读取热搜数据失败：connection reset by peer"` | `"读取热搜数据失败，请稍后重试"`（原文进 `console.error`） |
| B2 | `hot` 失败响应 | `{ok:false, error}` **缺 data 键** | `{ok:false, data:null, error}` 三键恒定 |
| B3 | `sync` 502 | `"数据源暂不可用：微博接口返回 HTTP 403…"`（各源原文拼接外露） | `"数据源暂不可用，请稍后重试"`（原文进 `console.error`） |
| B4 | `sync` 失败响应 | 缺 data 键 | 补 `data:null` |
| B5 | `favorites` 7 处 500 | `"读取收藏列表失败：<原文>"`、`"收藏写入失败：<原文>"`、`"修改备注失败：<原文>"`、`"取消收藏失败：<原文>"` 等 | 一律 `"……失败，请稍后重试"`（原文已在 `log()` 日志中，带 requestId） |
| B6 | `favorites` 失败响应 | 缺 data 键 | 补 `data:null` |
| B7 | `drama-episodes` 500 | `"读取剧集数据失败：<原文>"` | `"读取剧集数据失败，请稍后重试"`（原文进日志） |
| B8 | `drama-watchlogs` 5 处 500 | `"修改/删除/读取观看记录失败：<原文>"` | 一律 `"……失败，请稍后重试"`（原文进日志） |

已符合要求、未改动的部分：400 类（`date 参数格式不对…`、`limit 必须是正整数…`、`platform 只支持…`、`note 必填且必须是字符串`、`progress 必须是 0-100 的整数` 等）、404 类（`收藏不存在`、`观看记录不存在`、`没有找到这条热搜`）、405 类；前端 `my-app`（`暂时拿不到数据，请稍后重试` + 重试按钮）与 `ai-drama`（`数据加载失败，请稍后重试。`）全部已是中文，**未改**。

### C. 非法输入与 SQL 注入面

| 入口 | 已有防护 | 结论 |
|---|---|---|
| `GET /api/hot` | date 严格 `YYYY-MM-DD` 且真实存在（挡 2026-13-45）；limit 上限 100 | 合规。**观察项**：limit 非法时静默回退 20 而非 400（与 episodes 的 400 不一致，低风险） |
| `GET /api/drama/episodes` | limit 非正整数 → 400 中文 | 合规 |
| `GET /api/drama/watch-logs` | limit → 400 中文；episodeId/viewer 仅作参数化筛选 | 合规 |
| `POST /api/favorites` | 空 body / 非 JSON / 缺字段（一次列全）/ 类型不对 / 超长（trendId≤100、title≤200、note≤200）/ platform 白名单 / Idempotency-Key 字符集与长度 / trendId 存在性预检（404 不外抛外键错） | 合规，防护最全 |
| `PATCH /api/favorites/:id` | note 必填字符串 ≤200；id 不存在 → 404 | 合规 |
| `PATCH /api/drama/watch-logs/:id` | 至少改 progress/device 之一；progress 须 0-100 整数；device 须字符串 | 合规 |
| `DELETE`（两线） | 删前存在性校验 → 404；favorites 软删除可恢复 | 合规 |
| SQL 注入面 | 全仓库无一处字符串拼接 SQL；一律 SDK 查询构造器（`.from().select().eq()`），筛选值走 HTTP 参数传给数据网关 | **无注入面**（grep 实测：唯一命中是注释） |
| 路径参数 id | 取路径最后一段，未限长度/字符集 | 低风险观察项：超长 id 只会查无此人，参数化无注入；后续可加长度上限 |

---

## 二、修复记录（改了什么 / 加了什么）

**改了（错误提示统一，8 类见 §一-B）**：
- `cloudfunctions/hot/index.js`：fail 补 `data:null`；500 改通用人话 + `console.error`（此文件与 B2/B1 由用户先行修改，本次审计确认并纳入）
- `cloudfunctions/sync/index.js`：fail 补 `data:null`（用户）；502 聚合消息改通用人话 + `console.error`（本次）
- `cloudfunctions/favorites/index.js`：fail 补 `data:null`；7 处 500 改通用人话（日志已带原文，不动）
- `cloudfunctions/drama-episodes/index.js`：500 改通用人话 + `console.error`
- `cloudfunctions/drama-watchlogs/index.js`：5 处 500 改通用人话 + `console.error`
- `week3-acceptance.md`：3 处真实环境 ID → 占位符 `<env-id>` / `<env-id>-<租户号>`
- `my-app/tests/mock-api.cjs`：真实托管域名 → `process.env.MOCK_HOST` + 假域名默认值（用户）

**加了（密钥治理）**：
- `.env.example`（根目录，今日热搜线）：说明云函数为何不需要 .env、测试夹具用 `MOCK_HOST`、运维从 cloudbaserc.json 读环境 ID
- `ai-drama/.env.example`（漫剧线）：同上 + ComfyUI 脚本用 `COMFY_URL`
- 本报告 + 自查清单

**同步了（契约与现实对齐）**：根 `api-contract.md` 升 v1.1.0、`ai-drama/api-contract.md` 升 v0.2.1——500/502 文案改为通用人话、失败响应示例补 `data:null`、修正 sync 错误表中实际不存在的 500 行（单源失败计 detail 整体仍 200，全挂才 502）。

**修了一个 .gitignore 自身的设计缺陷（A6）**：`.env.*` 规则会把 `.env.example` 一起误杀，导致密钥治理模板根本进不了仓库。已在 `.gitignore` 加否定规则 `!.env.example` / `!ai-drama/.env.example`，实测 `.env` / `.env.production` / `foo.env` 仍被忽略、两个 `.env.example` 可提交。

**设计原则（本次确立，后续接口照此办理）**：
- ① 用户输入错 → 400，**告诉他改什么**（缺哪个字段、格式该写成什么样、上限多少）；
- ② 上游网络/接口错 → 502「数据源暂不可用，请稍后重试」；
- ③ 服务端错 → 500 通用人话「……失败，请稍后重试」，**原文只进日志**（`console.error` / `log()`，带 requestId），绝不出现在响应体。

---

## 三、安全自查清单（每项含「怎么算通过」）

| # | 检查项 | 怎么算通过（验证方法） | 状态 |
|---|---|---|---|
| 1 | 全仓库无密钥特征词 | `git grep -I -E "password\|secret\|api_key\|AKID\|BEGIN.*PRIVATE KEY"` 工作区 0 命中；`git grep <同模式> $(git rev-list --all)` 历史 0 命中（误报需逐条人工确认是文档/规则行） | ✅ |
| 2 | 无带凭据连接串 | `grep -rE "(postgres\|mysql\|mongodb\|redis)://[^/]*:[^/]*@" .` 0 命中 | ✅ |
| 3 | git 历史无真实密钥 | 同 #1 历史搜索 0 命中；本环境另查 `git log -S<envId>` 仅 2 个提交且内容为文档 URL（非凭据），已按 #4 处置 | ✅ |
| 4 | 环境 ID 不出现在被跟踪文件 | `git grep -l "<envId>"`（从 cloudbaserc.json 读取后比对）输出为空；`git check-ignore cloudbaserc.json` 命中 | ✅（修复后 0；历史 2 提交曾含，见 §五） |
| 5 | `.env` 不被跟踪且被忽略 | `git ls-files \| grep -i env` 无 `.env`；`git check-ignore .env ai-drama/.env .env.production` 全部命中 | ✅ |
| 6 | 仓库提供 `.env.example` 且不含真实值 | 根目录与 `ai-drama/` 各一份；文件内只有空值模板与说明，`grep -c "<envId>" .env.example ai-drama/.env.example` 为 0 | ✅ |
| 7 | 所有失败响应三键恒定 | 对每个接口发一个失败请求（见 #8/#9/#10），响应体必须同时含 `ok:false` / `data:null` / `error`（字符串），可用 `node -e` 断言三键 | ✅ |
| 8 | 输入错返回 400 中文且告诉他改什么 | `curl "…/api/hot?date=13-45"` → `date 参数格式不对，应该写成 YYYY-MM-DD…`；`curl -X PATCH …/api/drama/watch-logs/log-x -d '{"progress":999}'` → `progress 必须是 0-100 的整数` | ✅ |
| 9 | 记录不存在返回 404 中文 | `curl -X PATCH …/api/favorites/fav-no-such -d '{"note":"x"}'` → `收藏不存在`；同 `DELETE` → `观看记录不存在` | ✅ |
| 10 | 服务端错返回 500 通用人话、不露原文 | 本地用 mock SDK 注入故障真实触发（`scripts/day23-verify.js`），响应为 `读取热搜数据失败，请稍后重试`，body 中不含 `Error:`/英文堆栈；云端日志可见原文 | ✅ |
| 11 | 上游全挂返回 502 通用人话 | mock 全部源失败，响应为 `数据源暂不可用，请稍后重试`，body 不含各源原文 | ✅ |
| 12 | 无 SQL 注入面 | `grep -rnE "(SELECT\|INSERT\|UPDATE\|DELETE).*\"\s*\+" shared/ cloudfunctions/` 0 命中（唯一命中为注释）；所有查询走 SDK 构造器 | ✅ |
| 13 | 输入长度/类型/白名单有上限 | 代码审查：title≤200、note≤200、trendId≤100、Idempotency-Key≤64 且限字符集、platform 白名单、progress 0-100 整数 | ✅ |
| 14 | 前端错误提示全中文 | 审查 `my-app/js/app.js`、`ai-drama/assets/js/app.js` 所有 catch/错误态分支，无 `e.message` 直出（ai-drama 的 `e.message` 来源均为代码内中文 `throw`） | ✅ |

---

## 四、验证产物

- 截图 1「全仓库密钥搜索 0 条」：`tmp/day23-secret-scan.png`
- 截图 2「三类错误中文提示（改前 vs 改后）」：`tmp/day23-error-classes.png`
- 验证脚本：`scripts/day23-verify.js`（密钥取证 + 400/404 公网实测 + 500/502 mock 注入实测）
- 中间产物：`tmp/day23-*.json`

## 五、历史泄露处置说明

`git log -S<envId>` 显示 `2d57e8b`（Day 20）与 `41e6e38`（Day 21）两个提交曾把环境 ID 写进 `week3-acceptance.md` 与旧版 `mock-api.cjs`。处置决策：

1. **工作区已全部清理**（占位符 / 环境变量），后续任何检出都不再含环境 ID；
2. **不做历史重写**：环境 ID 不是凭据（知道 URL 也进不了后台，访问需账号鉴权），重写历史会波及已推送的公开提交、代价远大于收益；
3. **如平台要求**（例如环境 ID 被认定为敏感）：可作废并重建 CloudBase 环境，届时同步更新本地 `cloudbaserc.json`、重新部署全部云函数与静态托管——成本约半小时，仅在你确认需要时执行。
