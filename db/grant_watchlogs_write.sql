-- Day 22｜AI 漫剧线 checkins（drama_watch_logs）补修改/删除接口前的授权
-- 背景：rdb() 查询构造器以 anon 角色连接。授权前 anon 只有 SELECT，
--       PATCH/DELETE 报 "permission denied for table drama_watch_logs"。
-- 本次只授 PATCH/DELETE 必需权限，与 favorites 表同款做法（不授 INSERT，本线暂无 POST 接口）。
-- 已在云端执行成功，执行后复查 anon 权限为 DELETE / SELECT / UPDATE 三件。
GRANT UPDATE, DELETE ON TABLE drama_watch_logs TO anon;

-- 复查授权（执行后应看到 DELETE / SELECT / UPDATE 三行）：
-- SELECT privilege_type FROM information_schema.role_table_grants
-- WHERE table_schema='public' AND table_name='drama_watch_logs' AND grantee='anon'
-- ORDER BY privilege_type;
