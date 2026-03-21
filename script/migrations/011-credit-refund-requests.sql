-- 크레딧 환불 신청 (관리자 승인 시 credit_transactions 에 refund 기록 + 잔액 차감)
-- 배포 자동 적용: deploy/credit-refund-requests.sql (npm run db:deploy)
CREATE TABLE IF NOT EXISTS credit_refund_requests (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  credits_amount INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processed_by_user_id TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_credit_refund_requests_user ON credit_refund_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_refund_requests_status ON credit_refund_requests(status);
