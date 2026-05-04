import { useRef, useEffect, useCallback, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play, X, Radio } from "lucide-react";
import { useRadioPlayerStore, radioSeekSecondsForHandoff } from "@/stores/radio-player";
import { useWs } from "@/contexts/WsContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { redirectToLogin } from "@/lib/queryClient";
import { markGuestListenQuotaConsumed } from "@/lib/guest-listen-quota";
import { ToastAction } from "@/components/ui/toast";
import { Link, useLocation } from "wouter";
import { useResumeAudioWhenForeground } from "@/hooks/use-resume-audio-when-foreground";
import { useScreenWakeLockWhilePlaying } from "@/hooks/use-screen-wake-lock-while-playing";

const REFETCH_INTERVAL_MS = 8000;
/** 폴링에서 status !== live 가 연속으로 나올 때만 clear (일시 응답·레이스로 라디오가 죽는 것 방지) */
const POLL_NOT_LIVE_CLEAR_AFTER = 2;

/** `/api/music/:id/stream` 형태만 id 추출 (로컬 파일 object path는 null) */
function musicIdFromSiteMusicStreamUrl(url: string | null | undefined): number | null {
  if (!url) return null;
  const m = String(url).match(/\/api\/music\/(\d+)\/stream/);
  return m ? Number.parseInt(m[1], 10) : null;
}

/**
 * 서버(폴링·WS)가 이미 다음 곡으로 바뀌었는데, 클라이언트 오디오에는 아직 재생할 구간이 남은 경우
 * 즉시 setStream 하면 곡이 덜 끊긴 채로 넘어가므로 갈아타기를 미룬다.
 */
function shouldDeferHandoffToNewRadioTrack(
  el: HTMLAudioElement | null,
  newStreamUrl: string,
  currentStreamUrl: string | null,
  opts?: { needsReload?: boolean },
): boolean {
  if (opts?.needsReload) return false;
  const newId = musicIdFromSiteMusicStreamUrl(newStreamUrl);
  const curId = musicIdFromSiteMusicStreamUrl(currentStreamUrl);
  if (newId == null || curId == null || newId === curId) return false;
  if (!el || el.paused || el.ended) return false;
  try {
    if (el.buffered?.length) {
      const bufEnd = el.buffered.end(el.buffered.length - 1);
      // 재생 버퍼에 아직 여유가 있으면 서버·WS가 다음 곡으로 바뀌어도 갈아타기 미룸(곡 중간 끊김 완화)
      if (bufEnd - el.currentTime > 2) return true;
    }
  } catch {
    /* ignore */
  }
  const d = el.duration;
  return Number.isFinite(d) && d >= 2 && el.currentTime < d - 0.2;
}

function radioAudioPathMatchesStream(el: HTMLAudioElement | null, wanted: string): boolean {
  if (!el?.src) return false;
  try {
    return new URL(el.src, window.location.origin).pathname === new URL(wanted, window.location.origin).pathname;
  } catch {
    return el.src === wanted;
  }
}

export function GlobalRadioPlayer({ waveformBufferRef: _waveformBufferRef }: { waveformBufferRef?: RefObject<Uint8Array | null> }) {
  const { t, i18n } = useTranslation();
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
  const [playError, setPlayError] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [listenerCount, setListenerCount] = useState<number | null>(null);
  const pollNotLiveStreakRef = useRef(0);

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
    requestPlay,
  } = useRadioPlayerStore();

  // Refetch channel to keep stream in sync (streamUrl이 잠깐 null이어도 폴링 유지 — 곡 종료 직후 다른 페이지에서 다음 곡 복구)
  useEffect(() => {
    if (!slug) return;
    pollNotLiveStreakRef.current = 0;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/radio/channels/${slug.trim().toLowerCase()}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.status !== "live") {
          pollNotLiveStreakRef.current += 1;
          if (pollNotLiveStreakRef.current >= POLL_NOT_LIVE_CLEAR_AFTER) {
            clear();
          }
          return;
        }
        pollNotLiveStreakRef.current = 0;
        const nowPlayingId = data?.nowPlayingMusicId ?? null;
        const nowPlayingObjectPath = data?.nowPlayingObjectPath ?? null;
        // 곡 전환 직후 등으로 nowPlaying 이 잠깐 비는 동안 clear 하면 다른 탭으로 이동 시 재생이 끊김 → 폴링에서는 유지
        if (nowPlayingId == null && !nowPlayingObjectPath) return;
        const newStreamUrl =
          nowPlayingObjectPath != null ? nowPlayingObjectPath
          : nowPlayingId != null ? `/api/music/${nowPlayingId}/stream`
          : null;
        if (!newStreamUrl) return;
        const currentUrl = useRadioPlayerStore.getState().streamUrl;
        if (newStreamUrl !== currentUrl) {
          // 비로그인은 첫 곡 종료 이후에는 다음 곡으로 넘기지 않음
          if (!authLoading && !isAuthenticated && unauthFirstEndedCountRef.current >= 1) return;
          const pollActiveEl = activeIndexRef.current === 0 ? audioARef.current : audioBRef.current;
          if (shouldDeferHandoffToNewRadioTrack(pollActiveEl, newStreamUrl, currentUrl)) return;
          const def = i18n.t("radio.defaultChannelName");
          const resolvedName = String(data?.name ?? channelName ?? def).trim() || def;
          setStream(
            slug,
            resolvedName,
            newStreamUrl,
            radioSeekSecondsForHandoff(currentUrl, newStreamUrl, data?.nowPlayingElapsedSeconds as number | null | undefined),
          );
        }
      } catch { /* ignore */ }
    }, REFETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [slug, channelName, clear, setStream, isAuthenticated, authLoading]);

  const getActiveAudio = useCallback(() => (activeIndexRef.current === 0 ? audioARef.current : audioBRef.current), []);
  const getInactiveAudio = useCallback(() => (activeIndexRef.current === 0 ? audioBRef.current : audioARef.current), []);

  const [locationPath] = useLocation();

  /** PC 크로스페이드 rAF가 effect cleanup으로 끊기면 활성 트랙 볼륨이 0에 가깝게 남거나 비활성 audio가 같이 재생될 수 있음 */
  const restoreAudibleOutput = useCallback(() => {
    const s = useRadioPlayerStore.getState();
    if (s.userStopped || !s.streamUrl) return;
    const wanted = s.streamUrl;
    const a = audioARef.current;
    const b = audioBRef.current;
    let primary: HTMLAudioElement | null = null;
    // 통화 등으로 OS가 pause만 걸어둔 경우: 재생 중인 트랙 우선, 없으면 같은 src의 paused 버퍼도 복구
    if (radioAudioPathMatchesStream(a, wanted) && a && !a.ended && !a.paused) primary = a;
    if (!primary && radioAudioPathMatchesStream(b, wanted) && b && !b.ended && !b.paused) primary = b;
    if (!primary && radioAudioPathMatchesStream(a, wanted) && a && !a.ended) primary = a;
    if (!primary && radioAudioPathMatchesStream(b, wanted) && b && !b.ended) primary = b;
    if (!primary) {
      const def = getActiveAudio();
      if (def && !def.ended && radioAudioPathMatchesStream(def, wanted)) primary = def;
    }
    if (!primary) return;
    primary.volume = 1;
    primary.muted = false;
    const other = primary === a ? b : a;
    if (other) {
      if (!other.paused) {
        try {
          other.pause();
        } catch {
          /* ignore */
        }
      }
      other.volume = 1;
    }
    setIsMuted(false);
    // paused만이 아니라, 모바일에서 라우트 전환 직후 "paused는 false인데 무음"인 경우도 있어 항상 play 재시도
    void primary
      .play()
      .then(() => {
        setNeedsTap(false);
      })
      .catch(() => {
        setNeedsTap(true);
      });
  }, [getActiveAudio, setNeedsTap]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") restoreAudibleOutput();
    };
    window.addEventListener("pageshow", restoreAudibleOutput);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pageshow", restoreAudibleOutput);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [restoreAudibleOutput]);

  useResumeAudioWhenForeground(getActiveAudio, () => {
    const s = useRadioPlayerStore.getState();
    return !s.userStopped && !!s.streamUrl && !!s.slug;
  });

  useScreenWakeLockWhilePlaying(isPlaying && !!slug && !!streamUrl && !userStopped);

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

  /** 통화·시스템 오디오 점유 후 무음: play만으로는 복구 안 될 때 src 재부착·채널 재동기화 (연속 재생/ended 로직 미변경) */
  const radioRecoverTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const runRadioRecoveryAfterSystemPause = useCallback(async () => {
    const s0 = useRadioPlayerStore.getState();
    if (s0.userStopped || !s0.slug || !s0.streamUrl) return;
    // 곡 종료 직후 client-advance fetch 중: pause()가 suspend를 일으키면 복구 루틴이 돌며 requestPlay()가
    // 아직 ended인 활성 버퍼에 play()를 걸어 같은 곡이 처음부터 다시 돌거나 다음 곡 핸드오프와 경합함(모바일 연속 재생 깨짐).
    if (trackEndLockRef.current) return;

    restoreAudibleOutput();
    requestPlay();

    await new Promise<void>((r) => void window.setTimeout(() => r(), 520));

    const s = useRadioPlayerStore.getState();
    if (s.userStopped || !s.streamUrl) return;
    const wanted = s.streamUrl;
    const active = getActiveAudio();
    const looksPlaying =
      active &&
      !active.ended &&
      radioAudioPathMatchesStream(active, wanted) &&
      !active.paused &&
      active.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    if (looksPlaying) return;

    const target = getActiveAudio();
    if (target && radioAudioPathMatchesStream(target, wanted)) {
      try {
        target.pause();
        target.muted = false;
        target.volume = 1;
        target.removeAttribute("src");
        target.load();
        target.src = wanted;
        target.load();
        await target
          .play()
          .then(() => setNeedsTap(false))
          .catch(() => setNeedsTap(true));
      } catch {
        setNeedsTap(true);
      }
    }

    await new Promise<void>((r) => void window.setTimeout(() => r(), 280));

    const s2 = useRadioPlayerStore.getState();
    const el2 = getActiveAudio();
    const recovered =
      el2 &&
      !el2.ended &&
      s2.streamUrl &&
      radioAudioPathMatchesStream(el2, s2.streamUrl) &&
      !el2.paused;
    if (recovered || s2.userStopped || !s2.slug || !s2.streamUrl) return;

    try {
      const res = await fetch(`/api/radio/channels/${s2.slug.trim().toLowerCase()}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.status !== "live") return;
      const nowPlayingId = data?.nowPlayingMusicId ?? null;
      const nowPlayingObjectPath = data?.nowPlayingObjectPath ?? null;
      if (nowPlayingId == null && !nowPlayingObjectPath) return;
      const newStreamUrl =
        nowPlayingObjectPath != null
          ? String(nowPlayingObjectPath)
          : nowPlayingId != null
            ? `/api/music/${Number(nowPlayingId)}/stream`
            : null;
      if (!newStreamUrl) return;
      if (!authLoading && !isAuthenticated && unauthFirstEndedCountRef.current >= 1) return;
      const def = i18n.t("radio.defaultChannelName");
      const resolvedName = String(data?.name ?? s2.channelName ?? def).trim() || def;
      setStream(
        s2.slug,
        resolvedName,
        newStreamUrl,
        radioSeekSecondsForHandoff(s2.streamUrl, newStreamUrl, data?.nowPlayingElapsedSeconds as number | null | undefined),
      );
      requestPlay();
    } catch {
      /* ignore */
    }
  }, [
    restoreAudibleOutput,
    getActiveAudio,
    setNeedsTap,
    authLoading,
    isAuthenticated,
    i18n,
    setStream,
    requestPlay,
  ]);

  const scheduleRadioRecoveryAfterSystemPause = useCallback(() => {
    const s = useRadioPlayerStore.getState();
    if (s.userStopped || !s.streamUrl || !s.slug) return;
    if (trackEndLockRef.current) return;
    if (radioRecoverTimerRef.current != null) window.clearTimeout(radioRecoverTimerRef.current);
    radioRecoverTimerRef.current = window.setTimeout(() => {
      radioRecoverTimerRef.current = null;
      void runRadioRecoveryAfterSystemPause();
    }, 180);
  }, [runRadioRecoveryAfterSystemPause]);

  // SPA에서 다른 페이지로 이동해도 document.visibilityState는 "visible"인 경우가 많음(iOS Safari 등).
  // 그때는 복구 스케줄이 안 돌아가 무음으로 남을 수 있어, 라우트 변경마다 복구 루프를 태운다.
  useEffect(() => {
    const s = useRadioPlayerStore.getState();
    if (s.userStopped || !s.slug || !s.streamUrl) return;
    if (trackEndLockRef.current) return;
    restoreAudibleOutput();
    requestPlay();
    scheduleRadioRecoveryAfterSystemPause();
  }, [locationPath, restoreAudibleOutput, requestPlay, scheduleRadioRecoveryAfterSystemPause]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") scheduleRadioRecoveryAfterSystemPause();
    };
    window.addEventListener("focus", scheduleRadioRecoveryAfterSystemPause);
    window.addEventListener("pageshow", scheduleRadioRecoveryAfterSystemPause);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (radioRecoverTimerRef.current != null) {
        window.clearTimeout(radioRecoverTimerRef.current);
        radioRecoverTimerRef.current = null;
      }
      window.removeEventListener("focus", scheduleRadioRecoveryAfterSystemPause);
      window.removeEventListener("pageshow", scheduleRadioRecoveryAfterSystemPause);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [scheduleRadioRecoveryAfterSystemPause]);

  useEffect(() => {
    if (!slug) return;
    const schedule = scheduleRadioRecoveryAfterSystemPause;
    const onMediaStall = () => {
      if (document.visibilityState !== "visible") return;
      if (trackEndLockRef.current) return;
      const s = useRadioPlayerStore.getState();
      if (s.userStopped || !s.streamUrl) return;
      schedule();
    };
    const a = audioARef.current;
    const b = audioBRef.current;
    a?.addEventListener("stalled", onMediaStall);
    a?.addEventListener("suspend", onMediaStall);
    b?.addEventListener("stalled", onMediaStall);
    b?.addEventListener("suspend", onMediaStall);
    return () => {
      a?.removeEventListener("stalled", onMediaStall);
      a?.removeEventListener("suspend", onMediaStall);
      b?.removeEventListener("stalled", onMediaStall);
      b?.removeEventListener("suspend", onMediaStall);
    };
  }, [slug, scheduleRadioRecoveryAfterSystemPause]);

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
        const elapsedSecondsRaw = typeof (msg as any).elapsedSeconds === "number" ? (msg as any).elapsedSeconds : 0;
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
              if (!needsReload && shouldDeferHandoffToNewRadioTrack(activeEl, newStreamUrl, current, { needsReload: false })) {
                return;
              }
              const def = i18n.t("radio.defaultChannelName");
              const resolvedName = String(channelName ?? def).trim() || def;
              setStream(
                slug,
                resolvedName,
                newStreamUrl,
                radioSeekSecondsForHandoff(current, newStreamUrl, elapsedSecondsRaw > 0 ? elapsedSecondsRaw : null),
              );
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
    if (el) {
      el.muted = false;
      el.volume = 1;
    }
    setIsMuted(false);
  }, [getActiveAudio]);

  const handlePlay = useCallback(() => {
    setPlayError(false);
    setNeedsTap(false);
    setIsMuted(false);
    setUserStopped(false);
    const el = getActiveAudio();
    if (el) {
      el.muted = false;
      el.volume = 1;
      el.play().catch(() => {});
    }
  }, [setUserStopped, getActiveAudio]);

  const handlePause = useCallback(() => {
    setUserStopped(true);
    const el = getActiveAudio();
    if (el) el.pause();
  }, [setUserStopped, getActiveAudio]);

  /** ended + timeupdate 폴백 중복 방지 (백그라운드에서 ended 미발화 대비) */
  const trackEndLockRef = useRef(false);

  // streamUrl 변경 시 에러 상태 초기화 + A/B 버퍼에 로드
  // PC에서 rAF 크로스페이드는 라우트 전환·effect cleanup과 겹치면 볼륨/활성 버퍼가 꼬여 무음이 되므로, 모바일과 동일하게 즉시 핸드오프만 사용
  useEffect(() => {
    if (!streamUrl) return;
    setPlayError(false);
    let cancelled = false;
    const tId = window.setTimeout(() => {
      if (cancelled) return;
      const active = getActiveAudio();
      const inactive = getInactiveAudio();
      const matchSrc = (el: HTMLAudioElement | null) => {
        if (!el?.src) return false;
        try { return new URL(el.src, location.origin).pathname === new URL(streamUrl, location.origin).pathname; } catch { return el.src === streamUrl; }
      };
      const userStoppedNow = () => useRadioPlayerStore.getState().userStopped;
      const tryPlay = (el: HTMLAudioElement) => {
        el.volume = 1;
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
      /** 비활성 버퍼에 이미 올바른 src가 있을 때(이전 effect 취소 등)에도 반드시 핸드오프·재생 */
      const handoffToInactive = (inactiveEl: HTMLAudioElement) => {
        if (userStoppedNow()) return;
        const seek = pendingSeekRef.current ?? useRadioPlayerStore.getState().initialSeekSeconds ?? null;
        if (seek != null && seek > 0) {
          try {
            inactiveEl.currentTime = Math.max(0, seek);
          } catch { /* ignore */ }
          pendingSeekRef.current = null;
          useRadioPlayerStore.setState({ initialSeekSeconds: null });
        }
        const oldActive = getActiveAudio();
        activeIndexRef.current = 1 - activeIndexRef.current;
        setActiveIndex(activeIndexRef.current);
        if (oldActive) {
          try {
            oldActive.pause();
            oldActive.currentTime = 0;
          } catch {
            /* ignore */
          }
        }
        inactiveEl.volume = 1;
        tryPlay(inactiveEl);
      };

      if (matchSrc(active)) {
        if (userStoppedNow()) return;
        if (active && !active.paused && !active.ended) {
          active.volume = 1;
          active.muted = false;
          if (inactive && inactive !== active) {
            try {
              inactive.pause();
            } catch {
              /* ignore */
            }
            inactive.volume = 1;
          }
          setIsMuted(false);
          setNeedsTap(false);
          return;
        }
        if (active) tryPlay(active);
        return;
      }
      if (matchSrc(inactive) && inactive && inactive.readyState >= 2) {
        handoffToInactive(inactive);
        return;
      }

      if (!inactive || typeof inactive.pause !== "function") return;
      inactive.pause();
      inactive.currentTime = 0;
      inactive.removeAttribute("src");
      inactive.load();
      pendingSeekRef.current = useRadioPlayerStore.getState().initialSeekSeconds ?? null;
      inactive.src = streamUrl;
      const onReady = () => {
        handoffToInactive(inactive);
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
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(tId);
    };
  }, [streamUrl, getActiveAudio, getInactiveAudio]);

  useEffect(() => {
    const el = getActiveAudio();
    if (!el) return;
    if (trackEndLockRef.current) return;
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
      artist: t("radio.mediaSessionArtist", "라디오 청취 중"),
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
      setUserStopped(true);
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
  }, [streamUrl, channelName, getActiveAudio, handleStop, setUserStopped, t]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  const onAudioPlay = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (e.target === getActiveAudio()) {
      const el = e.target as HTMLAudioElement;
      if (el.volume < 0.05) el.volume = 1;
      trackEndLockRef.current = false;
      setPlaying(true);
    }
  }, [getActiveAudio, setPlaying]);

  const onAudioPause = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (e.target === getActiveAudio()) setPlaying(false);
  }, [getActiveAudio, setPlaying]);

  const processActiveTrackEnded = useCallback(
    (el: HTMLAudioElement) => {
      if (trackEndLockRef.current) return;
      if (el !== getActiveAudio()) return;
      trackEndLockRef.current = true;

      const endedSrc = el.src;
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

      const releaseEndLockAndClearAudio = () => {
        try {
          el.pause();
          el.removeAttribute("src");
          el.load();
        } catch {
          /* ignore */
        }
        trackEndLockRef.current = false;
      };

      const state = useRadioPlayerStore.getState();
      const currentSlug = state.slug;
      const match = endedSrc?.match(/\/api\/music\/(\d+)\/stream/);
      const musicId = match ? parseInt(match[1], 10) : NaN;
      const advanceBody =
        match && Number.isFinite(musicId) ? JSON.stringify({ currentMusicId: musicId }) : JSON.stringify({});

      /** 비로그인·스트림 없음: 즉시 끊기(기존과 동일) */
      if (!currentSlug || !shouldAutoAdvance) {
        useRadioPlayerStore.setState({ streamUrl: null });
        releaseEndLockAndClearAudio();
        if (unauthFirstEnd && currentSlug) {
          markGuestListenQuotaConsumed();
          toast({
            title: t("radio.loginContinuousRadioTitle", "음악을 연속해서 들으려면 로그인 하세요"),
            description: t("radio.loginContinuousRadioDesc", "로그인 후에는 다음 곡으로 자동 재생됩니다."),
            variant: "default",
            action: (
              <ToastAction altText={t("nav.login", "로그인")} onClick={() => redirectToLogin()}>
                {t("nav.login", "로그인")}
              </ToastAction>
            ),
          });
          handleStop();
        }
        if (slug) queryClient.invalidateQueries({ queryKey: ["/api/radio/channels", slug] });
        return;
      }

      // 로그인 청취: client-advance 응답 전까지 src 유지 → 네트워크 지연 동안 덜컹 무음 방지
      try {
        el.pause();
      } catch {
        /* ignore */
      }

      const def = i18n.t("radio.defaultChannelName");
      const chName = (state.channelName ?? def).trim() || def;

      const failAdvance = () => {
        useRadioPlayerStore.setState({ streamUrl: null });
        releaseEndLockAndClearAudio();
      };

      fetch(`/api/radio/channels/${currentSlug}/client-advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
        body: advanceBody,
      })
        .then(async (r) => (r.ok ? r.json() : null))
        .then(async (data: { ok?: boolean; nextMusicId?: number; reason?: string } | null) => {
          let didSetNext = false;
          const applyChannelPayload = (channelData: Record<string, unknown>) => {
            if (channelData?.status !== "live") return;
            const nowPlayingId = channelData?.nowPlayingMusicId ?? null;
            const nowPlayingObjectPath = channelData?.nowPlayingObjectPath ?? null;
            if (nowPlayingId == null && !nowPlayingObjectPath) return;
            const newStreamUrl =
              nowPlayingObjectPath != null
                ? String(nowPlayingObjectPath)
                : nowPlayingId != null
                  ? `/api/music/${Number(nowPlayingId)}/stream`
                  : null;
            if (!newStreamUrl) return;
            const s = useRadioPlayerStore.getState();
            if (s.userStopped || s.slug !== currentSlug) return;
            const resolvedName = String(channelData?.name ?? chName).trim() || i18n.t("radio.defaultChannelName");
            const elapsed =
              typeof channelData?.nowPlayingElapsedSeconds === "number"
                ? (channelData.nowPlayingElapsedSeconds as number)
                : null;
            s.setStream(currentSlug, resolvedName, newStreamUrl, radioSeekSecondsForHandoff(endedSrc, newStreamUrl, elapsed));
            didSetNext = true;
          };

          if (data?.ok && data.nextMusicId != null) {
            const nextUrl = `/api/music/${Number(data.nextMusicId)}/stream`;
            const s = useRadioPlayerStore.getState();
            if (!s.userStopped && s.slug === currentSlug) {
              s.setStream(currentSlug, chName, nextUrl);
              didSetNext = true;
            }
            if (!didSetNext) failAdvance();
            return;
          }
          if (data?.reason === "not_live") {
            failAdvance();
            return;
          }
          try {
            const r2 = await fetch(`/api/radio/channels/${currentSlug}`, { credentials: "include" });
            if (!r2.ok) {
              failAdvance();
              return;
            }
            const channelData = await r2.json();
            applyChannelPayload(channelData);
            if (!didSetNext) failAdvance();
          } catch {
            failAdvance();
          }
        })
        .catch(() => {
          failAdvance();
        });

      if (slug) queryClient.invalidateQueries({ queryKey: ["/api/radio/channels", slug] });
    },
    [
      getActiveAudio,
      setPlaying,
      setUserStopped,
      slug,
      queryClient,
      isAuthenticated,
      authLoading,
      toast,
      t,
      i18n,
      handleStop,
    ],
  );

  const onAudioTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      const el = e.target as HTMLAudioElement;
      if (el !== getActiveAudio()) return;
      useRadioPlayerStore.getState().currentTimeRef.current = el.currentTime;
      if (trackEndLockRef.current) return;
      const d = el.duration;
      if (!Number.isFinite(d) || d < 2) return;
      if (el.ended) return;
      // ended 미발화 보조용: 과도한 조기 진행 방지 — (1) reported duration 끝 근처 (2) 버퍼도 거의 소진
      // duration이 실제보다 짧게 잡힌 경우, 버퍼 끝이 아직 metadata 끝보다 짧으면 조기 종료하지 않음
      try {
        if (el.buffered?.length) {
          const bufEnd = el.buffered.end(el.buffered.length - 1);
          if (bufEnd - el.currentTime > 0.55) return;
          if (Number.isFinite(d) && bufEnd < d - 0.75 && d - el.currentTime > 0.9) return;
        }
      } catch {
        /* ignore */
      }
      if (el.currentTime < d - 0.18) return;
      processActiveTrackEnded(el);
    },
    [getActiveAudio, processActiveTrackEnded],
  );

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

  const onAudioEnded = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      const el = e.target as HTMLAudioElement;
      if (el !== getActiveAudio()) return;
      processActiveTrackEnded(el);
    },
    [getActiveAudio, processActiveTrackEnded],
  );

  if (!slug) return null;

  const listenerText =
    listenerCount != null ? ` · ${t("radio.listenersCount", { count: listenerCount })}` : "";
  const resolvedChannelName = (channelName ?? "").trim() || t("radio.defaultChannelName");

  return (
    <>
      {/* 음소거 안내 */}
      {isMuted && isPlaying && (
        <div className="fixed bottom-[68px] left-2 right-2 z-50">
          <button
            className="w-full flex items-center justify-center gap-2 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg shadow-lg"
            onClick={handleUnmute}
          >
            {t("radio.unmuteButton")}
          </button>
        </div>
      )}
      {needsTap && !isPlaying && (
        <div className="fixed bottom-[68px] left-2 right-2 z-50">
          <button
            className="w-full flex items-center justify-center gap-2 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-lg"
            onClick={handlePlay}
          >
            {t("radio.tapToListenRadio")}
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
              <span className="text-destructive">{t("radio.globalPlaybackError")}</span>
            ) : (
              <>
                <span className="font-medium">
                  {t("radio.globalListeningTo", { name: resolvedChannelName })}
                </span>
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
            aria-label={isPlaying ? t("radio.playerAriaPause") : t("radio.playerAriaPlay")}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>

          {/* X 종료 버튼 */}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={handleStop}
            aria-label={t("radio.stopBroadcastAria")}
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
