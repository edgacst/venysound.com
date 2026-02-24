-- 서버 DB에 누락된 컬럼 추가 (한 번만 실행)
-- 실행: 서버에서 psql 또는 DB 클라이언트로 연결 후 이 파일 실행
-- 예: psql "$DATABASE_URL" -f script/add-missing-columns.sql

-- 1. notifications.payload (알림 메타데이터)
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS payload JSONB;

-- 2. users.donation_badge (후원 뱃지: seed, sprout, supporter, sponsor)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS donation_badge VARCHAR(32);
