-- notifications.payload, users.donation_badge 추가 (한 번만 실행)
-- 이미 적용했으면 건너뛰기 (IF NOT EXISTS 로 안전)

ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS payload JSONB;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS donation_badge VARCHAR(32);
