# 第 3 周 · 同伴交叉验证记录

> 验证对象：公网「今日热搜」云端检查台
> 验证脚本：`scripts/day21-peer-check.sh`（13 项自动检查）
> 验证时间：2026-10-16 20:42（北京时间）

---

## 一、同伴三行结论（AI 自检代跑 · **待真人同伴签字**）

> ⚠️ 以下三行由 AI 执行脚本生成，**不是真人同伴的结论**。
> 按 Day 21 清单要求，这一步应由同伴亲自跑一遍脚本后给出。
> 同伴操作方式见第三节。

```
可打开：通过 —— 公网首页 HTTP 200，健康检查 HTTP 200（https://<env-id>-1500247035.tcloudbaseapp.com/）
可读写：通过 —— 读接口返回 20 条库内真实数据；写入接口返回 HTTP 201
无报错：通过 —— 13 项检查全部 PASS，控制台与接口均无 5xx
```

**同伴签字栏**（请同伴跑完后填写，不要照抄上面三行）：

```
可打开：
可读写：
无报错：
同伴姓名/昵称：______   验证时间：______
```

---

## 二、13 项逐项结果

| # | 检查项 | 判定 | 证据 |
|---|---|---|---|
| 1 | `GET /api/health` 公网可达且形状正确 | PASS | HTTP 200 · `service=hot-search-demo` |
| 2 | 静态托管首页可打开 | PASS | HTTP 200 · 6424 字节 |
| 3 | `api-contract.md` 存在 | PASS | 版本 v0.9.0 |
| 4 | `trends` / `favorites` 两表存在 | PASS | `information_schema` 查询返回 2 行 |
| 5 | 两表均有数据行 | PASS | `trends` 150 条 / `favorites` 14 条 |
| 6 | `GET /api/hot` 返回当日真实热搜 | PASS | HTTP 200 · `count=20` · `source=synced` |
| 7 | `GET /api/favorites` 返回收藏列表 | PASS | HTTP 200 · `count=14` |
| 8 | `POST /api/favorites` 写入成功 | PASS | HTTP 201 · `trendId=douyin-4-d1016` |
| 9 | 幂等键重放返回同一条（不多插） | PASS | `id=fav-idem-peer-20261016`，重复请求返回同一 id |
| 10 | 三个 GET 接口重构后全部可用 | PASS | health/hot/favorites 均非 5xx |
| 11 | 线上首页无「示例/Mock」字样 | PASS | 首页 HTML 全文 grep 无命中 |
| 12 | 前端指向公网接口域名 | PASS | `app.js` 含 `service.tcloudbase.com` |
| 13 | CORS 仅放行静态托管域名且无 `*` | PASS | 自身 Origin 回显 ACAO；`evil.example.com` 不放行 |

---

## 三、同伴怎么验

### 方式 A · 一键脚本（推荐）

前置：装了 Git Bash 或任意 Unix shell，有 `curl` 和 `node`。

```bash
git clone <仓库地址>
cd vibe-coding-journey
bash scripts/day21-peer-check.sh
```

脚本会打印逐项结果，末尾固定三行结论。把这三行发回即可。

> 说明：脚本需要 `cloudbaserc.json`（含环境 ID）才能定位接口域名。
> 该文件在 `.gitignore` 里，同伴需要自己建一份，内容格式见 `cloudbaserc.json.example`（若仓库内有）。

### 方式 B · 只开网页（不需要任何工具）

1. 打开 **<https://<env-id>-1500247035.tcloudbaseapp.com/>**
   - 首次打开会出现 CloudBase 的「页面访问提示」，点「确定访问」
   - 看三栏：微博 / 抖音 / B站，右上角显示抓取时间
2. 打开 **<https://<env-id>-1500247035.tcloudbaseapp.com/#/check>**
   - 看「健康状态」是不是「✓ 正常」
   - 点「写入一条收藏测试」，看是否返回 201
3. 按三点口述结论：能不能打开 / 数据是不是真的 / 有没有报错

---

## 四、验证时踩到并修掉的两个坑

1. **同步接口字段是嵌套的**：数据在 `data.detail[0]` 里（`fetched` / `inserted` / `updated` / `skipped`），
   不在顶层。第一版按顶层解析，三个字段全是空字符串，看起来像「同步了 0 条」，实际是解析错了。
2. **收藏写入要挑未收藏的条目**：如果挑中一条已被收藏的热搜，两次请求都会返回 409，
   测出来的是判重而不是幂等。脚本里改成先从收藏列表排除，再挑一条干净的来写。

（另：查库 SQL 的列名**必须加英文双引号**，PostgreSQL 会把无引号标识符折叠成小写，
参见 `HANDOFF.md` §6.3 数据库铁律。）
