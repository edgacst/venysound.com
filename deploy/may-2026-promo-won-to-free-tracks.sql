-- 5월 이벤트: users.promo_ai_credits_won 값을 「원」에서 「남은 무료 AI 출력 트랙 수」로 해석하도록 일회성 환산.
-- 기존에 40보다 큰 값(예: 3000)은 구 원 단위로 보고, 동일 생성가치(원÷75, 상한 40트랙)로 변환.
UPDATE users
SET
  promo_ai_credits_won = CASE
    WHEN COALESCE(promo_ai_credits_won, 0) > 40 THEN LEAST(40, GREATEST(0, FLOOR(promo_ai_credits_won::numeric / 75))::int)
    ELSE COALESCE(promo_ai_credits_won, 0)
  END,
  updated_at = NOW()
WHERE promo_ai_credits_expires_at IS NOT NULL
  AND COALESCE(promo_ai_credits_won, 0) > 0;
