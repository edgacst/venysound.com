import { useEffect, useRef } from "react";

/**
 * 통화·다른 앱 전환 등으로 OS가 오디오를 멈춘 뒤, 다시 앱/탭이 앞으로 오면 재생을 이어갑니다.
 * `shouldResumeAfterInterruption`이 true일 때만 시도하므로(예: userStopped·스트림 없음) 사용자가 정지한 경우는 건드리지 않습니다.
 * (백그라운드에서 끊기지 않게 하는 것은 iOS/Android 정책상 항상 보장되지는 않습니다.)
 */
export function useResumeAudioWhenForeground(
  getAudio: () => HTMLAudioElement | null,
  shouldResumeAfterInterruption: () => boolean,
) {
  const getAudioRef = useRef(getAudio);
  const shouldRef = useRef(shouldResumeAfterInterruption);
  getAudioRef.current = getAudio;
  shouldRef.current = shouldResumeAfterInterruption;

  useEffect(() => {
    const getEl = () => getAudioRef.current();

    const hasPlayableSrc = (a: HTMLAudioElement) => {
      const s = a.src || "";
      if (!s || s === window.location.href) return false;
      return true;
    };

    const tryResume = () => {
      if (!shouldRef.current()) return;
      requestAnimationFrame(() => {
        const a = getEl();
        if (!a || !a.paused || a.ended || !hasPlayableSrc(a)) return;
        a.play().catch(() => {});
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") tryResume();
    };

    window.addEventListener("focus", tryResume);
    window.addEventListener("pageshow", tryResume);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", tryResume);
      window.removeEventListener("pageshow", tryResume);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
