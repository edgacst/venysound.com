import { useEffect, useRef } from "react";
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

const SS_HREF = "venyNavBeforePop";

/**
 * TWA·일부 WebView에서 /radio/:slug 에서 뒤로가기 시 SPA는 빈 화면만 남는 경우가 있음.
 * history.replaceState 로 스택을 만지면 wouter와 엇갈릴 수 있어, popstate 후 본문이 비었으면
 * /radio 로 전체 네비게이션으로 복구한다.
 */
export function RadioBackNavigationRecovery() {
  const [loc] = useLocation();
  const recoveringRef = useRef(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(SS_HREF, window.location.href);
    } catch {
      /* ignore */
    }
  }, [loc]);

  useEffect(() => {
    const onPop = () => {
      let beforeHref = "";
      try {
        beforeHref = sessionStorage.getItem(SS_HREF) || "";
      } catch {
        beforeHref = "";
      }

      let beforePath = "";
      try {
        beforePath = beforeHref ? new URL(beforeHref).pathname : "";
      } catch {
        beforePath = "";
      }

      const wasRadioListen = pathIsRadioListenChannel(beforePath);
      if (!wasRadioListen) return;

      const nowPath = (window.location.pathname.replace(/\/$/, "") || "/").split("?")[0];
      if (nowPath !== "/" && nowPath !== "/radio") return;

      if (recoveringRef.current) return;

      window.setTimeout(() => {
        if (recoveringRef.current) return;
        const root = document.getElementById("root");
        const text = root?.textContent?.replace(/\s/g, "") ?? "";
        // 정상 홈·방송국은 텍스트가 훨씬 많음. 빈/깨진 트리만 복구
        if (text.length >= 100) return;

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

    window.addEventListener("popstate", onPop);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
