-- AI 음악 생성 월별 사용량 (Free 플랜 제한용)
CREATE TABLE IF NOT EXISTS ai_music_usage (
  user_id VARCHAR NOT NULL,
  period_month VARCHAR NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, period_month)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'venysound') THEN
    EXECUTE 'GRANT ALL PRIVILEGES ON TABLE ai_music_usage TO venysound';
  END IF;
END $$;
