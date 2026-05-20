-- 회원별 KIE Suno 커스텀 보이스(voiceId) — 기기 간 동기화
CREATE TABLE IF NOT EXISTS ai_music_user_voices (
  user_id varchar(128) PRIMARY KEY,
  voice_id varchar(128),
  voice_name varchar(120),
  style text,
  description text,
  singer_skill_level varchar(32) DEFAULT 'beginner',
  validate_task_id varchar(128),
  status varchar(32) NOT NULL DEFAULT 'none',
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_music_user_voices_voice_id ON ai_music_user_voices(voice_id)
  WHERE voice_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'venysound') THEN
    EXECUTE 'GRANT ALL PRIVILEGES ON TABLE ai_music_user_voices TO venysound';
  END IF;
END $$;
