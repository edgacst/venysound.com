-- db:push로 컬럼/테이블이 삭제된 경우 복구 (음원 목록 복구용)
-- 실행: psql "$DATABASE_URL" -f deploy/restore-columns-after-db-push.sql

-- users.donation_badge 복구 (없으면 음원 목록 쿼리 실패)
ALTER TABLE users ADD COLUMN IF NOT EXISTS donation_badge VARCHAR;

-- notifications.payload 복구
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payload JSONB;

-- 삭제된 테이블이 있으면 재생성 (데이터는 비어 있음, 로그인/결제는 재설정 필요)
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON sessions(expire);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  description VARCHAR,
  monthly_price INTEGER NOT NULL,
  yearly_price INTEGER NOT NULL,
  features JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  user_id VARCHAR NOT NULL,
  order_id VARCHAR NOT NULL UNIQUE,
  payment_key VARCHAR,
  amount INTEGER NOT NULL,
  status VARCHAR DEFAULT 'pending',
  plan VARCHAR,
  billing_period VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);
