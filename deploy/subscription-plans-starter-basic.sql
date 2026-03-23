-- Starter / Basic 유료 플랜 (요금제 4종: starter, basic, pro, premium)
INSERT INTO subscription_plans (id, name, description, monthly_price, yearly_price)
VALUES (
  'starter',
  'Starter',
  'AI 음악 생성 500 크레딧/월, 광고 없음',
  5000,
  54000
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price = EXCLUDED.monthly_price,
  yearly_price = EXCLUDED.yearly_price;

INSERT INTO subscription_plans (id, name, description, monthly_price, yearly_price)
VALUES (
  'basic',
  'Basic',
  'AI 음악 생성 1,000 크레딧/월, 광고 없음',
  9000,
  97200
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price = EXCLUDED.monthly_price,
  yearly_price = EXCLUDED.yearly_price;
