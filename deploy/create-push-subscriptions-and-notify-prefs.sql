-- Push subscriptions (Web Push) + user notification preferences for "new music for you"
-- Run: psql "$DATABASE_URL" -f deploy/create-push-subscriptions-and-notify-prefs.sql

-- User prefs: 신곡 알림 이메일/푸시 수신 여부
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notify_new_music_email BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_new_music_push BOOLEAN DEFAULT true;

-- Push subscription (one per device/browser)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
