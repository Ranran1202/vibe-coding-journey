# 备份说明 · pre-v1.0（2026-10-19 19:53 制作）

## 这个备份是什么

v1.0 发布前的完整快照，即「上一稳定版本」。包含两份：

| 文件 | 内容 | 行数/大小 |
|---|---|---|
| `trends.jsonl` | trends 表全量（含 10-19 当日 50 条） | 744 行 |
| `favorites.jsonl` | favorites 表全量 | 32 行 |
| `drama_episodes.jsonl` | drama_episodes 表全量 | 6 行 |
| `drama_watch_logs.jsonl` | drama_watch_logs 表全量 | 6 行 |
| `*.txt` | tcb db execute 原始输出（留档比对用） | — |
| `hosting-snapshot/` | 静态托管整站文件（含 `__auth/` 平台文件） | index.html 无 favicon 修复 |

## 「上一版本」是哪一版、怎么取回

- **静态托管上一版**：`hosting-snapshot/` 目录。取回命令（在仓库根目录）：
  `tcb hosting deploy backups/pre-v1.0-20261019/hosting-snapshot / -e <envId> --dir`
- **数据恢复**：仅当表被清空/写坏时用。逐表执行（JSONL 每行一个对象，转 INSERT 后导入；表结构未变更时可直接 `INSERT INTO ... SELECT ... FROM jsonb_to_recordset(...)`）。**表结构有变更时禁止直接导入，先对照 schema 手工映射列**。
- **代码版本**：pre-v1.0 的 index.html 等同于 git 仓库 Day 25 时点（favicon 修复前）；v1.0 发布后将以 `git tag v1.0` 标记（commit 确认后补打）。

## 制作方式（下次照抄）

1. 数据：`tcb db execute -e <envId> --sql "SELECT row_to_json(t)::text AS j FROM <表> t;" > <表>.txt`，再用 node 提取 `{"id"...}` 行存 `.jsonl`（逐行 JSON.parse 校验）
2. 文件：`tcb hosting download / backups/<目录>/hosting-snapshot -e <envId> --dir`
