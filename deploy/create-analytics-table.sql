-- analytics_visits 테이블만 생성 (db:push 사용 시 데이터 손실 경고가 나올 때 사용)
-- 서버에서: psql $DATABASE_URL -f deploy/create-analytics-table.sql
-- 또는 Hostinger DB 관리에서 SQL 실행

CREATE TABLE IF NOT EXISTS analytics_visits (
  id SERIAL PRIMARY KEY,
  visited_at TIMESTAMP NOT NULL DEFAULT NOW(),
  visitor_key TEXT NOT NULL,
  path TEXT NOT NULL
);
