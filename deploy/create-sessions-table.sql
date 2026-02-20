-- venysound 세션 테이블 생성
-- DB 복원 후, 세션 테이블이 없을 경우 이 스크립트를 실행하세요.
-- 실행 방법: psql $DATABASE_URL -f create-sessions-table.sql

CREATE TABLE IF NOT EXISTS "sessions" (
  "sid"    varchar   NOT NULL COLLATE "default",
  "sess"   json      NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX IF NOT EXISTS "IDX_sessions_expire" ON "sessions" ("expire");
