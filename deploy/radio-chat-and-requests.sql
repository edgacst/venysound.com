-- 베니방송국 채널 채팅 + 신청곡
-- 실행: npm run db:deploy

CREATE TABLE IF NOT EXISTS radio_chat_messages (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES radio_channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS radio_chat_messages_channel_id ON radio_chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS radio_chat_messages_created_at ON radio_chat_messages(created_at);

CREATE TABLE IF NOT EXISTS radio_song_requests (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES radio_channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  music_id INTEGER REFERENCES music(id) ON DELETE SET NULL,
  title TEXT,
  artist TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS radio_song_requests_channel_id ON radio_song_requests(channel_id);
CREATE INDEX IF NOT EXISTS radio_song_requests_status ON radio_song_requests(status);
