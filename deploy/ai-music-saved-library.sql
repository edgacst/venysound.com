-- AI 음악 생성 페이지: 사용자별 저장 곡 목록 (PC·모바일 공유)
CREATE TABLE IF NOT EXISTS ai_music_saved_tracks (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  client_id VARCHAR(220) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  clip_id TEXT,
  audio_url TEXT,
  image_url TEXT,
  title TEXT,
  tags TEXT,
  prompt TEXT,
  original_prompt TEXT,
  custom_mode BOOLEAN NOT NULL DEFAULT FALSE,
  generation_task_id VARCHAR(128),
  generation_provider VARCHAR(32),
  upload_count INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  published_to_site BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT ai_music_saved_tracks_user_client UNIQUE (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_music_saved_user_created ON ai_music_saved_tracks(user_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'venysound') THEN
    EXECUTE 'GRANT ALL PRIVILEGES ON TABLE ai_music_saved_tracks TO venysound';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE ai_music_saved_tracks_id_seq TO venysound';
  END IF;
END $$;
