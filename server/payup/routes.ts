import type { Express } from "express";
import { getPayupCredentials, getPayupRuntimeSummary } from "./config";
import { payupSignatureHex, signPayupBatchPay, signPayupCancel2 } from "./signing";

/**
 * 승인 전 준비: 설정 여부 확인용 API. 비밀키는 노출하지 않음.
 * 실제 order/pay/cert 연동은 승인·키 수령 후 같은 모듈(server/payup)에 추가.
 */
export function registerPayupRoutes(app: Express): void {
  app.get("/api/payup/status", (_req, res) => {
    const s = getPayupRuntimeSummary();
    res.json({
      payup: {
        configured: s.configured,
        testMode: s.testMode,
        baseUrl: s.baseUrl,
        hint: s.configured
          ? "구독: 인증결제 다이렉트(order→창→complete). 부분취소: POST /api/admin/payup/part-cancel (관리자)"
          : "가맹 승인 후 PAYUP_MERCHANT_ID, PAYUP_API_CERT_KEY 를 .env에 넣고 운영 전 PAYUP_USE_TEST=false 로 전환하세요.",
      },
    });
  });

  /** 로컬 개발용: 서명 생성 검증 (운영 빌드에서는 비활성). */
  app.post("/api/payup/debug-sign", (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ message: "Not found" });
    }
    const cred = getPayupCredentials();
    if (!cred.ok) {
      return res.status(503).json({ message: cred.message });
    }
    const kind = String(req.body?.kind ?? "").trim();
    try {
      if (kind === "cancel2") {
        const { merchantId, transactionId } = req.body ?? {};
        const sig = signPayupCancel2(String(merchantId), String(transactionId), cred.apiCertKey);
        return res.json({ signature: sig });
      }
      if (kind === "batchPay" || kind === "directOrder") {
        const { merchantId, orderNumber, amount, timestamp } = req.body ?? {};
        const sig = signPayupBatchPay(
          String(merchantId),
          String(orderNumber),
          String(amount),
          cred.apiCertKey,
          String(timestamp),
        );
        return res.json({ signature: sig });
      }
      return res.status(400).json({
        message: "kind는 cancel2 | batchPay | directOrder 중 하나",
        exampleJoin: payupSignatureHex(["sample", "pipe"]),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ message: msg });
    }
  });
}
