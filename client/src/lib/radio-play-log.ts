/**
 * 라디오(GlobalRadioPlayer) play() 실패·진단 로그.
 * 단말(TWA/S24 등)에서 NotAllowedError / AbortError 원인 추적용.
 *
 * 모바일 콘솔이 없을 때:
 * - 쿼리: `?venyRadioDebug=1` 한 번 접속
 * - 해시(검색과 헷갈리지 않음): `#venyRadioDebug=1` — 북마크에 넣기 좋음
 * - 또는 `localStorage.setItem('venyRadioDebug','1')` 후 새로고침
 * → 화면 상단에 최근 줄이 쌓임.
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

/** 해시 `#venyRadioDebug=1` 등 — 주소창에 URL로 넣을 때 검색으로 안 빠지는 편. 적용 후 해시는 지움. */
export function primeRadioDebugFromHash(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.location.hash.replace(/^#/, "").trim();
    if (!raw) return;
    const enable =
      raw === "venyRadioDebug=1" ||
      raw === "venyRadioDebug" ||
      raw === "radioDebug=1" ||
      /^venyRadioDebug=1(&|$)/.test(raw) ||
      /^radioDebug=1(&|$)/.test(raw);
    if (!enable) return;
    window.localStorage.setItem(RADIO_DEBUG_STORAGE_KEY, "1");
    window.dispatchEvent(new CustomEvent("veny-radio-debug-changed"));
    const u = new URL(window.location.href);
    u.hash = "";
    window.history.replaceState(null, "", `${u.pathname}${u.search}`);
  } catch {
    /* ignore */
  }
}

export function primeRadioDebugFromUrl(): void {
  primeRadioDebugFromSearch();
  primeRadioDebugFromHash();
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
