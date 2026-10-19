# vibe-coding-journey

我（Ranran1202）用 vibe coding 的方式，从零开始学习并做出的第一个项目仓库。

## 这是什么

这是一个 vibe coding 训练营的实践项目。所谓 vibe coding：我不直接写代码，而是用自然语言指挥 AI 协作，我来提需求、做验收，AI 来实现。

## 项目规则

我和 AI 的协作规则全部写在 [AGENTS.md](AGENTS.md) 里——它是这个项目的"宪法"，先立规则再动手，是整个训练营 Day 1 就定下的原则。

## 发布前检查 Skill（Day 25 产出）

每次发布前，一条命令跑完两条主线（今日热搜 / 我的AI漫）共 13 项检查，逐项 PASS/FAIL + 可核证据，退出码即结论：

```bash
bash scripts/verify-project.sh          # 两条线全查（默认）
bash scripts/verify-project.sh hot      # 只查今日热搜 + 仓库级（A1–A7）
bash scripts/verify-project.sh drama    # 只查我的AI漫（B1–B6）
```

退出码：0 = 无 FAIL 可发布；1 = 有 FAIL 先修再发；2 = 环境错误。
在对话中对 AI 说「跑一次发布前检查」即可触发；AI 必须原样附上脚本输出，不得口头转述「通过了」。

检查项定义、通过标准、FAIL 处置表见 [.workbuddy/skills/verify-project/SKILL.md](.workbuddy/skills/verify-project/SKILL.md)，踩坑来历与运行记录见 [day25-verify-project.md](day25-verify-project.md)。

## 当前进度

- [x] Day 1：环境搭建（WorkBuddy / Git / Node.js）+ 立规则（AGENTS.md）
- [x] Day 2：Git 初始化 + GitHub 仓库 + 首次提交（就是你现在看到的这个仓库）
- [ ] Day 7：MVP 上线（index.html 会从占位页变成真正的作品）

## 技术栈

- 前端：HTML / CSS / JavaScript（学习中）
- 协作方式：vibe coding（AI 配对）
