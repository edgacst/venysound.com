-- 테마/무드 플레이리스트 (사이트 기획용)
-- 실행: npm run db:curated  또는  psql "$DATABASE_URL" -f deploy/create-curated-playlists.sql

CREATE TABLE IF NOT EXISTS curated_playlists (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  cover_image_filename TEXT,
  genre_main TEXT,
  genre_sub TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS curated_playlist_music (
  id SERIAL PRIMARY KEY,
  curated_playlist_id INTEGER NOT NULL REFERENCES curated_playlists(id) ON DELETE CASCADE,
  music_id INTEGER NOT NULL REFERENCES music(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_curated_playlist_music_playlist ON curated_playlist_music(curated_playlist_id);

-- 기존 테이블에 컬럼이 없을 수 있으므로 안전하게 추가
ALTER TABLE curated_playlists
  ADD COLUMN IF NOT EXISTS cover_image_filename TEXT,
  ADD COLUMN IF NOT EXISTS genre_main TEXT,
  ADD COLUMN IF NOT EXISTS genre_sub TEXT;
