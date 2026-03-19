-- music 테이블에 ai_provider 컬럼 추가 (AI 음악 생성 서비스 구분용)
ALTER TABLE music ADD COLUMN IF NOT EXISTS ai_provider TEXT;
