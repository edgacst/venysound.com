-- 크레딧 단위 → 원화(정수 원). 1회만 적용 (app_oneoff_migrations 로 가드)

CREATE TABLE IF NOT EXISTS app_oneoff_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT NOW()
);

DO $wallet_won$
BEGIN
  IF EXISTS (SELECT 1 FROM app_oneoff_migrations WHERE name = 'wallet_credits_to_won_v1') THEN
    RETURN;
  END IF;

  UPDATE users
  SET credits = GREATEST(0, ROUND(COALESCE(credits, 0)::numeric * 7.5)::int);

  UPDATE credit_transactions
  SET amount = ROUND(amount::numeric * 7.5)::int;

  UPDATE music
  SET price = CASE
    WHEN COALESCE(price, 0) > 0 THEN GREATEST(0, ROUND(price::numeric * 7.5)::int)
    ELSE COALESCE(price, 0)
  END;

  UPDATE tips SET amount = GREATEST(0, ROUND(amount::numeric * 7.5)::int) WHERE amount IS NOT NULL;
  UPDATE purchases SET amount = GREATEST(0, ROUND(amount::numeric * 7.5)::int) WHERE amount IS NOT NULL;

  UPDATE credit_refund_requests
  SET credits_amount = GREATEST(0, ROUND(credits_amount::numeric * 7.5)::int);

  UPDATE ai_music_usage
  SET count = ROUND(count::numeric * 7.5)::int
  WHERE count > 2;

  UPDATE ai_music_generation_logs
  SET credits_charged = ROUND(credits_charged::numeric * 7.5)::int
  WHERE COALESCE(credits_charged, 0) > 0;

  INSERT INTO app_oneoff_migrations (name) VALUES ('wallet_credits_to_won_v1');
END
$wallet_won$;
