import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { payments } from "../../shared/models/auth";
import { PAID_SUBSCRIPTION_TIER_IDS } from "@shared/subscription-plan-pricing";
import { revertPayupCardSubscriptionPaymentById } from "./revert-payup-subscription";

const PAID_PLAN_IDS = [...PAID_SUBSCRIPTION_TIER_IDS] as string[];

function flattenUnknown(input: unknown, out: Record<string, string>, prefix = ""): void {
  if (input == null) return;
  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    const s = String(input).trim();
    if (s && prefix) out[prefix] = s;
    return;
  }
  if (Array.isArray(input)) {
    input.forEach((v, i) => flattenUnknown(v, out, prefix ? `${prefix}.${i}` : String(i)));
    return;
  }
  if (typeof input === "object") {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      flattenUnknown(v, out, key);
    }
  }
}

export function flattenPayupWebhookPayload(body: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  flattenUnknown(body, out, "");
  /** 동일 키 대소문자 혼재 시 상위 키도 남김 */
  const merged: Record<string, string> = { ...out };
  for (const [k, v] of Object.entries(out)) {
    merged[k.toLowerCase()] = v;
  }
  return merged;
}

/** 웹훅·PG 조회 응답에서 “취소·환불 완료”로 볼 만한 신호 (오탐 최소화) */
export function payupFlatIndicatesSuccessfulCancelOrRefund(flat: Record<string, string>): boolean {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = flat[k] ?? flat[k.toLowerCase()];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };
  const cancelDt = pick("cancelDateTime", "cancelDatetime", "CANCELDATETIME", "cancel_date_time");
  if (cancelDt.length >= 8) return true;
  const deal = pick("dealStatus", "DEALSTATUS", "deal_status", "status", "STATUS", "transactionStatus");
  if (/취소|환불|CANCEL|REFUND|VOID|망취소/i.test(deal)) return true;
  const msg = pick("msgType", "MSGTYPE", "event", "EVENT", "type", "TYPE", "notificationType");
  if (/CANCEL|REFUND|VOID|취소|환불/i.test(msg)) return true;
  const rc = pick("responseCode", "RESPONSECODE", "resultCode", "RESULT_CODE");
  const rmsg = pick("responseMsg", "RESPONSEMSG", "resultMsg", "RESULT_MSG");
  if (rc === "0000" && /취소|환불|CANCEL|REFUND/i.test(rmsg)) return true;
  return false;
}

/** 승인·결제완료만 있고 취소 신호가 없으면 웹훅만으로는 되돌리지 않음 */
export function payupFlatLooksLikeApprovalOnly(flat: Record<string, string>): boolean {
  const blob = JSON.stringify(flat).toUpperCase();
  const hasCancel = /CANCEL|REFUND|VOID|취소|환불|망취소/.test(blob);
  if (hasCancel) return false;
  if (/승인|APPROV|AUTH|CAPTURE|결제완료|SUCCESS|매입/.test(blob)) return true;
  return false;
}

function collectTransactionIdCandidates(flat: Record<string, string>): string[] {
  const ids = new Set<string>();
  for (const [k, v] of Object.entries(flat)) {
    if (!v || v.length < 6) continue;
    const kl = k.toLowerCase();
    if (
      kl === "transactionid" ||
      kl === "transaction_id" ||
      kl === "tid" ||
      /transactionid|transaction_id|orgtransaction|원거래|trxid|pgtid/.test(kl)
    ) {
      ids.add(v.replace(/^payup:/i, "").trim());
    }
  }
  return [...ids];
}

/**
 * 페이업(또는 PG)에서 보내는 취소·환불 통지 본문을 해석해, 해당 payup: 거래의 paid 구독 건을 되돌림.
 * 본문이 애매하면 아무 것도 하지 않음.
 */
export async function tryRevertPaidPayupSubscriptionFromNotifyFlat(flat: Record<string, string>): Promise<{
  action: "none" | "reverted" | "skipped_ambiguous";
  paymentId?: string;
  userId?: string;
  downgradedUser?: boolean;
  detail?: string;
}> {
  if (payupFlatLooksLikeApprovalOnly(flat) && !payupFlatIndicatesSuccessfulCancelOrRefund(flat)) {
    return { action: "skipped_ambiguous", detail: "approval_like" };
  }
  if (!payupFlatIndicatesSuccessfulCancelOrRefund(flat)) {
    return { action: "skipped_ambiguous", detail: "no_cancel_signal" };
  }
  const txnIds = collectTransactionIdCandidates(flat);
  if (txnIds.length === 0) {
    return { action: "skipped_ambiguous", detail: "no_transaction_id" };
  }
  for (const txnId of txnIds) {
    const keyLower = `payup:${txnId}`.toLowerCase();
    const [row] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          sql`lower(trim(${payments.paymentKey})) = ${keyLower}`,
          eq(payments.status, "paid"),
          inArray(payments.plan, PAID_PLAN_IDS),
        ),
      )
      .limit(1);
    if (!row) continue;
    const out = await revertPayupCardSubscriptionPaymentById(row.id);
    if (out.ok) {
      if (out.noop === "already_refunded") {
        return { action: "none", detail: "already_refunded" };
      }
      return {
        action: "reverted",
        paymentId: row.id,
        userId: out.userId,
        downgradedUser: out.downgradedUser,
      };
    }
  }
  return { action: "none", detail: "no_matching_paid_row" };
}
