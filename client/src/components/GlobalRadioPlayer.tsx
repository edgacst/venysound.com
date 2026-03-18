import { useRef, useEffect, useCallback, useState, type RefObject } from "react";
// Note: waveformBufferRef prop kept for API compatibility but waveform AudioContext removed
// to avoid browser autoplay policy blocking audio output via suspended AudioContext.
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Radio, Pause, Play, X } from "lucide-react";
import { useRadioPlayerStore } from "@/stores/radio-player";
import { useWs } from "@/contexts/WsContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const REFETCH_INTERVAL_MS = 8000;
const CROSSFADE_DURATION_MS = 1500;

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

  // Refetch channel when slug is set (e.g. user navigated away) to get new nowPlaying and update streamUrl
  useEffect(() => {
    if (!slug || !streamUrl) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/radio/channels/${slug.trim().toLowerCase()}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.status !== "live") {
          clear();
          return;
        }
        const nowPlayingId = data?.nowPlayingMusicId ?? null;
        const nowPlayingObjectPath = data?.nowPlayingObjectPath ?? null;
        if (nowPlayingId == null && !nowPlayingObjectPath) {
          clear();
          return;
        }
        const newStreamUrl =
          nowPlayingObjectPath != null
            ? nowPlayingObjectPath
            : nowPlayingId != null
              ? `/api/music/${nowPlayingId}/stream`
              : null;
        if (!newStreamUrl) {
          clear();
          return;
        }
        if (newStreamUrl !== streamUrl) {
          setStream(slug, (data?.name ?? channelName) ?? "", newStreamUrl, data?.nowPlayingElapsedSeconds ?? undefined);
        }
      } catch {
        // ignore
      }
    }, REFETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [slug, streamUrl, channelName, clear, setStream]);

  const getActiveAudio = useCallback(() => (activeIndexRef.current === 0 ? audioARef.current : audioBRef.current), []);
  const getInactiveAudio = useCallback(() => (activeIndexRef.current === 0 ? audioBRef.current : audioARef.current), []);

  const playNowRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    playNowRef.current = () => {
      getActiveAudio()?.play().catch(() => {});
    };
    setPlayNowRef(playNowRef);
    return () => setPlayNowRef(null);
  }, [getActiveAudio, setPlayNowRef]);

  // WebSocket: 곡 없으면 정지, 새 곡 오면 즉시 전환 (다음 곡 자연스럽게 이어지기)
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
            if (el) {
              el.pause();
              el.removeAttribute("src");
              el.load();
            }
          });
          clear();
        } else {
          const newStreamUrl =
            objPath != null ? objPath : musicId != null ? `/api/music/${musicId}/stream` : null;
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
          if (el) {
            el.pause();
            el.removeAttribute("src");
            el.load();
          }
        });
        clear();
      }
    });
    return unsub;
  }, [slug, channelName, subscribe, clear, setStream]);

  const handlePlay = useCallback(() => {
    setPlayError(false);
    setNeedsTap(false);
    setUserStopped(false);
    const el = getActiveAudio();
    if (el) el.play().catch(() => {});
  }, [setUserStopped, getActiveAudio]);

  const handlePause = useCallback(() => {
    const el = getActiveAudio();
    if (el) el.pause();
    setUserStopped(true);
  }, [setUserStopped, getActiveAudio]);


  // streamUrl 변경 시: 비활성(다음) 플레이어에 로드, 재생/크로스페이드는 onCanPlayThrough에서 (다음 틱에 실행해 ref 보장)
  useEffect(() => {
    if (!streamUrl) return;
    let cancelled = false;
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
        if (isMobile) {
          // 모바일: 이전 오디오 정지 후 교체, play() 시도 → 차단되면 needsTap 표시
          const oldActive = getActiveAudio();
          activeIndexRef.current = 1 - activeIndexRef.current;
          setActiveIndex(activeIndexRef.current);
          if (oldActive) {
            oldActive.pause();
            oldActive.currentTime = 0;
          }
          inactive.volume = 1;
          inactive.play().then(() => {
            setNeedsTap(false);
          }).catch(() => {
            // 자동재생 차단 → 사용자에게 탭 유도
            setNeedsTap(true);
          });
          return;
        }
        // 첫 트랙이면 바로 재생, 아니면 크로스페이드 (PC)
        if (!active?.src || active.paused) {
          activeIndexRef.current = 1 - activeIndexRef.current;
          setActiveIndex(activeIndexRef.current);
          inactive.volume = 1;
          inactive.play().then(() => { setNeedsTap(false); }).catch(() => { setNeedsTap(true); });
          return;
        }
        inactive.volume = 0;
        inactive.play().then(() => { setNeedsTap(false); }).catch(() => { setNeedsTap(true); });
        const start = performance.now();
        const run = () => {
          const t = Math.min(1, (performance.now() - start) / CROSSFADE_DURATION_MS);
          const ease = t * (2 - t);
          if (active) {
            active.volume = 1 - ease;
          }
          inactive.volume = ease;
          if (t < 1) {
            crossfadeRafRef.current = requestAnimationFrame(run);
          } else {
            crossfadeRafRef.current = null;
            if (active) {
              active.pause();
              active.currentTime = 0;
              active.removeAttribute("src");
              active.load();
            }
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
  }, [streamUrl, getActiveAudio, getInactiveAudio]);

  // When RadioChannel (or any consumer) calls requestPlay/requestPause, run the audio
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
    [audioARef.current, audioBRef.current].forEach((el) => {
      if (el) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
    });
    activeIndexRef.current = 0;
    setActiveIndex(0);
    clear();
  }, [clear]);

  if (!slug || !channelName) return null;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 safe-area-pb">
        {needsTap && !isPlaying && (
          <button
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground text-sm font-semibold"
            onClick={handlePlay}
          >
            <Play className="h-4 w-4 fill-current" />
            {t("radio.tapToPlay", "▶ 탭하여 라디오 듣기")}
          </button>
        )}
        <div className="container flex items-center gap-3 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Radio className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{channelName}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {playError
                    ? t("radio.listenError", "재생 오류")
                    : isPlaying
                      ? t("radio.listeningTo", "재생 중")
                      : needsTap
                        ? t("radio.tapToContinue", "탭하여 계속 듣기")
                        : t("radio.listeningPaused", "일시정지")}
                </span>
              </div>
              {trackTitle && (
                <p className="truncate text-xs text-muted-foreground">{trackTitle}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isPlaying ? (
              <Button size="sm" variant="ghost" onClick={handlePause} aria-label={t("radio.listenPause", "일시정지")}>
                <Pause className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={handlePlay} aria-label={t("radio.listenPlay", "재생")}>
                <Play className="h-4 w-4" />
              </Button>
            )}
            <Link
              href={`/radio/${slug}`}
              className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium hover:bg-white/10 hover:text-foreground"
            >
              {t("radio.openChannel", "채널로")}
            </Link>
            <Button size="sm" variant="ghost" onClick={handleStop} aria-label={t("radio.stopListening", "방송 정지")}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      {streamUrl && (
        <>
          <audio
            ref={audioARef}
            className="hidden"
            preload="auto"
            playsInline
            onPlay={(e) => {
              if (e.target === getActiveAudio()) setPlaying(true);
            }}
            onPause={(e) => {
              if (e.target === getActiveAudio()) setPlaying(false);
            }}
            onTimeUpdate={(e) => {
              if (e.target === getActiveAudio()) {
                useRadioPlayerStore.getState().currentTimeRef.current = (e.target as HTMLAudioElement).currentTime;
              }
            }}
            onError={() => {
              setPlayError(true);
              setPlaying(false);
              toast({
                title: t("radio.listenErrorTitle", "방송을 재생할 수 없습니다"),
                description: t("radio.listenErrorDesc", "네트워크 상태를 확인한 뒤 다시 시도해 주세요."),
                variant: "destructive",
              });
            }}
            onEnded={(e) => {
              const el = e.target as HTMLAudioElement;
              if (el !== getActiveAudio()) return;
              el.pause();
              el.currentTime = 0;
              el.removeAttribute("src");
              el.load();
              setPlaying(false);
              setUserStopped(false);
              // 곡 종료 시 즉시 서버에 다음 곡 진행 요청
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
              if (slug) {
                queryClient.invalidateQueries({ queryKey: ["/api/radio/channels", slug] });
              }
            }}
          />
          <audio
            ref={audioBRef}
            className="hidden"
            preload="auto"
            playsInline
            onPlay={(e) => {
              if (e.target === getActiveAudio()) setPlaying(true);
            }}
            onPause={(e) => {
              if (e.target === getActiveAudio()) setPlaying(false);
            }}
            onTimeUpdate={(e) => {
              if (e.target === getActiveAudio()) {
                useRadioPlayerStore.getState().currentTimeRef.current = (e.target as HTMLAudioElement).currentTime;
              }
            }}
            onError={() => {
              setPlayError(true);
              setPlaying(false);
              toast({
                title: t("radio.listenErrorTitle", "방송을 재생할 수 없습니다"),
                description: t("radio.listenErrorDesc", "네트워크 상태를 확인한 뒤 다시 시도해 주세요."),
                variant: "destructive",
              });
            }}
            onEnded={(e) => {
              const el = e.target as HTMLAudioElement;
              if (el !== getActiveAudio()) return;
              el.pause();
              el.currentTime = 0;
              el.removeAttribute("src");
              el.load();
              setPlaying(false);
              setUserStopped(false);
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
              if (slug) {
                queryClient.invalidateQueries({ queryKey: ["/api/radio/channels", slug] });
              }
            }}
          />
        </>
      )}
    </>
  );
}
