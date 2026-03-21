-- 동일: deploy/sensitive-email-otp.sql (수동 적용용 복사본)
CREATE TABLE IF NOT EXISTS sensitive_email_otp_challenges (
  id serial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  verify_attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sensitive_email_otp_user_purpose_created_idx
  ON sensitive_email_otp_challenges (user_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS sensitive_email_otp_expires_idx
  ON sensitive_email_otp_challenges (expires_at);
