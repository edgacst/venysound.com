-- 활동 알림 이메일 수신 여부 (댓글·팔로·쪽지·좋아요 등)
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_activity_email boolean NOT NULL DEFAULT true;
