import { useRef, useEffect, useCallback, type RefObject } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Radio, Pause, Play, X } from "lucide-react";
import { useRadioPlayerStore } from "@/stores/radio-player";
import { useWs } from "@/contexts/WsContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

const REFETCH_INTERVAL_MS = 8000;
const WAVEFORM_BUFFER_LENGTH = 128;

export function GlobalRadioPlayer({ waveformBufferRef }: { waveformBufferRef?: RefObject<Uint8Array | null> }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { subscribe } = useWs();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode } | null>(null);
  const {
    slug,
    channelName,
    streamUrl,
    isPlaying,
    userStopped,
    initialSeekSeconds,
    playTrigger,
    pauseTrigger,
    setStream,
    setPlaying,
    setUserStopped,
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
          const el = audioRef.current;
          if (el) {
            el.pause();
            el.removeAttribute("src");
            el.load();
          }
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
        const el = audioRef.current;
        if (el) {
          el.pause();
          el.removeAttribute("src");
          el.load();
        }
        clear();
      }
    });
    return unsub;
  }, [slug, channelName, subscribe, clear, setStream]);

  const handlePlay = useCallback(() => {
    setUserStopped(false);
    const el = audioRef.current;
    if (el) el.play().catch(() => {});
  }, [setUserStopped]);

  const handlePause = useCallback(() => {
    const el = audioRef.current;
    if (el) el.pause();
    setUserStopped(true);
  }, [setUserStopped]);

  // 전역 라디오 오디오 → Analyser → 파형 버퍼 (리스너 캔버스에서 사용)
  useEffect(() => {
    if (!streamUrl || !waveformBufferRef || !audioRef.current) return;
    const audio = audioRef.current;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    analyserRef.current = { ctx, analyser };
    const buffer = new Uint8Array(WAVEFORM_BUFFER_LENGTH);
    waveformBufferRef.current = buffer;
    let rafId = 0;
    function tick() {
      rafId = requestAnimationFrame(tick);
      if (!analyserRef.current || !waveformBufferRef?.current) return;
      analyserRef.current.analyser.getByteTimeDomainData(waveformBufferRef.current);
    }
    tick();
    return () => {
      cancelAnimationFrame(rafId);
      waveformBufferRef.current = null;
      analyserRef.current = null;
      try {
        source.disconnect();
      } catch (_) {}
      ctx.close();
    };
  }, [streamUrl, waveformBufferRef]);

  // When RadioChannel (or any consumer) calls requestPlay/requestPause, run the audio
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playTrigger > 0 && !userStopped) el.play().catch(() => {});
  }, [playTrigger, userStopped]);
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (pauseTrigger > 0) el.pause();
  }, [pauseTrigger]);

  const handleStop = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    clear();
  }, [clear]);

  if (!slug || !channelName) return null;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 safe-area-pb">
        <div className="container flex items-center gap-3 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Radio className="h-5 w-5 shrink-0 text-primary" />
            <span className="truncate text-sm font-medium">{channelName}</span>
            <span className="text-xs text-muted-foreground">
              {isPlaying ? t("radio.listeningTo", "지금 재생 중") : t("radio.listeningPaused", "일시정지")}
            </span>
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
        <audio
          ref={audioRef}
          key={streamUrl}
          src={streamUrl}
          className="hidden"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            const el = audioRef.current;
            if (el) {
              el.pause();
              el.removeAttribute("src");
              el.load();
            }
            setPlaying(false);
            setUserStopped(false);
            if (!slug) return;
            const endedStreamUrl = streamUrl;
            queryClient.invalidateQueries({ queryKey: ["/api/radio/channels", slug] });
            const tryFetch = () => {
              fetch(`/api/radio/channels/${slug.trim().toLowerCase()}`, { credentials: "include" })
                .then((res) => (res.ok ? res.json() : null))
                .then((data) => {
                  if (!data || data?.status !== "live") return;
                  const nowPlayingId = data?.nowPlayingMusicId ?? null;
                  const nowPlayingObjectPath = data?.nowPlayingObjectPath ?? null;
                  const newStreamUrl =
                    nowPlayingObjectPath != null
                      ? nowPlayingObjectPath
                      : nowPlayingId != null
                        ? `/api/music/${nowPlayingId}/stream`
                        : null;
                  if (newStreamUrl && newStreamUrl !== endedStreamUrl) {
                    setStream(slug, (data?.name ?? useRadioPlayerStore.getState().channelName) ?? "", newStreamUrl, data?.nowPlayingElapsedSeconds ?? undefined);
                  }
                })
                .catch(() => {});
            };
            tryFetch();
            setTimeout(tryFetch, 600);
            setTimeout(tryFetch, 1400);
          }}
          onCanPlay={() => {
            const el = audioRef.current;
            const seek = useRadioPlayerStore.getState().initialSeekSeconds;
            if (el && seek != null && seek > 0) {
              el.currentTime = Math.max(0, seek);
              useRadioPlayerStore.setState({ initialSeekSeconds: null });
            }
            if (!useRadioPlayerStore.getState().userStopped && el) {
              el.play().catch(() => {});
            }
          }}
        />
      )}
    </>
  );
}
