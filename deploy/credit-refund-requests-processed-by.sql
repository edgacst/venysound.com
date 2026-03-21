-- 기존 DB: 승인/반려 처리 관리자 id (감사·CS 근거)
ALTER TABLE credit_refund_requests
  ADD COLUMN IF NOT EXISTS processed_by_user_id TEXT REFERENCES users(id);
