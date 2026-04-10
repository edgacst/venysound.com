-- 홈 화면 라이브 티커 커스텀 문구 (방장 입력, 없으면 기존 자동 생성)
ALTER TABLE radio_channels ADD COLUMN IF NOT EXISTS home_ticker_text text;
