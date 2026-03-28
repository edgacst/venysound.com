import { useLayoutEffect } from "react";

/**
 * TWA·모바일 브라우저에서 딥링크로 들어올 때 history 스택이 1뿐이면,
 * 뒤로가기가 SPA 라우팅이 아니라 WebView 종료/빈 화면으로 가는 경우가 있다.
 * URL은 그대로 두고 스택 앞에 `/`를 넣어, 뒤로가기 한 번은 사이트 홈으로 가게 한다.
 */
export function DeepLinkBackHistoryFix() {
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    let path: string;
    try {
      path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    } catch {
      return;
    }

    const normalized = path.replace(/\/$/, "") || "/";
    if (normalized === "/") return;

    let len = 1;
    try {
      len = window.history.length;
    } catch {
      return;
    }
    if (len > 1) return;

    const anchor =
      path.startsWith("/radio") ? "/radio" : "/";

    try {
      window.history.replaceState({ venySpaBackAnchor: true }, "", anchor);
      window.history.pushState({ venySpaBackAnchor: true }, "", path || "/");
    } catch (e) {
      console.warn("[DeepLinkBackHistoryFix] skipped", e);
    }
  }, []);

  return null;
}
