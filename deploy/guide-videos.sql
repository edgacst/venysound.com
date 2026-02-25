-- 동영상 가이드 테이블: /guide 페이지에서 사용하는 영상 링크 관리
CREATE TABLE IF NOT EXISTS guide_videos (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  youtube_url TEXT NOT NULL,
  sort_order INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 이미 테이블이 있는 경우를 위한 보강용 ALTER (운영에서 안전하게 사용하기 위함)
ALTER TABLE guide_videos ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE guide_videos ADD COLUMN IF NOT EXISTS youtube_url TEXT NOT NULL;
ALTER TABLE guide_videos ADD COLUMN IF NOT EXISTS sort_order INTEGER;
ALTER TABLE guide_videos ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE guide_videos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

