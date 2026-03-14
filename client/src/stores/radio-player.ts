import { create } from "zustand";

type RadioPlayerState = {
  slug: string | null;
  channelName: string | null;
  streamUrl: string | null;
  isPlaying: boolean;
  userStopped: boolean;
  /** Seek to this position (seconds) when audio canplay fires. Cleared after use. */
  initialSeekSeconds: number | null;
  /** Increment to request play from GlobalRadioPlayer (e.g. from RadioChannel page). */
  playTrigger: number;
  /** Increment to request pause from GlobalRadioPlayer. */
  pauseTrigger: number;
  /** 모바일: 사용자 제스처 직후 동기적으로 play() 호출용. GlobalRadioPlayer가 설정. */
  playNowRef: { current: (() => void) | null } | null;
  setStream: (slug: string, channelName: string, streamUrl: string, initialSeekSeconds?: number) => void;
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
  streamUrl: null,
  isPlaying: false,
  userStopped: false,
  initialSeekSeconds: null,
  playTrigger: 0,
  pauseTrigger: 0,
  playNowRef: null,
  setStream: (slug, channelName, streamUrl, initialSeekSeconds) =>
    set({
      slug,
      channelName,
      streamUrl,
      initialSeekSeconds: initialSeekSeconds ?? null,
    }),
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
      streamUrl: null,
      isPlaying: false,
      userStopped: false,
      initialSeekSeconds: null,
      playNowRef: null,
    }),
}));
