-- analytics_visits에 광고/통계용 컬럼 추가 (기존 테이블이 있을 때 한 번 실행)
-- psql "$DATABASE_URL" -f deploy/alter-analytics-visits-add-columns.sql

ALTER TABLE analytics_visits ADD COLUMN IF NOT EXISTS ip_hash TEXT;
ALTER TABLE analytics_visits ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE analytics_visits ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE analytics_visits ADD COLUMN IF NOT EXISTS device_type TEXT;
ALTER TABLE analytics_visits ADD COLUMN IF NOT EXISTS referer_domain TEXT;
ALTER TABLE analytics_visits ADD COLUMN IF NOT EXISTS utm_source TEXT;
