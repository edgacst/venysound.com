-- 메시지 수신 설정, 차단, 신고
ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_direct_messages BOOLEAN DEFAULT true;

CREATE TABLE IF NOT EXISTS user_blocks (
  id SERIAL PRIMARY KEY,
  blocker_id TEXT NOT NULL REFERENCES users(id),
  blocked_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS user_reports (
  id SERIAL PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  reported_user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  message_id INTEGER REFERENCES direct_messages(id),
  conversation_id INTEGER REFERENCES conversations(id),
  status TEXT DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
