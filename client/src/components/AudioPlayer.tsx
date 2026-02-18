import { useMusic, useMusicList } from "@/hooks/use-music";
import { create } from 'zustand';
import { motion, AnimatePresence } from 'framer-motion';
import { X, SkipBack, SkipForward, Play, Pause, Volume2, VolumeX, FileText, Repeat, Repeat1, Shuffle, ListMusic, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { resolveStorageUrl } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Slider } from "@/components/ui/slider";
import { useTranslation } from 'react-i18next';

type RepeatMode = 'none' | 'all' | 'one';

interface PlayerStore {
  activeMusicId: number | null;
  playlist: number[];
  queue: number[];
  pauseRequested: boolean;
  lyricsRequested: boolean;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  shuffledOrder: number[];
  playMusic: (id: number) => void;
  playMusicWithLyrics: (id: number) => void;
  togglePause: () => void;
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

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  activeMusicId: null,
  playlist: [],
  queue: [],
  pauseRequested: false,
  lyricsRequested: false,
  repeatMode: 'none',
  shuffleEnabled: false,
  shuffledOrder: [],
  playMusic: (id) => set({ activeMusicId: id, pauseRequested: false, lyricsRequested: false }),
  playMusicWithLyrics: (id) => set({ activeMusicId: id, pauseRequested: false, lyricsRequested: true }),
  togglePause: () => set((state) => ({ pauseRequested: !state.pauseRequested })),
  setPlaylist: (ids) => {
    const state = get();
    set({ playlist: ids, shuffledOrder: state.shuffleEnabled ? shuffleArray(ids) : [] });
  },
  closePlayer: () => set({ activeMusicId: null, pauseRequested: false, lyricsRequested: false, queue: [] }),
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
  addToQueue: (id) => set((state) => ({ queue: [...state.queue, id] })),
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

  if (!currentLine) return <div className="flex-1 min-w-0" />;

  return (
    <div className="flex-1 min-w-0 overflow-hidden relative" data-testid="marquee-lyrics">
      <div className="relative h-full flex flex-col justify-center">
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
        className="max-h-[200px] overflow-y-auto scrollbar-thin scroll-smooth"
        data-testid="text-player-lyrics"
      >
        <div className="py-2 space-y-1">
          {parsedLines.map((line, i) => (
            <div
              key={i}
              ref={i === activeIndex ? activeRef : undefined}
              className={`px-2 py-1 rounded-md transition-all duration-300 text-sm leading-relaxed ${
                i === activeIndex
                  ? "text-white font-semibold bg-primary/20 scale-[1.02]"
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
  const { user } = useAuth();
  const { activeMusicId, playlist, queue, playMusic, closePlayer, pauseRequested, lyricsRequested, clearLyricsRequest, repeatMode, shuffleEnabled, shuffledOrder, toggleRepeat, toggleShuffle, removeFromQueue, clearQueue, addToQueue } = usePlayerStore();
  const { data: music } = useMusic(activeMusicId || 0);
  const { data: allMusic } = useMusicList({ limit: 500 });
  const { toast } = useToast();
  const streamingLimitShownRef = useRef(false);
  const handleStreamingLimit = useCallback(() => {
    if (!streamingLimitShownRef.current) {
      streamingLimitShownRef.current = true;
      toast({ title: "스트리밍 제한", description: "오늘의 무료 스트리밍 한도(100곡)에 도달했습니다. 프리미엄으로 업그레이드하면 무제한으로 감상할 수 있습니다.", variant: "destructive" });
      setTimeout(() => { streamingLimitShownRef.current = false; }, 60000);
    }
  }, [toast]);
  const tracker = useStreamingTracker(activeMusicId, handleStreamingLimit);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [showLyricsPanel, setShowLyricsPanel] = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [showEqPanel, setShowEqPanel] = useState(false);
  const [eqGains, setEqGains] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [eqPreset, setEqPreset] = useState('flat');

  const lastMusicRef = useRef<any>(null);
  const lastAudioUrlRef = useRef<string>("");
  const lastImageUrlRef = useRef<string>("");

  if (music) {
    lastMusicRef.current = music;
    lastAudioUrlRef.current = resolveStorageUrl(music.filename);
    lastImageUrlRef.current = music.imageFilename
      ? resolveStorageUrl(music.imageFilename)
      : "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=150&h=150&fit=crop";
  }

  const displayMusic = music || lastMusicRef.current;
  const audioUrl = lastAudioUrlRef.current;
  const imageUrl = lastImageUrlRef.current;
  const baseList = playlist.length > 0 ? playlist : (allMusic?.data?.map((m: any) => m.id) || []);

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

      if (ctx.state === 'suspended') {
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
    if (queue.length > 0) {
      const nextId = queue[0];
      removeFromQueue(0);
      playMusic(nextId);
      return;
    }
    if (currentList.length === 0) return;
    if (repeatMode === 'one') {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      return;
    }
    const nextIndex = currentIndex + 1;
    if (nextIndex >= currentList.length) {
      if (repeatMode === 'all') {
        playMusic(currentList[0]);
      }
    } else {
      playMusic(currentList[nextIndex]);
    }
  }, [tracker, currentList, currentIndex, playMusic, repeatMode, queue, removeFromQueue]);

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
  }, [activeMusicId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    audio.src = audioUrl;
    audio.load();
    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(() => {});
    }
  }, [audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeMusicId) return;
    if (pauseRequested) {
      audio.pause();
      setIsPlaying(false);
    } else {
      const p = audio.play();
      if (p) p.catch(() => {});
      setIsPlaying(true);
    }
  }, [pauseRequested, activeMusicId]);

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
    const onPlay = () => { setIsPlaying(true); tracker.onPlay(); };
    const onPause = () => { setIsPlaying(false); tracker.onPause(); };
    const onEnded = () => {
      setIsPlaying(false);
      if (user) {
        playNext();
      } else {
        tracker.onEnded();
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [isSeeking, tracker, playNext, user]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, []);

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
    tracker.onEnded();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
      sourceNodeRef.current = null;
      eqFiltersRef.current = [];
    }
    closePlayer();
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
      audioRef.current?.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      audioRef.current?.pause();
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
  }, [displayMusic, imageUrl, playNext, playPrev]);

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

  if (!activeMusicId || !displayMusic) return null;

  const repeatIcon = repeatMode === 'one' ? (
    <Repeat1 size={16} />
  ) : (
    <Repeat size={16} />
  );

  return (
    <>
      <audio ref={audioRef} preload="auto" crossOrigin="anonymous" />
      <AnimatePresence>
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-2xl"
        >
          <div
            ref={progressRef}
            className="relative cursor-pointer group"
            style={{ touchAction: 'none' }}
            onMouseDown={handleSeekStart}
            onTouchStart={handleSeekStart}
            data-testid="progress-bar"
          >
            <div className="h-6 flex items-center">
              <div className="w-full h-1.5 bg-muted rounded-full relative">
                <div
                  className="h-full bg-primary rounded-full transition-none"
                  style={{ width: `${progress}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-md"
                  style={{ left: `${progress}%`, transform: `translate(-50%, -50%)` }}
                />
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0 max-w-[35%] sm:max-w-[25%]">
              <img 
                src={imageUrl} 
                alt={displayMusic.title} 
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-md object-cover shadow-md shrink-0"
              />
              <div className="overflow-hidden min-w-0">
                <h4 className="font-semibold truncate text-white text-sm sm:text-base" data-testid="text-player-title">{displayMusic.title}</h4>
                <p className="text-xs sm:text-sm text-muted-foreground truncate" data-testid="text-player-artist">{displayMusic.artist}</p>
              </div>
            </div>

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
                data-testid="button-prev-track"
              >
                <SkipBack size={18} />
              </Button>
              <Button 
                size="icon"
                variant="ghost"
                onClick={togglePlay}
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </Button>
              <Button 
                size="icon"
                variant="ghost"
                onClick={playNext}
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

            <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>
              <span className="min-w-[2.5em] text-right" data-testid="text-current-time">{formatTime(currentTime)}</span>
              <span>/</span>
              <span className="min-w-[2.5em]" data-testid="text-duration">{formatTime(duration)}</span>
            </div>

            {displayMusic?.lyrics ? (
              <MarqueeLyric lyrics={displayMusic.lyrics} currentTime={currentTime} duration={duration} />
            ) : (
              <div className="flex-1" />
            )}

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

            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => togglePanel('eq')}
                className={`hidden sm:inline-flex ${showEqPanel ? "text-primary" : ""}`}
                data-testid="button-equalizer"
              >
                <SlidersHorizontal size={16} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => togglePanel('queue')}
                className={showQueuePanel ? "text-primary" : ""}
                data-testid="button-queue"
              >
                <ListMusic size={16} />
                {queue.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                    {queue.length}
                  </span>
                )}
              </Button>
              {displayMusic?.lyrics && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => togglePanel('lyrics')}
                  className={showLyricsPanel ? "text-primary" : ""}
                  data-testid="button-player-lyrics"
                >
                  <FileText size={16} />
                </Button>
              )}

              <div className="flex sm:hidden items-center gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={toggleShuffle}
                  className={shuffleEnabled ? "text-primary" : ""}
                  data-testid="button-shuffle-mobile"
                >
                  <Shuffle size={14} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={toggleRepeat}
                  className={repeatMode !== 'none' ? "text-primary" : ""}
                  data-testid="button-repeat-mobile"
                >
                  {repeatIcon}
                </Button>
              </div>

              <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline" data-testid="text-track-position">
                {currentIndex >= 0 ? currentIndex + 1 : "-"} / {currentList.length}
              </span>
              <Button 
                size="icon"
                variant="ghost"
                onClick={handleClose}
                data-testid="button-close-player"
              >
                <X size={20} />
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
      </AnimatePresence>
    </>
  );
}