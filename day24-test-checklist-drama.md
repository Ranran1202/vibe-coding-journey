# Day 24 ·「我的AI漫」核心链路测试清单（plan_days / checkins 全流程）

> **模板映射**：打卡应用的 `plan_days` = 本项目的 **`drama_episodes`**（剧集·内容本体）；`checkins` = **`drama_watch_logs`**（观看记录·一次观看 = 一次打卡）。
> **「检查台」在本项目 = 接口层自证**：ai-drama 前端未部署到公网，本清单全程用 `curl` + SQL 直查，不开页面。
> **用途**：今天集中找 Bug。修完 Bug 后用**同一份清单**再跑一遍，前后各留一份证据（before / after）。

---

## 0. 跑之前必须知道的三件事（避免误报）

1. **没有 POST 接口，「写入打卡」只能走 SQL 直插**。契约未承诺 POST；`anon` 角色无 INSERT 是 Day 22 授权时的明确决定（只授了 SELECT/UPDATE/DELETE）。这不是 Bug，是现状——C 组给出插入命令。
2. **DELETE 是硬删除，删了不可恢复**（本线没有软删除标记）。测试一律用专用 id（`log-day24-*`），**不碰 `log-1`~`log-6` 种子数据**。
3. **PATCH 只能改 `progress` / `device`**，其它字段（`viewer`/`episodeId`/`watchedAt`/`id`）不允许改——传了会被忽略或拒绝，见 E 组预期。

---

## 0+. 环境准备

在仓库根目录 `vibe-coding-journey/` 执行一次：

```bash
ENV=$(node -e "console.log(require('./cloudbaserc.json').envId)")
SVC="https://$ENV.service.tcloudbase.com"
# SQL 执行模板（每次照这个格式）
# export MSYS_NO_PATHCONV=1 && tcb db execute -e "$ENV" --sql "<你的SQL>" < /dev/null
```

**基线确认**（与预期不符先解决再测）：

```bash
curl -s "$SVC/api/drama/episodes" | head -c 300            # 预期 6 集
curl -s "$SVC/api/drama/watch-logs" | head -c 300          # 预期 6 条，log-6 在最上面（倒序）
```

---

## 结果速记表

| 区 | 用例数 | 通过 | 不通过 | 有问题 | 证据编号 |
|----|-------|------|--------|--------|---------|
| A 检查台（可达+可读） | 4 | | | | |
| B 读取 plan_days/checkins | 5 | | | | |
| C 写入打卡（SQL） | 5 | | | | |
| D 刷新确认 | 2 | | | | |
| E 修改（PATCH） | 8 | | | | |
| F 删除（DELETE） | 5 | | | | |
| G 边界与重复 | 5 | | | | |

---

## A. 打开检查台（接口可达 + 数据可读）

**A1 读取 plan_days（剧集）**
```bash
curl -s -w "\nstatus=%{http_code}\n" "$SVC/api/drama/episodes"
```
- 预期：200；`"count":6`；每条含 `id / order / title / status / duration / durationSec / summary / scene / videoUrl / cast / updatedAt`；`order` 1→6。
- 实测：____　证据：____

**A2 读取 checkins（观看记录）**
```bash
curl -s -w "\nstatus=%{http_code}\n" "$SVC/api/drama/watch-logs"
```
- 预期：200；6 条；按 `watchedAt` **倒序**（log-6 在最前）；含 `id / episodeId / viewer / progress / device / watchedAt`。
- 实测：____　证据：____

**A3 方法分发**
```bash
curl -s -X POST -w "\nstatus=%{http_code}\n" -H "Content-Type: application/json" -d '{}' "$SVC/api/drama/watch-logs"
curl -s -X PUT    -w "\nstatus=%{http_code}\n" "$SVC/api/drama/watch-logs"
```
- 预期：均 405「只支持 GET、PATCH、DELETE 三种方法」。（POST 走不通是设计如此，见第 0 节；这里只验文案。）
- 实测：____　证据：____

**A4 响应无内部信息泄露**
- 步骤：扫一眼 A1/A2 的完整响应。
- 预期：只有数据字段；无堆栈、无 SQL、无环境 ID 以外的内部标识。
- 实测：____　证据：____

---

## B. 读取 plan_days / checkins（带参查询）

**B1 按 episodeId 过滤**
```bash
curl -s "$SVC/api/drama/watch-logs?episodeId=ep01"
```
- 预期：只返回 `episodeId=ep01` 的记录（基线 2 条：log-1、log-2）。
- 实测：____　证据：____

**B2 按 viewer 过滤**
```bash
curl -s "$SVC/api/drama/watch-logs?viewer=me"
curl -s "$SVC/api/drama/watch-logs?viewer=linmo-fan"
```
- 预期：`me` 返回 5 条；`linmo-fan` 返回 1 条（log-5）。
- 实测：____　证据：____

**B3 组合条件**
```bash
curl -s "$SVC/api/drama/watch-logs?episodeId=ep01&viewer=me"
```
- 预期：2 条（两个条件同时生效）。
- 实测：____　证据：____

**B4 不存在的 episodeId**
```bash
curl -s -w "\nstatus=%{http_code}\n" "$SVC/api/drama/watch-logs?episodeId=ep99"
```
- 预期：200 + 空列表（查无数据不是错误，不该是 500）。
- 实测：____　证据：____

**B5 limit 边界**
```bash
curl -s "$SVC/api/drama/watch-logs?limit=2"        # 预期 2 条
curl -s -w "\nstatus=%{http_code}\n" "$SVC/api/drama/watch-logs?limit=abc"   # 预期 400
curl -s -w "\nstatus=%{http_code}\n" "$SVC/api/drama/watch-logs?limit=0"     # 预期 400
curl -s -w "\nstatus=%{http_code}\n" "$SVC/api/drama/watch-logs?limit=-1"    # 预期 400
curl -s "$SVC/api/drama/watch-logs?limit=99999"    # 预期全量（≤100 上限）
```
- 400 的文案预期：「limit 必须是正整数，例如 limit=5」。
- 实测：____　证据：____

---

## C. 写入打卡（SQL 直插——本线唯一写入入口）

**C1 插一条测试记录**
```bash
export MSYS_NO_PATHCONV=1
tcb db execute -e "$ENV" --sql "INSERT INTO \"drama_watch_logs\" (\"id\",\"episodeId\",\"viewer\",\"progress\",\"device\",\"watchedAt\") VALUES ('log-day24-1','ep02','me',50,'Day24 测试 / Edge','2026-10-18 16:00:00+08');" < /dev/null
```
- 预期：插入成功（1 row affected 或同类成功提示）。
- 实测：____　证据：____

**C2 插完立刻读回**
```bash
curl -s "$SVC/api/drama/watch-logs" | head -c 400
```
- 预期：`log-day24-1` 出现在列表里；因为 `watchedAt` 是今天 16:00（比种子数据都新），应在**最顶**。
- 实测：____　证据：____

**C3 重复插入同 id**
```bash
tcb db execute -e "$ENV" --sql "INSERT INTO \"drama_watch_logs\" (\"id\",\"episodeId\") VALUES ('log-day24-1','ep02');" < /dev/null
```
- 预期：主键冲突报错（记录原文）。符合预期——同 id 不覆盖，要改用 `ON CONFLICT DO UPDATE` 或换 id。
- 实测：____　证据：____

**C4 插不存在的 episodeId**
```bash
tcb db execute -e "$ENV" --sql "INSERT INTO \"drama_watch_logs\" (\"id\",\"episodeId\") VALUES ('log-day24-2','ep99');" < /dev/null
```
- 预期：外键约束报错（记录原文）。符合预期——外键在守数据质量。
- 实测：____　证据：____

**C5 边界值直插**
```bash
tcb db execute -e "$ENV" --sql "INSERT INTO \"drama_watch_logs\" (\"id\",\"episodeId\",\"progress\",\"device\",\"viewer\") VALUES ('log-day24-3','ep01',0,'"$(python -c "print('d'*500)")"','"$(python -c "print('v'*500)")"');" < /dev/null
tcb db execute -e "$ENV" --sql "INSERT INTO \"drama_watch_logs\" (\"id\",\"episodeId\",\"progress\") VALUES ('log-day24-4','ep01',100);" < /dev/null
curl -s "$SVC/api/drama/watch-logs?episodeId=ep01"
```
- 预期：记录实际（TEXT 列无长度限制、progress 0/100 合法）。能读回、接口不炸即正常；读不回或 500 就记录。
- 实测：____　证据：____

---

## D. 刷新确认

**D1 重放读取**
- 步骤：C 组做完后，重新 `curl -s "$SVC/api/drama/watch-logs"`。
- 预期：测试条都在；倒序位置正确（`log-day24-*` 的 watchedAt 最新，排在种子数据前）；`count` = 6 + 实际插入条数。
- 实测：____　证据：____

**D2 连读三次一致性**
```bash
for i in 1 2 3; do curl -s "$SVC/api/drama/watch-logs" | python -c "import sys,json; d=json.load(sys.stdin); print(d['count'], [x['id'] for x in d['data']][:3])"; done
```
- 预期：三次 `count` 与前三条 id 完全一致（无随机丢条/乱序）。
- 实测：____　证据：____

---

## E. 修改（PATCH）

**E1 改 progress**
```bash
curl -s -X PATCH -H "Content-Type: application/json" -d '{"progress":88}' "$SVC/api/drama/watch-logs/log-day24-1"
```
- 预期：200；返回行 `progress:88`。
- 实测：____　证据：____

**E2 改 device**
```bash
curl -s -X PATCH -H "Content-Type: application/json" -d '{"device":"Day24 改后 / Chrome"}' "$SVC/api/drama/watch-logs/log-day24-1"
```
- 预期：200；`device` 已更新。
- 实测：____　证据：____

**E3 两个字段一起改**
```bash
curl -s -X PATCH -H "Content-Type: application/json" -d '{"progress":90,"device":"Day24 双改"}' "$SVC/api/drama/watch-logs/log-day24-1"
```
- 预期：200；两个字段都改。
- 实测：____　证据：____

**E4 progress 非法值**
```bash
for P in 101 -1 88.5 '"88"' 'null'; do
  echo "--- progress=$P"
  curl -s -w "\nstatus=%{http_code}\n" -X PATCH -H "Content-Type: application/json" -d "{\"progress\":$P}" "$SVC/api/drama/watch-logs/log-day24-1"
done
```
- 预期：全部 400「progress 必须是 0-100 的整数」。
- 实测：____　证据：____

**E5 空 body / 非 JSON body**
```bash
curl -s -w "\nstatus=%{http_code}\n" -X PATCH "$SVC/api/drama/watch-logs/log-day24-1"
curl -s -w "\nstatus=%{http_code}\n" -X PATCH -H "Content-Type: application/json" -d 'not-json' "$SVC/api/drama/watch-logs/log-day24-1"
```
- 预期：400「请求体不能为空…」/ 400「请求体不是合法的 JSON」同类中文提示。
- 实测：____　证据：____

**E6 不存在的 id**
```bash
curl -s -w "\nstatus=%{http_code}\n" -X PATCH -H "Content-Type: application/json" -d '{"progress":1}' "$SVC/api/drama/watch-logs/log-day24-999"
```
- 预期：404「观看记录不存在」。
- 实测：____　证据：____

**E7 不可改字段**
```bash
curl -s -w "\nstatus=%{http_code}\n" -X PATCH -H "Content-Type: application/json" -d '{"viewer":"hacker"}' "$SVC/api/drama/watch-logs/log-day24-1"
curl -s -X PATCH -H "Content-Type: application/json" -d '{"progress":91,"viewer":"hacker"}' "$SVC/api/drama/watch-logs/log-day24-1"
curl -s "$SVC/api/drama/watch-logs?episodeId=ep02" | head -c 200
```
- 预期：第一条 400「没有可修改的字段，目前只支持修改 progress（0-100）和 device」；第二条 200 且 `viewer` **没被改掉**（读回确认）。
- 实测：____　证据：____

**E8 路径缺 id**
```bash
curl -s -w "\nstatus=%{http_code}\n" -X PATCH -H "Content-Type: application/json" -d '{"progress":1}' "$SVC/api/drama/watch-logs"
```
- 预期：400「路径缺少记录 id，应为 /api/drama/watch-logs/<id>」。
- 实测：____　证据：____

---

## F. 删除（DELETE · 硬删除，只用测试 id）

**F1 删除测试记录**
```bash
curl -s -w "\nstatus=%{http_code}\n" -X DELETE "$SVC/api/drama/watch-logs/log-day24-1"
```
- 预期：200 `{"ok":true,"data":{"id":"log-day24-1","deleted":true}}`。
- 实测：____　证据：____

**F2 删后读确认**
```bash
curl -s "$SVC/api/drama/watch-logs" | head -c 300
```
- 预期：`log-day24-1` 不在列表；`count` 回到删除前的值。
- 实测：____　证据：____

**F3 重复删同一条**
```bash
curl -s -w "\nstatus=%{http_code}\n" -X DELETE "$SVC/api/drama/watch-logs/log-day24-1"
```
- 预期：404「观看记录不存在」（不静默成功）。
- 实测：____　证据：____

**F4 删不存在的 id**
```bash
curl -s -w "\nstatus=%{http_code}\n" -X DELETE "$SVC/api/drama/watch-logs/log-day24-999"
```
- 预期：404 中文提示。
- 实测：____　证据：____

**F5 路径缺 id**
```bash
curl -s -w "\nstatus=%{http_code}\n" -X DELETE "$SVC/api/drama/watch-logs"
```
- 预期：400「路径缺少记录 id…」。
- 实测：____　证据：____

---

## G. 边界与重复

**G1 连续 PATCH 同一条 3 次**
```bash
for P in 88 90 95; do curl -s -X PATCH -H "Content-Type: application/json" -d "{\"progress\":$P}" "$SVC/api/drama/watch-logs/log-day24-3"; echo; done
curl -s "$SVC/api/drama/watch-logs?episodeId=ep01" | head -c 400
```
- 预期：三次都 200；最终 `log-day24-3` 的 `progress=95`（无中间态丢失）。
- 实测：____　证据：____

**G2 PATCH 后立刻 DELETE**
```bash
curl -s -X PATCH -H "Content-Type: application/json" -d '{"progress":42}' "$SVC/api/drama/watch-logs/log-day24-4"; echo
curl -s -w "\nstatus=%{http_code}\n" -X DELETE "$SVC/api/drama/watch-logs/log-day24-4"
```
- 预期：改、删都成功；删后该 id 404。链路时序正常。
- 实测：____　证据：____

**G3 注入串（SQL 注入面）**
```bash
curl -s -w "\nstatus=%{http_code}\n" "$SVC/api/drama/watch-logs?episodeId=ep01%27%3B%20DROP%20TABLE%20%22drama_watch_logs%22%3B--"
# 上面若被拦或返回空都正常；关键是跑完立刻验证表还在：
curl -s "$SVC/api/drama/watch-logs" | head -c 120
```
- 预期：参数化查询，注入串被当普通字符串；表和数据完好（第二条命令仍返回 6 条上下）。
- 实测：____　证据：____

**G4 快速连续读 10 次**
```bash
for i in $(seq 1 10); do curl -s -o /dev/null -w "%{http_code} " "$SVC/api/drama/watch-logs"; done; echo
```
- 预期：10 个 200，无超时、无 5xx。
- 实测：____　证据：____

**G5 写入后立即读（无缓存延迟）**
- 步骤：C1 插入后**不等待**直接 C2 读取，肉眼记录间隔。
- 预期：秒级可读。若读到旧数据，记录间隔多久后才出现（缓存行为证据）。
- 实测：____　证据：____

---

## 清理（跑完恢复现场，别把测试数据留给明天）

```bash
export MSYS_NO_PATHCONV=1
tcb db execute -e "$ENV" --sql "DELETE FROM \"drama_watch_logs\" WHERE \"id\" LIKE 'log-day24-%';" < /dev/null
curl -s "$SVC/api/drama/watch-logs" | head -c 120   # 预期回到 6 条种子数据
```

---

## 已知设计说明（不是 Bug，避免误报）

| 现象 | 说明 |
|------|------|
| 没有 POST「写入打卡」接口 | 契约未承诺；anon 无 INSERT 是 Day 22 授权时的明确决定，写入走 SQL |
| DELETE 真删、无恢复 | 本线未选软删除（无 `is_deleted` 列），契约明示硬删除 |
| 前端打不开/没有检查台页面 | ai-drama 是本地静态项目，未部署；接口层验证即「检查台」 |
| PATCH 传 `viewer` 等字段被忽略 | 契约：只允许改 `progress`/`device` |

---

## 证据留存规范（前后各一轮）

- 终端输出直接存文件：` drama-<用例编号>-<before|after>.txt`（例：`drama-E4-before.txt`）。
- 报错/异常原文**整段保留**（含 status 行），不要只抄一句话。
- 修复前全量跑一遍（before），修复+部署后原样再跑一遍（after）。

## 反馈模板（有不通过就按这个回传，我会按「原因排序 → 验证方法 → 修复方案 → 回归清单」处理）

```
【现象】
【复现步骤】
【报错原文】
【已尝试动作】
```
