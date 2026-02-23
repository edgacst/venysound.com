-- 후원 뱃지 컬럼 추가
-- 뱃지 레벨: seed(씨앗) / sprout(새싹) / supporter(후원자) / sponsor(스폰서)
ALTER TABLE users ADD COLUMN IF NOT EXISTS donation_badge VARCHAR;
