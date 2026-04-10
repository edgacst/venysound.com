-- 카페(라디오 채널) 프로필 외부 홈페이지 링크
ALTER TABLE radio_channels ADD COLUMN IF NOT EXISTS homepage_url text;
