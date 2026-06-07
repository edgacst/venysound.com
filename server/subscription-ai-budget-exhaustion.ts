import { and, eq, sql } from "drizzle-orm";
import { users } from "@shared/models/auth";
import { getAiMusicUsagePeriodKey } from "@shared/subscription-entitlements";
import { isPaidSubscriptionTierId } from "@shared/subscription-plan-pricing";
import { parseAiWallet, pruneAiWallet, sumAiWallet } from "@shared/subscription-ai-wallet";
import { db } from "./db";
import { storage } from "./storage";
import { sendSubscriptionAiBudgetExhaustedEmail } from "./email";
import { syncSubscriptionAiWalletForPaidUser } from "./subscription-ai-wallet";

const EXHAUSTION_MARKER_SUFFIX = "|ai-budget-exhausted:v1";

export function subscriptionAiBudgetExhaustionMarker(periodKey: string): string {
  return `${periodKey}${EXHAUSTION_MARKER_SUFFIX}`;
}

/**
 * 유료 구독 AI 지갑으로 다음 곡(150원)을 더 만들 수 없을 때:
 * 1회 인앱 알림 + 메일(중복 방지 DB 키) 후 구독 혜택을 즉시 free로 정리(옵션 4-A).
 */
/**
 * 활성 유료 + 구독 AI 지갑 잔액이 1곡 미만일 때만 free화.
 * 과금 직후 `runSubscription…` 호출이 누락된 경우·탭만 열어둔 경우 보정용 (auth/me·usage 등).
 */
export async function ensurePaidUserSubscriptionAiExhaustedIfWalletDepleted(userId: string, now: Date): Promise<void> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row || row.role === "admin" || !isPaidSubscriptionTierId(row.subscriptionTier ?? "free")) return;
  const w = await syncSubscriptionAiWalletForPaidUser(userId, now);
  const walletSum = w?.walletSum ?? sumAiWallet(pruneAiWallet(parseAiWallet(row.subscriptionAiWallet), now));
  if (walletSum > 0) return;
  await runSubscriptionAiBudgetExhaustionIfNeeded(userId, now);
}

export async function runSubscriptionAiBudgetExhaustionIfNeeded(userId: string, now: Date): Promise<void> {
  await syncSubscriptionAiWalletForPaidUser(userId, now);

  const post = await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!u || !isPaidSubscriptionTierId(u.subscriptionTier ?? "free")) return null;

    const wallet = pruneAiWallet(parseAiWallet(u.subscriptionAiWallet), now);
    const sum = sumAiWallet(wallet);
    if (sum > 0) return null;

    const periodKey = getAiMusicUsagePeriodKey(u, u.role ?? null, now);
    const marker = subscriptionAiBudgetExhaustionMarker(periodKey);

    const [claimed] = await tx
      .update(users)
      .set({ subscriptionAiBudgetExhaustionNoticeKey: marker, updatedAt: new Date() })
      .where(
        and(eq(users.id, userId), sql`${users.subscriptionAiBudgetExhaustionNoticeKey} is distinct from ${marker}`),
      )
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      });

    const [u2] = await tx.select().from(users).where(eq(users.id, userId));
    if (!u2 || !isPaidSubscriptionTierId(u2.subscriptionTier ?? "free")) return null;
    const sum2 = sumAiWallet(pruneAiWallet(parseAiWallet(u2.subscriptionAiWallet), now));
    if (sum2 > 0) return null;

    await tx
      .update(users)
      .set({
        subscriptionEntitlements: sql`'{}'::jsonb`,
        subscriptionTier: "free",
        subscriptionExpiresAt: null,
        subscriptionPlan: null,
        tossBillingKey: null,
        tossCustomerKey: null,
        subscriptionAiWallet: sql`'[]'::jsonb`,
        subscriptionAiPeriodKey: null,
        subscriptionAiPeriodConsumedWon: 0,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return {
      notify: !!claimed,
      email: u2.email,
      recipientName: `${u2.firstName || ""} ${u2.lastName || ""}`.trim() || null,
    };
  });

  if (!post?.notify) return;

  try {
    await storage.createNotification({
      userId,
      type: "system",
      message:
        "구독 플랜의 AI 음악 생성 예산(원화)이 모두 소진되어 유료 혜택이 종료되었습니다. Free 플랜 한도로 전환되었습니다.",
      payload: { kind: "subscription_ai_budget_exhausted" },
      url: "/pricing",
    });
  } catch (e) {
    console.error("[subscription-ai-budget-exhaustion] createNotification", e);
  }

  await sendSubscriptionAiBudgetExhaustedEmail(post.email, { recipientName: post.recipientName });
}
