# 第 3 周（Day 15–21）周验收表

> 验收时间：2026-10-16 20:40（北京时间）
> 环境：CloudBase 免费体验环境（环境 ID 不入库，见 `cloudbaserc.json`，已 gitignore）
> 判定口径：PASS = 有可复现证据；FAIL = 缺证据或证据不成立；未执行 = 本周计划外，顺延。
> 说明：文档中公网地址一律用占位符 `<env-id>`，与 `api-contract.md` §1 的脱敏约定保持一致。

| # | 验收项 | 来源 | 判定 | 证据（链接 / 复现命令） |
|---|---|---|---|---|
| 1 | 公网可访问：静态托管首页能打开 | Day 15 / Day 20 | **PASS** | <https://<env-id>-1500247035.tcloudbaseapp.com/> — HTTP 200，线上首页 6424 字节，与本地 `my-app/index.html` md5 一致 |
| 2 | 健康接口公网可达、形状正确 | Day 15 | **PASS** | `curl https://<env-id>.service.tcloudbase.com/api/health` → HTTP 200，`{"ok":true,"service":"hot-search-demo","time":"…"}` |
| 3 | 接口契约文件存在且随实现同步 | Day 15 / Day 20 | **PASS** | `api-contract.md` 契约版本 **v0.9.0**；§3.1/§3.3/§3.5/§3.6/§3.7 标记 ✅ 已实现 |
| 4 | 数据模型落地：核心表 + 记录表 | Day 16 | **PASS** | 控制台 / `tcb db execute` 查 `information_schema`： `trends(id, platform, rank, title, heat, url, date, createdAt)`、`favorites(id, trendId, title, platform, note, createdAt, updatedAt)` 两表均在 |
| 5 | 两张表均有真实数据行 | Day 16 / Day 20 | **PASS** | `trends` 当日 150 条（微博/B站/抖音各 50）；`favorites` 13 条 |
| 6 | 读接口 GET /api/hot 返回当日真实数据 | Day 17 | **PASS** | `curl …/api/hot?limit=3` → `{ok:true, count:3, source:"synced", date:"2026-10-16"}`，首条「英雄联盟S16世界赛开赛」 |
| 7 | 读接口 GET /api/favorites 返回收藏列表 | Day 17 | **PASS** | `curl …/api/favorites` → HTTP 200，`count=13` |
| 8 | 写接口 POST /api/favorites 真实落库 | Day 18 | **PASS** | 检查台写入测试 → **HTTP 201**，`id=fav-idem-day21-demo-walkthrough-001`；回读确认命中 |
| 9 | 写入判重（重复收藏返回 409） | Day 18 | **PASS** | 对已收藏条目再次 POST → HTTP 409「已经收藏过了」 |
| 10 | 幂等键重放不多插一行 | Day 18 | **PASS** | 同一 `Idempotency-Key` 连发两次 → 第二次 HTTP 200 且返回**同一个 id** |
| 11 | 数据访问层重构后接口行为不变 | Day 19 | **PASS** | 三个 GET 接口重构后全部非 5xx；前端回归测试 **51 项全绿** |
| 12 | 前端零 mock：只从公网接口取数 | Day 20 | **PASS** | `my-app/js/data.js` 已删除；`app.js` 按主机名反推 `https://<env-id>.service.tcloudbase.com` |
| 13 | 检查台：健康状态 + 真实列表 + 写入入口 | Day 20 | **PASS** | <https://<env-id>-1500247035.tcloudbaseapp.com/#/check> — 显示「✓ 正常」、核心表真实数据、写入测试返回 201 |
| 14 | 控制台改一行、接口返回跟着变 | Day 17 / Day 20 | **PASS** | 改 `weibo-11-d1016` 标题 → 刷新接口立刻返回新值（验证后已还原） |
| 15 | CORS 只放行静态托管域名，无 `*` | Day 20 | **PASS** | 带自身 Origin → 回显 ACAO；带 `https://evil.example.com` → 无 ACAO；白名单无 `*` |
| 16 | 页面无「示例 / Mock」字样 | Day 20 | **FAIL** | 见下方「缺项与 FAIL 明细」第 ① 条 |
| 17 | 同伴交叉验证三行结论 | Day 21 | **未执行** | 见下方「缺项与 FAIL 明细」第 ② 条 |
| 18 | `GET /api/platforms`、`GET /api/hot/:id` | 契约 §3.2 §3.4 | 未执行 | 本周计划外（契约中为 📝 占位），顺延 Day 22+ |
| 19 | `PATCH /api/favorites/:id` | 契约 §3.8 | 未执行 | 本周计划外（契约中为 📝 占位），顺延 Day 22+ |
| 20 | `DELETE /api/favorites/:id` | 契约 §3.9 | 未执行 | 本周计划外（契约中为 📝 占位），顺延 Day 22+ |
| 21 | 演示提纲已写出并完整走通一遍 | Day 21 | **PASS** | `bash scripts/day21-demo-walkthrough.sh` → 5 步全 PASS，退出码 0 |

**合计：PASS 15 项 ｜ FAIL 1 项 ｜ 未执行 5 项（其中 4 项为本周计划外顺延）**

---

## 缺项与 FAIL 明细

### ① 【FAIL】收藏列表仍残留 3 条带「示例」标题的种子数据

**现象**：打开公网首页 → 「我的收藏」，列表里出现：

| id | trendId | 标题 |
|---|---|---|
| `fav-1` | `weibo-1` | 示例热搜一：某地迎来初雪刷屏 |
| `fav-3` | `douyin-3` | 示例热搜三：这部剧大结局引热议 |
| `fav-4` | `weibo-4` | 示例热搜四：周末周边游攻略走红 |

**为什么会发生**：Day 20 的收尾要求是「移除**页面上**所有示例字样」，我当时只清了页面文案（页脚、关于页、来源标注）和内置假数据文件 `js/data.js`，但**没有清数据库里 Day 16 灌进去的种子收藏行**。`GET /api/favorites` 不带日期过滤，这 3 条就会原样出现在页面上——页面改干净了，数据还是脏的。

**修复方案（需你确认后我再执行）**：

```sql
DELETE FROM favorites WHERE "id" IN ('fav-1','fav-3','fav-4');
```

删完收藏列表剩 10 条，全部是这几天真实写入的。

**为什么先不动手**：这是删库表数据，属于不可逆操作，按项目规矩要你点头。另外 Day 18 之后 `favorites` 的外键已去掉，删这 3 条不会连带影响 `trends`。

---

### ② 【未执行】同伴交叉验证——需要一位真人同伴

**状态**：我（AI）已经把交叉验证**脚本化并实跑通过**，但清单要求的「**同伴**给出三行结论」这一步必须由真人完成，我代替不了，如实标记未执行。

**同伴怎么验（一键）**：

```bash
bash scripts/day21-peer-check.sh
```

脚本会自动跑完 13 项检查（公网可达、读接口、写接口、幂等、跨域、页面无示例字样），并在末尾打印三行结论：

```
可打开：通过 / 未通过 —— …
可读写：通过 / 未通过 —— …
无报错：通过 / 未通过 —— …
```

**同伴只需把这三行原样发回**即可，不需要装任何依赖（只需 `curl` + `node`）。

**同伴没法跑脚本时的备选**：直接打开 <https://<env-id>-1500247035.tcloudbaseapp.com/> 和 `/#/check`，按下面三点口述结论——
① 能不能打开；② 榜单数据是不是今天三个平台的真实热搜、点收藏能不能成功；③ 有没有看到报错。

---

## 说明：关于「今日不做」

今天清单要求「不顺手修复与验收无关的问题」。本次改动只有两项与验收直接相关：

1. 新增脚本（用于产生验收证据，不触碰任何既有代码）
2. 新增本文档（验收记录）

**没有改任何后端代码、没有改表结构、没有改前端逻辑。** 上一条 FAIL ① 我发现了但**没有自作主张去删数据**，等你确认。
