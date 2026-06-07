import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/models/auth";
import {
  getAiMusicUsagePeriodKey,
  isUserPaidSubscriptionActive,
  parseEntitlementsMap,
  sumActivePaidAiMusicMonthlyWonBudget,
} from "@shared/subscription-entitlements";
import { isPaidSubscriptionTierId } from "@shared/subscription-plan-pricing";
import {
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
  const sumBeforeSync = sumAiWallet(wallet);
  let consumed = Math.max(0, Math.floor(Number(u.subscriptionAiPeriodConsumedWon ?? 0)));
  const maxReasonableWallet = Math.max(monthlyGrant, 1) * 13;
  const legacyEntitlementTierCount = Object.keys(parseEntitlementsMap(u.subscriptionEntitlements)).filter((tier) =>
    isPaidSubscriptionTierId(tier),
  ).length;
  const looksLikeLegacyStackedGrant = legacyEntitlementTierCount > 1 && sumBeforeSync + consumed > monthlyGrant;

  if (
    looksLikeLegacyStackedGrant ||
    !Number.isSafeInteger(sumBeforeSync) ||
    !Number.isFinite(sumBeforeSync) ||
    sumBeforeSync > maxReasonableWallet
  ) {
    consumed = Math.min(consumed, monthlyGrant);
    const remaining = Math.max(0, monthlyGrant - consumed);
    wallet = remaining > 0 ? [{ won: remaining, creditedAt: now.toISOString() }] : [];
  }

  const sum = sumAiWallet(wallet);
  const originalWallet = parseAiWallet(u.subscriptionAiWallet);
  const needsWrite =
    u.subscriptionAiPeriodKey !== desiredKey ||
    u.subscriptionAiPeriodConsumedWon !== consumed ||
    JSON.stringify(originalWallet) !== JSON.stringify(wallet);

  if (needsWrite) {
    await tx
      .update(users)
      .set({
        subscriptionAiWallet: wallet,
        subscriptionAiPeriodKey: desiredKey,
        subscriptionAiPeriodConsumedWon: consumed,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  return {
    walletSum: sum,
    periodConsumed: consumed,
    periodKey: desiredKey,
    monthlyGrant,
    limitDisplay: sum + consumed,
  };
}

export async function syncSubscriptionAiWalletForPaidUser(userId: string, now: Date): Promise<PaidAiWalletState | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row || !isUserPaidSubscriptionActive(row, now)) return null;

  return await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!u || !isUserPaidSubscriptionActive(u, now)) return null;
    return performSubscriptionAiWalletSync(tx, u, userId, now);
  });
}

export async function deductSubscriptionAiWallet(userId: string, won: number, now: Date): Promise<boolean> {
  const n = Math.floor(won);
  if (n <= 0) return true;

  return await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!u || !isUserPaidSubscriptionActive(u, now)) return false;

    const synced = await performSubscriptionAiWalletSync(tx, u, userId, now);
    if (!synced) return false;

    const [u2] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u2) return false;
    const wallet = pruneAiWallet(parseAiWallet(u2.subscriptionAiWallet), now);
    const next = deductAiWalletFifo(wallet, n, now);
    if (!next) return false;

    await tx
      .update(users)
      .set({
        subscriptionAiWallet: next,
        subscriptionAiPeriodConsumedWon: Math.max(0, Math.floor(Number(u2.subscriptionAiPeriodConsumedWon ?? 0)) + n),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    return true;
  });
}

export async function adminRebuildSubscriptionAiWalletToPlanOnly(userId: string, now: Date): Promise<PaidAiWalletState | null> {
  return await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!u || !isUserPaidSubscriptionActive(u, now)) return null;

    const desiredKey = getAiMusicUsagePeriodKey(u, u.role ?? null, now);
    const monthlyGrant = sumActivePaidAiMusicMonthlyWonBudget(u, now);
    if (monthlyGrant <= 0) return null;

    const consumed = Math.min(Math.max(0, Math.floor(Number(u.subscriptionAiPeriodConsumedWon ?? 0))), monthlyGrant);
    const remaining = Math.max(0, monthlyGrant - consumed);
    const nextWallet: AiWalletChunk[] = remaining > 0 ? [{ won: remaining, creditedAt: now.toISOString() }] : [];

    await tx
      .update(users)
      .set({
        subscriptionAiWallet: nextWallet,
        subscriptionAiPeriodConsumedWon: consumed,
        subscriptionAiPeriodKey: desiredKey,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const [u2] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u2) return null;
    return performSubscriptionAiWalletSync(tx, u2, userId, now);
  });
}

export async function adminSetSubscriptionAiPeriodConsumedWon(userId: string, usedWon: number, now: Date): Promise<boolean> {
  const used = Math.max(0, Math.floor(usedWon));
  return await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!u || !isUserPaidSubscriptionActive(u, now)) return false;

    const synced = await performSubscriptionAiWalletSync(tx, u, userId, now);
    if (!synced) return false;

    const [u2] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u2) return false;
    const wallet = pruneAiWallet(parseAiWallet(u2.subscriptionAiWallet), now);
    const sum = sumAiWallet(wallet);
    const consumed = Math.max(0, Math.floor(Number(u2.subscriptionAiPeriodConsumedWon ?? 0)));
    const total = sum + consumed;
    const nextConsumed = Math.min(used, total);
    const nextRemaining = Math.max(0, total - nextConsumed);
    const nextWallet: AiWalletChunk[] = nextRemaining > 0 ? [{ won: nextRemaining, creditedAt: now.toISOString() }] : [];

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
