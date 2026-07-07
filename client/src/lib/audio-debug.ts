type AudioDebugPayload = Record<string, unknown>;

const AUDIO_DEBUG_KEY = "venyAudioDebug";
const AUDIO_DEBUG_BUFFER_KEY = "venyAudioDebugBuffer";
const MAX_AUDIO_DEBUG_LINES = 120;

function isAudioDebugEnabled() {
  try {
    return window.localStorage.getItem(AUDIO_DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

function bufferedSummary(el: HTMLMediaElement) {
  try {
    if (!el.buffered?.length) return [];
    return Array.from({ length: el.buffered.length }, (_, i) => [
      Number(el.buffered.start(i).toFixed(2)),
      Number(el.buffered.end(i).toFixed(2)),
    ]);
  } catch {
    return "unavailable";
  }
}

function mediaErrorSummary(el: HTMLMediaElement) {
  if (!el.error) return null;
  return {
    code: el.error.code,
    message: el.error.message,
  };
}

export function audioDebugLog(
  source: "music" | "radio" | "resume-hook",
  event: string,
  el?: HTMLMediaElement | null,
  payload: AudioDebugPayload = {},
) {
  if (typeof window === "undefined" || !isAudioDebugEnabled()) return;
  const state = el
    ? {
        paused: el.paused,
        ended: el.ended,
        muted: el.muted,
        volume: Number(el.volume.toFixed(2)),
        currentTime: Number(el.currentTime.toFixed(2)),
        duration: Number.isFinite(el.duration) ? Number(el.duration.toFixed(2)) : String(el.duration),
        readyState: el.readyState,
        networkState: el.networkState,
        src: el.currentSrc || el.src || "",
        buffered: bufferedSummary(el),
        error: mediaErrorSummary(el),
      }
    : {};
  const entry = {
    at: new Date().toISOString(),
    source,
    event,
    visibility: document.visibilityState,
    focused: document.hasFocus(),
    mediaSessionState: "mediaSession" in navigator ? navigator.mediaSession.playbackState : "unsupported",
    ...state,
    ...payload,
  };
  try {
    const prev = window.localStorage.getItem(AUDIO_DEBUG_BUFFER_KEY) || "";
    const lines = prev ? prev.split("\n").filter(Boolean) : [];
    lines.push(JSON.stringify(entry));
    window.localStorage.setItem(AUDIO_DEBUG_BUFFER_KEY, lines.slice(-MAX_AUDIO_DEBUG_LINES).join("\n"));
  } catch {
    /* ignore */
  }
  console.info("[veny-audio-debug]", entry);
}
