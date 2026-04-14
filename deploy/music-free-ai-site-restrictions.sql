-- 무료 플랜 AI 생성 후 사이트 공개된 곡: 후원·유료 다운로드·벨소리 비활성(약관·정책)
ALTER TABLE music ADD COLUMN IF NOT EXISTS free_ai_site_restrictions BOOLEAN NOT NULL DEFAULT FALSE;
