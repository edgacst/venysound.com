import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "wouter";

/** popstate 직전 SPA 경로 (layout effect로 동기 기록) */
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

/**
 * TWA·모바일 크롬 등에서 /radio/:slug → 시스템 뒤로가기 시 SPA가 멈추거나 검은 화면만 남는 경우.
 *
 * #root 안에 글로벌 플레이어·숨김 텍스트가 많아 "빈 화면" 자동 판별(root 텍스트 길이)은 오탐/미탐이 심함.
 * 청취 페이지에서만 / 또는 /radio 로 돌아온 popstate 한 번이면 **항상** /radio 로 전체 로드해 복구한다.
 * (홈으로 돌아가고 싶으면 상단에서 홈 링크 사용.)
 */
export function RadioBackNavigationRecovery() {
  const [loc] = useLocation();
  const committedPathRef = useRef(loc);
  const recoveringRef = useRef(false);

  useLayoutEffect(() => {
    committedPathRef.current = loc;
    try {
      const p = normalizePath(loc || window.location.pathname || "/");
      sessionStorage.setItem(SS_LAST_SPA_PATH, p);
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
      goRadio();
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
