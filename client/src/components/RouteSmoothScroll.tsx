import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * 상단 네비 등으로 페이지가 바뀔 때 본문을 부드럽게 맨 위로 스크롤합니다.
 * 첫 마운트(새로고침·직접 URL 진입)에서는 스크롤 위치를 건드리지 않습니다.
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
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [loc]);

  return null;
}
