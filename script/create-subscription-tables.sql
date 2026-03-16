-- subscription_plans, payments 테이블 생성 및 premium 플랜 데이터 삽입
-- 웹서버 DB(venysounddb)에서 venysound 사용자로 실행하거나, postgres로 실행 후 권한 부여

-- 1) subscription_plans 테이블
CREATE TABLE IF NOT EXISTS subscription_plans (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  description VARCHAR,
  monthly_price INTEGER NOT NULL,
  yearly_price INTEGER NOT NULL,
  features JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2) pro plan (15,400/mo, 10% off yearly = 166,320)
INSERT INTO subscription_plans (id, name, description, monthly_price, yearly_price)
VALUES (
  'pro',
  'Pro',
  '2000 credits/mo for AI music, streaming, upload',
  15400,
  166320
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, monthly_price = EXCLUDED.monthly_price, yearly_price = EXCLUDED.yearly_price;

-- 3) premium plan (33,000/mo, 10% off yearly = 356,400)
INSERT INTO subscription_plans (id, name, description, monthly_price, yearly_price)
VALUES (
  'premium',
  'Premium',
  '3000 credits, music video creation, premium badge',
  33000,
  356400
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, monthly_price = EXCLUDED.monthly_price, yearly_price = EXCLUDED.yearly_price;

-- 4) payments 테이블
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL,
  order_id VARCHAR NOT NULL UNIQUE,
  payment_key VARCHAR,
  amount INTEGER NOT NULL,
  status VARCHAR DEFAULT 'pending',
  plan VARCHAR,
  billing_period VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 5) ai_music_usage (Free 플랜 월별 AI 음악 생성 횟수)
CREATE TABLE IF NOT EXISTS ai_music_usage (
  user_id VARCHAR NOT NULL,
  period_month VARCHAR NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, period_month)
);

-- 6) Grant to venysound (skipped on local if role does not exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'venysound') THEN
    EXECUTE 'GRANT ALL PRIVILEGES ON TABLE subscription_plans TO venysound';
    EXECUTE 'GRANT ALL PRIVILEGES ON TABLE payments TO venysound';
    EXECUTE 'GRANT ALL PRIVILEGES ON TABLE ai_music_usage TO venysound';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO venysound';
  END IF;
END $$;
