-- ============================================================
-- Day 22 软删除恢复：把某条被软删除的收藏「找回来」
-- 原理：DELETE 接口只是把 is_deleted 置 true，数据还在库里，翻回 false 即可。
-- 用法：把下面 <收藏id> 换成实际 id（如 fav-xxxx），再执行：
--   tcb db execute -e "$ENV" --sql "UPDATE favorites SET \"is_deleted\" = FALSE, \"deletedAt\" = NULL WHERE \"id\" = '<收藏id>';"
-- 找回后 GET /api/favorites 又会重新看到它。
-- ============================================================

-- 示例（执行前请替换 <收藏id>）：
-- UPDATE favorites SET "is_deleted" = FALSE, "deletedAt" = NULL WHERE "id" = '<收藏id>';
