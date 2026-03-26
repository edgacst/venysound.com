import { useEffect, useRef } from "react";

/**
 * 화면 잠금·탭 전환 등으로 브라우저가 오디오를 멈춘 뒤, 다시 앞으로 가져오면 재생을 이어갑니다.
 * (화면이 꺼진 동안에도 끊기지 않게 하는 것은 iOS/Android 정책상 항상 보장되지는 않습니다.)
 */
export function useResumeAudioWhenForeground(
  getAudio: () => HTMLAudioElement | null,
  shouldResumeAfterInterruption: () => boolean,
) {
  const getAudioRef = useRef(getAudio);
  const shouldRef = useRef(shouldResumeAfterInterruption);
  getAudioRef.current = getAudio;
  shouldRef.current = shouldResumeAfterInterruption;
  const wasAudiblyPlayingRef = useRef(false);

  useEffect(() => {
    const el = () => getAudioRef.current();

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        const a = el();
        wasAudiblyPlayingRef.current = !!(a && !a.paused && !a.ended);
        return;
      }
      if (document.visibilityState !== "visible") return;
      if (!wasAudiblyPlayingRef.current) return;
      if (!shouldRef.current()) return;
      requestAnimationFrame(() => {
        const a = el();
        if (a && a.paused) a.play().catch(() => {});
      });
    };

    const onPageShow = () => {
      if (!wasAudiblyPlayingRef.current) return;
      if (!shouldRef.current()) return;
      requestAnimationFrame(() => {
        const a = el();
        if (a && a.paused) a.play().catch(() => {});
      });
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
}
