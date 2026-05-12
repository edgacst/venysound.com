/**
 * 라디오(GlobalRadioPlayer) play() 실패·진단 로그.
 * 단말(TWA/S24 등)에서 NotAllowedError / AbortError 원인 추적용.
 *
 * 모바일 콘솔이 없을 때: 주소에 `?venyRadioDebug=1` 을 붙여 한 번 접속하거나
 * `localStorage.setItem('venyRadioDebug','1')` 후 새로고침 → 화면 상단에 최근 줄이 쌓임.
 */
export const RADIO_DEBUG_STORAGE_KEY = "venyRadioDebug";
const RADIO_DEBUG_QUERY_KEY = "venyRadioDebug";

const MAX_SCREEN_LINES = 18;
const screenLines: string[] = [];
const screenListeners = new Set<() => void>();

function bumpScreenListeners(): void {
  screenListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

/** URL `?venyRadioDebug=1` 이면 localStorage 에 플래그 저장(모바일에서 켜기 쉽게). */
export function primeRadioDebugFromSearch(): void {
  if (typeof window === "undefined") return;
  try {
    const v = new URLSearchParams(window.location.search).get(RADIO_DEBUG_QUERY_KEY);
    if (v === "1" || v === "true") {
      window.localStorage.setItem(RADIO_DEBUG_STORAGE_KEY, "1");
      window.dispatchEvent(new CustomEvent("veny-radio-debug-changed"));
    }
  } catch {
    /* ignore */
  }
}

export function isRadioScreenDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RADIO_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function getRadioScreenDebugLines(): readonly string[] {
  return screenLines;
}

export function subscribeRadioScreenDebug(listener: () => void): () => void {
  screenListeners.add(listener);
  return () => {
    screenListeners.delete(listener);
  };
}

export function clearRadioScreenDebug(): void {
  screenLines.length = 0;
  bumpScreenListeners();
}

function pushRadioScreenDebugLine(line: string): void {
  if (!isRadioScreenDebugEnabled()) return;
  const ts = new Date().toISOString().slice(11, 23);
  const entry = `${ts} ${line.slice(0, 520)}`;
  screenLines.push(entry);
  while (screenLines.length > MAX_SCREEN_LINES) screenLines.shift();
  bumpScreenListeners();
}

export function logRadioPlayFail(label: string, err: unknown, el?: HTMLAudioElement | null): void {
  try {
    const e = err as DOMException & Error;
    const vis = typeof document !== "undefined" ? document.visibilityState : undefined;
    console.warn("[RADIO_PLAY_FAIL]", {
      label,
      name: e?.name,
      message: e?.message,
      paused: el?.paused,
      ended: el?.ended,
      readyState: el?.readyState,
      networkState: el?.networkState,
      visibility: vis,
      src: el?.src ? String(el.src).slice(0, 220) : undefined,
      currentTime: el?.currentTime,
    });
    pushRadioScreenDebugLine(
      `FAIL ${label} ${e?.name ?? "?"} ${e?.message ?? String(err)} vis=${vis} rs=${el?.readyState} ns=${el?.networkState}`,
    );
  } catch {
    console.warn("[RADIO_PLAY_FAIL]", { label, err });
    pushRadioScreenDebugLine(`FAIL ${label} (log err)`);
  }
}

export function logRadioDiag(label: string, payload?: Record<string, unknown>): void {
  try {
    const vis = typeof document !== "undefined" ? document.visibilityState : undefined;
    console.warn(`[RADIO] ${label}`, {
      ...payload,
      visibility: vis,
    });
    let extra = "";
    try {
      extra = payload ? JSON.stringify(payload).slice(0, 280) : "";
    } catch {
      extra = "";
    }
    pushRadioScreenDebugLine(`DIAG ${label} ${extra}`);
  } catch {
    console.warn(`[RADIO] ${label}`);
    pushRadioScreenDebugLine(`DIAG ${label}`);
  }
}
