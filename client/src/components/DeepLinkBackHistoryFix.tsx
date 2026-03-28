import { useLayoutEffect } from "react";
import { useLocation } from "wouter";

function basePathOnly(full: string): string {
  return full.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
}

/** /radio/:slug 청취 페이지만 (studio·create·channels 제외는 상위 라우트에서 처리) */
function isRadioSingleSlugChannel(base: string): boolean {
  const parts = base.split("/").filter(Boolean);
  if (parts.length !== 2) return false;
  if (parts[0] !== "radio") return false;
  const slug = parts[1].toLowerCase();
  return slug !== "create" && slug !== "channels";
}

/**
 * TWA·모바일에서 딥링크/짧은 history 스택일 때 뒤로가기가 WebView 빈 화면으로 가는 문제 완화.
 * - 경로가 바뀔 때마다 다시 평가 (앱이 / 에서 뜬 뒤 /radio/g 로 이동한 경우 포함)
 * - length===2 는 "이 탭 최초 URL이 지금과 같을 때" + /radio/:slug 일 때만 보정 (내부 링크 탐색 오탐 방지)
 */
export function DeepLinkBackHistoryFix() {
  const [loc] = useLocation();

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    let path: string;
    try {
      path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    } catch {
      return;
    }

    const base = basePathOnly(path);
    if (base === "/" || base === "/radio") return;

    let len = 1;
    try {
      len = window.history.length;
    } catch {
      return;
    }

    const st = window.history.state as { venySpaBackAnchor?: boolean } | null;
    if (st?.venySpaBackAnchor) return;

    let bootRaw = "";
    try {
      bootRaw = sessionStorage.getItem("venyBootPath") || "";
    } catch {
      bootRaw = "";
    }
    const bootBase = basePathOnly(bootRaw);

    const anchor = path.startsWith("/radio") ? "/radio" : "/";

    const canLen1 = len === 1;
    const canLen2 =
      len === 2 &&
      bootBase === base &&
      isRadioSingleSlugChannel(base);

    if (!canLen1 && !canLen2) return;

    try {
      window.history.replaceState({ venySpaBackAnchor: true }, "", anchor);
      window.history.pushState({ venySpaBackAnchor: true }, "", path || "/");
    } catch (e) {
      console.warn("[DeepLinkBackHistoryFix] skipped", e);
    }
  }, [loc]);

  return null;
}
