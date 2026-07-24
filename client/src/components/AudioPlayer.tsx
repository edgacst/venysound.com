import { useMusic, useMusicList } from "@/hooks/use-music";
import { create } from 'zustand';
import { motion, AnimatePresence } from 'framer-motion';
import { X, SkipBack, SkipForward, Play, Pause, Volume2, VolumeX, FileText, Repeat, Repeat1, Shuffle, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { resolveStorageUrl } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { blockGuestPlaybackIfNeeded } from "@/lib/guest-listen-quota";
import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Slider } from "@/components/ui/slider";
import { useTranslation } from 'react-i18next';
import { useLocation } from "wouter";
import { useResumeAudioWhenForeground } from "@/hooks/use-resume-audio-when-foreground";
import { useScreenWakeLockWhilePlaying } from "@/hooks/use-screen-wake-lock-while-playing";
import { useRadioPlayerStore } from "@/stores/radio-player";
import { audioDebugLog } from "@/lib/audio-debug";

type RepeatMode = 'none' | 'all' | 'one';

function playWithSoftStart(el: HTMLMediaElement, targetVolume = 1): Promise<void> {
  const volume = Math.max(0, Math.min(1, targetVolume));
  el.muted = false;
  if (document.visibilityState !== "visible") {
    el.volume = volume;
    return el.play();
  }
  el.volume = 0;
  return el.play().then(
    () =>
      new Promise<void>((resolve) => {
        const startedAt = performance.now();
        const tick = () => {
          if (document.visibilityState !== "visible") {
            el.volume = volume;
            resolve();
            return;
          }
          const ratio = Math.min(1, (performance.now() - startedAt) / 90);
          el.volume = volume * ratio;
          if (ratio < 1) {
            requestAnimationFrame(tick);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(tick);
      }),
    (err) => {
      el.volume = volume;
      throw err;
    },
  );
}

export interface ExternalTrack {
  url: string;
  title: string;
  artist?: string;
  imageUrl?: string;
}

interface PlayerStore {
  activeMusicId: number | null;
  activeExternalTrack: ExternalTrack | null;
  playlist: number[];
  queue: number[];
  pauseRequested: boolean;
  lyricsRequested: boolean;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  shuffledOrder: number[];
  playMusic: (id: number) => void;
  playMusicWithLyrics: (id: number) => void;
  playExternalTrack: (track: ExternalTrack) => void;
  togglePause: () => void;
  setPauseRequested: (paused: boolean) => void;
  setPlaylist: (ids: number[]) => void;
  closePlayer: () => void;
  clearLyricsRequest: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  addToQueue: (id: number) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  reorderQueue: (from: number, to: number) => void;
}

function shuffleArray(arr: number[]): number[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** 라디오 글로벌 플레이어와 음악 글로벌 플레이어가 동시에 뜨지 않도록 */
function clearGlobalRadioForOnDemandPlayback() {
  useRadioPlayerStore.getState().clear();
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  activeMusicId: null,
  activeExternalTrack: null,
  playlist: [],
  queue: [],
  pauseRequested: false,
  lyricsRequested: false,
  repeatMode: 'none',
  shuffleEnabled: false,
  shuffledOrder: [],
  playMusic: (id) => {
    if (blockGuestPlaybackIfNeeded()) return;
    clearGlobalRadioForOnDemandPlayback();
    set({ activeMusicId: id, activeExternalTrack: null, pauseRequested: false, lyricsRequested: false });
  },
  playMusicWithLyrics: (id) => {
    if (blockGuestPlaybackIfNeeded()) return;
    clearGlobalRadioForOnDemandPlayback();
    set({ activeMusicId: id, activeExternalTrack: null, pauseRequested: false, lyricsRequested: true });
  },
  playExternalTrack: (track) => {
    if (blockGuestPlaybackIfNeeded()) return;
    clearGlobalRadioForOnDemandPlayback();
    set({ activeMusicId: null, activeExternalTrack: track, pauseRequested: false, lyricsRequested: false });
  },
  togglePause: () => set((state) => ({ pauseRequested: !state.pauseRequested })),
  setPauseRequested: (paused) => set({ pauseRequested: paused }),
  setPlaylist: (ids) => {
    const state = get();
    set({ playlist: ids, shuffledOrder: state.shuffleEnabled ? shuffleArray(ids) : [] });
  },
  closePlayer: () => set({ activeMusicId: null, activeExternalTrack: null, pauseRequested: false, lyricsRequested: false, queue: [] }),
  clearLyricsRequest: () => set({ lyricsRequested: false }),
  toggleRepeat: () => set((state) => {
    const modes: RepeatMode[] = ['none', 'all', 'one'];
    const nextIndex = (modes.indexOf(state.repeatMode) + 1) % modes.length;
    return { repeatMode: modes[nextIndex] };
  }),
  toggleShuffle: () => set((state) => {
    const newShuffle = !state.shuffleEnabled;
    return {
      shuffleEnabled: newShuffle,
      shuffledOrder: newShuffle ? shuffleArray(state.playlist) : [],
    };
  }),
  addToQueue: (id) => {
    if (blockGuestPlaybackIfNeeded()) return;
    set((state) => ({ queue: [...state.queue, id] }));
  },
  removeFromQueue: (index) => set((state) => ({
    queue: state.queue.filter((_, i) => i !== index),
  })),
  clearQueue: () => set({ queue: [] }),
  reorderQueue: (from, to) => set((state) => {
    const newQueue = [...state.queue];
    const [moved] = newQueue.splice(from, 1);
    newQueue.splice(to, 0, moved);
    return { queue: newQueue };
  }),
}));

function useStreamingTracker(musicId: number | null, onStreamingLimited?: () => void) {
  const startTimeRef = useRef<number | null>(null);
  const trackedMusicIdRef = useRef<number | null>(null);
  const musicIdRef = useRef(musicId);
  musicIdRef.current = musicId;

  const sendLog = useRef((id: number, seconds: number) => {
    if (seconds < 3) return;
    fetch("/api/streaming-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ musicId: id, durationSeconds: Math.round(seconds) }),
      credentials: "include",
    }).then(res => {
      if (res.status === 403) {
        onStreamingLimited?.();
      }
    }).catch(() => {});
  }).current;

  const flush = useRef(() => {
    if (trackedMusicIdRef.current != null && startTimeRef.current != null) {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      sendLog(trackedMusicIdRef.current, elapsed);
    }
    startTimeRef.current = null;
  }).current;

  useEffect(() => {
    if (musicId != null && musicId !== trackedMusicIdRef.current) {
      flush();
      trackedMusicIdRef.current = musicId;
      startTimeRef.current = Date.now();
    }
    if (musicId == null && trackedMusicIdRef.current != null) {
      flush();
      trackedMusicIdRef.current = null;
    }
  }, [musicId, flush]);

  useEffect(() => {
    const handleBeforeUnload = () => flush();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [flush]);

  const onPause = useCallback(() => {
    flush();
  }, [flush]);

  const onPlay = useCallback(() => {
    const mid = musicIdRef.current;
    if (mid != null) {
      trackedMusicIdRef.current = mid;
      startTimeRef.current = Date.now();
    }
  }, []);

  const onEnded = useCallback(() => {
    flush();
  }, [flush]);

  return { onEnded, onPause, onPlay };
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface LrcLine {
  time: number;
  text: string;
}

function parseLRC(lyrics: string): LrcLine[] | null {
  const lrcRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/;
  const lines = lyrics.split("\n").filter(l => l.trim());
  const hasLrc = lines.some(l => lrcRegex.test(l));
  if (!hasLrc) return null;

  const parsed: LrcLine[] = [];
  for (const line of lines) {
    const match = line.match(lrcRegex);
    if (match) {
      const min = parseInt(match[1]);
      const sec = parseInt(match[2]);
      const ms = match[3] ? parseInt(match[3].padEnd(3, "0")) : 0;
      const time = min * 60 + sec + ms / 1000;
      const text = line.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, "").trim();
      if (text) parsed.push({ time, text });
    }
  }
  return parsed.length > 0 ? parsed.sort((a, b) => a.time - b.time) : null;
}

function distributeLines(lyrics: string, duration: number): LrcLine[] {
  const lines = lyrics.split("\n").filter(l => l.trim());
  if (lines.length === 0 || duration <= 0) return lines.map((text, i) => ({ time: i, text }));
  const interval = duration / (lines.length + 1);
  return lines.map((text, i) => ({ time: interval * (i + 1), text }));
}

function MarqueeLyric({ lyrics, currentTime, duration }: { lyrics: string; currentTime: number; duration: number }) {
  const parsedLines = useMemo(() => {
    const lrc = parseLRC(lyrics);
    if (lrc) return lrc;
    return distributeLines(lyrics, duration);
  }, [lyrics, duration]);

  const activeIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < parsedLines.length; i++) {
      if (currentTime >= parsedLines[i].time) idx = i;
      else break;
    }
    return idx;
  }, [parsedLines, currentTime]);

  const currentLine = activeIndex >= 0 ? parsedLines[activeIndex]?.text : "";
  const nextLine = activeIndex + 1 < parsedLines.length ? parsedLines[activeIndex + 1]?.text : "";

  if (!currentLine) return <div className="flex-1 min-w-0 min-h-[2.5rem]" />;

  return (
    <div className="flex-1 min-w-0 min-h-[2.5rem] overflow-hidden relative flex flex-col justify-center" data-testid="marquee-lyrics">
      <div className="relative flex flex-col justify-center">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={`lyric-${activeIndex}`}
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: "0%", opacity: 1 }}
            exit={{ x: "-100%", opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-sm text-white/90 font-medium whitespace-nowrap truncate"
          >
            {currentLine}
          </motion.div>
        </AnimatePresence>
        {nextLine && (
          <p className="text-[10px] text-muted-foreground/60 whitespace-nowrap truncate mt-0.5">
            {nextLine}
          </p>
        )}
      </div>
    </div>
  );
}

function SyncedLyricsPanel({ lyrics, currentTime, duration }: { lyrics: string; currentTime: number; duration: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  const parsedLines = useMemo(() => {
    const lrc = parseLRC(lyrics);
    if (lrc) return lrc;
    return distributeLines(lyrics, duration);
  }, [lyrics, duration]);

  const activeIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < parsedLines.length; i++) {
      if (currentTime >= parsedLines[i].time) idx = i;
      else break;
    }
    return idx;
  }, [parsedLines, currentTime]);

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex]);

  return (
    <div className="max-w-7xl mx-auto px-4 pb-3 pt-1">
      <div
        ref={containerRef}
        className="max-h-[200px] overflow-y-auto scrollbar-thin scroll-smooth text-center"
        data-testid="text-player-lyrics"
      >
        <div className="py-2 space-y-2">
          {parsedLines.map((line, i) => (
            <div
              key={i}
              ref={i === activeIndex ? activeRef : undefined}
              className={`py-1 transition-all duration-300 text-base leading-relaxed ${
                i === activeIndex
                  ? "text-primary font-semibold"
                  : i < activeIndex
                    ? "text-muted-foreground/50"
                    : "text-muted-foreground"
              }`}
              data-testid={`lyric-line-${i}`}
            >
              {line.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const EQ_PRESETS: Record<string, { name: string; gains: number[] }> = {
  flat: { name: "기본", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  bass_boost: { name: "베이스 부스트", gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  treble_boost: { name: "고음 부스트", gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
  vocal: { name: "보컬 강화", gains: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1] },
  rock: { name: "록", gains: [4, 3, 1, 0, -1, -1, 0, 2, 3, 4] },
  pop: { name: "팝", gains: [-1, 1, 3, 4, 3, 1, 0, -1, -1, -1] },
  jazz: { name: "재즈", gains: [3, 2, 0, 1, -1, -1, 0, 1, 2, 3] },
  electronic: { name: "일렉트로닉", gains: [4, 3, 1, 0, -2, 0, 1, 3, 4, 4] },
  classical: { name: "클래식", gains: [3, 2, 1, 0, 0, 0, 0, 1, 2, 3] },
  custom: { name: "커스텀", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
};

const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

function EqualizerPanel({
  gains,
  onGainChange,
  activePreset,
  onPresetSelect,
}: {
  gains: number[];
  onGainChange: (index: number, value: number) => void;
  activePreset: string;
  onPresetSelect: (preset: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="max-w-7xl mx-auto px-4 pb-4 pt-2">
      <div className="flex flex-wrap gap-1.5 mb-4">
        {Object.entries(EQ_PRESETS).filter(([key]) => key !== 'custom' || activePreset === 'custom').map(([key, preset]) => (
          <Button
            key={key}
            variant={activePreset === key ? "default" : "outline"}
            size="sm"
            onClick={() => onPresetSelect(key)}
            className="text-xs"
            data-testid={`button-eq-preset-${key}`}
          >
            {t(`player.eqPresets.${key}`, preset.name)}
          </Button>
        ))}
      </div>
      <div className="flex items-end gap-1 sm:gap-2 justify-between">
        {EQ_FREQUENCIES.map((freq, i) => (
          <div key={freq} className="flex flex-col items-center gap-1 flex-1">
            <span className="text-[9px] text-muted-foreground mb-1">
              {gains[i] > 0 ? `+${gains[i]}` : gains[i]}dB
            </span>
            <div className="h-24 flex items-center">
              <Slider
                orientation="vertical"
                min={-12}
                max={12}
                step={1}
                value={[gains[i]]}
                onValueChange={(v) => onGainChange(i, v[0])}
                className="h-full"
                data-testid={`slider-eq-${freq}`}
              />
            </div>
            <span className="text-[9px] text-muted-foreground mt-1">
              {freq >= 1000 ? `${freq / 1000}k` : freq}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QueuePanel({
  queue,
  allMusic,
  onRemove,
  onClear,
  onPlayFromQueue,
}: {
  queue: number[];
  allMusic: any[];
  onRemove: (index: number) => void;
  onClear: () => void;
  onPlayFromQueue: (index: number) => void;
}) {
  const { t } = useTranslation();
  if (queue.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 pb-4 pt-2">
        <p className="text-center text-muted-foreground text-sm py-4">
          {t('player.emptyQueue')}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 pb-4 pt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">
          {t('player.queue')} ({queue.length})
        </span>
        <Button variant="ghost" size="sm" onClick={onClear} className="text-xs gap-1" data-testid="button-clear-queue">
          <Trash2 size={12} /> {t('player.clearAll')}
        </Button>
      </div>
      <div className="max-h-[200px] overflow-y-auto scrollbar-thin space-y-1">
        {queue.map((musicId, index) => {
          const track = allMusic.find((m: any) => m.id === musicId);
          if (!track) return null;
          const imgUrl = track.imageFilename
            ? resolveStorageUrl(track.imageFilename)
            : "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=60&h=60&fit=crop";
          return (
            <div
              key={`${musicId}-${index}`}
              className="flex items-center gap-2 p-1.5 rounded-md hover-elevate group"
              data-testid={`queue-item-${index}`}
            >
              <span className="text-muted-foreground/40 text-xs shrink-0 w-4 text-center">{index + 1}</span>
              <img src={imgUrl} alt={track.title} className="w-8 h-8 rounded object-cover shrink-0" />
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => onPlayFromQueue(index)}
              >
                <p className="text-sm font-medium truncate text-foreground">{track.title}</p>
                <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onRemove(index)}
                data-testid={`button-remove-queue-${index}`}
              >
                <X size={14} />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GlobalAudioPlayer() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { activeMusicId, activeExternalTrack, playlist, queue, playMusic, closePlayer, pauseRequested, setPauseRequested, lyricsRequested, clearLyricsRequest, repeatMode, shuffleEnabled, shuffledOrder, toggleRepeat, toggleShuffle, removeFromQueue, clearQueue, addToQueue } = usePlayerStore();
  const { data: music } = useMusic(activeMusicId || 0);
  const { data: allMusic } = useMusicList({ limit: 500 });
  const { toast } = useToast();
  const streamingLimitShownRef = useRef(false);
  const handleStreamingLimit = useCallback(() => {
    if (!streamingLimitShownRef.current) {
      streamingLimitShownRef.current = true;
      toast({
        title: t("player.streamingLimitTitle", "스트리밍 제한"),
        description: t(
          "player.streamingLimitDesc",
          "오늘의 무료 스트리밍 한도(100곡)에 도달했습니다. 프리미엄으로 업그레이드하면 무제한으로 감상할 수 있습니다.",
        ),
        variant: "destructive",
      });
      setTimeout(() => { streamingLimitShownRef.current = false; }, 60000);
    }
  }, [toast, t]);
  const tracker = useStreamingTracker(activeMusicId, handleStreamingLimit);
  const unauthEndedToastShownRef = useRef(false);
  const unauthStoppedRef = useRef(false);

  useEffect(() => {
    // 새 곡·외부 트랙마다 비로그인 종료 토스트 1회 플래그만 초기화
    unauthEndedToastShownRef.current = false;
  }, [activeMusicId, activeExternalTrack]);

  useEffect(() => {
    // 비로그인 상태에서 1곡 종료로 멈춘 뒤 로그인하면,
    // "이제 연속으로 들을 수 있음" 안내를 띄운다.
    if (user && unauthStoppedRef.current) {
      unauthStoppedRef.current = false;
      toast({
        title: t("player.loginContinuousPlayAfterLogin", "로그인 후에는 연속 재생됩니다"),
        variant: "default",
      });
    }
  }, [user, toast, t]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useResumeAudioWhenForeground(
    () => audioRef.current,
    () => {
      const st = usePlayerStore.getState();
      return !st.pauseRequested && (!!st.activeMusicId || !!st.activeExternalTrack);
    },
    {
      prepareResume: () => {
        const ctx = audioContextRef.current;
        if (ctx && ctx.state !== "running" && ctx.state !== "closed") {
          void ctx.resume().catch(() => {});
        }
      },
    },
  );
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const progressRef = useRef<HTMLDivElement>(null);
  const prevPauseRequestedRef = useRef(pauseRequested);
  const playAttemptKeyRef = useRef<string | null>(null);
  const resumeAfterSystemPauseRef = useRef(false);
  const resumeAfterSystemPauseTimerRef = useRef<number | null>(null);
  const resumeAfterSystemPauseAttemptsRef = useRef(0);
  const systemPauseHiddenAtRef = useRef<number | null>(null);
  const systemPauseSnapshotRef = useRef<{ src: string; time: number } | null>(null);
  const systemPauseNeedsReloadRef = useRef(false);
  const systemPauseBlurredWhileVisibleRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  useScreenWakeLockWhilePlaying(
    isPlaying && !pauseRequested && (!!activeMusicId || !!activeExternalTrack),
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const volumeRef = useRef(volume);
  const [isMuted, setIsMuted] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [showLyricsPanel, setShowLyricsPanel] = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [showEqPanel, setShowEqPanel] = useState(false);
  const [eqGains, setEqGains] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [eqPreset, setEqPreset] = useState('flat');
  const currentListRef = useRef<number[]>([]);

  useEffect(() => {
    volumeRef.current = volume;
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const keepAudioContextRunning = () => {
      const st = usePlayerStore.getState();
      if (st.pauseRequested || (!st.activeMusicId && !st.activeExternalTrack)) return;
      const ctx = audioContextRef.current;
      if (ctx && ctx.state !== "running" && ctx.state !== "closed") {
        void ctx.resume().catch(() => {});
      }
    };

    keepAudioContextRunning();
    const interval = window.setInterval(keepAudioContextRunning, 1000);
    document.addEventListener("visibilitychange", keepAudioContextRunning);
    window.addEventListener("focus", keepAudioContextRunning);
    window.addEventListener("pageshow", keepAudioContextRunning);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", keepAudioContextRunning);
      window.removeEventListener("focus", keepAudioContextRunning);
      window.removeEventListener("pageshow", keepAudioContextRunning);
    };
  }, []);

  const reloadAudioForSystemResume = useCallback((audio: HTMLAudioElement) => {
    const snapshot = systemPauseSnapshotRef.current;
    const resumeTime = Number.isFinite(audio.currentTime) && audio.currentTime > 0
      ? audio.currentTime
      : snapshot?.time ?? 0;
    const resumeSrc = audio.currentSrc || audio.src || snapshot?.src || "";
    if (!resumeSrc) return Promise.resolve(false);
    audioDebugLog("music", "reload-for-system-resume:start", audio, {
      resumeSrc,
      resumeTime,
      snapshot,
    });

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let settleTimer: number | null = null;
      const cleanup = () => {
        audio.removeEventListener("loadedmetadata", restoreTime);
        audio.removeEventListener("seeked", onReady);
        audio.removeEventListener("canplay", onReady);
        audio.removeEventListener("error", onReady);
        if (settleTimer != null) window.clearTimeout(settleTimer);
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        audioDebugLog("music", "reload-for-system-resume:ready", audio, { resumeTime });
        resolve(true);
      };
      const onReady = () => finish();
      const restoreTime = () => {
        if (Number.isFinite(resumeTime) && resumeTime > 0) {
          try {
            audio.currentTime = resumeTime;
            audio.addEventListener("seeked", onReady, { once: true });
            settleTimer = window.setTimeout(finish, 450);
            return;
          } catch {
            /* ignore */
          }
        }
        if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finish();
        else audio.addEventListener("canplay", onReady, { once: true });
      };

      audio.pause();
      audio.muted = true;
      audio.volume = 0;
      audio.src = resumeSrc;
      audio.load();
      audio.addEventListener("error", onReady, { once: true });
      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        restoreTime();
      } else {
        audio.addEventListener("loadedmetadata", restoreTime, { once: true });
      }
    });
  }, []);

  const cancelSystemResume = useCallback(() => {
    audioDebugLog("music", "cancel-system-resume", audioRef.current);
    resumeAfterSystemPauseRef.current = false;
    resumeAfterSystemPauseAttemptsRef.current = 0;
    systemPauseNeedsReloadRef.current = false;
    systemPauseHiddenAtRef.current = null;
    if (resumeAfterSystemPauseTimerRef.current) {
      window.clearTimeout(resumeAfterSystemPauseTimerRef.current);
      resumeAfterSystemPauseTimerRef.current = null;
    }
  }, []);

  const scheduleResumeAfterSystemPause = useCallback((forceReload = false) => {
    const audio = audioRef.current;
    const st = usePlayerStore.getState();
    if (!audio || st.pauseRequested || (!st.activeMusicId && !st.activeExternalTrack)) return;
    resumeAfterSystemPauseRef.current = true;
    audioDebugLog("music", "schedule-system-resume", audio, {
      forceReload,
      pauseRequested: st.pauseRequested,
      activeMusicId: st.activeMusicId,
      hasExternalTrack: !!st.activeExternalTrack,
      needsReload: systemPauseNeedsReloadRef.current,
      attempts: resumeAfterSystemPauseAttemptsRef.current,
    });
    if (systemPauseBlurredWhileVisibleRef.current) {
      systemPauseNeedsReloadRef.current = systemPauseNeedsReloadRef.current || forceReload;
      return;
    }
    if (document.visibilityState !== "visible") {
      systemPauseNeedsReloadRef.current = systemPauseNeedsReloadRef.current || forceReload;
      audioDebugLog("music", "system-resume:defer-hidden", audio, {
        forceReload,
        needsReload: systemPauseNeedsReloadRef.current,
      });
      return;
    }

    if (resumeAfterSystemPauseTimerRef.current) {
      window.clearTimeout(resumeAfterSystemPauseTimerRef.current);
    }

    const tryResume = () => {
      void (async () => {
      const currentAudio = audioRef.current;
      const currentState = usePlayerStore.getState();
      if (!currentAudio || currentState.pauseRequested || (!currentState.activeMusicId && !currentState.activeExternalTrack)) {
        audioDebugLog("music", "system-resume:abort", currentAudio, {
          pauseRequested: currentState.pauseRequested,
          activeMusicId: currentState.activeMusicId,
          hasExternalTrack: !!currentState.activeExternalTrack,
        });
        resumeAfterSystemPauseRef.current = false;
        resumeAfterSystemPauseAttemptsRef.current = 0;
        systemPauseNeedsReloadRef.current = false;
        return;
      }
      if (!resumeAfterSystemPauseRef.current) return;

      const ctx = audioContextRef.current;
      audioDebugLog("music", "system-resume:attempt", currentAudio, {
        forceReload,
        needsReload: systemPauseNeedsReloadRef.current,
        attempts: resumeAfterSystemPauseAttemptsRef.current,
        audioContextState: ctx?.state ?? null,
      });
      if (ctx && ctx.state !== "running" && ctx.state !== "closed") {
        void ctx.resume().catch(() => {});
      }
      if (forceReload && resumeAfterSystemPauseAttemptsRef.current === 0) {
        resumeAfterSystemPauseAttemptsRef.current += 1;
        await reloadAudioForSystemResume(currentAudio);
        systemPauseNeedsReloadRef.current = false;
      }
      currentAudio.muted = false;
      currentAudio.volume = volume;
      if (!currentAudio.paused && !systemPauseNeedsReloadRef.current) {
        audioDebugLog("music", "system-resume:already-playing", currentAudio);
        resumeAfterSystemPauseRef.current = false;
        resumeAfterSystemPauseAttemptsRef.current = 0;
        systemPauseNeedsReloadRef.current = false;
        setIsPlaying(true);
        setNeedsTap(false);
        return;
      }

      resumeAfterSystemPauseAttemptsRef.current += 1;
      if (systemPauseNeedsReloadRef.current || resumeAfterSystemPauseAttemptsRef.current === 3) {
        await reloadAudioForSystemResume(currentAudio);
        systemPauseNeedsReloadRef.current = false;
      }

      void playWithSoftStart(currentAudio, volume)
        .then(() => {
          audioDebugLog("music", "system-resume:play-success", currentAudio);
          resumeAfterSystemPauseRef.current = false;
          resumeAfterSystemPauseAttemptsRef.current = 0;
          systemPauseNeedsReloadRef.current = false;
          setIsPlaying(true);
          setNeedsTap(false);
        })
        .catch(() => {
          audioDebugLog("music", "system-resume:play-failed", currentAudio, {
            attempts: resumeAfterSystemPauseAttemptsRef.current,
          });
          const delay = resumeAfterSystemPauseAttemptsRef.current >= 3 ? 1800 : 1200;
          resumeAfterSystemPauseTimerRef.current = window.setTimeout(tryResume, delay);
        });
      })();
    };

    resumeAfterSystemPauseTimerRef.current = window.setTimeout(tryResume, 350);
  }, [reloadAudioForSystemResume, volume]);

  const markSystemAudioInterruption = useCallback(() => {
    const st = usePlayerStore.getState();
    const hasTrack = !!st.activeMusicId || !!st.activeExternalTrack;
    const audio = audioRef.current;
    if (!st.pauseRequested && hasTrack) {
      const src = audio?.currentSrc || audio?.src || "";
      if (src) {
        systemPauseSnapshotRef.current = {
          src,
          time: Number.isFinite(audio?.currentTime) ? audio?.currentTime ?? 0 : 0,
        };
      }
      systemPauseHiddenAtRef.current = Date.now();
      resumeAfterSystemPauseRef.current = true;
      audioDebugLog("music", "mark-system-interruption", audio, {
        activeMusicId: st.activeMusicId,
        hasExternalTrack: !!st.activeExternalTrack,
        snapshot: systemPauseSnapshotRef.current,
      });
    }
  }, []);

  useEffect(() => {
    const onResumeSignal = () => {
      if (document.hasFocus()) systemPauseBlurredWhileVisibleRef.current = false;
      if (resumeAfterSystemPauseRef.current) scheduleResumeAfterSystemPause(systemPauseNeedsReloadRef.current);
    };
    const onVisibilityChange = () => {
      audioDebugLog("music", "document-visibilitychange", audioRef.current, {
        nextVisibility: document.visibilityState,
        resumeFlag: resumeAfterSystemPauseRef.current,
        needsReload: systemPauseNeedsReloadRef.current,
      });
      if (document.visibilityState === "hidden") {
        markSystemAudioInterruption();
        return;
      }
      const hiddenAt = systemPauseHiddenAtRef.current;
      const wasInterrupted = hiddenAt != null && Date.now() - hiddenAt > 1200;
      systemPauseHiddenAtRef.current = null;
      if (wasInterrupted || resumeAfterSystemPauseRef.current) {
        scheduleResumeAfterSystemPause(systemPauseNeedsReloadRef.current);
      }
    };
    const onBlur = () => {
      audioDebugLog("music", "window-blur", audioRef.current);
      if (document.visibilityState === "visible") systemPauseBlurredWhileVisibleRef.current = true;
      markSystemAudioInterruption();
    };
    const onPageHide = () => {
      audioDebugLog("music", "window-pagehide", audioRef.current);
      markSystemAudioInterruption();
    };
    const onFreeze = () => {
      audioDebugLog("music", "document-freeze", audioRef.current);
      markSystemAudioInterruption();
    };
    window.addEventListener("focus", onResumeSignal);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("freeze", onFreeze);
    window.addEventListener("pageshow", onResumeSignal);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onResumeSignal);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("freeze", onFreeze);
      window.removeEventListener("pageshow", onResumeSignal);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (resumeAfterSystemPauseTimerRef.current) {
        window.clearTimeout(resumeAfterSystemPauseTimerRef.current);
      }
    };
  }, [markSystemAudioInterruption, scheduleResumeAfterSystemPause]);

  useEffect(() => {
    const retryForegroundPlayback = () => {
      if (document.visibilityState !== "visible") return;
      const st = usePlayerStore.getState();
      if (st.pauseRequested || (!st.activeMusicId && !st.activeExternalTrack)) return;
      const audio = audioRef.current;
      if (!audio || !audio.src || !audio.paused || audio.ended) return;
      audioDebugLog("music", "foreground-paused-retry", audio, {
        activeMusicId: st.activeMusicId,
        hasExternalTrack: !!st.activeExternalTrack,
      });
      audio.muted = false;
      audio.volume = volume;
      void playWithSoftStart(audio, volume)
        .then(() => {
          setIsPlaying(true);
          setNeedsTap(false);
        })
        .catch(() => {
          setNeedsTap(true);
        });
    };
    const delayedRetry = () => {
      retryForegroundPlayback();
      window.setTimeout(retryForegroundPlayback, 300);
      window.setTimeout(retryForegroundPlayback, 1000);
    };
    window.addEventListener("focus", delayedRetry);
    window.addEventListener("pageshow", delayedRetry);
    document.addEventListener("visibilitychange", delayedRetry);
    return () => {
      window.removeEventListener("focus", delayedRetry);
      window.removeEventListener("pageshow", delayedRetry);
      document.removeEventListener("visibilitychange", delayedRetry);
    };
  }, [volume]);

  const lastMusicRef = useRef<any>(null);
  const lastAudioUrlRef = useRef<string>("");
  const lastImageUrlRef = useRef<string>("");
  const isClosingRef = useRef(false);

  if (activeExternalTrack) {
    lastAudioUrlRef.current = `/api/ai-music/audio-proxy?url=${encodeURIComponent(activeExternalTrack.url)}&purpose=stream`;
  } else if (activeMusicId) {
    lastAudioUrlRef.current = `/api/music/${activeMusicId}/stream`;
  }
  if (activeExternalTrack) {
    lastMusicRef.current = { title: activeExternalTrack.title, artist: activeExternalTrack.artist ?? "", lyrics: null };
    lastImageUrlRef.current = activeExternalTrack.imageUrl || "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=150&h=150&fit=crop";
  } else if (music) {
    lastMusicRef.current = music;
    lastImageUrlRef.current = music.imageFilename
      ? resolveStorageUrl(music.imageFilename)
      : "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=150&h=150&fit=crop";
  }

  const displayMusic = music || lastMusicRef.current;
  const audioUrl = lastAudioUrlRef.current;
  const imageUrl = lastImageUrlRef.current;
  const isExternalTrack = !!activeExternalTrack;
  const baseList = playlist.length > 0 ? playlist : (allMusic?.data?.map((m: any) => m.id) || []);

  const tryStartNextTrackImmediately = useCallback((nextId: number) => {
    const audio = audioRef.current;
    if (!audio || usePlayerStore.getState().pauseRequested) return;
    try {
      audio.muted = false;
      audio.volume = volume;
      audio.src = `/api/music/${nextId}/stream`;
      audio.load();
      void playWithSoftStart(audio, volume)
        .then(() => {
          setIsPlaying(true);
          setIsMuted(false);
          setNeedsTap(false);
        })
        .catch(() => {
          setIsPlaying(false);
          setNeedsTap(true);
        });
    } catch {
      setIsPlaying(false);
      setNeedsTap(true);
    }
  }, [pauseRequested, volume]);

  useEffect(() => {
    if (shuffleEnabled && baseList.length > 0) {
      const currentShuffled = usePlayerStore.getState().shuffledOrder;
      if (currentShuffled.length !== baseList.length || !baseList.every(id => currentShuffled.includes(id))) {
        const newShuffled = shuffleArray(baseList);
        usePlayerStore.setState({ shuffledOrder: newShuffled });
      }
    }
  }, [baseList.length, shuffleEnabled]);

  const currentList = shuffleEnabled && shuffledOrder.length > 0 ? shuffledOrder : baseList;
  useEffect(() => {
    if (currentList.length > 0) currentListRef.current = currentList;
  }, [currentList]);

  const initEqualizer = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audioContextRef.current) return;

    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaElementSource(audio);
      sourceNodeRef.current = source;

      const filters = EQ_FREQUENCIES.map((freq, i) => {
        const filter = ctx.createBiquadFilter();
        if (i === 0) filter.type = 'lowshelf';
        else if (i === EQ_FREQUENCIES.length - 1) filter.type = 'highshelf';
        else filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.4;
        filter.gain.value = eqGains[i];
        return filter;
      });

      source.connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1]);
      }
      filters[filters.length - 1].connect(ctx.destination);
      eqFiltersRef.current = filters;

      if (ctx.state !== 'running' && ctx.state !== 'closed') {
        ctx.resume().catch(() => {});
      }
    } catch {}
  }, []);

  const handleEqGainChange = useCallback((index: number, value: number) => {
    if (!audioContextRef.current) {
      initEqualizer();
    } else if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    setEqGains(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setEqPreset('custom');
    if (eqFiltersRef.current[index]) {
      eqFiltersRef.current[index].gain.value = value;
    }
  }, [initEqualizer]);

  const handleEqPresetSelect = useCallback((preset: string) => {
    if (!audioContextRef.current) {
      initEqualizer();
    } else if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    const presetData = EQ_PRESETS[preset];
    if (!presetData) return;
    setEqPreset(preset);
    setEqGains(preset === 'custom' ? eqGains : presetData.gains);
    const gainsToApply = preset === 'custom' ? eqGains : presetData.gains;
    eqFiltersRef.current.forEach((filter, i) => {
      filter.gain.value = gainsToApply[i];
    });
  }, [initEqualizer, eqGains]);

  useEffect(() => {
    if (lyricsRequested) {
      if (displayMusic?.lyrics) {
        setShowLyricsPanel(true);
        clearLyricsRequest();
      }
    }
  }, [lyricsRequested, displayMusic?.lyrics]);

  const currentIndex = activeMusicId ? currentList.indexOf(activeMusicId) : -1;

  const playNext = useCallback(() => {
    tracker.onEnded();
    const playerState = usePlayerStore.getState();
    if (playerState.activeExternalTrack) {
      if (repeatMode === 'one') {
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        }
      }
      return;
    }
    if (playerState.queue.length > 0) {
      const nextId = playerState.queue[0];
      if (blockGuestPlaybackIfNeeded()) return;
      clearGlobalRadioForOnDemandPlayback();
      usePlayerStore.setState({
        activeMusicId: nextId,
        activeExternalTrack: null,
        pauseRequested: false,
        lyricsRequested: false,
        queue: playerState.queue.slice(1),
      });
      tryStartNextTrackImmediately(nextId);
      return;
    }
    const nextList = playerState.shuffleEnabled && playerState.shuffledOrder.length > 0
      ? playerState.shuffledOrder
      : playerState.playlist.length > 0
        ? playerState.playlist
        : currentListRef.current.length > 0
          ? currentListRef.current
          : currentList;
    const nextCurrentIndex = playerState.activeMusicId ? nextList.indexOf(playerState.activeMusicId) : -1;
    if (nextList.length === 0) return;
    if (repeatMode === 'one') {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      return;
    }
    const nextIndex = nextCurrentIndex + 1;
    if (nextIndex >= nextList.length) {
      if (repeatMode === 'all') {
        const nextId = nextList[0];
        if (blockGuestPlaybackIfNeeded()) return;
        clearGlobalRadioForOnDemandPlayback();
        usePlayerStore.setState({ activeMusicId: nextId, activeExternalTrack: null, pauseRequested: false, lyricsRequested: false });
        tryStartNextTrackImmediately(nextId);
      }
    } else {
      const nextId = nextList[nextIndex];
      if (blockGuestPlaybackIfNeeded()) return;
      clearGlobalRadioForOnDemandPlayback();
      usePlayerStore.setState({ activeMusicId: nextId, activeExternalTrack: null, pauseRequested: false, lyricsRequested: false });
      tryStartNextTrackImmediately(nextId);
    }
  }, [tracker, currentList, repeatMode, tryStartNextTrackImmediately]);

  const playPrev = useCallback(() => {
    tracker.onEnded();
    if (currentList.length === 0) return;
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const prevIndex = (currentIndex - 1 + currentList.length) % currentList.length;
    playMusic(currentList[prevIndex]);
  }, [tracker, currentList, currentIndex, playMusic]);

  const handlePlayFromQueue = useCallback((index: number) => {
    const id = queue[index];
    removeFromQueue(index);
    playMusic(id);
  }, [queue, removeFromQueue, playMusic]);

  useEffect(() => {
    setShowLyricsPanel(false);
  }, [activeMusicId, activeExternalTrack]);

  // 모바일 자동재생: load() 직후 play()는 자주 거절됨 → canplay + 음소거 폴백 (docs/송출_상태동기화_검토.md)
  useEffect(() => {
    const audio = audioRef.current;
    const hasTrack = activeMusicId || activeExternalTrack;
    if (!audio || !audioUrl || !hasTrack) return;
    let cancelled = false;
    const playKey = `${audioUrl}:${activeMusicId ?? ""}:${activeExternalTrack?.url ?? ""}`;
    playAttemptKeyRef.current = null;

    const tryPlay = () => {
      if (cancelled || usePlayerStore.getState().pauseRequested) return;
      if (playAttemptKeyRef.current === playKey) return;
      playAttemptKeyRef.current = playKey;
      const targetVolume = volumeRef.current;
      audio.muted = false;
      audio.volume = targetVolume;
      void playWithSoftStart(audio, targetVolume)
        .then(() => {
          if (!cancelled) {
            audio.muted = false;
            setNeedsTap(false);
          }
        })
        .catch(() => {
          if (!cancelled) setNeedsTap(true);
        })
        .finally(() => {
          window.setTimeout(() => {
            if (playAttemptKeyRef.current === playKey) playAttemptKeyRef.current = null;
          }, 500);
        });
    };

    const onReadyOnce = () => {
      if (cancelled) return;
      tryPlay();
    };

    audio.src = audioUrl;
    audio.load();

    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      tryPlay();
    } else {
      audio.addEventListener("canplay", onReadyOnce, { once: true });
    }

    const retryTimer = window.setTimeout(() => {
      if (cancelled || usePlayerStore.getState().pauseRequested) return;
      if (audio.paused) tryPlay();
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      audio.removeEventListener("canplay", onReadyOnce);
    };
  }, [audioUrl, activeMusicId, activeExternalTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    const hasTrack = activeMusicId || activeExternalTrack;
    if (!audio) return;
    if (!hasTrack) {
      prevPauseRequestedRef.current = pauseRequested;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setNeedsTap(false);
      return;
    }
    if (pauseRequested) {
      cancelSystemResume();
      prevPauseRequestedRef.current = true;
      audio.pause();
      setIsPlaying(false);
      return;
    }
    if (!prevPauseRequestedRef.current) return;
    prevPauseRequestedRef.current = false;
    if (audio.src && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      audio.muted = false;
      audio.volume = volume;
      void playWithSoftStart(audio, volume)
        .then(() => {
          setIsPlaying(true);
          setNeedsTap(false);
        })
        .catch(() => {
          setNeedsTap(true);
        });
    }
  }, [cancelSystemResume, pauseRequested, activeMusicId, activeExternalTrack, volume]);

  // 일부 모바일(특히 S24/LTE 백그라운드)에서 "조용히 paused" 되는 케이스 방지:
  // 재생해야 하는데 paused면 hidden 상태에서도 isPlaying 동기화 + 재생 재시도 + 실패 시 needsTap 노출
  useEffect(() => {
    const audio = audioRef.current;
    const hasTrack = activeMusicId || activeExternalTrack;
    if (!audio || !hasTrack) return;
    if (pauseRequested) return;

    const isCoarseOrTouchDevice = () => {
      try {
        if (window.matchMedia("(pointer: coarse)").matches) return true;
        if (navigator.maxTouchPoints > 0 && window.matchMedia("(hover: none)").matches) return true;
      } catch {
        /* ignore */
      }
      return false;
    };
    if (!isCoarseOrTouchDevice()) return;

    const interval = window.setInterval(() => {
      const st = usePlayerStore.getState();
      const shouldBePlaying = !st.pauseRequested && (!!st.activeMusicId || !!st.activeExternalTrack);
      if (!shouldBePlaying) return;
      if (systemPauseBlurredWhileVisibleRef.current) return;
      const a = audioRef.current;
      if (!a) return;

      if (isPlaying && a.paused) setIsPlaying(false);

      if (a.paused) {
        a.muted = false;
        a.volume = volume;
        void playWithSoftStart(a, volume)
          .then(() => setNeedsTap(false))
          .catch(() => {
            setIsPlaying(false);
            setNeedsTap(true);
          });
      }
    }, 1200);

    return () => window.clearInterval(interval);
  }, [activeMusicId, activeExternalTrack, pauseRequested, volume, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (!isSeeking) {
        setCurrentTime(audio.currentTime);
      }
    };
    const onLoadedMetadata = () => {
      setDuration(audio.duration);
      setCurrentTime(0);
    };
    const onDurationChange = () => setDuration(audio.duration);
    const onPlay = () => {
      audioDebugLog("music", "audio-play", audio, {
        resumeFlag: resumeAfterSystemPauseRef.current,
        needsReload: systemPauseNeedsReloadRef.current,
      });
      resumeAfterSystemPauseRef.current = false;
      setIsPlaying(true);
      tracker.onPlay();
    };
    const onPause = () => {
      const st = usePlayerStore.getState();
      audioDebugLog("music", "audio-pause", audio, {
        pauseRequested: st.pauseRequested,
        activeMusicId: st.activeMusicId,
        hasExternalTrack: !!st.activeExternalTrack,
        resumeFlag: resumeAfterSystemPauseRef.current,
      });
      if (!st.pauseRequested && (st.activeMusicId || st.activeExternalTrack) && !audio.ended) {
        markSystemAudioInterruption();
        systemPauseNeedsReloadRef.current = true;
        scheduleResumeAfterSystemPause();
      }
      setIsPlaying(false);
      tracker.onPause();
    };
    const onEnded = () => {
      const d = audio.duration;
      const isNaturalEnd = audio.ended || (Number.isFinite(d) && d > 0 && audio.currentTime >= d - 0.5);
      audioDebugLog("music", "audio-ended", audio, {
        resumeFlag: resumeAfterSystemPauseRef.current,
        isNaturalEnd,
      });
      if (resumeAfterSystemPauseRef.current && !isNaturalEnd) {
        systemPauseNeedsReloadRef.current = true;
        scheduleResumeAfterSystemPause(true);
        return;
      }
      setIsPlaying(false);
      // 연속 재생 여부는 playMusic 내부의 guest quota 차단(blockGuestPlaybackIfNeeded)에서 결정한다.
      // (모바일에서 auth/user가 순간 null로 흔들리면 여기서 연속 재생이 끊기는 문제가 있어 ended에서는 항상 다음 곡을 시도)
      tracker.onEnded();
      playNext();
    };
    const onError = () => {
      if (isClosingRef.current) return;
      audioDebugLog("music", "audio-error", audio, {
        resumeFlag: resumeAfterSystemPauseRef.current,
      });
      if (resumeAfterSystemPauseRef.current) {
        systemPauseNeedsReloadRef.current = true;
        scheduleResumeAfterSystemPause(true);
        return;
      }
      setIsPlaying(false);
      if (displayMusic?.title) {
        toast({
          variant: "destructive",
          title: t("player.playFailedTitle", "재생 실패"),
          description: t("player.playFailedDesc", '"{{title}}" 음원 파일을 불러올 수 없습니다. /file-guide 에서 필요한 파일 목록을 확인해 주세요.', {
            title: displayMusic.title,
          }),
        });
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [isSeeking, tracker, playNext, user, toast, t, displayMusic?.title, closePlayer]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      setPauseRequested(false);
    } else {
      cancelSystemResume();
      setPauseRequested(true);
      audio.pause();
    }
  }, [cancelSystemResume, setPauseRequested]);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const v = parseFloat(e.target.value);
    audio.volume = v;
    volumeRef.current = v;
    setVolume(v);
    if (v === 0) {
      audio.muted = true;
      setIsMuted(true);
    } else if (audio.muted) {
      audio.muted = false;
      setIsMuted(false);
    }
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !isFinite(duration) || duration === 0) return;

    const rect = bar.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  }, [duration]);

  const handleSeekStart = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    setIsSeeking(true);
    handleSeek(e);

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const bar = progressRef.current;
      const audio = audioRef.current;
      if (!bar || !audio || !isFinite(duration) || duration === 0) return;
      const rect = bar.getBoundingClientRect();
      const clientX = 'touches' in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      audio.currentTime = ratio * duration;
      setCurrentTime(ratio * duration);
    };

    const onEnd = () => {
      setIsSeeking(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove);
    document.addEventListener('touchend', onEnd);
  }, [duration, handleSeek]);

  const handleClose = useCallback(() => {
    isClosingRef.current = true;
    tracker.onEnded();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
      audio.load();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
      sourceNodeRef.current = null;
      eqFiltersRef.current = [];
    }
    closePlayer();
    setTimeout(() => { isClosingRef.current = false; }, 300);
  }, [tracker, closePlayer]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    if (!displayMusic || !('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: displayMusic.title,
      artist: displayMusic.artist,
      artwork: imageUrl ? [{ src: imageUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
    });

    navigator.mediaSession.setActionHandler('play', () => {
      audioDebugLog("music", "media-session-play", audioRef.current);
      setPauseRequested(false);
      audioRef.current?.play().catch(() => {});
    });
    // MediaSession pause는 상단 플레이바 등 사용자의 명시적 정지 요청이다.
    // 통화 등 시스템 중단은 audio pause/visibility 이벤트에서 별도로 복구한다.
    navigator.mediaSession.setActionHandler('pause', () => {
      audioDebugLog("music", "media-session-pause", audioRef.current);
      cancelSystemResume();
      setPauseRequested(true);
      audioRef.current?.pause();
      setIsPlaying(false);
      setNeedsTap(false);
    });
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (audioRef.current && details.seekTime != null) {
        audioRef.current.currentTime = details.seekTime;
        setCurrentTime(details.seekTime);
      }
    });

    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      }
    };
  }, [displayMusic, imageUrl, cancelSystemResume, playNext, playPrev, setPauseRequested]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const playing = isPlaying && !pauseRequested;
    try {
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    } catch {
      /* ignore */
    }
  }, [isPlaying, pauseRequested]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !audioRef.current) return;
    const audio = audioRef.current;
    const updatePositionState = () => {
      try {
        if (isFinite(audio.duration) && audio.duration > 0) {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime,
          });
        }
      } catch {}
    };
    const interval = setInterval(updatePositionState, 1000);
    return () => clearInterval(interval);
  }, [activeMusicId]);

  const togglePanel = useCallback((panel: 'lyrics' | 'queue' | 'eq') => {
    if (panel === 'lyrics') {
      setShowLyricsPanel(v => !v);
      setShowQueuePanel(false);
      setShowEqPanel(false);
    } else if (panel === 'queue') {
      setShowQueuePanel(v => !v);
      setShowLyricsPanel(false);
      setShowEqPanel(false);
    } else {
      const wasOpen = showEqPanel;
      setShowEqPanel(v => !v);
      setShowLyricsPanel(false);
      setShowQueuePanel(false);
      if (!wasOpen && !audioContextRef.current) {
        initEqualizer();
      }
    }
  }, [showEqPanel, initEqualizer]);

  const repeatIcon = repeatMode === 'one' ? (
    <Repeat1 size={16} />
  ) : (
    <Repeat size={16} />
  );

  return (
    <>
      <audio ref={audioRef} preload="auto" crossOrigin="anonymous" playsInline />
      {needsTap && !isPlaying && !pauseRequested && ((activeMusicId && displayMusic) || activeExternalTrack) && (
        <div className="fixed bottom-[68px] left-2 right-2 z-50">
          <button
            className="w-full flex items-center justify-center gap-2 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-lg"
            onClick={() => {
              const a = audioRef.current;
              if (!a) return;
              a.muted = false;
              a.volume = volume;
              void playWithSoftStart(a, volume).then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
            }}
          >
            {t("player.tapToContinue", "탭해서 계속 듣기")}
          </button>
        </div>
      )}
      {((activeMusicId && displayMusic) || activeExternalTrack) && <AnimatePresence>
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-14 left-0 right-0 z-50 border-t border-border bg-card shadow-2xl pr-[env(safe-area-inset-right)] sm:bottom-0"
        >
          <div
            ref={progressRef}
            className="relative cursor-pointer group"
            style={{ touchAction: 'none' }}
            onMouseDown={handleSeekStart}
            onTouchStart={handleSeekStart}
            data-testid="progress-bar"
          >
            <div className="h-4 flex items-center sm:h-6">
              <div className="w-full h-1 bg-muted rounded-full relative sm:h-1.5">
                <div
                  className="h-full bg-primary rounded-full transition-none"
                  style={{ width: `${progress}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full sm:h-4 sm:w-4 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-md"
                  style={{ left: `${progress}%`, transform: `translate(-50%, -50%)` }}
                />
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-2.5 sm:px-4 py-1.5 flex items-center gap-1 sm:gap-4">
            <button
              type="button"
              onClick={() => !isExternalTrack && activeMusicId != null && setLocation(`/music/${activeMusicId}`)}
              className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0 max-w-[28%] sm:max-w-[25%] text-left cursor-pointer rounded-md hover:bg-white/5 active:bg-white/10 transition-colors touch-manipulation"
              data-testid="button-player-go-detail"
            >
              <img 
                src={imageUrl} 
                alt={displayMusic.title} 
                className="w-9 h-9 sm:w-12 sm:h-12 rounded-md object-cover shadow-md shrink-0"
              />
              <div className="overflow-hidden min-w-0">
                <h4 className="font-semibold truncate text-white text-xs sm:text-base" data-testid="text-player-title">{displayMusic.title}</h4>
                <p className="text-[11px] sm:text-sm text-muted-foreground truncate" data-testid="text-player-artist">{displayMusic.artist}</p>
              </div>
            </button>

            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleShuffle}
                className={`hidden sm:inline-flex ${shuffleEnabled ? "text-primary" : ""}`}
                data-testid="button-shuffle"
              >
                <Shuffle size={16} />
              </Button>
              <Button 
                size="icon"
                variant="ghost"
                onClick={playPrev}
                className="h-8 w-8 sm:h-10 sm:w-10"
                data-testid="button-prev-track"
              >
                <SkipBack size={18} />
              </Button>
              <Button 
                size="icon"
                variant="ghost"
                onClick={togglePlay}
                className="h-8 w-8 sm:h-10 sm:w-10"
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </Button>
              <Button 
                size="icon"
                variant="ghost"
                onClick={playNext}
                className="h-8 w-8 sm:h-10 sm:w-10"
                data-testid="button-next-track"
              >
                <SkipForward size={18} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleRepeat}
                className={`hidden sm:inline-flex ${repeatMode !== 'none' ? "text-primary" : ""}`}
                data-testid="button-repeat"
              >
                {repeatIcon}
              </Button>
            </div>

            <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0 sm:gap-2 sm:text-xs" style={{ fontVariantNumeric: "tabular-nums" }}>
              <span className="min-w-[2.5em] text-right" data-testid="text-current-time">{formatTime(currentTime)}</span>
              <span>/</span>
              <span className="min-w-[2.5em]" data-testid="text-duration">{formatTime(duration)}</span>
            </div>

            {/* 고정 높이로 가사 유무에 따른 플레이바 흔들림 방지 (모바일). 모바일에서 오른쪽 버튼 공간 확보를 위해 min-w-0 */}
            <div className="flex-1 min-w-0 flex items-center h-8 sm:h-9 overflow-hidden">
              {displayMusic?.lyrics ? (
                <MarqueeLyric lyrics={displayMusic.lyrics} currentTime={currentTime} duration={duration} />
              ) : null}
            </div>

            <div className="hidden sm:flex items-center gap-1 shrink-0">
              <Button size="icon" variant="ghost" onClick={toggleMute} data-testid="button-mute">
                {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </Button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 accent-primary h-1"
                data-testid="input-volume"
              />
            </div>

            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 min-w-0">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => togglePanel('eq')}
                className={`hidden sm:inline-flex shrink-0 ${showEqPanel ? "text-primary" : ""}`}
                data-testid="button-equalizer"
              >
                <SlidersHorizontal size={16} />
              </Button>
              {displayMusic?.lyrics && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => togglePanel('lyrics')}
                  className={`shrink-0 ${showLyricsPanel ? "text-primary" : ""}`}
                  data-testid="button-player-lyrics"
                >
                  <FileText size={16} />
                </Button>
              )}

              <div className="flex sm:hidden items-center gap-0.5 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className={`h-8 w-8 sm:h-10 sm:w-10 ${shuffleEnabled ? "text-primary" : ""}`}
                  data-testid="button-shuffle-mobile"
                  onClick={toggleShuffle}
                >
                  <Shuffle size={14} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={`h-8 w-8 sm:h-10 sm:w-10 ${repeatMode !== 'none' ? "text-primary" : ""}`}
                  data-testid="button-repeat-mobile"
                  onClick={toggleRepeat}
                >
                  {repeatIcon}
                </Button>
              </div>

              <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline shrink-0" data-testid="text-track-position">
                {currentIndex >= 0 ? currentIndex + 1 : "-"} / {currentList.length}
              </span>
              <Button 
                size="icon"
                variant="ghost"
                onClick={handleClose}
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground sm:h-10 sm:w-10"
                data-testid="button-close-player"
                aria-label={t("player.close", "\ub2eb\uae30")}
              >
                <X size={16} className="sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>

          <AnimatePresence>
            {showLyricsPanel && displayMusic?.lyrics && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <SyncedLyricsPanel lyrics={displayMusic.lyrics} currentTime={currentTime} duration={duration} />
              </motion.div>
            )}
            {showQueuePanel && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t border-border/50"
              >
                <QueuePanel
                  queue={queue}
                  allMusic={allMusic?.data || []}
                  onRemove={removeFromQueue}
                  onClear={clearQueue}
                  onPlayFromQueue={handlePlayFromQueue}
                />
              </motion.div>
            )}
            {showEqPanel && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t border-border/50"
              >
                <EqualizerPanel
                  gains={eqGains}
                  onGainChange={handleEqGainChange}
                  activePreset={eqPreset}
                  onPresetSelect={handleEqPresetSelect}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>}
    </>
  );
}
