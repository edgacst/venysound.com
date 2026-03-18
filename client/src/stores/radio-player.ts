import { create } from "zustand";

const _currentTimeRef = { current: 0 };

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
