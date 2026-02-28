-- 베니방송국 채널
-- 실행: npm run db:deploy (run-all-deploy-migrations에 포함)

CREATE TABLE IF NOT EXISTS radio_channels (
  id SERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  cover_filename TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',
  invite_token TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  notice TEXT,
  now_playing_music_id INTEGER REFERENCES music(id) ON DELETE SET NULL,
  now_playing_started_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS radio_channels_owner_id ON radio_channels(owner_id);
