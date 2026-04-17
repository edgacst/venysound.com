import { eq, and, ne, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { payments, users } from "../../shared/models/auth";
import { isPaidSubscriptionTierId, PAID_SUBSCRIPTION_TIER_IDS } from "@shared/subscription-plan-pricing";

const PAID_PLAN_IDS_FOR_PAYMENTS = [...PAID_SUBSCRIPTION_TIER_IDS] as string[];

export function normalizePaymentKeyString(paymentKey: string | null | undefined): string {
  return String(paymentKey ?? "").trim();
}

/** 관리자 UI·서버 공통: 페이업 승인 건 `payup:{거래번호}` (대소문자 무관) */
export function isPayupCardPaymentKey(paymentKey: string | null | undefined): boolean {
  return normalizePaymentKeyString(paymentKey).toLowerCase().startsWith("payup:");
}

function payupMetaTxnId(payment: { payupMeta: unknown }): string {
  const meta = payment.payupMeta && typeof payment.payupMeta === "object" ? (payment.payupMeta as Record<string, unknown>) : null;
  const tid = meta && typeof meta.txnId === "string" ? meta.txnId.trim() : "";
  return tid;
}

/**
 * 페이업 카드 구독 완료 건인지 (payment_key 가 payup: 이거나, 승인 시 저장한 payup_meta.txnId 가 있는 경우)
 * bank_transfer 구독은 제외
 */
export function isPayupCardSubscriptionPaymentRow(payment: {
  paymentKey: string | null;
  payupMeta: unknown;
  plan: string | null;
}): boolean {
  const pk = normalizePaymentKeyString(payment.paymentKey);
  if (pk === "bank_transfer") return false;
  if (isPayupCardPaymentKey(payment.paymentKey)) return true;
  const tid = payupMetaTxnId(payment);
  if (!tid) return false;
  return isPaidSubscriptionTierId(String(payment.plan ?? "").trim().toLowerCase());
}

/**
 * 페이업 PG에서 승인 후 취소·환불해도 서버는 자동으로 모름 — 이 호출로 payments 를 refunded 처리하고,
 * 동일 회원에게 남은 **paid 유료 구독 결제**가 없으면 users 구독·구독 AI 지갑을 무료로 되돌림.
 */
export async function revertPayupCardSubscriptionPaymentById(
  paymentId: string,
): Promise<
  | { ok: true; downgradedUser: boolean; userId: string; noop?: "already_refunded" }
  | { ok: false; message: string }
> {
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!payment) return { ok: false, message: "결제 건을 찾을 수 없습니다." };

  const st = String(payment.status ?? "").trim().toLowerCase();
  if (st === "refunded") {
    return { ok: true, downgradedUser: false, userId: payment.userId, noop: "already_refunded" };
  }
  if (st !== "paid") {
    return { ok: false, message: `paid 상태의 건만 처리할 수 있습니다. (현재: ${payment.status ?? "?"})` };
  }

  const planNorm = String(payment.plan ?? "").trim().toLowerCase();
  if (!isPaidSubscriptionTierId(planNorm)) {
    return { ok: false, message: "유료 구독 플랜 결제만 처리할 수 있습니다." };
  }

  if (!isPayupCardSubscriptionPaymentRow(payment)) {
    return {
      ok: false,
      message:
        "페이업 카드 구독 결제만 처리할 수 있습니다. (payment_key 가 payup: 로 시작하거나 payup_meta.txnId 가 있어야 하며, 계좌이체 건은 제외)",
    };
  }

  return await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(payments).where(eq(payments.id, paymentId));
    if (!cur) return { ok: false, message: "결제 건을 찾을 수 없습니다." };
    const curSt = String(cur.status ?? "").trim().toLowerCase();
    if (curSt === "refunded") {
      return { ok: true, downgradedUser: false, userId: cur.userId, noop: "already_refunded" };
    }
    if (curSt !== "paid") {
      return { ok: false, message: `paid 상태의 건만 처리할 수 있습니다. (현재: ${cur.status ?? "?"})` };
    }

    const pk2 = normalizePaymentKeyString(cur.paymentKey);
    const metaTid2 = payupMetaTxnId(cur);
    const normalizedKey = isPayupCardPaymentKey(cur.paymentKey)
      ? `payup:${pk2.replace(/^payup:/i, "").trim()}`
      : metaTid2
        ? `payup:${metaTid2}`
        : pk2;

    const others = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.userId, cur.userId),
          eq(payments.status, "paid"),
          inArray(payments.plan, PAID_PLAN_IDS_FOR_PAYMENTS),
          ne(payments.id, paymentId),
        ),
      )
      .limit(1);
    const hasOtherPaidSub = others.length > 0;

    const prevMeta =
      cur.payupMeta && typeof cur.payupMeta === "object" ? ({ ...(cur.payupMeta as Record<string, unknown>) } as Record<string, unknown>) : {};
    await tx
      .update(payments)
      .set({
        status: "refunded",
        paymentKey: normalizedKey.toLowerCase().startsWith("payup:") ? normalizedKey : cur.paymentKey,
        payupMeta: {
          ...prevMeta,
          pgCancelRevertedAt: new Date().toISOString(),
        },
      })
      .where(eq(payments.id, paymentId));

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
        .where(eq(users.id, cur.userId));
    }
    return { ok: true, downgradedUser: !hasOtherPaidSub, userId: cur.userId };
  });
}
