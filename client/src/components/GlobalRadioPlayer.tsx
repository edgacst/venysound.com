import { useRef, useEffect, useCallback, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play, X, Radio } from "lucide-react";
import { useRadioPlayerStore } from "@/stores/radio-player";
import { useWs } from "@/contexts/WsContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { redirectToLogin } from "@/lib/queryClient";
import { ToastAction } from "@/components/ui/toast";
import { Link } from "wouter";
import { useResumeAudioWhenForeground } from "@/hooks/use-resume-audio-when-foreground";

const REFETCH_INTERVAL_MS = 8000;
const CROSSFADE_DURATION_MS = 1500;

export function GlobalRadioPlayer({ waveformBufferRef: _waveformBufferRef }: { waveformBufferRef?: RefObject<Uint8Array | null> }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { subscribe } = useWs();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const isAuthenticated = !!user;
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);
  const crossfadeRafRef = useRef<number | null>(null);
  const [playError, setPlayError] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [listenerCount, setListenerCount] = useState<number | null>(null);

  const {
    slug,
    channelName,
    streamUrl,
    isPlaying,
    userStopped,
    playTrigger,
    pauseTrigger,
    setStream,
    setPlaying,
    setUserStopped,
    setPlayNowRef,
    clear,
  } = useRadioPlayerStore();

  // Refetch channel to keep stream in sync (streamUrl이 잠깐 null이어도 폴링 유지 — 곡 종료 직후 다른 페이지에서 다음 곡 복구)
  useEffect(() => {
    if (!slug) return;
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
        const currentUrl = useRadioPlayerStore.getState().streamUrl;
        if (newStreamUrl !== currentUrl) {
          // 비로그인은 첫 곡 종료 이후에는 다음 곡으로 넘기지 않음
          if (!authLoading && !isAuthenticated && unauthFirstEndedCountRef.current >= 1) return;
          const resolvedName = String(data?.name ?? channelName ?? "라디오").trim() || "라디오";
          setStream(slug, resolvedName, newStreamUrl, data?.nowPlayingElapsedSeconds ?? undefined);
        }
      } catch { /* ignore */ }
    }, REFETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [slug, channelName, clear, setStream, isAuthenticated, authLoading]);

  const getActiveAudio = useCallback(() => (activeIndexRef.current === 0 ? audioARef.current : audioBRef.current), []);
  const getInactiveAudio = useCallback(() => (activeIndexRef.current === 0 ? audioBRef.current : audioARef.current), []);

  useResumeAudioWhenForeground(getActiveAudio, () => {
    const s = useRadioPlayerStore.getState();
    return !s.userStopped && !!s.streamUrl && !!s.slug;
  });

  // 비로그인은 채널에서 첫 곡 1회만 재생하고 정지
  const unauthFirstEndedCountRef = useRef(0);
  const limitSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (limitSlugRef.current !== slug) {
      limitSlugRef.current = slug;
      unauthFirstEndedCountRef.current = 0;
    }
  }, [slug]);
  useEffect(() => {
    if (isAuthenticated) unauthFirstEndedCountRef.current = 0;
  }, [isAuthenticated]);

  const playNowRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    playNowRef.current = () => { getActiveAudio()?.play().catch(() => {}); };
    setPlayNowRef(playNowRef);
    return () => setPlayNowRef(null);
  }, [getActiveAudio, setPlayNowRef]);

  // WebSocket: 곡 변경 + 청취자 수 수신
  useEffect(() => {
    if (!slug) return;
    const normalizedSlug = slug.trim().toLowerCase();
    const unsub = subscribe((msg) => {
      if (msg.type === "radio_listeners" && (msg.slug == null || String(msg.slug).toLowerCase() === normalizedSlug)) {
        const users = (msg as any).users;
        if (Array.isArray(users)) setListenerCount(users.length);
        else if (typeof (msg as any).count === "number") setListenerCount((msg as any).count);
      }
      if (msg.type === "radio_user_joined" && (msg.slug == null || String(msg.slug).toLowerCase() === normalizedSlug)) {
        setListenerCount((prev) => (prev ?? 0) + 1);
      }
      if (msg.type === "radio_user_left" && (msg.slug == null || String(msg.slug).toLowerCase() === normalizedSlug)) {
        setListenerCount((prev) => Math.max(0, (prev ?? 1) - 1));
      }
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
            const activeEl = activeIndexRef.current === 0 ? audioARef.current : audioBRef.current;
            // URL이 같더라도 오디오 src가 비어있으면(트랙 종료 후) 다시 로드
            const needsReload = !activeEl?.src || activeEl.src === window.location.href;
            if (newStreamUrl !== current || needsReload) {
              // 비로그인은 첫 곡 종료 이후에는 다음 곡으로 넘기지 않음
              if (!authLoading && !isAuthenticated && unauthFirstEndedCountRef.current >= 1) return;
              const resolvedName = String(channelName ?? "라디오").trim() || "라디오";
              setStream(slug, resolvedName, newStreamUrl, elapsedSeconds > 0 ? elapsedSeconds : undefined);
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
  }, [slug, channelName, subscribe, clear, setStream, isAuthenticated, authLoading]);

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

  // streamUrl 변경 시 에러 상태 초기화 + 오디오 로드 및 크로스페이드
  useEffect(() => {
    if (!streamUrl) return;
    setPlayError(false);
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
          tryPlay(inactive);
          return;
        }
        if (!active?.src || active.paused) {
          activeIndexRef.current = 1 - activeIndexRef.current;
          setActiveIndex(activeIndexRef.current);
          tryPlay(inactive);
          return;
        }
        inactive.volume = 0;
        tryPlay(inactive);
        const start = performance.now();
        const run = () => {
          const t = Math.min(1, (performance.now() - start) / CROSSFADE_DURATION_MS);
          const ease = t * (2 - t);
          if (active) active.volume = (1 - ease);
          inactive.volume = ease;
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
      // iOS Safari는 스트리밍에서 canplaythrough 미발생 → canplay 병행 등록
      let readyCalled = false;
      const onReadyOnce = () => {
        if (readyCalled) return;
        readyCalled = true;
        inactive.oncanplaythrough = null;
        inactive.oncanplay = null;
        onReady();
      };
      inactive.oncanplaythrough = onReadyOnce;
      inactive.oncanplay = onReadyOnce;
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
    [audioARef.current, audioBRef.current].forEach((el) => {
      if (el) { el.pause(); el.removeAttribute("src"); el.load(); }
    });
    activeIndexRef.current = 0;
    setActiveIndex(0);
    setListenerCount(null);
    clear();
  }, [clear]);

  // MediaSession API: handleStop 선언 이후에 위치해야 TDZ 에러 없음
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!streamUrl || !channelName) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    navigator.mediaSession.metadata = new MediaMetadata({
      title: channelName,
      artist: "라디오 청취 중",
      album: "VenySound",
      artwork: origin
        ? [{ src: `${origin}/favicon.png`, sizes: "192x192", type: "image/png" }]
        : [],
    });
    navigator.mediaSession.setActionHandler("play", () => {
      const el = getActiveAudio();
      if (el) el.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      const el = getActiveAudio();
      if (el) el.pause();
    });
    navigator.mediaSession.setActionHandler("stop", () => {
      handleStop();
    });
    return () => {
      try {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("stop", null);
      } catch { /* ignore */ }
    };
  }, [streamUrl, channelName, getActiveAudio, handleStop]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

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
  }, [getActiveAudio]);

  const onAudioError = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    // 비활성 오디오 엘리먼트(src 없음)의 오류는 무시
    if (e.target !== getActiveAudio()) return;
    const el = e.target as HTMLAudioElement;
    // src가 없는 경우는 정상적인 reset 동작이므로 무시
    if (!el.src || el.src === window.location.href) return;
    setPlayError(true);
    setPlaying(false);
    toast({
      title: t("radio.listenErrorTitle", "방송을 재생할 수 없습니다"),
      description: t("radio.listenErrorDesc", "네트워크 상태를 확인한 뒤 다시 시도해 주세요."),
      variant: "destructive",
    });
  }, [getActiveAudio, setPlaying, toast, t]);

  const onAudioEnded = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    const el = e.target as HTMLAudioElement;
    if (el !== getActiveAudio()) return;
    // 오디오 엘리먼트의 실제 src에서 musicId 추출 (스토어는 이미 다음 곡으로 바뀌어 있을 수 있음)
    const endedSrc = el.src;
    el.pause();
    el.currentTime = 0;
    el.removeAttribute("src");
    el.load();
    setPlaying(false);
    const shouldLimit = !authLoading && !isAuthenticated;
    const unauthFirstEnd = shouldLimit && unauthFirstEndedCountRef.current === 0;
    const shouldAutoAdvance = !shouldLimit;
    if (shouldLimit) {
      if (unauthFirstEnd) unauthFirstEndedCountRef.current = 1;
      setUserStopped(true);
    } else {
      setUserStopped(false);
    }
    const state = useRadioPlayerStore.getState();
    const currentSlug = state.slug;
    // streamUrl을 null로 초기화: 같은 곡이 루프될 때도 WS radio_now_playing이 setStream()을 호출하도록
    useRadioPlayerStore.setState({ streamUrl: null });
    // 방금 끝난 곡의 ID를 el.src에서 추출 (state.streamUrl 사용 시 이미 다음 곡 ID가 들어있어 곡 건너뜀 버그 발생)
    const match = endedSrc?.match(/\/api\/music\/(\d+)\/stream/);
    if (currentSlug && match && shouldAutoAdvance) {
      const musicId = parseInt(match[1], 10);
      const chName = (state.channelName ?? "라디오").trim() || "라디오";
      // 응답으로 바로 다음 곡 URL을 적용 — 화면 꺼짐 시 setInterval/WS가 지연돼도 전환 유지
      fetch(`/api/radio/channels/${currentSlug}/client-advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
        body: JSON.stringify({ currentMusicId: musicId }),
      })
        .then(async (r) => (r.ok ? r.json() : null))
        .then(async (data: { ok?: boolean; nextMusicId?: number; reason?: string } | null) => {
          if (data?.ok && data.nextMusicId != null) {
            const nextUrl = `/api/music/${Number(data.nextMusicId)}/stream`;
            const s = useRadioPlayerStore.getState();
            if (!s.userStopped && s.slug === currentSlug) {
              s.setStream(currentSlug, chName, nextUrl);
            }
            return;
          }
          if (data?.reason !== "already_advanced") return;
          const r2 = await fetch(`/api/radio/channels/${currentSlug}`, { credentials: "include" });
          if (!r2.ok) return;
          const channelData = await r2.json();
          if (channelData?.status !== "live") return;
          const nowPlayingId = channelData?.nowPlayingMusicId ?? null;
          const nowPlayingObjectPath = channelData?.nowPlayingObjectPath ?? null;
          if (nowPlayingId == null && !nowPlayingObjectPath) return;
          const newStreamUrl =
            nowPlayingObjectPath != null
              ? nowPlayingObjectPath
              : nowPlayingId != null
                ? `/api/music/${nowPlayingId}/stream`
                : null;
          if (!newStreamUrl) return;
          const s = useRadioPlayerStore.getState();
          if (s.userStopped || s.slug !== currentSlug) return;
          const resolvedName = String(channelData?.name ?? chName).trim() || "라디오";
          s.setStream(
            currentSlug,
            resolvedName,
            newStreamUrl,
            typeof channelData?.nowPlayingElapsedSeconds === "number"
              ? channelData.nowPlayingElapsedSeconds
              : undefined,
          );
        })
        .catch(() => {});
    }
    if (unauthFirstEnd && currentSlug) {
      toast({
        title: "음악을 연속해서 들을려면 로그인 하세요",
        description: "로그인 후에는 다음 곡으로 자동 재생됩니다.",
        variant: "default",
        action: (
          <ToastAction altText="확인" onClick={() => redirectToLogin()}>
            확인
          </ToastAction>
        ),
      });
    }
    if (slug) queryClient.invalidateQueries({ queryKey: ["/api/radio/channels", slug] });
  }, [getActiveAudio, setPlaying, setUserStopped, slug, queryClient, isAuthenticated, authLoading, toast]);

  if (!slug) return null;

  const listenerText = listenerCount != null ? ` · 청취자 ${listenerCount}명` : "";
  const resolvedChannelName = (channelName ?? "").trim() || "라디오";

  return (
    <>
      {/* 음소거 안내 */}
      {isMuted && isPlaying && (
        <div className="fixed bottom-[68px] left-2 right-2 z-50">
          <button
            className="w-full flex items-center justify-center gap-2 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg shadow-lg"
            onClick={handleUnmute}
          >
            🔊 소리 켜기 (탭하세요)
          </button>
        </div>
      )}
      {needsTap && !isPlaying && (
        <div className="fixed bottom-[68px] left-2 right-2 z-50">
          <button
            className="w-full flex items-center justify-center gap-2 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-lg"
            onClick={handlePlay}
          >
            ▶ 탭하여 라디오 듣기
          </button>
        </div>
      )}

      {/* 플레이 바 - 한 줄 floating */}
      <div className="fixed bottom-2 left-2 right-2 z-50 bg-card border border-border rounded-xl shadow-2xl pb-[env(safe-area-inset-bottom)]">
        <div className="px-3 py-2 flex items-center gap-2">
          {/* 라이브 인디케이터 */}
          <Radio className={`h-4 w-4 shrink-0 ${isPlaying ? "text-red-500" : "text-muted-foreground"}`} />

          {/* 방송 정보 텍스트 */}
          <span className="flex-1 min-w-0 text-sm truncate">
            {playError ? (
              <span className="text-destructive">재생 오류</span>
            ) : (
              <>
                <span className="font-medium">현재 </span>
                <span className="font-semibold text-primary">{resolvedChannelName}</span>
                <span className="font-medium"> 방송 청취중</span>
                {listenerText && (
                  <span className="text-muted-foreground text-xs">{listenerText}</span>
                )}
              </>
            )}
          </span>

          {slug ? (
            <Button variant="outline" size="sm" className="h-8 shrink-0 px-2 text-xs" asChild>
              <Link href={`/radio/${encodeURIComponent(slug.trim().toLowerCase())}`}>
                {t("radio.goToChannel", "채널 가기")}
              </Link>
            </Button>
          ) : null}

          {/* 재생/일시정지 토글 */}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={isPlaying ? handlePause : handlePlay}
            aria-label={isPlaying ? "일시정지" : "재생"}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>

          {/* X 종료 버튼 */}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={handleStop}
            aria-label="방송 종료"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 숨겨진 오디오 엘리먼트 — streamUrl이 곡 사이에 null이어도 마운트 유지(리스너 페이지 밖에서 ref 끊김 방지) */}
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
    </>
  );
}
