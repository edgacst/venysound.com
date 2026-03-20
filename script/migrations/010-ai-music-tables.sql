-- AI 음악 월별 사용량 테이블
CREATE TABLE IF NOT EXISTS ai_music_usage (
  user_id VARCHAR NOT NULL,
  period_month VARCHAR NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, period_month)
);

-- AI 음악 생성 로그 테이블 (관리자 조회용)
CREATE TABLE IF NOT EXISTS ai_music_generation_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  billing_kind VARCHAR(32) NOT NULL,
  subscription_tier_at VARCHAR(32),
  provider VARCHAR(32) NOT NULL,
  task_id VARCHAR(128),
  request_title VARCHAR(512),
  request_summary TEXT,
  credits_charged INTEGER NOT NULL DEFAULT 0,
  publishments JSONB DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_ai_music_gen_logs_user ON ai_music_generation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_music_gen_logs_task ON ai_music_generation_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_ai_music_gen_logs_created ON ai_music_generation_logs(created_at);
