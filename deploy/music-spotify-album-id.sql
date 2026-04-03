-- 해외(Spotify) 출시 카드 → 사이트 음원 연결용 (앨범/싱글 ID)
ALTER TABLE music ADD COLUMN IF NOT EXISTS spotify_album_id varchar(32);
