# 回滚手册（今日热搜 + 我的AI漫）

> 可执行性要求：本手册经 Day 26 真实演练逐步走通（记录见 `day26-drill-record.md`，
> 静态托管回退全程约 2 分 06 秒）。每一步都写明命令与预期输出。

## 一、什么情况必须回滚（判断表）

| 症状 | 判定 | 动作 |
|---|---|---|
| 首页打不开 / 白屏 / 报错页，回退到上一版无此问题 | 必须回滚（静态托管） | 第三节 1 |
| 页面能开但核心数据不显示，`verify-project.sh` 出现 FAIL 且确认是新发布引起 | 必须回滚 | 第三节 1 |
| 接口报错（500/404）且能定位到某次云函数部署 | 必须回滚（云函数） | 第三节 2 |
| 数据被误删/误写坏（收藏消失、热搜错乱） | 先止损再评估：接口继续写坏数据 → 先回滚云函数；数据已坏 → 第三节 3 恢复 | 视情 |
| 只是样式/小文案不对，功能可用 | **不回滚**，记录问题下版修 | — |
| 接口变慢但可用 | **不回滚**，观察并记录 | — |
| verify-project 有 FAIL 但确认与本次发布无关（存量问题） | 不回滚，在发布记录标注 | — |

原则：**回滚永远不丢数据，修复却可能越修越坏——拿不准时先回滚再说。**

## 二、回滚前置：确认「上一版」是什么

回滚前必须能回答：上一版是哪一版、备份在哪、怎么取回。
查看 `backups/` 下最新日期目录的 `README.md`。本次演练时答案：
**上一版 = pre-v1.0（2026-10-19 19:53 快照），取回命令 = `tcb hosting deploy backups/pre-v1.0-20261019/hosting-snapshot / -e <envId>`。**

## 三、三层回退步骤

### 1. 代码回退（静态托管回退上一版）——本次已实跑

平台事实（决定做法）：`tcb hosting deploy` **没有版本管理**（官方 help 原文 no version management），无法一键回退历史版本，回退 = 重新上传上一版快照。

```bash
# ① 部署上一版快照（约 8 秒）
tcb hosting deploy backups/<日期目录>/hosting-snapshot / -e <envId>

# ② 验证公网（见第四节）
# ③ 清理残留（重要坑，见下）：删除新版多出来的云端文件
tcb hosting delete /favicon.ico -e <envId>   # 仅当旧版没有该文件时
```

**必知的三个坑（演练实测）**：
1. **deploy 只覆盖、不删除**：旧版没有而新版有的文件会残留在云端（本次演练实测 favicon.ico 回滚后仍 200），必须用 `tcb hosting delete` 逐个清理。彻底回滚 = 上传快照 + 删除新版新增文件清单（清单记录在对应日期的发布清单里）。
2. **CDN 缓存**：页面不更新时用 `curl -H "Cache-Control: no-cache" <url>` 验证，或无痕窗口；CDN 通常几分钟内刷新。
3. **`--verify` 一致性校验可能误报**：实测文件已上传成功但 verify 报 missing 全部文件，以 curl 实测线上状态为准，不要被吓住重复部署。

**平台备查（今天不做实操）**：`tcb app deploy` 提供云构建 + 版本管理 + 回滚（官方 help 原文 cloud builds, rollbacks）；若日后迁移到该方式，回退可走平台能力，本节 1 的手工路径仍作为兜底保留。

### 2. 云函数回退（重新部署上一版代码）——备查，本次未实操

```bash
# ① 确认上一版代码：git log --oneline -- cloudfunctions/<函数名>/，取发布前的提交号
# ② 检出上一版到临时目录
git show <上一版提交号>:cloudfunctions/<函数名>/index.js > /tmp/index.js   # 逐文件
# ③ 重新部署单个函数
tcb fn deploy <函数名> -e <envId> --dir cloudfunctions/<函数名> --force
# ④ 验证：curl 对应接口，比对契约（ai-drama/api-contract.md / SKILL.md A 组定义）
```

要点：云函数一次只回退**出问题的那一个**；回退前把当前线上版本目录先拷贝到
`backups/<日期>-fn-<函数名>/`，防止回退动作本身丢代码。

### 3. 数据恢复（只能靠发布前导出的备份重新导入）——备查，本次未实操

```bash
# 备份是 JSONL（每行一个 JSON 对象）。恢复单表：
# ① 禁止盲目清表！先确认坏数据范围：SELECT count(*) FROM <表>;
# ② 表结构未变更时，把 JSONL 转成 INSERT（node -e 生成）后逐批执行
#    表结构有变更时：禁止直接导入，先对照 db/drama_schema.sql 手工映射列
# ③ 恢复后必跑：bash scripts/verify-project.sh all
```

**铁律：发布含表结构变更（ALTER/新表）前，必须先完成第四节的数据导出；没有导出不允许发布。**

## 四、回滚后的验证方法（三层通用）

1. **公网可用**：浏览器打开首页，出现热搜列表 + 来源条日期为今天；`curl` 首页 HTTP 200。
2. **版本正确**：核对回滚特征。本次演练用 favicon 作版本指纹：旧版 = 标签页灰色地球图标 + `/favicon.ico` 404 + index.html 无 `rel="icon"`；v1.0 = 红色图标 + 200。
3. **数据无损坏**：`bash scripts/verify-project.sh all` → PASS 13 · FAIL 0；重点看 A6/B6 表计数与备份时行数量级一致（trends 744 / favorites 32 / drama_episodes 6 / drama_watch_logs 6，2026-10-19 快照值）。
4. 全部通过后，在 `day26-drill-record.md`（或当次发布记录）补一行回滚记录：开始时间、公网恢复时间、总耗时、原因。
