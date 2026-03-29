import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "wouter";

/** popstate 직전 SPA 경로 (layout effect로 동기 기록) */
const SS_LAST_SPA_PATH = "venyLastSpaPath";

/** /radio/:slug 청취 페이지(studio·create·channels 제외 — 세그먼트 2개뿐인 경우만) */
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

function pathIsRadioUtilityPage(pathname: string): boolean {
  const p = normalizePath(pathname);
  return p === "/radio/channels" || p === "/radio/create";
}

/**
 * TWA·모바일 크롬 등에서 /radio/:slug → 시스템 뒤로가기 시 SPA가 멈추거나 검은 화면만 남는 경우.
 *
 * #root 안에 글로벌 플레이어·숨김 텍스트가 많아 "빈 화면" 자동 판별(root 텍스트 길이)은 오탐/미탐이 심함.
 * 청취 페이지에서 시스템 뒤로가기로 **홈(/)** 까지 나온 경우에만 /radio 로 전체 로드해 복구한다.
 * (/radio 로만 돌아간 경우는 SPA가 정상 복구되는 경우가 많아 여기서 replace 하면 오히려 멈춤·깜빡임 유발)
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
      if (pathIsRadioUtilityPage(nowPath)) return;
      if (nowPath !== "/") return;

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
