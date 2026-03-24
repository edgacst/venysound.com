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
  pro: { monthly: 15000, yearly: 162000 },
  premium: { monthly: 22000, yearly: 237600 },
};

/**
 * 요금제 화면·계좌이체·Toss Pro 구독 청구에 쓰는 **공급가(월/연)**.
 * DB `subscription_plans` 금액과 어긋나면 옛 가격이 노출되므로, **이 표(SUBSCRIPTION_PLAN_FALLBACK)를 단일 기준**으로 항상 사용합니다.
 * DB 행은 관리·마이그레이션용으로 맞춰 두는 것을 권장합니다.
 */
export function normalizeSubscriptionPlanPrices(
  planId: PaidSubscriptionTierId,
  _monthly?: number | null,
  _yearly?: number | null,
): { monthly: number; yearly: number } {
  return { ...SUBSCRIPTION_PLAN_FALLBACK[planId] };
}

/** 공급가(원)에 부가세 10%를 더한 입금·결제 총액(원, 반올림). DB·payments.amount·안내 문구와 동일하게 사용 */
export function subscriptionTotalVatInclusiveWon(supplyPriceWon: number): number {
  return Math.round(supplyPriceWon * 1.1);
}
