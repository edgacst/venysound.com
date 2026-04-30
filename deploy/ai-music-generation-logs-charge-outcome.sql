-- AI 음악 생성: 과금은 성공 확정 후에만 반영, 실패 시 관리자 로그에 사유 기록
ALTER TABLE ai_music_generation_logs ADD COLUMN IF NOT EXISTS charge_status VARCHAR(32) NOT NULL DEFAULT 'charged';
ALTER TABLE ai_music_generation_logs ADD COLUMN IF NOT EXISTS failure_message TEXT;
COMMENT ON COLUMN ai_music_generation_logs.charge_status IS 'pending=생성요청만 기록, charged=과금완료, failed=실패·미과금(또는 과금오류)';
COMMENT ON COLUMN ai_music_generation_logs.failure_message IS '업스트림 실패·과금 실패 시 사유';
