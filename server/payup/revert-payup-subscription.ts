import { eq, and, ne, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { payments, users } from "../../shared/models/auth";
import { isPaidSubscriptionTierId, PAID_SUBSCRIPTION_TIER_IDS } from "@shared/subscription-plan-pricing";

const PAID_PLAN_IDS_FOR_PAYMENTS = [...PAID_SUBSCRIPTION_TIER_IDS] as string[];

/**
 * 페이업 PG에서 승인 후 취소·환불해도 서버는 자동으로 모름 — 이 호출로 payments 를 refunded 처리하고,
 * 동일 회원에게 남은 **paid 유료 구독 결제**가 없으면 users 구독·구독 AI 지갑을 무료로 되돌림.
 */
export async function revertPayupCardSubscriptionPaymentById(
  paymentId: string,
): Promise<{ ok: true; downgradedUser: boolean; userId: string } | { ok: false; message: string }> {
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!payment) return { ok: false, message: "결제 건을 찾을 수 없습니다." };
  const pk = String(payment.paymentKey ?? "");
  if (!pk.startsWith("payup:")) {
    return { ok: false, message: "페이업 카드(payment_key 가 payup: 로 시작) 구독 건만 처리할 수 있습니다." };
  }
  if (payment.status !== "paid") {
    return { ok: false, message: "paid 상태의 건만 처리할 수 있습니다." };
  }
  const planNorm = String(payment.plan ?? "").trim().toLowerCase();
  if (!isPaidSubscriptionTierId(planNorm)) {
    return { ok: false, message: "유료 구독 플랜 결제만 처리할 수 있습니다." };
  }

  return await db.transaction(async (tx) => {
    const others = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.userId, payment.userId),
          eq(payments.status, "paid"),
          inArray(payments.plan, PAID_PLAN_IDS_FOR_PAYMENTS),
          ne(payments.id, paymentId),
        ),
      )
      .limit(1);
    const hasOtherPaidSub = others.length > 0;
    await tx.update(payments).set({ status: "refunded" }).where(eq(payments.id, paymentId));
    if (!hasOtherPaidSub) {
      await tx
        .update(users)
        .set({
          subscriptionTier: "free",
          subscriptionEntitlements: sql`'{}'::jsonb`,
          subscriptionExpiresAt: null,
          subscriptionPlan: null,
          subscriptionAiWallet: sql`'[]'::jsonb`,
          subscriptionAiPeriodKey: null,
          subscriptionAiPeriodConsumedWon: 0,
          updatedAt: new Date(),
        })
        .where(eq(users.id, payment.userId));
    }
    return { ok: true, downgradedUser: !hasOtherPaidSub, userId: payment.userId };
  });
}
