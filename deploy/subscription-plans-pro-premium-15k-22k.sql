-- Pro / Premium 월 공급가 조정 (15,000원 / 22,000원), 연간 = 월×12×90%
UPDATE subscription_plans
SET
  monthly_price = 15000,
  yearly_price = 162000,
  description = 'AI 음악 생성 1,500 크레딧/월, 광고 없음, DistroKid 등 글로벌 유통'
WHERE id = 'pro';

UPDATE subscription_plans
SET
  monthly_price = 22000,
  yearly_price = 237600,
  description = 'AI 음악 생성 2,000 크레딧/월, 프리미엄 배지, DistroKid 등 글로벌 유통'
WHERE id = 'premium';
