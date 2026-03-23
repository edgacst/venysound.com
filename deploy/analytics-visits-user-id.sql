-- 로그인 사용자의 페이지뷰에 user_id 연결 (관리자 회원별 접속 로그용)
-- npx tsx script/run-all-deploy-migrations.ts 에 포함됨

ALTER TABLE analytics_visits ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS analytics_visits_user_id_visited_at_idx ON analytics_visits (user_id, visited_at DESC);
