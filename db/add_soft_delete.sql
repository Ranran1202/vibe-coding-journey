-- ============================================================
-- Day 22 软删除：给 favorites 表加 is_deleted / deletedAt 两列
-- 配套：shared/favoritesRepository.js 的 softDeleteFavorite + listFavorites 过滤
-- 执行：可重复执行（ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS）
-- 用法：tcb db execute -e "$ENV" --sql "$(cat db/add_soft_delete.sql)"
-- ============================================================

ALTER TABLE favorites ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE favorites ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_favorites_deleted ON favorites ("is_deleted");

COMMENT ON COLUMN favorites."is_deleted" IS '软删除标记：false=正常，true=已删除。DELETE 接口只置此标记、不真删，删错可用 db/recover_favorite.sql 找回。';
COMMENT ON COLUMN favorites."deletedAt" IS '软删除时间；NULL 表示未删除。';
