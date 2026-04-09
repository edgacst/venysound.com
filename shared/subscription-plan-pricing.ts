/** 유료 구독 플랜 ID (DB subscription_plans.id 와 동일) */
export const PAID_SUBSCRIPTION_TIER_IDS = ["starter", "basic", "pro", "premium"] as const;
export type PaidSubscriptionTierId = (typeof PAID_SUBSCRIPTION_TIER_IDS)[number];

export function isPaidSubscriptionTierId(tier: string | null | undefined): boolean {
  if (tier == null) return false;
  const n = String(tier).trim().toLowerCase();
  return PAID_SUBSCRIPTION_TIER_IDS.includes(n as PaidSubscriptionTierId);
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

/**
 * 구독 **실제 청구·입금액**(원). `subscription_plans`에 저장된 월/연 금액(공급가 표기)과 **동일**하며,
 * 여기에 부가세 10%를 **더하지 않음** (회원은 예: Basic 월 9,000원만 입금).
 */
export function subscriptionBilledAmountWon(supplyPriceWon: number): number {
  return Math.round(Number(supplyPriceWon));
}
