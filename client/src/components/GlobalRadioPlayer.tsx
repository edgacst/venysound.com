import { useRef, useEffect, useCallback, useState, type RefObject } from "react";
// Note: waveformBufferRef prop kept for API compatibility but waveform AudioContext removed
// to avoid browser autoplay policy blocking audio output via suspended AudioContext.
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Radio, Pause, Play, X, Volume2, VolumeX } from "lucide-react";
import { useRadioPlayerStore } from "@/stores/radio-player";
import { useWs } from "@/contexts/WsContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { resolveStorageUrl } from "@/lib/utils";

const REFETCH_INTERVAL_MS = 8000;
const CROSSFADE_DURATION_MS = 1500;

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function GlobalRadioPlayer({ waveformBufferRef: _waveformBufferRef }: { waveformBufferRef?: RefObject<Uint8Array | null> }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { subscribe } = useWs();
  const { toast } = useToast();
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);
  const crossfadeRafRef = useRef<number | null>(null);
  const [playError, setPlayError] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);

  const {
    slug,
    channelName,
    trackTitle,
    streamUrl,
    isPlaying,
    userStopped,
    initialSeekSeconds,
    playTrigger,
    pauseTrigger,
    setStream,
    setPlaying,
    setUserStopped,
    setPlayNowRef,
    clear,
  } = useRadioPlayerStore();

  // 커버 이미지: streamUrl에서 musicId 추출 후 메타데이터 fetch
  useEffect(() => {
    const match = streamUrl?.match(/\/api\/music\/(\d+)\/stream/);
    if (!match) {
      setCoverImageUrl(null);
      return;
    }
    const musicId = match[1];
    let cancelled = false;
    fetch(`/api/music/${musicId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.imageFilename) {
          setCoverImageUrl(resolveStorageUrl(data.imageFilename));
        } else {
          setCoverImageUrl(null);
        }
      })
      .catch(() => { if (!cancelled) setCoverImageUrl(null); });
    return () => { cancelled = true; };
  }, [streamUrl]);

  // Refetch channel when slug is set to get new nowPlaying
  useEffect(() => {
    if (!slug || !streamUrl) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/radio/channels/${slug.trim().toLowerCase()}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.status !== "live") { clear(); return; }
        const nowPlayingId = data?.nowPlayingMusicId ?? null;
        const nowPlayingObjectPath = data?.nowPlayingObjectPath ?? null;
        if (nowPlayingId == null && !nowPlayingObjectPath) { clear(); return; }
        const newStreamUrl =
          nowPlayingObjectPath != null ? nowPlayingObjectPath
          : nowPlayingId != null ? `/api/music/${nowPlayingId}/stream`
          : null;
        if (!newStreamUrl) { clear(); return; }
        if (newStreamUrl !== streamUrl) {
          setStream(slug, (data?.name ?? channelName) ?? "", newStreamUrl, data?.nowPlayingElapsedSeconds ?? undefined);
        }
      } catch { /* ignore */ }
    }, REFETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [slug, streamUrl, channelName, clear, setStream]);

  const getActiveAudio = useCallback(() => (activeIndexRef.current === 0 ? audioARef.current : audioBRef.current), []);
  const getInactiveAudio = useCallback(() => (activeIndexRef.current === 0 ? audioBRef.current : audioARef.current), []);

  const playNowRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    playNowRef.current = () => { getActiveAudio()?.play().catch(() => {}); };
    setPlayNowRef(playNowRef);
    return () => setPlayNowRef(null);
  }, [getActiveAudio, setPlayNowRef]);

  // WebSocket: 곡 변경 감지
  useEffect(() => {
    if (!slug) return;
    const normalizedSlug = slug.trim().toLowerCase();
    const unsub = subscribe((msg) => {
      if (msg.type === "radio_now_playing" && (msg.slug == null || String(msg.slug).toLowerCase() === normalizedSlug)) {
        const musicId = msg.musicId != null ? Number(msg.musicId) : null;
        const objPath = (msg as any).nowPlayingObjectPath;
        const elapsedSeconds = typeof (msg as any).elapsedSeconds === "number" ? (msg as any).elapsedSeconds : 0;
        if (musicId === null && !objPath) {
          [audioARef.current, audioBRef.current].forEach((el) => {
            if (el) { el.pause(); el.removeAttribute("src"); el.load(); }
          });
          clear();
        } else {
          const newStreamUrl = objPath != null ? objPath : musicId != null ? `/api/music/${musicId}/stream` : null;
          if (newStreamUrl) {
            const current = useRadioPlayerStore.getState().streamUrl;
            if (newStreamUrl !== current) {
              setStream(slug, channelName ?? "", newStreamUrl, elapsedSeconds > 0 ? elapsedSeconds : undefined);
            }
          }
        }
      }
      if (msg.type === "radio_broadcast_ended" && (msg.slug == null || String(msg.slug).toLowerCase() === normalizedSlug)) {
        [audioARef.current, audioBRef.current].forEach((el) => {
          if (el) { el.pause(); el.removeAttribute("src"); el.load(); }
        });
        clear();
      }
    });
    return unsub;
  }, [slug, channelName, subscribe, clear, setStream]);

  // 볼륨 적용
  useEffect(() => {
    [audioARef.current, audioBRef.current].forEach((el) => {
      if (el) el.volume = volume;
    });
  }, [volume]);

  const handleUnmute = useCallback(() => {
    const el = getActiveAudio();
    if (el) el.muted = false;
    setIsMuted(false);
  }, [getActiveAudio]);

  const handlePlay = useCallback(() => {
    setPlayError(false);
    setNeedsTap(false);
    setIsMuted(false);
    setUserStopped(false);
    const el = getActiveAudio();
    if (el) { el.muted = false; el.play().catch(() => {}); }
  }, [setUserStopped, getActiveAudio]);

  const handlePause = useCallback(() => {
    const el = getActiveAudio();
    if (el) el.pause();
    setUserStopped(true);
  }, [setUserStopped, getActiveAudio]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    const el = getActiveAudio();
    if (el) {
      el.volume = v;
      el.muted = false;
      setIsMuted(false);
    }
  }, [getActiveAudio]);

  const handleToggleMute = useCallback(() => {
    const el = getActiveAudio();
    if (!el) return;
    if (isMuted) {
      el.muted = false;
      setIsMuted(false);
    } else {
      el.muted = true;
      setIsMuted(true);
    }
  }, [getActiveAudio, isMuted]);

  // streamUrl 변경 시 비활성 플레이어에 로드 및 크로스페이드
  useEffect(() => {
    if (!streamUrl) return;
    let cancelled = false;
    setCurrentTime(0);
    setDuration(0);
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      const active = getActiveAudio();
      const inactive = getInactiveAudio();
      const matchSrc = (el: HTMLAudioElement | null) => {
        if (!el?.src) return false;
        try { return new URL(el.src, location.origin).pathname === new URL(streamUrl, location.origin).pathname; } catch { return el.src === streamUrl; }
      };
      if (matchSrc(active) || matchSrc(inactive)) return;
      if (!inactive || typeof inactive.pause !== "function") return;
      inactive.pause();
      inactive.currentTime = 0;
      inactive.removeAttribute("src");
      inactive.load();
      pendingSeekRef.current = useRadioPlayerStore.getState().initialSeekSeconds ?? null;
      inactive.src = streamUrl;
      inactive.volume = volume;
      const onReady = () => {
        inactive.oncanplaythrough = null;
        const seek = pendingSeekRef.current;
        if (seek != null && seek > 0) {
          inactive.currentTime = Math.max(0, seek);
          pendingSeekRef.current = null;
          useRadioPlayerStore.setState({ initialSeekSeconds: null });
        }
        const active = getActiveAudio();
        const userStoppedNow = useRadioPlayerStore.getState().userStopped;
        if (userStoppedNow) return;
        const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const tryPlay = (el: HTMLAudioElement) => {
          el.muted = false;
          el.play().then(() => {
            setNeedsTap(false);
            setIsMuted(false);
          }).catch(() => {
            el.muted = true;
            el.play().then(() => {
              setIsMuted(true);
              setNeedsTap(false);
            }).catch(() => {
              setNeedsTap(true);
            });
          });
        };
        if (isMobile) {
          const oldActive = getActiveAudio();
          activeIndexRef.current = 1 - activeIndexRef.current;
          setActiveIndex(activeIndexRef.current);
          if (oldActive) { oldActive.pause(); oldActive.currentTime = 0; }
          inactive.volume = volume;
          tryPlay(inactive);
          return;
        }
        if (!active?.src || active.paused) {
          activeIndexRef.current = 1 - activeIndexRef.current;
          setActiveIndex(activeIndexRef.current);
          inactive.volume = volume;
          tryPlay(inactive);
          return;
        }
        inactive.volume = 0;
        tryPlay(inactive);
        const start = performance.now();
        const run = () => {
          const t = Math.min(1, (performance.now() - start) / CROSSFADE_DURATION_MS);
          const ease = t * (2 - t);
          if (active) active.volume = (1 - ease) * volume;
          inactive.volume = ease * volume;
          if (t < 1) {
            crossfadeRafRef.current = requestAnimationFrame(run);
          } else {
            crossfadeRafRef.current = null;
            if (active) { active.pause(); active.currentTime = 0; active.removeAttribute("src"); active.load(); }
            activeIndexRef.current = 1 - activeIndexRef.current;
            setActiveIndex(activeIndexRef.current);
          }
        };
        crossfadeRafRef.current = requestAnimationFrame(run);
      };
      inactive.oncanplaythrough = onReady;
      inactive.load();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (crossfadeRafRef.current != null) {
        cancelAnimationFrame(crossfadeRafRef.current);
        crossfadeRafRef.current = null;
      }
    };
  }, [streamUrl, getActiveAudio, getInactiveAudio, volume]);

  useEffect(() => {
    const el = getActiveAudio();
    if (!el) return;
    if (playTrigger > 0 && !userStopped) el.play().catch(() => {});
  }, [playTrigger, userStopped, getActiveAudio]);

  useEffect(() => {
    const el = getActiveAudio();
    if (!el) return;
    if (pauseTrigger > 0) el.pause();
  }, [pauseTrigger, getActiveAudio]);

  const handleStop = useCallback(() => {
    setPlayError(false);
    setNeedsTap(false);
    setIsMuted(false);
    setCurrentTime(0);
    setDuration(0);
    [audioARef.current, audioBRef.current].forEach((el) => {
      if (el) { el.pause(); el.removeAttribute("src"); el.load(); }
    });
    activeIndexRef.current = 0;
    setActiveIndex(0);
    clear();
  }, [clear]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const onAudioPlay = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (e.target === getActiveAudio()) setPlaying(true);
  }, [getActiveAudio, setPlaying]);

  const onAudioPause = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (e.target === getActiveAudio()) setPlaying(false);
  }, [getActiveAudio, setPlaying]);

  const onAudioTimeUpdate = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    const el = e.target as HTMLAudioElement;
    if (el !== getActiveAudio()) return;
    useRadioPlayerStore.getState().currentTimeRef.current = el.currentTime;
    setCurrentTime(el.currentTime);
    if (isFinite(el.duration)) setDuration(el.duration);
  }, [getActiveAudio]);

  const onAudioError = useCallback(() => {
    setPlayError(true);
    setPlaying(false);
    toast({
      title: t("radio.listenErrorTitle", "방송을 재생할 수 없습니다"),
      description: t("radio.listenErrorDesc", "네트워크 상태를 확인한 뒤 다시 시도해 주세요."),
      variant: "destructive",
    });
  }, [setPlaying, toast, t]);

  const onAudioEnded = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    const el = e.target as HTMLAudioElement;
    if (el !== getActiveAudio()) return;
    el.pause();
    el.currentTime = 0;
    el.removeAttribute("src");
    el.load();
    setPlaying(false);
    setUserStopped(false);
    setCurrentTime(0);
    setDuration(0);
    const state = useRadioPlayerStore.getState();
    const currentSlug = state.slug;
    const currentUrl = state.streamUrl;
    const match = currentUrl?.match(/\/api\/music\/(\d+)\/stream/);
    if (currentSlug && match) {
      const musicId = parseInt(match[1], 10);
      fetch(`/api/radio/channels/${currentSlug}/client-advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentMusicId: musicId }),
      }).catch(() => {});
    }
    if (slug) queryClient.invalidateQueries({ queryKey: ["/api/radio/channels", slug] });
  }, [getActiveAudio, setPlaying, setUserStopped, slug, queryClient]);

  if (!slug || !channelName) return null;

  const statusText = playError
    ? t("radio.listenError", "재생 오류")
    : isMuted && isPlaying
      ? t("radio.mutedPlaying", "🔇 음소거")
      : isPlaying
        ? t("radio.listeningTo", "LIVE")
        : needsTap
          ? t("radio.tapToContinue", "탭하여 계속")
          : t("radio.listeningPaused", "일시정지");

  return (
    <>
      {/* 음소거/탭 안내 배너 */}
      {isMuted && isPlaying && (
        <div className="fixed bottom-[72px] left-0 right-0 z-50">
          <button
            className="w-full flex items-center justify-center gap-2 py-2 bg-amber-500 text-white text-sm font-semibold"
            onClick={handleUnmute}
          >
            <Volume2 className="h-4 w-4" />
            {t("radio.tapToUnmute", "🔊 소리 켜기 (탭하세요)")}
          </button>
        </div>
      )}
      {needsTap && !isPlaying && (
        <div className="fixed bottom-[72px] left-0 right-0 z-50">
          <button
            className="w-full flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground text-sm font-semibold"
            onClick={handlePlay}
          >
            <Play className="h-4 w-4 fill-current" />
            {t("radio.tapToPlay", "▶ 탭하여 라디오 듣기")}
          </button>
        </div>
      )}

      {/* 플레이어 바 */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-2xl pb-[env(safe-area-inset-bottom)]">
        {/* 진행 바 (읽기 전용) */}
        <div className="relative h-1 bg-muted">
          <div
            className="h-full bg-primary transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-4">
          {/* 커버 이미지 + 곡 정보 */}
          <Link
            href={`/radio/${slug}`}
            className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 max-w-[40%] sm:max-w-[35%] rounded-md hover:bg-white/5 active:bg-white/10 transition-colors touch-manipulation"
          >
            {coverImageUrl ? (
              <img
                src={coverImageUrl}
                alt=""
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-md object-cover shadow-md shrink-0"
              />
            ) : (
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-md bg-muted flex items-center justify-center shrink-0">
                <Radio className="h-5 w-5 text-primary" />
              </div>
            )}
            <div className="overflow-hidden min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-semibold truncate text-sm text-foreground leading-tight">{channelName}</p>
                <span className={`text-[10px] font-bold px-1 py-0.5 rounded shrink-0 ${
                  isPlaying ? "bg-red-500 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {statusText}
                </span>
              </div>
              {trackTitle && (
                <p className="truncate text-xs text-muted-foreground leading-tight mt-0.5">{trackTitle}</p>
              )}
            </div>
          </Link>

          {/* 재생 컨트롤 */}
          <div className="flex items-center gap-0.5 shrink-0">
            {isPlaying ? (
              <Button size="icon" variant="ghost" onClick={handlePause} aria-label={t("radio.listenPause", "일시정지")}>
                <Pause className="h-5 w-5" />
              </Button>
            ) : (
              <Button size="icon" variant="ghost" onClick={handlePlay} aria-label={t("radio.listenPlay", "재생")}>
                <Play className="h-5 w-5" />
              </Button>
            )}
          </div>

          {/* 시간 표시 */}
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground shrink-0 tabular-nums">
            <span>{formatTime(currentTime)}</span>
            {duration > 0 && <><span>/</span><span>{formatTime(duration)}</span></>}
          </div>

          {/* 볼륨 컨트롤 */}
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            <Button size="icon" variant="ghost" onClick={handleToggleMute}>
              {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 accent-primary h-1 cursor-pointer"
              aria-label="볼륨"
            />
          </div>

          {/* 닫기 */}
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0 ml-auto"
            onClick={handleStop}
            aria-label={t("radio.stopListening", "방송 정지")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 숨겨진 오디오 엘리먼트 */}
      {streamUrl && (
        <>
          <audio
            ref={audioARef}
            className="hidden"
            preload="auto"
            playsInline
            onPlay={onAudioPlay}
            onPause={onAudioPause}
            onTimeUpdate={onAudioTimeUpdate}
            onError={onAudioError}
            onEnded={onAudioEnded}
          />
          <audio
            ref={audioBRef}
            className="hidden"
            preload="auto"
            playsInline
            onPlay={onAudioPlay}
            onPause={onAudioPause}
            onTimeUpdate={onAudioTimeUpdate}
            onError={onAudioError}
            onEnded={onAudioEnded}
          />
        </>
      )}
    </>
  );
}
