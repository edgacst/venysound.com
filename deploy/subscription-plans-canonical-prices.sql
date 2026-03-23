-- 구독 플랜 공급가(부가세 전) — 계좌이체 입금액·요금제 화면과 일치
-- (로컬에 잘못 들어간 행 보정; 연간 = 월×12×90%)
UPDATE subscription_plans
SET
  monthly_price = 5000,
  yearly_price = 54000,
  name = COALESCE(NULLIF(TRIM(name), ''), 'Starter'),
  description = 'AI 음악 생성 500 크레딧/월, 광고 없음'
WHERE id = 'starter';

UPDATE subscription_plans
SET
  monthly_price = 9000,
  yearly_price = 97200,
  name = COALESCE(NULLIF(TRIM(name), ''), 'Basic'),
  description = 'AI 음악 생성 1,000 크레딧/월, 광고 없음'
WHERE id = 'basic';

UPDATE subscription_plans
SET
  monthly_price = 13500,
  yearly_price = 145800,
  name = COALESCE(NULLIF(TRIM(name), ''), 'Pro'),
  description = 'AI 음악 생성 1,500 크레딧/월, 광고 없음'
WHERE id = 'pro';

UPDATE subscription_plans
SET
  monthly_price = 19000,
  yearly_price = 205200,
  name = COALESCE(NULLIF(TRIM(name), ''), 'Premium'),
  description = 'AI 음악 생성 2,000 크레딧/월, 프리미엄 배지'
WHERE id = 'premium';
