/** 로그인 직후 모바일 레이아웃 1회 보정 — veny-mobile-bootstrap.js 와 쌍 */
export const MOBILE_LAYOUT_REFRESH_PARAM = "veny_layout";

export function withMobileLayoutRefresh(path: string): string {
  try {
    const url = new URL(path, window.location.origin);
    url.searchParams.set(MOBILE_LAYOUT_REFRESH_PARAM, "1");
    return url.pathname + url.search;
  } catch {
    const join = path.includes("?") ? "&" : "?";
    return `${path}${join}${MOBILE_LAYOUT_REFRESH_PARAM}=1`;
  }
}

export function isTouchLayoutDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}
