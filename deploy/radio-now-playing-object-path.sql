-- 로컬 파일 송출용: 음원 미등록, 임시 스트림만 사용
ALTER TABLE radio_channels ADD COLUMN IF NOT EXISTS now_playing_object_path TEXT;
ALTER TABLE radio_channels ADD COLUMN IF NOT EXISTS now_playing_temp_duration_seconds INTEGER;
ALTER TABLE radio_channels ADD COLUMN IF NOT EXISTS now_playing_temp_next_snapshot_index INTEGER;
