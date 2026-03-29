import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "wouter";

/** /radio/:slug 청취 페이지( studio / create / channels 제외 ) */
function pathIsRadioListenChannel(pathname: string): boolean {
  const p = (pathname.replace(/\/$/, "") || "/").split("?")[0];
  const parts = p.split("/").filter(Boolean);
  if (parts.length !== 2) return false;
  if (parts[0] !== "radio") return false;
  const s = parts[1].toLowerCase();
  return s !== "channels" && s !== "create";
}

function rootLooksBroken(): boolean {
  const root = document.getElementById("root");
  const text = root?.textContent?.replace(/\s/g, "") ?? "";
  if (text.length < 100) return true;
  const inner = root?.innerHTML?.replace(/\s/g, "") ?? "";
  // 빈 트리·깨진 하이드레이션: 텍스트는 있는데 DOM이 비정상적으로 얇은 경우
  return text.length < 160 && inner.length < 280;
}

/**
 * TWA·일부 WebView에서 /radio/:slug 에서 뒤로가기 시 SPA가 빈 화면만 남는 경우가 있음.
 * sessionStorage로 직전 URL을 잡으면 popstate 직후 useEffect가 새 URL로 덮어 실패할 수 있어,
 * useLayoutEffect로 동기화한 ref를 popstate **capture**에서 읽는다.
 */
export function RadioBackNavigationRecovery() {
  const [loc] = useLocation();
  /** 마지막으로 커밋된 wouter 경로 — capture 단계 popstate 시 아직 이전 값 */
  const committedPathRef = useRef(loc);
  const recoveringRef = useRef(false);

  useLayoutEffect(() => {
    committedPathRef.current = loc;
  }, [loc]);

  useEffect(() => {
    const onPop = () => {
      const beforeRaw = committedPathRef.current || "/";
      const beforePath = (beforeRaw.replace(/\/$/, "") || "/").split("?")[0];
      if (!pathIsRadioListenChannel(beforePath)) return;

      const nowPath = (window.location.pathname.replace(/\/$/, "") || "/").split("?")[0];
      if (nowPath !== "/" && nowPath !== "/radio") return;

      if (recoveringRef.current) return;

      window.setTimeout(() => {
        if (recoveringRef.current) return;
        if (!rootLooksBroken()) return;

        recoveringRef.current = true;
        window.location.replace(`${window.location.origin}/radio`);
      }, 400);
    };

    const onPageShow = (ev: PageTransitionEvent) => {
      if (!ev.persisted) return;
      const p = window.location.pathname.replace(/\/$/, "") || "/";
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
