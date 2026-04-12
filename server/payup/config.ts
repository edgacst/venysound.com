export const PAYUP_API_TEST_BASE = "https://api.testpayup.co.kr";
export const PAYUP_API_LIVE_BASE = "https://api.payup.co.kr";

function parseUseTest(): boolean {
  const raw = (process.env.PAYUP_USE_TEST ?? "true").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "live" || raw === "production") return false;
  return true;
}

export function getPayupBaseUrl(): string {
  return parseUseTest() ? PAYUP_API_TEST_BASE : PAYUP_API_LIVE_BASE;
}

export type PayupCredentials =
  | { ok: true; merchantId: string; apiCertKey: string }
  | { ok: false; message: string };

export function getPayupCredentials(): PayupCredentials {
  const merchantId = (process.env.PAYUP_MERCHANT_ID ?? "").trim();
  const apiCertKey = (process.env.PAYUP_API_CERT_KEY ?? "").trim();
  if (!merchantId || !apiCertKey) {
    return {
      ok: false,
      message: "페이업 연동: .env 에 PAYUP_MERCHANT_ID 와 PAYUP_API_CERT_KEY 를 설정하세요.",
    };
  }
  return { ok: true, merchantId, apiCertKey };
}

export function getPayupRuntimeSummary(): {
  configured: boolean;
  testMode: boolean;
  baseUrl: string;
} {
  const cred = getPayupCredentials();
  return {
    configured: cred.ok,
    testMode: parseUseTest(),
    baseUrl: getPayupBaseUrl(),
  };
}
