import type { PayupCredentials } from "./config";
import { payupPostJson, type PayupJsonResult } from "./http";

/**
 * [페이업] 인증결제 DANAL 다이렉트 규격서 3.4 — 주문 응답의 `payUrl` 로 JSON POST
 * 요청 전문: `{ "RETURNPARAMS": "…" }` (Content-Type application/json)
 */
export async function payupDirectPostPayUrl(
  cred: Extract<PayupCredentials, { ok: true }>,
  payUrl: string,
  returnParams: string,
): Promise<PayupJsonResult<Record<string, unknown>>> {
  return payupPostJson<Record<string, unknown>>(cred, payUrl, {
    RETURNPARAMS: returnParams,
  });
}
