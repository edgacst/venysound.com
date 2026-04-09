import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { users, aiMusicUsage } from "@shared/models/auth";
import {
  isUserPaidSubscriptionActive,
  sumActivePaidAiMusicMonthlyWonBudget,
  getAiMusicUsagePeriodKey,
  calendarMonthKeyUtc,
  AI_MUSIC_WON_PER_TRACK,
} from "@shared/subscription-entitlements";
import {
  appendAiWalletGrant,
  deductAiWalletFifo,
  parseAiWallet,
  pruneAiWallet,
  sumAiWallet,
  type AiWalletChunk,
} from "@shared/subscription-ai-wallet";

export type PaidAiWalletState = {
  walletSum: number;
  periodConsumed: number;
  periodKey: string;
  monthlyGrant: number;
  /** UI·한도 표시: 잔액 + 이번 기간 사용 누적 (= limit 역할) */
  limitDisplay: number;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function performSubscriptionAiWalletSync(
  tx: Tx,
  u: typeof users.$inferSelect,
  userId: string,
  now: Date,
): Promise<PaidAiWalletState | null> {
  if (!isUserPaidSubscriptionActive(u, now)) return null;

  const desiredKey = getAiMusicUsagePeriodKey(u, u.role ?? null, now);
  const monthlyGrant = sumActivePaidAiMusicMonthlyWonBudget(u, now);
  let wallet = pruneAiWallet(parseAiWallet(u.subscriptionAiWallet), now);
  let consumed = Math.max(0, u.subscriptionAiPeriodConsumedWon ?? 0);
  const curKey = u.subscriptionAiPeriodKey ?? null;

  if (curKey === desiredKey) {
    /** 구독 키는 맞는데 consumed 만 0으로 고착된 경우: 레거시 ai_music_usage(달력 YYYY-MM)에 원화 누적만 있는 케이스 복구 */
    if (consumed === 0 && desiredKey.startsWith("sub:")) {
      const calKey = calendarMonthKeyUtc(now);
      const [usageCal] = await tx
        .select()
        .from(aiMusicUsage)
        .where(and(eq(aiMusicUsage.userId, userId), eq(aiMusicUsage.periodMonth, calKey)));
      const c = usageCal?.count ?? 0;
      if (c >= AI_MUSIC_WON_PER_TRACK) {
        consumed = Math.min(c, monthlyGrant * 3);
        await tx
          .update(users)
          .set({ subscriptionAiPeriodConsumedWon: consumed, updatedAt: new Date() })
          .where(eq(users.id, userId));
      }
    }
    if (JSON.stringify(wallet) !== JSON.stringify(parseAiWallet(u.subscriptionAiWallet))) {
      await tx
        .update(users)
        .set({ subscriptionAiWallet: wallet, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }
    const sum = sumAiWallet(wallet);
    return {
      walletSum: sum,
      periodConsumed: consumed,
      periodKey: desiredKey,
      monthlyGrant,
      limitDisplay: sum + consumed,
    };
  }

  if (curKey === null) {
    const [usageDesired] = await tx
      .select()
      .from(aiMusicUsage)
      .where(and(eq(aiMusicUsage.userId, userId), eq(aiMusicUsage.periodMonth, desiredKey)));
    let usedLegacy = Math.max(0, usageDesired?.count ?? 0);
    /** sub: 키로는 ai_music_usage 행이 없고 달력 월 행에만 원화 누적이 있는 레거시(배포 후 consumed 0 초기화 방지) */
    if (usedLegacy === 0 && desiredKey.startsWith("sub:")) {
      const calKey = calendarMonthKeyUtc(now);
      const [usageCal] = await tx
        .select()
        .from(aiMusicUsage)
        .where(and(eq(aiMusicUsage.userId, userId), eq(aiMusicUsage.periodMonth, calKey)));
      const c = usageCal?.count ?? 0;
      if (c >= AI_MUSIC_WON_PER_TRACK) {
        usedLegacy = Math.min(c, monthlyGrant * 3);
      }
    }
    const startWon = Math.max(0, monthlyGrant - usedLegacy);
    wallet = appendAiWalletGrant(wallet, startWon, now);
    consumed = usedLegacy;
  } else {
    wallet = appendAiWalletGrant(wallet, monthlyGrant, now);
    /** 집계 키가 달력 → 월간 구독 sub: 로 바뀐 첫 동기화: 옛 YYYY-MM 행의 원화 누적을 이월 */
    let carried = 0;
    if (/^\d{4}-\d{2}$/.test(curKey) && desiredKey.startsWith("sub:")) {
      const [legacyRow] = await tx
        .select()
        .from(aiMusicUsage)
        .where(and(eq(aiMusicUsage.userId, userId), eq(aiMusicUsage.periodMonth, curKey)));
      const c = legacyRow?.count ?? 0;
      if (c >= AI_MUSIC_WON_PER_TRACK) {
        carried = Math.min(c, monthlyGrant * 3);
      }
    }

    const preserved = Math.max(0, u.subscriptionAiPeriodConsumedWon ?? 0);
    const isCalKey = (k: string | null): k is string => !!k && /^\d{4}-\d{2}$/.test(k);
    const parseSubMs = (k: string | null): number | null => {
      if (!k?.startsWith("sub:")) return null;
      const n = Number(k.slice(4));
      return Number.isFinite(n) ? n : null;
    };
    const oldSubMs = parseSubMs(curKey);
    const newSubMs = parseSubMs(desiredKey);
    /** 구독 만료 시각(ms)이 바뀌면 새 결제·갱신 구간 → 사용 누적은 0부터 */
    const subPeriodRenewed =
      oldSubMs != null && newSubMs != null && oldSubMs !== newSubMs;
    /** 연간 등 달력 버킷이 월이 바뀐 경우 → 새 달이므로 누적 리셋 */
    const calendarMonthRolled =
      isCalKey(curKey) && isCalKey(desiredKey) && curKey !== desiredKey;

    if (calendarMonthRolled || subPeriodRenewed) {
      consumed = carried;
    } else if (isCalKey(curKey) && desiredKey.startsWith("sub:")) {
      consumed = Math.max(carried, preserved);
    } else if (curKey?.startsWith("sub:") && isCalKey(desiredKey)) {
      /** 월간(sub:) → 연간(달력) 등: ai_music_usage 에 sub 행이 거의 없으므로 users 컬럼이 진실 */
      const [subUsageRow] = await tx
        .select()
        .from(aiMusicUsage)
        .where(and(eq(aiMusicUsage.userId, userId), eq(aiMusicUsage.periodMonth, curKey)));
      const c = subUsageRow?.count ?? 0;
      const fromUsage =
        c >= AI_MUSIC_WON_PER_TRACK ? Math.min(c, monthlyGrant * 3) : 0;
      consumed = Math.max(carried, preserved, fromUsage);
    } else {
      /** 키만 바뀌고 위에 해당하지 않으면(배포·규칙 변경 등) DB 누적을 잃지 않음 */
      consumed = Math.max(carried, preserved);
    }
  }

  await tx
    .update(users)
    .set({
      subscriptionAiWallet: wallet,
      subscriptionAiPeriodKey: desiredKey,
      subscriptionAiPeriodConsumedWon: consumed,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  const sum = sumAiWallet(wallet);
  return {
    walletSum: sum,
    periodConsumed: consumed,
    periodKey: desiredKey,
    monthlyGrant,
    limitDisplay: sum + consumed,
  };
}

/**
 * 활성 유료 구독자만: 기간 키 동기화, 만료 prune, 기간 전환 시 월 정기 충전(이월분은 지갑에 잔존).
 * 최초(null): 레거시 ai_music_usage 기준 잔여를 지갑으로 이관.
 */
export async function syncSubscriptionAiWalletForPaidUser(userId: string, now: Date): Promise<PaidAiWalletState | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row || !isUserPaidSubscriptionActive(row, now)) return null;

  return await db.transaction(async (tx) => {
    const [u] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!u || !isUserPaidSubscriptionActive(u, now)) return null;
    return performSubscriptionAiWalletSync(tx, u, userId, now);
  });
}

export async function deductSubscriptionAiWallet(userId: string, won: number, now: Date): Promise<boolean> {
  const n = Math.floor(won);
  if (n <= 0) return true;

  return await db.transaction(async (tx) => {
    const [u] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!u || !isUserPaidSubscriptionActive(u, now)) return false;

    const synced = await performSubscriptionAiWalletSync(tx, u, userId, now);
    if (!synced) return false;

    const [u2] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u2) return false;
    let wallet = pruneAiWallet(parseAiWallet(u2.subscriptionAiWallet), now);
    const next = deductAiWalletFifo(wallet, n, now);
    if (!next) return false;

    await tx
      .update(users)
      .set({
        subscriptionAiWallet: next,
        subscriptionAiPeriodConsumedWon: Math.max(0, (u2.subscriptionAiPeriodConsumedWon ?? 0) + n),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    return true;
  });
}

/**
 * 관리자: 활성 유료 구독자의 이번 기간 AI 사용(원) 절대값 설정. 잔액(지갑)은 총액 보존.
 */
export async function adminSetSubscriptionAiPeriodConsumedWon(userId: string, usedWon: number, now: Date): Promise<boolean> {
  const used = Math.max(0, Math.floor(usedWon));
  return await db.transaction(async (tx) => {
    const [u] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!u || !isUserPaidSubscriptionActive(u, now)) return false;

    const synced = await performSubscriptionAiWalletSync(tx, u, userId, now);
    if (!synced) return false;

    const [u2] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u2) return false;
    let wallet = pruneAiWallet(parseAiWallet(u2.subscriptionAiWallet), now);
    const sum = sumAiWallet(wallet);
    const consumed = Math.max(0, u2.subscriptionAiPeriodConsumedWon ?? 0);
    const total = sum + consumed;
    const nextConsumed = Math.min(used, total);
    const nextRemaining = Math.max(0, total - nextConsumed);
    const nextWallet: AiWalletChunk[] =
      nextRemaining > 0 ? [{ won: nextRemaining, creditedAt: now.toISOString() }] : [];

    await tx
      .update(users)
      .set({
        subscriptionAiWallet: nextWallet,
        subscriptionAiPeriodConsumedWon: nextConsumed,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    return true;
  });
}
