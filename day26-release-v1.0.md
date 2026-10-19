# 发布清单 · v1.0（今日热搜 + 我的AI漫）

**版本号**：v1.0
**发布时间**：2026-10-19 20:00 前后（部署命令耗时 8 秒）
**发布内容**：
- 今日热搜前端（my-app：index.html / css / js / tests）
- 本次相对上一版的变化：`index.html` 新增 `<link rel="icon" href="/favicon.ico">`；新增 `favicon.ico`（修复 Day 24 已知待修项 A7，页面不再有 favicon 404 噪音）
- 后端不变：云函数 6 个（health / hot / favorites / sync / drama-episodes / drama-watchlogs）+ 数据库 4 张核心表（trends / favorites / drama_episodes / drama_watch_logs）

## 一、发布前必须通过的验证项

直接引用 verify-project Skill（`.workbuddy/skills/verify-project/SKILL.md`），执行：

```
bash scripts/verify-project.sh all
```

**本次发布前实测（2026-10-19）：PASS 13 · FAIL 0，退出码 0**（完整输出存档 `tmp/vp-v10-release.txt`）。13 项全 PASS，其中 A7 为本次发布内容所修，其余 12 项为存量验证。

发布前置动作（缺一不可）：
1. `POST /api/sync` 同步当日热搜（否则 A1 会因 `source=seed, count=0` 判 FAIL）。本次实测：inserted=50。
2. 制作发布前备份（见第四节），没有备份不允许发布。

## 二、发布方式与发布后逐项验证

**发布方式**（静态托管，命令约 8 秒完成）：

```
tcb hosting deploy my-app / -e <envId>
```

发布后逐项验证（按顺序，任何一步不过即停止发布流程、进入回滚判断）：

| # | 验证什么 | 怎么验 | 通过标准 |
|---|---|---|---|
| 1 | 首页可访问 | 浏览器打开静态站根路径 | 页面渲染出热搜列表，无报错页 |
| 2 | 数据真实 | 看页面底部来源条 | 「数据来自云端数据库 · <平台> · <今天日期>」 |
| 3 | favicon（本次变更点） | 看浏览器标签页图标；`curl -o /dev/null -w "%{http_code}" .../favicon.ico` | 红色图标显示；HTTP 200 |
| 4 | 接口健康 | `curl <api>/api/health` | `{"ok":true,"service":"hot-search-demo",...}` |
| 5 | 全量检查 | `bash scripts/verify-project.sh all` | PASS 13 · FAIL 0 |
| 6 | 核心流程 | 页面上点一次收藏、取消收藏 | 列表条数变化符合预期，无 console 报错 |

**本次发布后实测**：①-⑥ 全过；截图存档 `tmp/day26-v10-live.png`（地址栏 + 页面 + 标签页红色 favicon）。

## 三、版本标记（代码）

- **git tag v1.0**：Day 26 提交确认后立即补打（`git tag -a v1.0 -m "首个正式版：今日热搜+我的AI漫"`）。打完 tag 后，`git show v1.0:my-app/index.html` 即可取回发布版代码。
- 补打前的临时标记：本地工作区 HEAD + 本清单的发布时间戳。

## 四、备份方式（发布前已完成，2026-10-19 19:53）

| 备份 | 位置 | 内容 | 取回方法 |
|---|---|---|---|
| 数据导出 | `backups/pre-v1.0-20261019/*.jsonl` | 四表全量 788 行（逐行 JSON，已校验可解析） | 见 `backups/pre-v1.0-20261019/README.md` 的恢复 SQL |
| 云端文件快照 | `backups/pre-v1.0-20261019/hosting-snapshot/` | 静态托管整站文件（v1.0 之前的上一版） | `tcb hosting deploy backups/pre-v1.0-20261019/hosting-snapshot / -e <envId>` |
| 代码版本 | git 历史 + tag v1.0 | 每次提交可追溯 | `git checkout v1.0` |

**规则：每次发布前必须重做数据导出 + 云端文件快照（换新日期目录），上一份备份保留不删。**
