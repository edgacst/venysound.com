import { type PayupCredentials, getPayupBaseUrl } from "./config";
import { signPayupCancel2 } from "./signing";
import { payupPostJson } from "./http";
import { payupMetaTransactionIdFromPayupMeta } from "./revert-payup-subscription";
import {
  payupFlatIndicatesSuccessfulCancelOrRefund,
  payupFlatLooksLikeApprovalOnly,
  flattenPayupWebhookPayload,
} from "./payup-webhook-notify";

type Cred = Extract<PayupCredentials, { ok: true }>;

/** PG 거래조회 시 transactionId 후보 — meta TID·가맹점 주문번호(S…) 순 (페이업 조회 API가 주문번호를 받는 경우 대비) */
export function payupCollectInquiryLookupIds(
  payupMeta: unknown,
  orderId: string,
  extra: string[] = [],
): string[] {
  const ids: string[] = [];
  const add = (raw: string) => {
    const t = raw.trim().replace(/^payup:/i, "");
    if (t.length < 4) return;
    if (!ids.some((x) => x.toLowerCase() === t.toLowerCase())) ids.push(t);
  };
  for (const e of extra) add(e);
  const fromMeta = payupMetaTransactionIdFromPayupMeta(payupMeta);
  if (fromMeta) add(fromMeta);
  add(orderId);
  return ids;
}

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
 * 레포 `deploy/docs/payup/` 의 다날 다이렉트 규격(v1.1.1)에는 조회 URI 가 없고 order(`/ap/.../order`)·cancel2(`/v2/.../cancel2`) 만 정의됨.
 * `PAYUP_TXN_RECONCILE_PATH` 는 페이업이 별도로 안내한 조회 API 가 있을 때만 유효; 임의의 `/…/inquiry` 는 404 일 수 있음.
 * 기본 서명: `cancel2` 와 동일 `merchantId|transactionId|apiCertKey` (문서가 다르면 `PAYUP_TXN_RECONCILE_SIGN_MODE` 확장)
 */
export async function payupHttpReconcileTransactionCancelled(
  cred: Cred,
  transactionId: string,
  opts?: { merchantOrderId?: string },
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
  const body: Record<string, string> = { transactionId, signature };
  const inclOrder =
    String(process.env.PAYUP_TXN_RECONCILE_INCLUDE_ORDER_NUMBER ?? "true").trim().toLowerCase() !== "false";
  const moid = (opts?.merchantOrderId ?? "").trim();
  if (inclOrder && moid) {
    body.orderNumber = moid;
    body.moid = moid;
  }
  const out = await payupPostJson<Record<string, unknown>>(cred, path, body);
  if (!out.ok) {
    const base = getPayupBaseUrl().replace(/\/$/, "");
    const suffix =
      out.status === 404
        ? ` — HTTP 404: ${base}${path.startsWith("/") ? path : `/${path}`} (페이업 "인증결제 다이렉트" 규격서의 거래조회 POST 경로·파라미터를 확인하거나 기술지원에 문의하세요. /v2 와 /ap/api 는 서로 다른 묶음입니다.)`
        : ` — path: ${path}`;
    return { ok: false, message: `${out.message}${suffix}` };
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

/** 여러 lookupId(transactionId·가맹점 주문번호 등)로 조회 — 첫 성공 응답 사용 */
export async function payupHttpInquireWithLookupIds(
  cred: Cred,
  lookupIds: string[],
  opts?: { merchantOrderId?: string },
): Promise<
  | { ok: true; skipped: true; reason: string }
  | { ok: true; lookupId: string; cancelledAtPg: boolean; flat?: Record<string, string> }
  | { ok: false; message: string; tried: string[] }
> {
  const pathTpl = (process.env.PAYUP_TXN_RECONCILE_PATH ?? "").trim();
  if (!pathTpl) {
    return { ok: true, skipped: true, reason: "PAYUP_TXN_RECONCILE_PATH unset" };
  }
  const tried: string[] = [];
  let lastMsg = "PG 거래조회에 실패했습니다.";
  for (const lookupId of lookupIds) {
    const id = lookupId.trim().replace(/^payup:/i, "");
    if (!id) continue;
    tried.push(id);
    const pg = await payupHttpReconcileTransactionCancelled(cred, id, opts);
    if (!pg.ok) {
      lastMsg = pg.message;
      continue;
    }
    if ("skipped" in pg && pg.skipped) {
      return { ok: true, skipped: true, reason: pg.reason };
    }
    return {
      ok: true,
      lookupId: id,
      cancelledAtPg: "cancelledAtPg" in pg && pg.cancelledAtPg === true,
      flat: "flat" in pg ? pg.flat : undefined,
    };
  }
  return { ok: false, message: lastMsg, tried };
}
