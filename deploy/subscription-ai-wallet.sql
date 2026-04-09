-- 구독 AI 예산 이월 지갑(청크별 creditedAt, 12개월 만료는 앱에서 prune)
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_ai_wallet jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_ai_period_key varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_ai_period_consumed_won integer NOT NULL DEFAULT 0;
