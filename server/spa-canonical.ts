import type { Request } from "express";

/**
 * SPA HTML에 주입할 절대 URL (SITE_URL 기준, 경로는 요청과 동일).
 * 이전처럼 모든 페이지에 홈만 canonical 고정하면 GSC에서 중복·비색인이 늘 수 있음.
 */
export function canonicalUrlForSpaRequest(req: Request): string {
  const base = (process.env.SITE_URL || "https://venysound.com").replace(/\/$/, "");
  let pathname = typeof req.path === "string" && req.path.startsWith("/") ? req.path : "/";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  if (pathname === "/") {
    return `${base}/`;
  }
  return `${base}${pathname}`;
}

function escapeHtmlAttr(url: string): string {
  return url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** client/index.html 내 __VENYSOUND_CANONICAL__ 자리에 주입 */
export function injectSpaCanonicalPlaceholders(html: string, req: Request): string {
  const href = escapeHtmlAttr(canonicalUrlForSpaRequest(req));
  return html.split("__VENYSOUND_CANONICAL__").join(href);
}
