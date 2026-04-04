import type { AnalyticsSignupConversionEvent } from "@shared/analytics-conversion-events";
import { readVisitorKey, writeVisitorKey } from "@/lib/visitor-key";

let lastSignupPageViewSentAt = 0;

/** React StrictMode 이중 마운트 등 짧은 간격 중복만 억제 */
export function recordSignupPageViewDeduped(): void {
  const now = Date.now();
  if (now - lastSignupPageViewSentAt < 1200) return;
  lastSignupPageViewSentAt = now;
  void recordSignupConversionEvent("signup_page_view");
}

export async function recordSignupConversionEvent(
  event: AnalyticsSignupConversionEvent,
  meta?: Record<string, string | number | boolean | null>,
): Promise<void> {
  const visitorKey = readVisitorKey();
  const body = JSON.stringify({
    event,
    visitorKey: visitorKey || undefined,
    meta: meta && Object.keys(meta).length > 0 ? meta : undefined,
  });
  try {
    const r = await fetch("/api/analytics/conversion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body,
      keepalive: true,
    });
    if (!r.ok) return;
    const data = (await r.json()) as { visitorKey?: string };
    if (data?.visitorKey && typeof data.visitorKey === "string") {
      writeVisitorKey(data.visitorKey.trim());
    }
  } catch {
    /* ignore */
  }
}
