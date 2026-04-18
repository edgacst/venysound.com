import type { PayupCredentials } from "./config";
import { signPayupCancel2 } from "./signing";
import { payupPostJson } from "./http";
import {
  payupFlatIndicatesSuccessfulCancelOrRefund,
  payupFlatLooksLikeApprovalOnly,
  flattenPayupWebhookPayload,
} from "./payup-webhook-notify";

type Cred = Extract<PayupCredentials, { ok: true }>;

/** 페이업 응답이 `{ data: { … } }` 형태일 때 한 단계 펼침 (routes 의 payupOrderResponseAsFlatRecord 와 동일) */
function payupMergeApiResponseFlat(d: Record<string, unknown>): Record<string, unknown> {
  const box = d["data"] ?? d["result"];
  if (box && typeof box === "object" && !Array.isArray(box)) {
    return { ...d, ...(box as Record<string, unknown>) };
  }
  return d;
}

/**
 * 페이업 규격서에 맞는 **거래 조회** URL을 .env 에 넣었을 때만 호출합니다.
 * `PAYUP_TXN_RECONCILE_PATH` 는 규격별로 다름. 주문이 `/ap/api/payment/.../order` 이면 조회도 `/ap/api/...` 일 가능성이 큼(문서 필수).
 * 예: `/ap/api/payment/{merchantId}/inquiry` — 404 시 v2 경로가 아닌지·세그먼트명(inquiry vs transaction 등)을 규격서로 확인.
 * 기본 서명: `cancel2` 와 동일 `merchantId|transactionId|apiCertKey` (문서가 다르면 `PAYUP_TXN_RECONCILE_SIGN_MODE` 확장)
 */
export async function payupHttpReconcileTransactionCancelled(
  cred: Cred,
  transactionId: string,
): Promise<
  | { ok: true; skipped: true; reason: string }
  | { ok: true; cancelledAtPg: boolean; flat?: Record<string, string> }
  | { ok: false; message: string }
> {
  const pathTpl = (process.env.PAYUP_TXN_RECONCILE_PATH ?? "").trim();
  if (!pathTpl) {
    return { ok: true, skipped: true, reason: "PAYUP_TXN_RECONCILE_PATH unset" };
  }
  const signMode = (process.env.PAYUP_TXN_RECONCILE_SIGN_MODE ?? "cancel2").trim().toLowerCase();
  if (signMode !== "cancel2") {
    return { ok: false, message: `Unsupported PAYUP_TXN_RECONCILE_SIGN_MODE: ${signMode}` };
  }
  const path = pathTpl
    .replace(/\{merchantId\}/g, encodeURIComponent(cred.merchantId))
    .replace(/\{transactionId\}/g, encodeURIComponent(transactionId));
  const signature = signPayupCancel2(cred.merchantId, transactionId, cred.apiCertKey);
  const out = await payupPostJson<Record<string, unknown>>(cred, path, {
    transactionId,
    signature,
  });
  if (!out.ok) {
    return { ok: false, message: out.message };
  }
  const flatRec = payupMergeApiResponseFlat(out.data as Record<string, unknown>);
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(flatRec)) {
    if (v == null) continue;
    flat[k] = typeof v === "string" ? v : String(v);
  }
  const merged = { ...flat, ...flattenPayupWebhookPayload(out.data) };
  if (payupFlatLooksLikeApprovalOnly(merged) && !payupFlatIndicatesSuccessfulCancelOrRefund(merged)) {
    return { ok: true, cancelledAtPg: false, flat: merged };
  }
  if (payupFlatIndicatesSuccessfulCancelOrRefund(merged)) {
    return { ok: true, cancelledAtPg: true, flat: merged };
  }
  return { ok: true, cancelledAtPg: false, flat: merged };
}
