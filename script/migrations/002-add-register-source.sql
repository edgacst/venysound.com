-- users.register_source 추가 (가입 경로: email, google, naver, kakao, facebook, tiktok)
-- 이미 적용했으면 건너뛰기

ALTER TABLE users
ADD COLUMN IF NOT EXISTS register_source VARCHAR(32);
