-- 사이트 공지 팝업 (관리자 설정, 메인 접속 시 시간대에 맞춰 노출)
CREATE TABLE IF NOT EXISTS site_announcements (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  image_url TEXT,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
-- 기존 테이블에 이미지 컬럼 추가 (이미 있으면 무시)
ALTER TABLE site_announcements ADD COLUMN IF NOT EXISTS image_url TEXT;
-- 언어별 번역 저장 (공지 저장 시 자동 번역)
ALTER TABLE site_announcements ADD COLUMN IF NOT EXISTS content_translations JSONB DEFAULT '{}';
