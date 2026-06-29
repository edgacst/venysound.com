/** 유료 구독 플랜 ID (DB subscription_plans.id 와 동일) */
export const PAID_SUBSCRIPTION_TIER_IDS = ["starter", "basic", "pro", "premium"] as const;
export type PaidSubscriptionTierId = (typeof PAID_SUBSCRIPTION_TIER_IDS)[number];

export function isPaidSubscriptionTierId(tier: string | null | undefined): boolean {
  if (tier == null) return false;
  const n = String(tier).trim().toLowerCase();
  return PAID_SUBSCRIPTION_TIER_IDS.includes(n as PaidSubscriptionTierId);
}

/**
 * 음원 카드·상세 API용 업로더 티어 문자열.
 * DB `subscription_tier`가 `starter`/`basic`이거나, 관리자인데 컬럼이 `free`로 남아 있어도
 * 클라이언트(`pro` | `premium` | `admin`만 인식)에서 후원·벨 UI가 켜지도록 정규화합니다.
 * 구독 만료일은 쓰지 않으므로, 호출부의 과거 만료일 계산값보다 현재 DB 티어를 우선합니다.
 */
export function apiUploaderSubscriptionTierForClient(
  isPremium: boolean,
  uploaderRole: string | null | undefined,
  dbSubscriptionTier: string | null | undefined,
): "free" | "admin" | "pro" | "premium" {
  const role = String(uploaderRole ?? "").trim().toLowerCase();
  if (role === "admin") return "admin";
  const t = String(dbSubscriptionTier ?? "").trim().toLowerCase();
  if (!isPremium && !isPaidSubscriptionTierId(t)) return "free";
  if (t === "premium") return "premium";
  if (isPaidSubscriptionTierId(t)) return "pro";
  return isPremium ? "pro" : "free";
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
 * 회원 청구·입금·토스 결제 **총액**(원). 공급가에 부가세 10%를 더한 금액(반올림).
 * 예: Basic 월 공급가 9,000 → 청구 9,900.
 */
export function subscriptionTotalVatInclusiveWon(supplyPriceWon: number): number {
  return Math.round(Number(supplyPriceWon) * 1.1);
}
