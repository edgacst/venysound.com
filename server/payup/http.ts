import type { PayupCredentials } from "./config";
import { getPayupBaseUrl } from "./config";

export type PayupJsonResult<T = unknown> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; message: string; bodyText?: string };

/**
 * 페이업 REST 호출 (JSON). 승인 후 order/pay/cert 등에서 재사용.
 * @param path 절대경로 아님 — 예: `/ap/api/payment/${merchantId}/order`
 */
export async function payupPostJson<T = unknown>(
  cred: Extract<PayupCredentials, { ok: true }>,
  path: string,
  body: Record<string, string>,
): Promise<PayupJsonResult<T>> {
  const base = getPayupBaseUrl().replace(/\/$/, "");
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: T;
  try {
    data = (text ? JSON.parse(text) : {}) as T;
  } catch {
    return { ok: false, status: res.status, message: "페이업 응답이 JSON이 아닙니다.", bodyText: text.slice(0, 500) };
  }
  if (!res.ok) {
    const msg =
      typeof (data as { responseMsg?: string })?.responseMsg === "string"
        ? (data as { responseMsg: string }).responseMsg
        : `HTTP ${res.status}`;
    return { ok: false, status: res.status, message: msg, bodyText: text.slice(0, 300) };
  }
  return { ok: true, status: res.status, data };
}
