-- 알림 메시지 번역용 payload 컬럼 추가
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payload JSONB;
