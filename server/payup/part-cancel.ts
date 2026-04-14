import type { PayupCredentials } from "./config";
import { signPayupPartCancel } from "./signing";
import { payupPostJson, type PayupJsonResult } from "./http";

/**
 * [페이업] 신용카드 부분취소 RESTful API 규격서 2.1
 * `POST /v2/api/payment/{merchantId}/partcancel`
 * 서명: merchantId|transactionId|cancelAmount|apiCertKey (예시 전문과 동일)
 */
export async function payupPostPartCancel(
  cred: Extract<PayupCredentials, { ok: true }>,
  args: { transactionId: string; cancelAmount: number; cancelReason: string },
): Promise<PayupJsonResult<Record<string, unknown>>> {
  const cancelAmountStr = String(Math.max(0, Math.floor(args.cancelAmount)));
  if (cancelAmountStr.length > 10) {
    return { ok: false, status: 400, message: "부분취소 금액은 10자리 이하여야 합니다." };
  }
  const signature = signPayupPartCancel(cred.merchantId, args.transactionId, cancelAmountStr, cred.apiCertKey);
  const path = `/v2/api/payment/${encodeURIComponent(cred.merchantId)}/partcancel`;
  return payupPostJson<Record<string, unknown>>(cred, path, {
    transactionId: args.transactionId,
    cancelAmount: cancelAmountStr,
    cancelReason: args.cancelReason.trim().slice(0, 256),
    signature,
  });
}
