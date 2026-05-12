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

    const attemptPlay = (el: HTMLAudioElement) => {
      el.muted = false;
      el.volume = Math.max(el.volume, 1);
      void el.play().catch(() => {});
    };

    const tryResume = () => {
      if (!shouldRef.current()) return;
      const run = () => {
        const a = getEl();
        if (!a || a.ended || !hasPlayableSrc(a)) return;
        // 통화 직후 일부 단말은 paused가 아닌데도 무음이거나, paused인데 focus가 늦게 오는 경우가 있어 항상 play() 시도
        attemptPlay(a);
        window.setTimeout(() => {
          if (!shouldRef.current()) return;
          const a2 = getEl();
          if (!a2 || a2.ended || !hasPlayableSrc(a2)) return;
          if (a2.paused) attemptPlay(a2);
        }, 320);
      };
      requestAnimationFrame(run);
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
