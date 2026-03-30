import type { Request } from "express";

function headerFirst(req: Request, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0]?.trim();
  return typeof v === "string" ? v.trim() : undefined;
}

/** IPv4-mapped IPv6 → IPv4 */
function unwrapIpv4Mapped(ip: string): string {
  const s = ip.trim();
  if (s.startsWith("::ffff:") && s.includes(".")) return s.slice(7);
  return s;
}

function isNonPublicIp(ip: string): boolean {
  const x = unwrapIpv4Mapped(ip);
  if (!x) return true;
  if (/^127\./.test(x) || x === "::1") return true;
  if (/^10\./.test(x)) return true;
  if (/^192\.168\./.test(x)) return true;
  if (/^169\.254\./.test(x)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(x)) return true;
  if (/^fc00:/i.test(x) || /^fe80:/i.test(x)) return true;
  if (x === "0.0.0.0") return true;
  return false;
}

/**
 * GeoIP·방문 로그용 클라이언트 IP.
 * Cloudflare / Nginx / 로드밸런서 뒤에서는 X-Forwarded-For 첫 칸만 쓰면 엣지(미국 등)만 잡히는 경우가 많아,
 * CF-Connecting-IP · X-Real-IP 등을 우선합니다.
 */
export function getClientIpForGeo(req: Request): string {
  const orderedHeaders = [
    "cf-connecting-ip",
    "true-client-ip",
    "fly-client-ip",
    "x-real-ip",
  ] as const;
  for (const name of orderedHeaders) {
    const raw = headerFirst(req, name);
    if (!raw) continue;
    const ip = unwrapIpv4Mapped(raw.split(/\s+/)[0] ?? "");
    if (ip && !isNonPublicIp(ip)) return ip;
  }

  const xff = headerFirst(req, "x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => unwrapIpv4Mapped(p.trim())).filter(Boolean);
    for (const ip of parts) {
      if (!isNonPublicIp(ip)) return ip;
    }
    if (parts.length > 0) return parts[0];
  }

  const expressIp = typeof req.ip === "string" ? unwrapIpv4Mapped(req.ip) : "";
  if (expressIp && expressIp !== "::1" && !isNonPublicIp(expressIp)) return expressIp;

  const socketIp = req.socket?.remoteAddress;
  if (socketIp) return unwrapIpv4Mapped(socketIp);

  return "";
}
