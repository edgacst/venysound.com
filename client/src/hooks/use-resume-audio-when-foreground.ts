import { useEffect, useRef } from "react";

export type ResumeAudioWhenForegroundOptions = {
  /** play() 직전 (예: AudioContext.resume) */
  prepareResume?: () => void;
};

/**
 * 통화·다른 앱 전환 등으로 OS가 오디오를 멈춘 뒤, 다시 앱/탭이 앞으로 오면 재생을 이어갑니다.
 * `shouldResumeAfterInterruption`이 true일 때만 시도하므로(예: userStopped·pauseRequested) 사용자가 정지한 경우는 건드리지 않습니다.
 */
export function useResumeAudioWhenForeground(
  getAudio: () => HTMLAudioElement | null,
  shouldResumeAfterInterruption: () => boolean,
  options?: ResumeAudioWhenForegroundOptions,
) {
  const getAudioRef = useRef(getAudio);
  const shouldRef = useRef(shouldResumeAfterInterruption);
  const prepareRef = useRef(options?.prepareResume);
  getAudioRef.current = getAudio;
  shouldRef.current = shouldResumeAfterInterruption;
  prepareRef.current = options?.prepareResume;

  useEffect(() => {
    const getEl = () => getAudioRef.current();
    const resumeTimers = new Set<number>();

    const hasPlayableSrc = (a: HTMLAudioElement) => {
      const s = a.src || "";
      if (!s || s === window.location.href) return false;
      return true;
    };

    /** 곡 말미 pause(ended·client-advance)와 통화 일시정지 구분 */
    const isLikelyTrackEndPause = (a: HTMLAudioElement) => {
      if (a.ended) return true;
      const d = a.duration;
      return Number.isFinite(d) && d >= 2 && a.currentTime >= d - 0.35;
    };

    const attemptPlay = (el: HTMLAudioElement) => {
      prepareRef.current?.();
      el.muted = false;
      void el.play().catch(() => {});
    };

    const tryResume = () => {
      if (!shouldRef.current()) return;
      const run = () => {
        const a = getEl();
        if (!a || !hasPlayableSrc(a) || isLikelyTrackEndPause(a)) return;
        attemptPlay(a);
        for (const delay of [320, 900, 2000]) {
          const tid = window.setTimeout(() => {
            resumeTimers.delete(tid);
            if (!shouldRef.current()) return;
            const a2 = getEl();
            if (!a2 || !hasPlayableSrc(a2) || isLikelyTrackEndPause(a2)) return;
            attemptPlay(a2);
          }, delay);
          resumeTimers.add(tid);
        }
      };
      requestAnimationFrame(run);
    };

    /** 통화 등 OS pause: 앱이 foreground에 남아 있어도 통화 종료 후 재개 */
    const onElementPause = () => {
      if (!shouldRef.current()) return;
      const a = getEl();
      if (!a || !hasPlayableSrc(a) || isLikelyTrackEndPause(a)) return;
      for (const delay of [400, 1200, 2800]) {
        const tid = window.setTimeout(() => {
          resumeTimers.delete(tid);
          tryResume();
        }, delay);
        resumeTimers.add(tid);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") tryResume();
    };

    let attached: HTMLAudioElement | null = null;
    const syncPauseListener = () => {
      const el = getEl();
      if (el === attached) return;
      attached?.removeEventListener("pause", onElementPause);
      attached = el;
      attached?.addEventListener("pause", onElementPause);
    };
    syncPauseListener();
    const attachPoll = window.setInterval(syncPauseListener, 600);

    window.addEventListener("focus", tryResume);
    window.addEventListener("pageshow", tryResume);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      for (const tid of resumeTimers) window.clearTimeout(tid);
      resumeTimers.clear();
      window.clearInterval(attachPoll);
      attached?.removeEventListener("pause", onElementPause);
      window.removeEventListener("focus", tryResume);
      window.removeEventListener("pageshow", tryResume);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
