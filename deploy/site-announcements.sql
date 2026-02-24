-- 사이트 공지 팝업 (관리자 설정, 메인 접속 시 시간대에 맞춰 노출)
CREATE TABLE IF NOT EXISTS site_announcements (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
