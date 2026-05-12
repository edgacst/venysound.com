/**
 * 라디오(GlobalRadioPlayer) play() 실패·진단 로그.
 * 단말(TWA/S24 등)에서 NotAllowedError / AbortError 원인 추적용.
 */
export function logRadioPlayFail(label: string, err: unknown, el?: HTMLAudioElement | null): void {
  try {
    const e = err as DOMException & Error;
    console.warn("[RADIO_PLAY_FAIL]", {
      label,
      name: e?.name,
      message: e?.message,
      paused: el?.paused,
      ended: el?.ended,
      readyState: el?.readyState,
      networkState: el?.networkState,
      visibility: typeof document !== "undefined" ? document.visibilityState : undefined,
      src: el?.src ? String(el.src).slice(0, 220) : undefined,
      currentTime: el?.currentTime,
    });
  } catch {
    console.warn("[RADIO_PLAY_FAIL]", { label, err });
  }
}

export function logRadioDiag(label: string, payload?: Record<string, unknown>): void {
  try {
    console.warn(`[RADIO] ${label}`, {
      ...payload,
      visibility: typeof document !== "undefined" ? document.visibilityState : undefined,
    });
  } catch {
    console.warn(`[RADIO] ${label}`);
  }
}
