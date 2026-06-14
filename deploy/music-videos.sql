CREATE TABLE IF NOT EXISTS music_videos (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  original_filename VARCHAR(260),
  duration_sec INTEGER,
  file_size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_music_videos_created
  ON music_videos (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_music_videos_user_created
  ON music_videos (user_id, created_at DESC);
