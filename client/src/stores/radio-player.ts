import { create } from "zustand";

const _currentTimeRef = { current: 0 };

function radioStreamSameAsset(prevUrl: string, nextUrl: string): boolean {
  if (prevUrl === nextUrl) return true;
  if (typeof window === "undefined") return false;
  try {
    return new URL(prevUrl, window.location.origin).pathname === new URL(nextUrl, window.location.origin).pathname;
  } catch {
    return false;
  }
}

/**
 * 채널 동기화용 seek 초: **다른 곡·다른 소스로 갈아탈 때** 서버 elapsed는 전곡/경합으로 틀릴 수 있어 무시(0부터).
 * 최초 진입(prev 없음) 또는 동일 스트림이면 서버 값 사용.
 */
export function radioSeekSecondsForHandoff(
  prevStreamUrl: string | null | undefined,
  nextStreamUrl: string,
  serverElapsedSeconds: number | null | undefined,
): number | undefined {
  if (serverElapsedSeconds == null || typeof serverElapsedSeconds !== "number" || !Number.isFinite(serverElapsedSeconds)) {
    return undefined;
  }
  const sec = Math.max(0, Math.floor(serverElapsedSeconds));
  if (sec <= 0) return undefined;
  if (!prevStreamUrl) return sec;
  if (radioStreamSameAsset(prevStreamUrl, nextStreamUrl)) return sec;
  return undefined;
}

type RadioPlayerState = {
  slug: string | null;
  channelName: string | null;
  trackTitle: string | null;
  streamUrl: string | null;
  isPlaying: boolean;
  userStopped: boolean;
  initialSeekSeconds: number | null;
  playTrigger: number;
  pauseTrigger: number;
  playNowRef: { current: (() => void) | null } | null;
  currentTimeRef: { current: number };
  setStream: (slug: string, channelName: string, streamUrl: string, initialSeekSeconds?: number) => void;
  setTrackTitle: (title: string | null) => void;
  setPlaying: (playing: boolean) => void;
  setUserStopped: (stopped: boolean) => void;
  setPlayNowRef: (ref: { current: (() => void) | null } | null) => void;
  requestPlay: () => void;
  requestPause: () => void;
  clear: () => void;
};

export const useRadioPlayerStore = create<RadioPlayerState>((set) => ({
  slug: null,
  channelName: null,
  trackTitle: null,
  streamUrl: null,
  isPlaying: false,
  userStopped: false,
  initialSeekSeconds: null,
  playTrigger: 0,
  pauseTrigger: 0,
  playNowRef: null,
  currentTimeRef: _currentTimeRef,
  setStream: (slug, channelName, streamUrl, initialSeekSeconds) =>
    set({
      slug,
      channelName,
      streamUrl,
      initialSeekSeconds: initialSeekSeconds ?? null,
      userStopped: false, // 새 채널 진입 시 정지 상태 초기화
    }),
  setTrackTitle: (trackTitle) => set({ trackTitle }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setUserStopped: (userStopped) => set({ userStopped }),
  setPlayNowRef: (playNowRef) => set({ playNowRef }),
  requestPlay: () => {
    set((s) => ({ playTrigger: s.playTrigger + 1, userStopped: false }));
    useRadioPlayerStore.getState().playNowRef?.current?.();
  },
  requestPause: () => set((s) => ({ pauseTrigger: s.pauseTrigger + 1, userStopped: true })),
  clear: () =>
    set({
      slug: null,
      channelName: null,
      trackTitle: null,
      streamUrl: null,
      isPlaying: false,
      userStopped: false,
      initialSeekSeconds: null,
      playNowRef: null,
    }),
}));
