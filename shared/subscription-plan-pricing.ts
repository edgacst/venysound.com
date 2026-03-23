/** 유료 구독 플랜 ID (DB subscription_plans.id 와 동일) */
export const PAID_SUBSCRIPTION_TIER_IDS = ["starter", "basic", "pro", "premium"] as const;
export type PaidSubscriptionTierId = (typeof PAID_SUBSCRIPTION_TIER_IDS)[number];

export function isPaidSubscriptionTierId(tier: string | null | undefined): boolean {
  return tier != null && PAID_SUBSCRIPTION_TIER_IDS.includes(tier as PaidSubscriptionTierId);
}

/** 구독 플랜 공급가(부가세 전, 원) — DB 오류·테스트 값 보정 시 사용. 연간 = 월×12×90%(할인) */
export const SUBSCRIPTION_PLAN_FALLBACK: Record<
  PaidSubscriptionTierId,
  { monthly: number; yearly: number }
> = {
  starter: { monthly: 5000, yearly: 54000 },
  basic: { monthly: 9000, yearly: 97200 },
  pro: { monthly: 13500, yearly: 145800 },
  premium: { monthly: 19000, yearly: 205200 },
};

/**
 * 월 금액이 비정상적으로 낮으면(로컬 DB 테스트 행 등) 표준 가격으로 대체합니다.
 */
export function normalizeSubscriptionPlanPrices(
  planId: PaidSubscriptionTierId,
  monthly: number | null | undefined,
  yearly: number | null | undefined,
): { monthly: number; yearly: number } {
  const fb = SUBSCRIPTION_PLAN_FALLBACK[planId];
  const m = monthly ?? fb.monthly;
  const y = yearly ?? fb.yearly;
  if (planId === "starter" && m < 4500) return { ...fb };
  if (planId === "basic" && m < 8000) return { ...fb };
  if (planId === "pro" && m < 12000) return { ...fb };
  if (planId === "premium" && m < 17000) return { ...fb };
  return { monthly: m, yearly: y };
}

/** 공급가(원)에 부가세 10%를 더한 입금·결제 총액(원, 반올림). DB·payments.amount·안내 문구와 동일하게 사용 */
export function subscriptionTotalVatInclusiveWon(supplyPriceWon: number): number {
  return Math.round(supplyPriceWon * 1.1);
}
