import { createHash } from "node:crypto";

/** 페이업 규격: 파라미터 공백 제거 후 `|` 로 연결해 SHA-256 hex (소문자). */
export function payupSignatureHex(parts: readonly string[]): string {
  const joined = parts.map((p) => String(p).replace(/\s/g, "")).join("|");
  return createHash("sha256").update(joined, "utf8").digest("hex");
}

/** 부분취소 — 규격서 예시: merchantId|transactionId|cancelAmount|apiCertKey */
export function signPayupPartCancel(merchantId: string, transactionId: string, cancelAmount: string, apiCertKey: string): string {
  return payupSignatureHex([merchantId, transactionId, cancelAmount, apiCertKey]);
}

/** 자동결제 배치키 발급 준비 ready — merchantId|orderNumber|apiCertKey */
export function signPayupBatchReady(merchantId: string, orderNumber: string, apiCertKey: string): string {
  return payupSignatureHex([merchantId, orderNumber, apiCertKey]);
}

/** 자동결제 승인 pay — merchantId|orderNumber|amount|apiCertKey|timestamp */
export function signPayupBatchPay(
  merchantId: string,
  orderNumber: string,
  amount: string,
  apiCertKey: string,
  timestamp: string,
): string {
  return payupSignatureHex([merchantId, orderNumber, amount, apiCertKey, timestamp]);
}

/** 인증결제 다이렉트 주문 order — merchantId|orderNumber|amount|apiCertKey|timestamp (배치 pay 와 동일 조합) */
export function signPayupDirectOrder(
  merchantId: string,
  orderNumber: string,
  amount: string,
  apiCertKey: string,
  timestamp: string,
): string {
  return signPayupBatchPay(merchantId, orderNumber, amount, apiCertKey, timestamp);
}

/** 전액 취소 cancel2 — merchantId|transactionId|apiCertKey */
export function signPayupCancel2(merchantId: string, transactionId: string, apiCertKey: string): string {
  return payupSignatureHex([merchantId, transactionId, apiCertKey]);
}
