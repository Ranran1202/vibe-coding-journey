# Day 22｜今日热搜线 favorites 修改/删除接口：部署与验证记录

> 覆盖第①条需求：PATCH 只改备注、DELETE 删一条、不存在 id 返回中文错误、响应统一 `{ok,data,error}`、
> 前端检查台删除二次确认、测试命令 + DB 前后对比。契约见根目录 `api-contract.md` v1.0.0（§3.8 / §3.9）。

---

## 1. 本次交付清单

| 层 | 文件 | 内容 |
|---|---|---|
| 数据访问 | `shared/favoritesRepository.js` | 新增 `updateFavorite` / `softDeleteFavorite` / `findFavoriteIncludingDeleted`；三个读函数加 `is_deleted` 过滤 |
| 云函数 | `cloudfunctions/favorites/index.js` | 新增 `handlePatch` / `handleDelete`；`parseIdFromPath` 三级兼容前缀剥离；CORS 放行 PATCH/DELETE |
| 数据库 | `db/add_soft_delete.sql` | 加 `is_deleted` / `deletedAt` 列 + 索引（幂等，已云端执行） |
| 数据库 | `db/recover_favorite.sql` | 软删除恢复模板 |
| 前端 | `my-app/index.html` + `my-app/js/app.js` | 检查台 `#/check` 第④张卡片「删除测试」，`runDeleteTest()` 带 `window.confirm` 二次确认 |
| 验证 | `scripts/day22-verify.js` + `tmp/day22-*.{html,json,png}` | 公网 CRUD 闭环脚本与截图产物 |

> 数据访问分层约定：`shared/*Repository.js` 是唯一数据出口，`scripts/sync-shared.js` 负责复制到各云函数 `lib/`，改数据访问只改 shared 源。

---

## 2. 部署步骤（按顺序执行）

```bash
# 0) 一次性：加软删除列（已执行过，幂等可重跑）
export PATH="$PATH:/c/Users/86153/.workbuddy/binaries/node/workspace/node_modules/.bin"
export MSYS_NO_PATHCONV=1
ENV=$(node -e "console.log(require('./cloudbaserc.json').envId)")
tcb db execute -e "$ENV" --sql "ALTER TABLE favorites ADD COLUMN IF NOT EXISTS \"is_deleted\" BOOLEAN NOT NULL DEFAULT FALSE; ALTER TABLE favorites ADD COLUMN IF NOT EXISTS \"deletedAt\" TIMESTAMPTZ; CREATE INDEX IF NOT EXISTS idx_favorites_deleted ON favorites (\"is_deleted\");" < /dev/null

# 1) 部署 favorites 云函数（PATCH/DELETE 后端）
cd cloudfunctions/favorites && tcb fn deploy -e "$ENV" < /dev/null && cd ../..

# 2) 同步 shared 数据访问层到云函数 lib/（改 shared 后必做）
node scripts/sync-shared.js

# 3) 部署前端（检查台删除测试卡片 + 二次确认）
tcb hosting deploy ./my-app / -e "$ENV" < /dev/null
```

> 环境 ID 只从本地 `cloudbaserc.json` 读，不回显、不进仓库。

---

## 3. 测试命令与 DB 前后对比

设 `BASE=https://<env-id>.service.tcloudbase.com`（从 cloudbaserc.json 拼，勿手打）。

### 3.1 PATCH：只允许改备注

```bash
# ① 建一条测试收藏（拿到 favId）
curl -s -X POST "$BASE/api/favorites" \
  -H "Content-Type: application/json" \
  -d '{"trendId":"douyin-7-d1016","title":"<热搜标题>","note":"检查台 PATCH 测试前"}'

# ② DB 改前
tcb db execute -e "$ENV" --sql "SELECT id, note, \"updatedAt\" FROM favorites WHERE id='<favId>'" < /dev/null

# ③ 改备注
curl -s -X PATCH "$BASE/api/favorites/<favId>" \
  -H "Content-Type: application/json" \
  -d '{"note":"检查台 PATCH 测试后"}'
# 期望：{"ok":true,"data":{...整行...},"error":null}（HTTP 200）

# ④ DB 改后：note 已变，updatedAt 顺延
tcb db execute -e "$ENV" --sql "SELECT id, note, \"updatedAt\" FROM favorites WHERE id='<favId>'" < /dev/null
```

校验点：`note` 只能改这一个字段；请求体缺 `note` → `400`「note 必填，且需为长度不超过 200 的字符串」。

### 3.2 DELETE：软删除（删错可找回）

```bash
# ① DB 删前：is_deleted=false、deletedAt 为空
tcb db execute -e "$ENV" --sql "SELECT id, \"is_deleted\", \"deletedAt\" FROM favorites WHERE id='<favId>'" < /dev/null

# ② 删
curl -s -X DELETE "$BASE/api/favorites/<favId>"
# 期望：{"ok":true,"data":{"id":"<favId>","deleted":true,"softDeleted":true},"error":null}

# ③ DB 删后：is_deleted=true、deletedAt 有值；总数十一点（软删不进普通列表）
tcb db execute -e "$ENV" --sql "SELECT id, \"is_deleted\", \"deletedAt\" FROM favorites WHERE id='<favId>'" < /dev/null
tcb db execute -e "$ENV" --sql "SELECT count(*) FROM favorites WHERE \"is_deleted\"=false" < /dev/null

# ④ GET 列表已不含该条
curl -s "$BASE/api/favorites"
```

**恢复（软删除的意义）**：

```bash
tcb db execute -e "$ENV" --sql "UPDATE favorites SET \"is_deleted\"=FALSE,\"deletedAt\"=NULL WHERE id='<favId>'" < /dev/null
```

### 3.3 不存在的 id：中文错误，不崩、不 500

```bash
curl -s -X PATCH  "$BASE/api/favorites/fav-not-exist-999" -H "Content-Type: application/json" -d '{"note":"x"}'
curl -s -X DELETE "$BASE/api/favorites/fav-not-exist-999"
# 期望均为：{"ok":false,"data":null,"error":"收藏不存在"}（HTTP 404）
```

### 3.4 前端二次确认

打开 `<静态托管域名>/#/check`，第④张卡片「删除测试（DELETE /api/favorites/:id）· 带二次确认」：
点击按钮 → `window.confirm` 弹窗说明将删哪一条 → 取消则什么都不发生；确认后才发 DELETE，并再 GET 一次证明不再返回。

---

## 4. Day 22 实测结果（2026-10-18，公网）

| 步骤 | 结果 |
|---|---|
| POST 新建 `douyin-7-d1016` 测试收藏 | 200，拿到 favId |
| PATCH 改 note | 200，返回整行；DB 复查 note 已变 |
| DELETE | 200，`softDeleted:true` |
| GET 列表计数 | 19 → 18 |
| DB 直查 | `is_deleted=true`、`deletedAt` 有值 |
| 不存在 id | PATCH/DELETE 均 `404`「收藏不存在」 |
| 截图产物 | `tmp/day22-patch.png`（PATCH 前后对比）、`tmp/day22-delete.png`（DELETE 后消失） |

---

## 5. 「删除为什么比新增更容易出事」——本例加的三道确认

1. **精确 id**：路径最后一段即 id，拼错路径会先被 `parseIdFromPath` 三级兼容拦住，不会误删别人。
2. **删前存在性校验**：不存在 → `404` 中文错误，绝不静默返回成功。
3. **软删除可恢复**：`is_deleted` 标记而非物理删除，删错可用 `db/recover_favorite.sql` 一键找回。
