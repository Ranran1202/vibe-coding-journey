-- ============================================================
-- favorites 外键修复脚本（Day 18 决策落地用）
--
-- 背景（api-contract.md §3.6「已知数据一致性问题」）：
--   favorites."trendId" 上的外键带 ON DELETE CASCADE，
--   POST /api/sync 同步时「先删当日旧热搜再插入」会把指向这些热搜的收藏**连带删掉**。
--   Day 16 灌的 5 条种子收藏，同步后只剩 3 条（fav-2、fav-5 静默消失）。
--
-- 决策（2026-10-08 Day 18）：选方案 b —— 去掉外键，靠应用层维护。
--   理由：favorites 本来冗余存了 title / platform，原热搜下架后收藏照样能显示；
--         「不留孤儿数据」的收益 < 「收藏被静默删掉」的代价。
--         方案 a（ON DELETE RESTRICT）会让同步删旧数据时整批失败，更糟。
--
-- ⚠️ 状态：**尚未执行**。改表属结构变更，需你确认后再跑。
--    执行方式（Git Bash，tcb 不在 PATH 里，先加这一行）：
--      export PATH="$PATH:/c/Users/86153/.workbuddy/binaries/node/workspace/node_modules/.bin"
--      cd /c/Users/86153/WorkBuddy/vibe-coding-journey
--      ENV=$(node -p "require('./cloudbaserc.json').envId")
--      SQL=$(cat db/fix_favorites_fk.sql)
--      tcb db execute -e "$ENV" --sql "$SQL" < /dev/null
--    （末尾的 < /dev/null 不能省，否则 CLI 等输入会卡住。）
--
-- 可否重复执行：可以。下面两条都做了「存在才处理」的保护。
-- ============================================================


-- ------------------------------------------------------------
-- 1. 删掉带 ON DELETE CASCADE 的外键约束
--    用 DO 块先判断约束是否存在：不存在就跳过，不报错。
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'favorites_trendid_fkey'
    AND    conrelid = 'favorites'::regclass
  ) THEN
    ALTER TABLE favorites DROP CONSTRAINT favorites_trendid_fkey;
    RAISE NOTICE '已删除外键 favorites_trendid_fkey（原 ON DELETE CASCADE）';
  ELSE
    RAISE NOTICE '外键 favorites_trendid_fkey 不存在，跳过';
  END IF;
END $$;

COMMENT ON COLUMN favorites."trendId" IS
  '★关联字段★ 指向 trends.id（靠它从收藏反查原热搜）。2026-10-08（Day 18）起**不再有外键约束**：'
  '原热搜被同步清理时收藏不再被连带删除（此前 ON DELETE CASCADE 导致 5 条种子收藏静默剩 3 条）。'
  '"这条热搜还在吗"改由应用层负责：POST /api/favorites 会先查 trends，不存在就返回 404 中文提示。'
  '冗余字段 title / platform 保证原条目下架后收藏列表仍能显示。';


-- ------------------------------------------------------------
-- 2.（可选但推荐）给 trendId 加唯一索引 —— 从数据库层面堵住重复收藏
--    现在 POST /api/favorites 是「先查后插」，极小并发窗口下可能插进两条相同 trendId。
--    加了唯一索引后，这条防线由数据库兜底（应用层已能识别 duplicate 错误并转成幂等返回）。
--    当前库里 3 条收藏的 trendId 互不相同，可以直接建；若将来出现重复行，先去重再执行。
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_trendid_unique
  ON favorites ("trendId");

-- 说明：原有的普通索引 idx_favorites_trendid 保留也没问题（查询照样能用唯一索引），
-- 想清理的话单独执行：DROP INDEX IF EXISTS idx_favorites_trendid;


-- ------------------------------------------------------------
-- 3. 执行后自查（把这条单独跑一遍，确认改对了）
--    SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'favorites'::regclass;
--    → 应看不到 favorites_trendid_fkey；
--    SELECT indexname FROM pg_indexes WHERE tablename = 'favorites';
--    → 应能看到 idx_favorites_trendid_unique。
-- ------------------------------------------------------------
