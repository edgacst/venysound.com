import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * 상단 네비 등으로 페이지가 바뀔 때, 대시보드 해시 앵커(#…)와 같은 방식으로
 * 메인 영역을 scrollIntoView(smooth) 합니다. 고정 헤더 여백은 #app-main-scroll 의 scroll-mt 로 맞춥니다.
 * URL에 해시가 있으면(예: /dashboard#global-distribution-management) 페이지 쪽 스크롤 로직에 맡깁니다.
 */
export function RouteSmoothScroll() {
  const [loc] = useLocation();
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevRef.current === null) {
      prevRef.current = loc;
      return;
    }
    if (prevRef.current === loc) return;
    prevRef.current = loc;

    try {
      const h = window.location.hash;
      if (h && h.length > 1) return;
    } catch {
      /* ignore */
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById("app-main-scroll");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
        } else {
          window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
        }
      });
    });
  }, [loc]);

  return null;
}
