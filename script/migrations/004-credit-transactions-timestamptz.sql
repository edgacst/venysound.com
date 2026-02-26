-- credit_transactions.created_at 을 TIMESTAMPTZ 로 변경 (UTC 저장으로 크레딧 지급 시간 표시 일치)
-- 기존 데이터: INSERT 당시 DB 서버 타임존으로 해석됨. (서버가 UTC면 'UTC', 한국이면 'Asia/Seoul' 등)
-- 이미 적용했으면 건너뛰기.

-- 옵션 A: DB 서버가 UTC인 경우
-- ALTER TABLE credit_transactions ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

-- 옵션 B: DB 서버 타임존 그대로 사용 (일반적으로 권장)
ALTER TABLE credit_transactions ALTER COLUMN created_at TYPE TIMESTAMPTZ;
