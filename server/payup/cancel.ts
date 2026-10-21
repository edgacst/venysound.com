import type { PayupCredentials } from "./config";
import { signPayupCancel2 } from "./signing";
import { payupPostJson, type PayupJsonResult } from "./http";

/**
 * [페이업] 인증결제 다이렉트 전액취소
 * `POST /v2/api/payment/{merchantId}/cancel2`
 * 서명: merchantId|transactionId|apiCertKey
 */
export async function payupPostCancel2(
  cred: Extract<PayupCredentials, { ok: true }>,
  args: { transactionId: string },
): Promise<PayupJsonResult<Record<string, unknown>>> {
  const transactionId = args.transactionId.replace(/^payup:/i, "").trim();
  if (!transactionId) {
    return { ok: false, status: 400, message: "transactionId 가 필요합니다." };
  }
  const signature = signPayupCancel2(cred.merchantId, transactionId, cred.apiCertKey);
  const path = `/v2/api/payment/${encodeURIComponent(cred.merchantId)}/cancel2`;
  return payupPostJson<Record<string, unknown>>(cred, path, {
    transactionId,
    signature,
  });
}
