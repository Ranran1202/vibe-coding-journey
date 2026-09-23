# 我在大学期间用AI买股身价过亿 · 站点说明

一部 AI 漫剧（第 1 周 MVP）的展示站。**纯静态**：无后端、无数据库、无 `.env`，视频以后用外站链接嵌入。

---

## 一、怎么在本地运行（重要）

因为页面用 `fetch` 读取 `data/*.json`，**必须通过本地服务器打开**，不能直接双击 HTML 文件（双击会被浏览器的跨域策略拦住，页面会显示"数据加载失败"）。

在 **Git Bash** 里执行（两行，注意第一行的路径要完整）：

```bash
cd /c/Users/86153/WorkBuddy/vibe-coding-journey/ai-drama
"/c/Users/86153/.workbuddy/binaries/python/versions/3.13.12/python.exe" -m http.server 8000
```

然后在浏览器打开：

```
http://localhost:8000/
```

看到页面后按 `Ctrl + C` 可以停掉服务器。

> 为什么要写 python 的完整路径？因为本机 `python` 命令指向的是 Windows 应用商店的占位程序，直接敲 `python -m http.server` 会失败。

### 备用方案
- 换端口（8000 被占用时）：把命令里的 `8000` 改成 `8001`，地址同步改成 `http://localhost:8001/`
- 用 Node 起服务：`D:/nodejs/node.exe` 已可用，可执行 `npx --yes http-server -p 8000`

---

## 二、目录结构

```
ai-drama/
├── index.html          # 首页：故事前提 + 前 3 集 + 主要角色
├── episodes.html       # 全部 6 集（含视频播放区）
├── characters.html     # 角色 + 核心设定 + 剧情时间线
├── making.html         # 制作花絮：用了哪些 AI 工具、制作流程
├── data/
│   ├── episodes.json   # 站点信息 / 角色 / 工具 / 剧集
│   └── story.json      # 剧情设定（设定的唯一来源，改这里全站同步）
├── assets/
│   ├── css/style.css   # 样式（手机可直接打开）
│   └── js/site.js      # 读取 JSON 并渲染页面
├── README.md           # 本文（运行说明）
└── TECH_DESIGN.md      # 技术设计文档（Day 5）
```

---

## 三、日常怎么改内容

| 想改什么 | 改哪个文件 |
|---|---|
| 剧集标题、简介、时长、状态 | `data/episodes.json` → `episodes` |
| 视频地址（以后有片子了） | `data/episodes.json` → 对应剧集的 `videoUrl` 填外链 |
| 角色名字、介绍 | `data/episodes.json` → `characters` |
| 起始资金、时间跨度等设定 | `data/story.json` → `settings` |
| 剧情时间线 | `data/story.json` → `timeline` |
| 颜色、字号、间距 | `assets/css/style.css` 顶部的 `:root` 变量 |

改完**刷新浏览器**即可看到效果（改 JSON 不用重启服务器，刷新就行）。

---

## 四、当前状态

- ✅ 页面骨架完成：4 个页面 + 数据驱动渲染，本地可运行
- ⏳ 视频未生成（按 30 天计划在第 2～3 周），剧集统一标「制作中」，播放区显示占位说明
- ⛔ 本期不做：登录、支付、后端、数据库

---

## 五、免责声明

本故事纯属虚构，不构成任何投资建议。
