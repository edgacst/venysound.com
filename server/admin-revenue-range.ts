/** 관리자 매출 집계 기간 — 결제 `created_at`은 DB 기본 타임스탬프(서버/DB TZ) 기준이므로, month만 서울 달력으로 해석합니다. */

export function seoulCalendarMonthRange(anchor: Date = new Date()): { start: Date; endExclusive: Date; ymLabel: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = fmt.formatToParts(anchor);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const start = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+09:00`);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  const endExclusive = new Date(`${ny}-${String(nm).padStart(2, "0")}-01T00:00:00+09:00`);
  return { start, endExclusive, ymLabel: `${y}-${String(m).padStart(2, "0")}` };
}

export type ParsedAdminRevenueRange =
  | { ok: true; label: string; start?: Date; endExclusive?: Date; endInclusive?: Date }
  | { ok: false; error: string };

export function parseAdminRevenueRangeQuery(q: { period?: string; days?: string }): ParsedAdminRevenueRange {
  const period = (q.period ?? "all").toLowerCase().trim();
  if (period === "all" || period === "") {
    return { ok: true, label: "전체" };
  }
  if (period === "month") {
    const r = seoulCalendarMonthRange();
    return { ok: true, label: `${r.ymLabel} (서울 기준 월)`, start: r.start, endExclusive: r.endExclusive };
  }
  if (period === "days") {
    const n = Math.min(366, Math.max(1, parseInt(String(q.days ?? "30"), 10) || 30));
    const endInclusive = new Date();
    const start = new Date(endInclusive.getTime() - n * 86400000);
    return { ok: true, label: `최근 ${n}일`, start, endInclusive };
  }
  return { ok: false, error: "period=all | month | days&days=N" };
}
