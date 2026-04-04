-- 가입 퍼널 등 전환 이벤트 (관리자 통계용). npm run db:deploy 로 적용.
CREATE TABLE IF NOT EXISTS analytics_conversion_events (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visitor_key TEXT NOT NULL,
  event_name TEXT NOT NULL,
  meta JSONB
);

CREATE INDEX IF NOT EXISTS analytics_conversion_events_created_at_idx
  ON analytics_conversion_events (created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_conversion_events_event_created_idx
  ON analytics_conversion_events (event_name, created_at DESC);
