-- 방송 예정 시간 (몇 시부터 몇 시까지)
ALTER TABLE radio_channels ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMP;
ALTER TABLE radio_channels ADD COLUMN IF NOT EXISTS scheduled_end_at TIMESTAMP;
