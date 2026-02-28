-- 베니방송국 채널 스텝(부방장 등)
-- 실행: npm run db:deploy

CREATE TABLE IF NOT EXISTS radio_channel_staff (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES radio_channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS radio_channel_staff_channel_id ON radio_channel_staff(channel_id);
CREATE INDEX IF NOT EXISTS radio_channel_staff_user_id ON radio_channel_staff(user_id);
