-- Music video likes, comments, and paid downloads.
-- Run via: npm run db:deploy

CREATE TABLE IF NOT EXISTS music_video_likes (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES music_videos(id) ON DELETE CASCADE,
  user_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS music_video_likes_video_user_unique
  ON music_video_likes(video_id, user_id);
CREATE INDEX IF NOT EXISTS idx_music_video_likes_video
  ON music_video_likes(video_id);

CREATE TABLE IF NOT EXISTS music_video_comments (
  id SERIAL PRIMARY KEY,
  video_id INTEGER NOT NULL REFERENCES music_videos(id) ON DELETE CASCADE,
  user_id VARCHAR(128) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_music_video_comments_video_created
  ON music_video_comments(video_id, created_at);

CREATE TABLE IF NOT EXISTS music_video_purchases (
  id SERIAL PRIMARY KEY,
  buyer_id VARCHAR(128) NOT NULL,
  video_id INTEGER NOT NULL REFERENCES music_videos(id) ON DELETE CASCADE,
  seller_id VARCHAR(128) NOT NULL,
  amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS music_video_purchases_buyer_video_unique
  ON music_video_purchases(buyer_id, video_id);
CREATE INDEX IF NOT EXISTS idx_music_video_purchases_buyer
  ON music_video_purchases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_music_video_purchases_seller
  ON music_video_purchases(seller_id);
