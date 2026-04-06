import {
  isPaidSubscriptionTierId,
  type PaidSubscriptionTierId,
  PAID_SUBSCRIPTION_TIER_IDS,
} from "./subscription-plan-pricing";

/** Free 플랜 월 AI 곡 수 상한 */
export const FREE_AI_MUSIC_LIMIT_PER_MONTH = 2;

/** AI 음악 1회 생성 시 지갑에서 차감하는 원(구독 만료 후 유료 등급 표시만 남은 경우 등) */
export const AI_MUSIC_WON_PER_TRACK = 150;

/** @deprecated AI_MUSIC_WON_PER_TRACK 사용 */
export const AI_MUSIC_CREDITS_PER_TRACK = AI_MUSIC_WON_PER_TRACK;

/**
 * 유료 플랜(활성) 월간 AI 사용 예산(원). 구독에 포함된 분량(구 500~2000 크레딧 × 7.5원).
 */
export const AI_MUSIC_MONTHLY_WON_BUDGET_BY_TIER: Record<PaidSubscriptionTierId, number> = {
  starter: 3750,
  basic: 7500,
  pro: 11250,
  premium: 15000,
};

const TIER_RANK: Record<PaidSubscriptionTierId, number> = {
  starter: 1,
  basic: 2,
  pro: 3,
  premium: 4,
};

function parseIsoDate(iso: string): Date | null {
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
};

export function isUserPaidSubscriptionActive(user: UserSubscriptionFields | undefined, now: Date): boolean {
  if (!user) return false;
  const view = buildEntitlementsView(user.subscriptionEntitlements, user.subscriptionTier, user.subscriptionExpiresAt, now);
  const pruned = pruneExpiredEntitlements(view, now);
  return getActivePaidTierIds(pruned, now).length > 0;
}

/** 활성 유료 플랜이 있으면 각 tier 월 AI 예산(원)을 합산 */
export function sumActivePaidAiMusicMonthlyWonBudget(user: UserSubscriptionFields | undefined, now: Date): number {
  const view = buildEntitlementsView(user?.subscriptionEntitlements, user?.subscriptionTier, user?.subscriptionExpiresAt, now);
  const pruned = pruneExpiredEntitlements(view, now);
  const active = getActivePaidTierIds(pruned, now);
  if (active.length === 0) return FREE_AI_MUSIC_LIMIT_PER_MONTH;
  return active.reduce((sum, t) => sum + AI_MUSIC_MONTHLY_WON_BUDGET_BY_TIER[t], 0);
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
  return Number.MAX_SAFE_INTEGER;
}

/** UI·DB 레거시 컬럼용: 최고 tier + 활성 tier 중 가장 늦은 만료 */
export function computeDisplayedSubscriptionFromEntitlements(
  stored: unknown,
  legacyTier: string | null | undefined,
  legacyExp: Date | null | undefined,
  now: Date,
): {
  subscriptionEntitlements: Record<string, string>;
  subscriptionTier: string;
  subscriptionExpiresAt: Date | null;
} {
  const view = buildEntitlementsView(stored, legacyTier, legacyExp, now);
  const pruned = pruneExpiredEntitlements(view, now);
  const active = getActivePaidTierIds(pruned, now);
  if (active.length === 0) {
    return { subscriptionEntitlements: pruned, subscriptionTier: "free", subscriptionExpiresAt: null };
  }
  return {
    subscriptionEntitlements: pruned,
    subscriptionTier: highestPaidTier(active),
    subscriptionExpiresAt: maxExpiryAmongTiers(pruned, active),
  };
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
  const view = buildEntitlementsView(user.subscriptionEntitlements, user.subscriptionTier, user.subscriptionExpiresAt, now);
  const pruned = pruneExpiredEntitlements(view, now);
  return getActivePaidTierIds(pruned, now).includes("premium");
}

/** @deprecated AI_MUSIC_MONTHLY_WON_BUDGET_BY_TIER */
export const AI_MUSIC_MONTHLY_CREDITS_BY_TIER = AI_MUSIC_MONTHLY_WON_BUDGET_BY_TIER;
