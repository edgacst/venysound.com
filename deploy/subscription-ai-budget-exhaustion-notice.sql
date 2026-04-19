-- 구독 AI 예산 소진 시 인앱+메일 1회 발송용 중복 방지 키 (기간별 마커 문자열)
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_ai_budget_exhaustion_notice_key varchar;
