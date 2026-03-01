-- DJ 인수인계: 현재 송출 호스트 지정
-- radio_channels.current_host_id (nullable, FK users.id)
ALTER TABLE radio_channels ADD COLUMN IF NOT EXISTS current_host_id TEXT REFERENCES users(id) ON DELETE SET NULL;
