import { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/components/AudioPlayer";
import { useRadioPlayerStore } from "@/stores/radio-player";
import { useTranslation } from "react-i18next";

const SCROLL_THRESHOLD = 400;
/** 스크롤이 깊어질수록 플레이바 위로 더 올림 (상한) — 진행바+컨트롤 행·라디오 플로팅 대비 */
const SCROLL_EXTRA_LIFT_MAX_PX = 120;

export function ScrollToTop() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const activeMusicId = usePlayerStore((s) => s.activeMusicId);
  const activeExternalTrack = usePlayerStore((s) => s.activeExternalTrack);
  const radioSlug = useRadioPlayerStore((s) => s.slug);

  const onScroll = useCallback(() => {
    const y = window.scrollY;
    setScrollY(y);
    setVisible(y > SCROLL_THRESHOLD);
  }, []);

  useEffect(() => {
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const musicBarVisible = activeMusicId != null || activeExternalTrack != null;
  const radioBarVisible = (radioSlug ?? "").trim().length > 0;

  const extraLiftPx = useMemo(() => {
    if (!visible) return 0;
    return Math.min(
      SCROLL_EXTRA_LIFT_MAX_PX,
      Math.max(0, Math.floor((scrollY - SCROLL_THRESHOLD) / 10)),
    );
  }, [visible, scrollY]);

  /** 음악 플레이바(진행바+h-10~12 행) + 라디오(bottom-2 플로팅) 동시 노출 시 더 높게 */
  const bothBarsVisible = musicBarVisible && radioBarVisible;
  const bottomRem = bothBarsVisible ? 13 : musicBarVisible ? 11.5 : radioBarVisible ? 7.5 : 1.5;

  if (!visible) return null;

  return (
    <Button
      size="icon"
      variant="secondary"
      className="fixed right-4 z-[60] size-11 rounded-full border border-yellow-300 bg-yellow-400 text-black shadow-lg backdrop-blur hover:bg-yellow-500"
      style={{
        marginRight: "env(safe-area-inset-right)",
        bottom: `calc(${bottomRem}rem + env(safe-area-inset-bottom) + ${extraLiftPx}px)`,
      }}
      onClick={scrollToTop}
      aria-label={t("common.scrollToTop", "맨 위로")}
      data-testid="button-scroll-to-top"
    >
      <ArrowUp size={20} />
    </Button>
  );
}
