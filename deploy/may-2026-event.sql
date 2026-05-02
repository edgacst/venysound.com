-- 5월 신규가입 이벤트: AI 생성 전용 프로모 잔액 + 가입 신청 테이블
ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_ai_credits_won INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_ai_credits_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS may_2026_event_applications (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  applicant_message TEXT,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS idx_may2026_event_apps_status ON may_2026_event_applications(status);
CREATE INDEX IF NOT EXISTS idx_may2026_event_apps_user ON may_2026_event_applications(user_id);
