-- notify_new_music_email, notify_new_music_push 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_new_music_email boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_new_music_push boolean NOT NULL DEFAULT true;
