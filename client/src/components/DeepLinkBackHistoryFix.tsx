import { useLayoutEffect, useRef } from "react";
import { useLocation } from "wouter";

function basePathOnly(full: string): string {
  return full.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
}

/** /radio/:slug 청취 (create·channels 제외) */
function isRadioSingleSlugChannel(base: string): boolean {
  const parts = base.split("/").filter(Boolean);
  if (parts.length !== 2) return false;
  if (parts[0] !== "radio") return false;
  const slug = parts[1].toLowerCase();
  return slug !== "create" && slug !== "channels";
}

const SS_PRIMED = "venyBackPrimedFor";

/**
 * TWA·모바일 WebView에서 /radio/:slug 뒤로가기 시 빈 화면 나오는 경우:
 * - 탭 첫 화면이 곧 채널(딥링크): history 짧음 → 앞에 /radio 넣음
 * - 홈(/)에서 SPA로 채널 진입 후에도 일부 WebView는 스택이 깨짐 → / + 채널일 때 동일 보정
 * SPA에서 다른 경로(/music 등)에서 채널로 온 경우는 보정하지 않음(스택이 이미 깊음).
 */
export function DeepLinkBackHistoryFix() {
  const [loc] = useLocation();
  const prevLocRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const prevLoc = prevLocRef.current;
    if (prevLoc === loc) return;

    let path: string;
    try {
      path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    } catch {
      return;
    }
    const base = basePathOnly(path);

    let len = 1;
    try {
      len = window.history.length;
    } catch {
      prevLocRef.current = loc;
      return;
    }

    const st = window.history.state as { venySpaBackAnchor?: boolean } | null;
    if (st?.venySpaBackAnchor) {
      prevLocRef.current = loc;
      return;
    }

    const anchor = path.startsWith("/radio") ? "/radio" : "/";

    const finish = () => {
      prevLocRef.current = loc;
    };

    try {
      if (base === "/" || base === "/radio") {
        sessionStorage.removeItem(SS_PRIMED);
        finish();
        return;
      }
      if (!isRadioSingleSlugChannel(base)) {
        sessionStorage.removeItem(SS_PRIMED);
      }
    } catch {
      /* ignore */
    }

    let alreadyPrimed = false;
    try {
      alreadyPrimed = sessionStorage.getItem(SS_PRIMED) === base;
    } catch {
      alreadyPrimed = false;
    }
    if (alreadyPrimed) {
      finish();
      return;
    }

    const markPrimed = () => {
      try {
        sessionStorage.setItem(SS_PRIMED, base);
      } catch {
        /* ignore */
      }
    };

    const doPrime = () => {
      try {
        window.history.replaceState({ venySpaBackAnchor: true }, "", anchor);
        window.history.pushState({ venySpaBackAnchor: true }, "", path || "/");
        markPrimed();
      } catch (e) {
        console.warn("[DeepLinkBackHistoryFix] skipped", e);
      }
    };

    if (isRadioSingleSlugChannel(base)) {
      const coldFirstPaint = prevLoc === null;
      const fromHome = prevLoc === "/";
      const fromSpaOther =
        prevLoc !== null && prevLoc !== "/" && prevLoc !== loc;

      const allowLen = len === 1 || len === 2 || (len === 3 && coldFirstPaint);

      if (!allowLen) {
        finish();
        return;
      }

      if (fromSpaOther) {
        finish();
        return;
      }

      if (coldFirstPaint || fromHome) {
        doPrime();
        finish();
        return;
      }

      finish();
      return;
    }

    if (len !== 1) {
      finish();
      return;
    }

    doPrime();
    finish();
  }, [loc]);

  return null;
}
