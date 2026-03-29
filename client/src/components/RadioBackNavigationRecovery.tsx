import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "wouter";

/** popstate 직전 SPA 경로 (useLayoutEffect보다 먼저 읽기 위해 sessionStorage 동기 기록) */
const SS_LAST_SPA_PATH = "venyLastSpaPath";

/** /radio/:slug 청취 페이지( studio / create / channels 제외 ) */
function pathIsRadioListenChannel(pathname: string): boolean {
  const p = (pathname.replace(/\/$/, "") || "/").split("?")[0];
  const parts = p.split("/").filter(Boolean);
  if (parts.length !== 2) return false;
  if (parts[0] !== "radio") return false;
  const s = parts[1].toLowerCase();
  return s !== "channels" && s !== "create";
}

function normalizePath(pathname: string): string {
  return (pathname.replace(/\/$/, "") || "/").split("?")[0];
}

function rootLooksBroken(): boolean {
  const root = document.getElementById("root");
  const text = root?.textContent?.replace(/\s/g, "") ?? "";
  if (text.length < 100) return true;
  const inner = root?.innerHTML?.replace(/\s/g, "") ?? "";
  return text.length < 160 && inner.length < 280;
}

/** PWA·TWA·iOS 홈화면 등: 시스템 뒤로가기 시 SPA가 자주 깨짐 */
function isStandaloneLike(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if ((window.navigator as unknown as { standalone?: boolean }).standalone === true) return true;
    return window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

/**
 * TWA·WebView에서 /radio/:slug → 뒤로가기 시 빈 화면이 되는 경우 대응.
 * - sessionStorage에 마지막 wouter 경로를 동기 저장 → popstate 시점에 직전 경로 확정
 * - standalone(TWA/홈화면): 청취에서 / 또는 /radio 로 돌아오면 곧바로 /radio 전체 로드(블랙 스크린 우선 방지)
 * - 일반 브라우저: #root 가 비어 보일 때만 복구 + 지연 1회 재시도
 */
export function RadioBackNavigationRecovery() {
  const [loc] = useLocation();
  const committedPathRef = useRef(loc);
  const recoveringRef = useRef(false);

  useLayoutEffect(() => {
    committedPathRef.current = loc;
    try {
      sessionStorage.setItem(SS_LAST_SPA_PATH, loc);
    } catch {
      /* ignore */
    }
  }, [loc]);

  useEffect(() => {
    const goRadio = () => {
      if (recoveringRef.current) return;
      recoveringRef.current = true;
      window.location.replace(`${window.location.origin}/radio`);
    };

    const onPop = () => {
      let stored = "";
      try {
        stored = sessionStorage.getItem(SS_LAST_SPA_PATH) || "";
      } catch {
        stored = "";
      }
      const beforePath = normalizePath(stored || committedPathRef.current || "/");
      if (!pathIsRadioListenChannel(beforePath)) return;

      const nowPath = normalizePath(window.location.pathname);
      if (nowPath !== "/" && nowPath !== "/radio") return;

      if (recoveringRef.current) return;

      if (isStandaloneLike()) {
        goRadio();
        return;
      }

      window.setTimeout(() => {
        if (recoveringRef.current) return;
        if (!rootLooksBroken()) return;
        goRadio();
      }, 400);

      window.setTimeout(() => {
        if (recoveringRef.current) return;
        if (!rootLooksBroken()) return;
        goRadio();
      }, 900);
    };

    const onPageShow = (ev: PageTransitionEvent) => {
      if (!ev.persisted) return;
      const p = normalizePath(window.location.pathname);
      if (pathIsRadioListenChannel(p)) {
        window.location.reload();
      }
    };

    window.addEventListener("popstate", onPop, true);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("popstate", onPop, true);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
