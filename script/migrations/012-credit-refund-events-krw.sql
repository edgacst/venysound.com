-- append-only 환불 감사 로그 + 원화 환불 스냅샷 컬럼 (배포 자동: deploy/credit-refund-events-krw.sql, npm run db:deploy)
CREATE TABLE IF NOT EXISTS credit_refund_events (
  id SERIAL PRIMARY KEY,
  refund_request_id INTEGER NOT NULL REFERENCES credit_refund_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id),
  metadata JSONB,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_refund_events_request ON credit_refund_events(refund_request_id);
CREATE INDEX IF NOT EXISTS idx_credit_refund_events_created ON credit_refund_events(created_at);

ALTER TABLE credit_refund_requests ADD COLUMN IF NOT EXISTS krw_refund_amount_won INTEGER;
ALTER TABLE credit_refund_requests ADD COLUMN IF NOT EXISTS krw_refund_completed_at TIMESTAMPTZ;
ALTER TABLE credit_refund_requests ADD COLUMN IF NOT EXISTS krw_refund_note TEXT;
ALTER TABLE credit_refund_requests ADD COLUMN IF NOT EXISTS krw_refund_recorded_by_user_id TEXT REFERENCES users(id);
