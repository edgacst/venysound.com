-- Community posts: 조회수 (npm run db:deploy 에 포함)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;
