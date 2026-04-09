import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { users, aiMusicUsage } from "@shared/models/auth";
import {
  isUserPaidSubscriptionActive,
  sumActivePaidAiMusicMonthlyWonBudget,
  getAiMusicUsagePeriodKey,
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
    const [usage] = await tx
      .select()
      .from(aiMusicUsage)
      .where(and(eq(aiMusicUsage.userId, userId), eq(aiMusicUsage.periodMonth, desiredKey)));
    const usedLegacy = Math.max(0, usage?.count ?? 0);
    const startWon = Math.max(0, monthlyGrant - usedLegacy);
    wallet = appendAiWalletGrant(wallet, startWon, now);
    consumed = usedLegacy;
  } else {
    wallet = appendAiWalletGrant(wallet, monthlyGrant, now);
    consumed = 0;
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
