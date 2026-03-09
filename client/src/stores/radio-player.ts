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
  setStream: (slug: string, channelName: string, streamUrl: string, initialSeekSeconds?: number) => void;
  setPlaying: (playing: boolean) => void;
  setUserStopped: (stopped: boolean) => void;
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
  setStream: (slug, channelName, streamUrl, initialSeekSeconds) =>
    set({
      slug,
      channelName,
      streamUrl,
      initialSeekSeconds: initialSeekSeconds ?? null,
    }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setUserStopped: (userStopped) => set({ userStopped }),
  requestPlay: () => set((s) => ({ playTrigger: s.playTrigger + 1, userStopped: false })),
  requestPause: () => set((s) => ({ pauseTrigger: s.pauseTrigger + 1, userStopped: true })),
  clear: () =>
    set({
      slug: null,
      channelName: null,
      streamUrl: null,
      isPlaying: false,
      userStopped: false,
      initialSeekSeconds: null,
    }),
}));
