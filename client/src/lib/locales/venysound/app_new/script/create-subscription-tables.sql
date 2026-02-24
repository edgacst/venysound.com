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

-- 2) premium 플랜 행 (이미 있으면 무시)
INSERT INTO subscription_plans (id, name, description, monthly_price, yearly_price)
VALUES (
  'premium',
  'Premium',
  '모든 기능 무제한',
  6600,
  60000
)
ON CONFLICT (id) DO NOTHING;

-- 3) payments 테이블
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

-- 4) venysound 사용자에게 권한 부여 (postgres로 실행 시)
GRANT ALL PRIVILEGES ON TABLE subscription_plans TO venysound;
GRANT ALL PRIVILEGES ON TABLE payments TO venysound;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO venysound;
