-- 라디오 채널 재생 큐 스냅샷 (DJ 브라우저 종료 후에도 서버가 다음 곡 자동 진행)
-- 실행: npm run db:deploy

ALTER TABLE radio_channels ADD COLUMN IF NOT EXISTS playlist_snapshot JSONB;
