-- 복수 요금제 동시 유효 시 AI 월 크레딧 합산 등에 사용
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_entitlements jsonb NOT NULL DEFAULT '{}'::jsonb;
