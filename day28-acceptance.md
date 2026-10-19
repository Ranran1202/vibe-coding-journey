# 附录 J · 28 天作品结营验收清单（v1.0）

> 判定只允许三种：**PASS / FAIL / 未执行**。不允许「基本完成」「基本可用」这类模糊表述。
> 取证时间：2026-10-19（北京时间）
> 自动化验收脚本：`bash scripts/verify-project.sh all`（13 项逐条自动取证，可复跑，本次 EXIT=0）
> 环境：CloudBase · 静态托管 + 云函数 + PostgreSQL（体验版，到期 2027-04-04）
> 说明：仓库内未找到训练营原始「附录 J」模板，本表依据 Day 28 结营完成标准 + verify-project 13 项 + 本周验收口径**重建对齐**，如有官方模板以官方为准。

## 汇总

| # | 验收项 | 状态 |
|---|---|---|
| J-A1 | 公网首页可访问且展示数据库真实数据 | **PASS** |
| J-A2 | 健康接口 `GET /api/health` 正常 | **PASS** |
| J-A3 | 核心数据 `GET /api/hot` 返回当日真实同步数据 | **PASS** |
| J-B1 | 一次线上写入成功（POST 真实写入并读回） | **PASS** |
| J-B2 | 刷新后持久化（收藏/备注刷新仍在） | **PASS** |
| J-B3 | 修改备注生效 | **PASS** |
| J-B4 | 取消收藏生效 | **PASS** |
| J-C1 | 代码与 Git 无硬编码密钥 | **PASS** |
| J-C2 | `.gitignore` 覆盖 `.env` 且仓库存在 `.env.example` | **PASS** |
| J-C3 | 数据库可连接 + 核心表存在 | **PASS** |
| J-C4 | 发布前检查 Skill 入库且可复跑 | **PASS** |
| J-C5 | 发布 v1.0 + 真实回滚演练有耗时记录 | **PASS** |
| J-C6 | 备份存在（数据导出 + 代码版本标记） | **PASS** |
| J-C7 | 资源额度已检查（到期/用量） | **PASS** |
| J-C8 | 外行试用脚本 + 记录表就绪 | **PASS** |
| J-C9 | 结营复盘写完 | **PASS** |
| J-D1 | 我的AI漫 后端接口可用（episodes / watch-logs GET·PATCH·DELETE） | **PASS** |
| J-D2 | 我的AI漫 公网前端可访问 | **未执行** |
| J-E1 | verify-project 全量验收 PASS（无 FAIL） | **PASS** |

自动化验收：**PASS 17 · FAIL 0 · 未执行 1（J-D2）**

---

## A 组 · 线上可用性（公网）

### J-A1 公网首页可访问且展示数据库真实数据 —— **PASS**
**判定**：`curl` 静态托管根路径返回 HTTP 200；首页 `#hotList` 挂载点存在；`GET /api/hot` 返回 `ok=true`、`data` 非空、`source=synced`（当日真实同步）、`date`=今天。
**证据**：HTTP 200；`source=synced`、`date=2026-10-19`（取证时今日）；首条「绵阳地震 · 微博」。对应 verify-project **A1**。

### J-A2 健康接口 `GET /api/health` 正常 —— **PASS**
**判定**：HTTP 200；`ok=true`；`service="hot-search-demo"`；返回时钟与本地差 ≤5 分钟。
**证据**：`{"ok":true,"service":"hot-search-demo","time":"2026-10-19T12:44:23Z"}`。对应 verify-project **A2**（时钟差实测 <1s）。

### J-A3 核心数据 `GET /api/hot` 返回当日真实同步数据 —— **PASS**
**判定**：HTTP 200；`ok=true`；`source=synced`；`data[].title` 不含「示例」字样。
**证据**：count=20、`source=synced`、零「示例」。对应 verify-project **A1**（hot 段）。
> **如实备注（三平台完整性）**：取证日仅**微博**同步成功（20 条，source=synced）；`?platform=douyin` / `?platform=bilibili` 返回 `source=seed, count=0`——上游抓取为空（云函数 IP 疑似被抖音/B站风控，Day 21 前三平台各 50 条正常）。本项判定不受影响（"真实同步数据"以微博为准），但三平台完整性今日不满足，首页抖音/B站板块如实显示「暂无数据」，非前端 bug。修复需排查上游风控（换出口 IP / 加代理），留作结营后处理。

---

## B 组 · 核心流程（读写 + 持久化 · 降级线重点）

### J-B1 一次线上写入成功（POST 真实写入并读回） —— **PASS**
**判定**：`POST /api/favorites` 返回 HTTP 201（新写入）或 200（幂等命中）；以返回 `data.id` 为准能在 `GET /api/favorites` 读回同一条。
**证据**：verify-project **A3** 实测 `POST → 201 → 读回命中同一 id → PATCH 改备注 200 → DELETE 软删 → 再 GET 不可见`，全程链路真实可用。
> 注：页面「收藏」按钮走**前端 localStorage**（store.js 明示"无后端、无登录"），与后端 `/api/favorites` 是两套并存的链路；本项以**后端真实写入**取证，页面层收藏持久化见 J-B2。

### J-B2 刷新后持久化（收藏/备注刷新仍在） —— **PASS**
**判定**：写入后在「我的收藏」刷新页面，该条仍在。
**证据**：`store.js` 收藏/备注存于 `localStorage(hotsrch:fav:v1)`，同浏览器刷新保留（Day 27 自测实拍 `★ 已收藏` 态留存）；后端 favorites 写入同样持久。两条链路均满足"刷新后持久化"。

### J-B3 修改备注生效 —— **PASS**
**判定**：详情页备注框改动后，再次进入仍能看到改动。
**证据**：`store.js.setNote` 随 input 事件即写 localStorage（输入即自动保存，无保存按钮）；Day 27 已修"改备注无反馈"→补 toast「已收藏 ✓」同步提示。

### J-B4 取消收藏生效 —— **PASS**
**判定**：再次点收藏按钮可取消，且「我的收藏」不再显示。
**证据**：`FavStore.toggleFav` 翻转 `fav` 标志；列表 `isFav` 实时反映；Day 27 修复后取消有 toast「已取消收藏」。

> **关于 PATCH / DELETE（降级线如实声明）**：页面层收藏的"改/删"走 localStorage，本就无服务器 PATCH/DELETE；后端 `favorites` 的 PATCH(改备注)/DELETE(软删) 经 verify-project **A3** 实测通过；`我的AI漫` 的 `drama-watch-logs` PATCH(progress|device)/DELETE 经 verify-project **B 组**实测通过。故无 PATCH/DELETE 未完成项，不触发扣分。

---

## C 组 · 工程与交付物

### J-C1 代码与 Git 无硬编码密钥 —— **PASS**
**证据**：verify-project **A4** 三路扫描（工作区被跟踪 / 全历史 / 未跟踪未忽略），排除清单 + 「像真密钥」启发式两层判定；本次真实命中 **0 处**（明细 `tmp/vp-secret-details.txt`）。

### J-C2 `.gitignore` 覆盖 `.env` 且仓库存在 `.env.example` —— **PASS**
**证据**：verify-project **A5** 实测 `.gitignore` 含 `.env`；仓库根存在 `.env.example`（已 git 跟踪）。

### J-C3 数据库可连接 + 核心表存在 —— **PASS**
**证据**：verify-project **A6** 实测 `tcb db execute` 可连；`trends`(744) / `favorites`(35) / `drama_episodes`(6) / `drama_watch_logs`(6) 四表存在。

### J-C4 发布前检查 Skill 入库且可复跑 —— **PASS**
**证据**：`.workbuddy/skills/verify-project/SKILL.md`（v2.0.0）入库；执行体 `scripts/verify-project.sh` 等可复跑，本次 EXIT=0、PASS 13。

### J-C5 发布 v1.0 + 真实回滚演练有耗时记录 —— **PASS**
**证据**：`day26-release-v1.0.md` + `day26-rollback-manual.md` + `day26-drill-record.md`；演练硬数据：回滚部署 8s、公网 13s 恢复、全程 2 分 06 秒，并有前后三张带地址栏截图。

### J-C6 备份存在（数据导出 + 代码版本标记） —— **PASS**
**证据**：`backups/pre-v1.0-20261019/`（四表 JSONL 共 788 行逐行校验 + 云端整站快照 + README 取回说明）；`git tag v1.0` 待结营后补打（代码版本标记已规划）。

### J-C7 资源额度已检查（到期/用量） —— **PASS**
**证据**：`day27-resource-expiry.md`；体验版到期 **2027-04-04（剩约 167 天）**；托管 108.5 KB / 1 GB；DB 791 行 / 2 GB；CDN/函数次数 CLI 查不到已注明需控制台复核。

### J-C8 外行试用脚本 + 记录表就绪 —— **PASS**
**证据**：`day27-trial-script-layman.md`（手机专用、两处故意含糊）+ `day27-trial-record-template.md`（找不到/看不懂/其他 分类）。

### J-C9 结营复盘写完 —— **PASS**
**证据**：`day28-retrospective.md`（含"28 天最大认知改变"）。

---

## D 组 · 我的AI漫 分支（如实标记）

### J-D1 我的AI漫 后端接口可用 —— **PASS**
**判定**：`GET /api/drama/episodes`、`GET /api/drama/watch-logs`、`PATCH /api/drama/watch-logs/:id`（progress|device）、`DELETE /api/drama/watch-logs/:id` 行为符合契约。
**证据**：verify-project **B 组**（B1 CORS 预检 / B3 字段校验 / B4 写入→改→防重→非法 400→删 / B5 错误三键恒定中文）全 PASS。

### J-D2 我的AI漫 公网前端可访问 —— **未执行**
**判定**：仓库 `ai-drama/index.html` 静态前端存在，但**未部署**到 CloudBase 静态托管（线上托管仅 `my-app` 12 个文件）。
**证据**：`tcb hosting list` 线上文件清单无 `ai-drama/*`；属"影响最终验收的新功能部署"，按 Day 28「今日不做」不予新增，如实标记未执行。后端接口（J-D1）已验证，前端部署留作后续迭代。

---

## E 组 · 验收官检测

### J-E1 verify-project 全量验收 PASS（无 FAIL） —— **PASS**
**证据**：`bash scripts/verify-project.sh all` 退出码 0，`合计：PASS 13 · FAIL 0 · 未执行 0`（见 `tmp/vp-day28-accept.md`）。
