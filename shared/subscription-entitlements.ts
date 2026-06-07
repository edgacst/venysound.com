import {
  isPaidSubscriptionTierId,
  type PaidSubscriptionTierId,
  PAID_SUBSCRIPTION_TIER_IDS,
  SUBSCRIPTION_PLAN_FALLBACK,
} from "./subscription-plan-pricing";

/** Free 플랜 월 AI 곡 수 상한 */
export const FREE_AI_MUSIC_LIMIT_PER_MONTH = 2;

/** AI 음악 1회 생성 시 지갑에서 차감하는 원(구독 만료 후 유료 등급 표시만 남은 경우 등) */
export const AI_MUSIC_WON_PER_TRACK = 150;

/** @deprecated AI_MUSIC_WON_PER_TRACK 사용 */
export const AI_MUSIC_CREDITS_PER_TRACK = AI_MUSIC_WON_PER_TRACK;

/**
 * 유료 플랜(활성) 월간 AI 사용 예산(원). **구독 월 공급가(부가세 제외)** 와 동일.
 * 회원 청구액은 공급가+10%이나, 음악 생성에 쓰는 월 한도는 공급가 분만 반영.
 */
export const AI_MUSIC_MONTHLY_WON_BUDGET_BY_TIER: Record<PaidSubscriptionTierId, number> = {
  starter: SUBSCRIPTION_PLAN_FALLBACK.starter.monthly,
  basic: SUBSCRIPTION_PLAN_FALLBACK.basic.monthly,
  pro: SUBSCRIPTION_PLAN_FALLBACK.pro.monthly,
  premium: SUBSCRIPTION_PLAN_FALLBACK.premium.monthly,
};

const TIER_RANK: Record<PaidSubscriptionTierId, number> = {
  starter: 1,
  basic: 2,
  pro: 3,
  premium: 4,
};

export function parseIsoDate(iso: string): Date | null {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** DB jsonb → tier → 만료 시각 ISO 문자열 */
export function parseEntitlementsMap(raw: unknown): Record<string, string> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

/**
 * 저장된 entitlements + 레거시 subscription_tier/expires_at 를 합쳐 단일 맵으로 본다.
 * 레거시만 있는 기존 회원은 json 이 비어 있을 때 tier 한 줄로 복원된다.
 */
export function buildEntitlementsView(
  stored: unknown,
  legacyTier: string | null | undefined,
  legacyExp: Date | null | undefined,
  now: Date,
): Record<string, string> {
  const map = { ...parseEntitlementsMap(stored) };
  const lt = legacyTier ?? "free";
  if (!isPaidSubscriptionTierId(lt) || !legacyExp) return map;
  const leg = new Date(legacyExp);
  if (leg <= now) return map;
  const iso = leg.toISOString();
  const existing = map[lt] ? parseIsoDate(map[lt]) : null;
  if (!existing || leg > existing) map[lt] = iso;
  return map;
}

export function pruneExpiredEntitlements(map: Record<string, string>, now: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    const d = parseIsoDate(v);
    if (d && d > now) out[k] = v;
  }
  return out;
}

export function getActivePaidTierIds(map: Record<string, string>, now: Date): PaidSubscriptionTierId[] {
  const ids: PaidSubscriptionTierId[] = [];
  for (const id of PAID_SUBSCRIPTION_TIER_IDS) {
    const v = map[id];
    if (!v) continue;
    const d = parseIsoDate(v);
    if (d && d > now) ids.push(id);
  }
  return ids;
}

export function highestPaidTier(active: PaidSubscriptionTierId[]): PaidSubscriptionTierId {
  return active.reduce((a, b) => (TIER_RANK[b] > TIER_RANK[a] ? b : a), active[0]!);
}

export function maxExpiryAmongTiers(map: Record<string, string>, tiers: PaidSubscriptionTierId[]): Date | null {
  if (tiers.length === 0) return null;
  let max = 0;
  for (const t of tiers) {
    const d = parseIsoDate(map[t] ?? "");
    if (d) max = Math.max(max, d.getTime());
  }
  return max ? new Date(max) : null;
}

/** 동일 tier 재결제 시 더 늦은 만료만 반영 */
export function mergeEntitlementExpiry(
  map: Record<string, string>,
  tier: PaidSubscriptionTierId,
  expiresAt: Date,
): Record<string, string> {
  const next = { ...map };
  const prev = next[tier] ? parseIsoDate(next[tier]) : null;
  if (!prev || expiresAt > prev) next[tier] = expiresAt.toISOString();
  return next;
}

export type UserSubscriptionFields = {
  subscriptionTier?: string | null;
  subscriptionExpiresAt?: Date | null;
  subscriptionEntitlements?: unknown;
  subscriptionAiWallet?: unknown;
  subscriptionAiPeriodKey?: string | null;
  /** payments.billingPeriod 등에서 온 값: `monthly` | `yearly` (계좌이체·토스 갱신 시 설정) */
  subscriptionPlan?: string | null;
};

export function sumRemainingSubscriptionAiWallet(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  return raw.reduce((sum, item) => {
    if (!item || typeof item !== "object") return sum;
    const won = Math.floor(Number((item as { won?: unknown }).won));
    return Number.isFinite(won) && won > 0 ? sum + won : sum;
  }, 0);
}

export function getWalletBackedPaidTierId(user: UserSubscriptionFields | undefined): PaidSubscriptionTierId | null {
  const tier = String(user?.subscriptionTier ?? "free").trim().toLowerCase();
  if (!isPaidSubscriptionTierId(tier)) return null;
  return sumRemainingSubscriptionAiWallet(user?.subscriptionAiWallet) > 0 ? (tier as PaidSubscriptionTierId) : null;
}

export function isUserPaidSubscriptionActive(user: UserSubscriptionFields | undefined, now: Date): boolean {
  if (!user) return false;
  return getWalletBackedPaidTierId(user) != null;
}

/** 활성 유료 플랜이 있으면 각 tier 월 AI 예산(원)을 합산 */
export function sumActivePaidAiMusicMonthlyWonBudget(user: UserSubscriptionFields | undefined, now: Date): number {
  const walletTier = getWalletBackedPaidTierId(user);
  if (walletTier) return AI_MUSIC_MONTHLY_WON_BUDGET_BY_TIER[walletTier];
  const tier = String(user?.subscriptionTier ?? "free").trim().toLowerCase();
  return isPaidSubscriptionTierId(tier)
    ? AI_MUSIC_MONTHLY_WON_BUDGET_BY_TIER[tier as PaidSubscriptionTierId]
    : FREE_AI_MUSIC_LIMIT_PER_MONTH;
}

/** @deprecated sumActivePaidAiMusicMonthlyWonBudget */
export const sumActivePaidAiMusicMonthlyCredits = sumActivePaidAiMusicMonthlyWonBudget;

/**
 * AI 월 한도(관리자 -1). 유료 활성: 합산 원화 예산. 무료: 곡 수 한도.
 * 만료된 유료 표시만 남은 경우 월 한도는 적용하지 않음(실질 차단은 지갑 원화).
 */
export function getAiMusicMonthlyUsageLimit(
  user: UserSubscriptionFields | undefined,
  role: string | null | undefined,
  now: Date,
): number {
  if (role === "admin") return -1;
  if (isUserPaidSubscriptionActive(user, now)) {
    return sumActivePaidAiMusicMonthlyWonBudget(user, now);
  }
  if ((user?.subscriptionTier ?? "free") === "free") return FREE_AI_MUSIC_LIMIT_PER_MONTH;
  return FREE_AI_MUSIC_LIMIT_PER_MONTH;
}

/** AI 집계·레거시 ai_music_usage 행과 맞추기 위해 export */
export function calendarMonthKeyUtc(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * `ai_music_usage.period_month` 집계 키.
 * - Free·관리자: 달력 `YYYY-MM`
 * - 유료·연간: 달력 `YYYY-MM` (구독 유효 기간 안에서 매달 예산 리셋 — 연 1회 결제라도 월 단위 혜택)
 * - 유료·월간(또는 billing 미설정 레거시): `sub:<구독만료 시각 ms>` — **한 번 결제한 구독 기간 동안** 달이 바뀌어도 한도 유지, 재결제·만료 후 신규 시에만 리셋
 */
export function getAiMusicUsagePeriodKey(
  user: UserSubscriptionFields | undefined,
  role: string | null | undefined,
  now: Date,
): string {
  const cal = calendarMonthKeyUtc(now);
  if (role === "admin") return cal;
  if (!isUserPaidSubscriptionActive(user, now)) return cal;

  const walletTier = getWalletBackedPaidTierId(user);
  if (walletTier) return `wallet:${walletTier}`;
  return cal;
}

/** UI·DB 레거시 컬럼용: 최고 tier + 활성 tier 중 가장 늦은 만료 */
export function computeDisplayedSubscriptionFromEntitlements(
  stored: unknown,
  legacyTier: string | null | undefined,
  legacyExp: Date | null | undefined,
  now: Date,
  subscriptionAiWallet?: unknown,
): {
  subscriptionEntitlements: Record<string, string>;
  subscriptionTier: string;
  subscriptionExpiresAt: Date | null;
} {
  const walletTier = getWalletBackedPaidTierId({ subscriptionTier: legacyTier, subscriptionAiWallet });
  if (walletTier) {
    return { subscriptionEntitlements: {}, subscriptionTier: walletTier, subscriptionExpiresAt: null };
  }
  return { subscriptionEntitlements: {}, subscriptionTier: "free", subscriptionExpiresAt: null };
}

export function subscriptionRowNeedsSync(
  user: UserSubscriptionFields,
  now: Date,
): {
  subscriptionEntitlements: Record<string, string>;
  subscriptionTier: string;
  subscriptionExpiresAt: Date | null;
  needsWrite: boolean;
} {
  const computed = computeDisplayedSubscriptionFromEntitlements(
    user.subscriptionEntitlements,
    user.subscriptionTier,
    user.subscriptionExpiresAt,
    now,
    user.subscriptionAiWallet,
  );
  const storedMap = parseEntitlementsMap(user.subscriptionEntitlements);
  const jsonSame = JSON.stringify(storedMap) === JSON.stringify(computed.subscriptionEntitlements);
  const tierSame = (user.subscriptionTier ?? "free") === computed.subscriptionTier;
  const a = computed.subscriptionExpiresAt ? computed.subscriptionExpiresAt.getTime() : null;
  const b = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).getTime() : null;
  const expSame = a === b;
  const needsWrite = !jsonSame || !tierSame || !expSame;
  return { ...computed, needsWrite };
}

/** 악보 PDF 등: 활성 premium entitlement 또는 레거시 premium+만료 */
export function hasActivePremiumSubscription(
  user: (UserSubscriptionFields & { role?: string | null }) | undefined,
  now: Date,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return getWalletBackedPaidTierId(user) === "premium";
}

/** @deprecated AI_MUSIC_MONTHLY_WON_BUDGET_BY_TIER */
export const AI_MUSIC_MONTHLY_CREDITS_BY_TIER = AI_MUSIC_MONTHLY_WON_BUDGET_BY_TIER;
