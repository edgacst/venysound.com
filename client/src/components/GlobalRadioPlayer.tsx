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
import { isGuestPlaybackBlocked, markGuestListenQuotaConsumed } from "@/lib/guest-listen-quota";
import { ToastAction } from "@/components/ui/toast";
import { Link, useLocation } from "wouter";
import { useResumeAudioWhenForeground } from "@/hooks/use-resume-audio-when-foreground";
import { useScreenWakeLockWhilePlaying } from "@/hooks/use-screen-wake-lock-while-playing";

const REFETCH_INTERVAL_MS = 8000;
/** 모바일/네트워크 흔들림에서 status가 잠깐 non-live로 오는 경우가 있어 즉시 clear하지 않음 */
const POLL_NOT_LIVE_CLEAR_AFTER = 5;
/** TWA에서 play()가 잠깐 거절되는 경우가 많아, 즉시 "탭해서 듣기"를 띄우지 않고 이 시간까지 자동 복구를 재시도 */
const NEEDS_TAP_DEFER_TOTAL_MS = 5200;
const NEEDS_TAP_RETRY_AT_MS = [0, 550, 1500, 3200, NEEDS_TAP_DEFER_TOTAL_MS] as const;
/** A/B 핸드오프 직후 다음 트랙을 잠깐 뮤트로 재생한 뒤 출력을 연 시간(ms). tryPlay `holdMutedOutputMs`와 함께 사용. */
const NEXT_TRACK_HANDOFF_UNMUTE_MS = 240;

/** `/api/music/:id/stream` 형태만 id 추출 (로컬 파일 object path는 null) */
function musicIdFromSiteMusicStreamUrl(url: string | null | undefined): number | null {
  if (!url) return null;
  const m = String(url).match(/\/api\/music\/(\d+)\/stream/);
  return m ? Number.parseInt(m[1], 10) : null;
}

function isCoarseOrTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return true;
    if (navigator.maxTouchPoints > 0 && window.matchMedia("(hover: none)").matches) return true;
  } catch {
    /* ignore */
  }
  return false;
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
  // 모바일에서 라우트 전환/백그라운드 복귀 시 auth가 잠깐 흔들려도 "게스트 1곡 제한"으로 오판해 끊기지 않게 한다.
  // 한 번이라도 로그인 사용자로 확인되면(이 세션 내) guest-limit 로직을 적용하지 않는다.
  const everAuthenticatedRef = useRef(false);
  useEffect(() => {
    if (user?.id) everAuthenticatedRef.current = true;
  }, [user?.id]);
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
  /** 통화/알림 등 시스템 인터럽트로 pause 된 경우: 자동 복구(play 재시도)로 맞서지 않는다. */
  const systemInterruptedRef = useRef(false);
  /** 즉시 needsTap 대신: 자동 복구 여러 번 시도 후에만 CTA 표시 (restoreAudibleOutput보다 아래에서 채움) */
  const scheduleNeedsTapAfterRecoveryRef = useRef<() => void>(() => {});
  const needsTapDeferSeqRef = useRef(0);
  const needsTapDeferTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** A/B 핸드오프 직후 뮤트 해제 타이머 — effect 재실행·채널 전환 시 이전 타이머가 엉뚱한 엘리먼트를 unmute 하지 않게 정리 */
  const handoffUnmuteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const invalidateDeferredNeedsTap = useCallback(() => {
    needsTapDeferSeqRef.current += 1;
    needsTapDeferTimersRef.current.forEach((id) => clearTimeout(id));
    needsTapDeferTimersRef.current = [];
  }, []);

  const {
    slug,
    channelName,
    streamUrl,
    streamHandoffSeq,
    isPlaying,
    userStopped,
    playTrigger,
    pauseTrigger,
    setStream,
    setPlaying,
    setUserStopped,
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
          if (data?.status != null) {
            pollNotLiveStreakRef.current += 1;
            if (pollNotLiveStreakRef.current >= POLL_NOT_LIVE_CLEAR_AFTER) clear();
          }
          return;
        }
        pollNotLiveStreakRef.current = 0;
        const nowPlayingId = data?.nowPlayingMusicId ?? null;
        const nowPlayingObjectPath = data?.nowPlayingObjectPath ?? null;
        // 곡 전환 직후 nowPlaying 이 잠깐 비는 동안 clear 하면 페이지 이동 시 재생이 끊김 → 폴링에서는 유지
        if (nowPlayingId == null && !nowPlayingObjectPath) return;
        const newStreamUrl =
          nowPlayingObjectPath != null ? nowPlayingObjectPath
          : nowPlayingId != null ? `/api/music/${nowPlayingId}/stream`
          : null;
        if (!newStreamUrl) return;
        const currentUrl = useRadioPlayerStore.getState().streamUrl;
        if (newStreamUrl !== currentUrl) {
          // 비로그인은 첫 곡 종료 이후에는 다음 곡으로 넘기지 않음
          const guestBlocked = !everAuthenticatedRef.current && isGuestPlaybackBlocked();
          if (guestBlocked && unauthFirstEndedCountRef.current >= 1) return;
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
  }, [slug, channelName, clear, setStream]);

  const getActiveAudio = useCallback(() => (activeIndexRef.current === 0 ? audioARef.current : audioBRef.current), []);
  const getInactiveAudio = useCallback(() => (activeIndexRef.current === 0 ? audioBRef.current : audioARef.current), []);

  const [locationPath] = useLocation();

  /** PC 크로스페이드 rAF가 effect cleanup으로 끊기면 활성 트랙 볼륨이 0에 가깝게 남거나 비활성 audio가 같이 재생될 수 있음 */
  const restoreAudibleOutput = useCallback(() => {
    const s = useRadioPlayerStore.getState();
    if (s.userStopped || !s.streamUrl) return;
    if (systemInterruptedRef.current) return;
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
    const shouldAttemptPlay = primary.paused || isCoarseOrTouchDevice();
    if (!shouldAttemptPlay) return;
    void primary
      .play()
      .then(() => {
        invalidateDeferredNeedsTap();
        setNeedsTap(false);
      })
      .catch(() => {
        scheduleNeedsTapAfterRecoveryRef.current();
      });
  }, [getActiveAudio, setNeedsTap, invalidateDeferredNeedsTap]);

  useEffect(() => {
    restoreAudibleOutput();
  }, [locationPath, restoreAudibleOutput]);

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
  const radioRecoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runRadioRecoveryAfterSystemPause = useCallback(async () => {
    const s0 = useRadioPlayerStore.getState();
    if (s0.userStopped || !s0.slug || !s0.streamUrl) return;
    if (systemInterruptedRef.current) return;

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
          .then(() => {
            invalidateDeferredNeedsTap();
            setNeedsTap(false);
          })
          .catch(() => scheduleNeedsTapAfterRecoveryRef.current());
      } catch {
        scheduleNeedsTapAfterRecoveryRef.current();
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
      if (isGuestPlaybackBlocked() && unauthFirstEndedCountRef.current >= 1) return;
      const def = i18n.t("radio.defaultChannelName");
      const resolvedName = String(data?.name ?? s2.channelName ?? def).trim() || def;
      setStream(
        s2.slug,
        resolvedName,
        newStreamUrl,
        radioSeekSecondsForHandoff(s2.streamUrl, newStreamUrl, data?.nowPlayingElapsedSeconds as number | null | undefined),
      );
      // setStream → streamUrl effect에서 tryPlay/handoff — 여기서 requestPlay 하면 스왑 전 이전 버퍼에 play()가 걸려 곡 처음이 재생될 수 있음
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
    invalidateDeferredNeedsTap,
  ]);

  const scheduleRadioRecoveryAfterSystemPause = useCallback(() => {
    const s = useRadioPlayerStore.getState();
    if (s.userStopped || !s.streamUrl || !s.slug) return;
    if (systemInterruptedRef.current) return;
    if (radioRecoverTimerRef.current != null) clearTimeout(radioRecoverTimerRef.current);
    radioRecoverTimerRef.current = setTimeout(() => {
      radioRecoverTimerRef.current = null;
      void runRadioRecoveryAfterSystemPause();
    }, 180);
  }, [runRadioRecoveryAfterSystemPause]);

  const scheduleNeedsTapAfterRecovery = useCallback(() => {
    if (systemInterruptedRef.current) {
      setPlaying(false);
      setNeedsTap(true);
      return;
    }
    needsTapDeferTimersRef.current.forEach((id) => clearTimeout(id));
    needsTapDeferTimersRef.current = [];
    const mySeq = ++needsTapDeferSeqRef.current;

    const tryRecoverBurst = () => {
      const s = useRadioPlayerStore.getState();
      if (s.userStopped || !s.streamUrl || !s.slug) return;
      if (systemInterruptedRef.current) return;
      restoreAudibleOutput();
      requestPlay();
      scheduleRadioRecoveryAfterSystemPause();
      const el = getActiveAudio();
      const wanted = s.streamUrl;
      if (el && radioAudioPathMatchesStream(el, wanted) && el.paused && !s.userStopped) {
        el.muted = false;
        el.volume = 1;
        void el.play().catch(() => {
          el.muted = true;
          void el.play().catch(() => {});
        });
      }
    };

    NEEDS_TAP_RETRY_AT_MS.forEach((ms, idx) => {
      const id = setTimeout(() => {
        if (mySeq !== needsTapDeferSeqRef.current) return;
        tryRecoverBurst();
        if (idx === NEEDS_TAP_RETRY_AT_MS.length - 1) {
          const s = useRadioPlayerStore.getState();
          const el = getActiveAudio();
          const stuck =
            !s.userStopped &&
            !!s.streamUrl &&
            !!el &&
            el.paused &&
            radioAudioPathMatchesStream(el, s.streamUrl);
          if (stuck) {
            setPlaying(false);
            setNeedsTap(true);
          }
        }
      }, ms);
      needsTapDeferTimersRef.current.push(id);
    });
  }, [
    restoreAudibleOutput,
    requestPlay,
    scheduleRadioRecoveryAfterSystemPause,
    getActiveAudio,
    setPlaying,
    setNeedsTap,
  ]);

  useEffect(() => {
    scheduleNeedsTapAfterRecoveryRef.current = scheduleNeedsTapAfterRecovery;
  }, [scheduleNeedsTapAfterRecovery]);

  // 모바일: SPA 라우트만 바뀌면 visibility/focus 이벤트가 안 오는 경우가 있어 schedule까지 함께 호출
  useEffect(() => {
    if (!isCoarseOrTouchDevice()) return;
    const s = useRadioPlayerStore.getState();
    if (s.userStopped || !s.slug || !s.streamUrl) return;
    scheduleRadioRecoveryAfterSystemPause();
  }, [locationPath, scheduleRadioRecoveryAfterSystemPause]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") scheduleRadioRecoveryAfterSystemPause();
    };
    window.addEventListener("focus", scheduleRadioRecoveryAfterSystemPause);
    window.addEventListener("pageshow", scheduleRadioRecoveryAfterSystemPause);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (radioRecoverTimerRef.current != null) {
        clearTimeout(radioRecoverTimerRef.current);
        radioRecoverTimerRef.current = null;
      }
      window.removeEventListener("focus", scheduleRadioRecoveryAfterSystemPause);
      window.removeEventListener("pageshow", scheduleRadioRecoveryAfterSystemPause);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [scheduleRadioRecoveryAfterSystemPause]);

  // Galaxy S24 등 일부 모바일에서 오디오가 "조용히 paused" 되는 케이스 방지:
  // 재생해야 하는데 paused면 isPlaying 동기화 + 재생 복구 시도 + 실패 시 needsTap 노출
  useEffect(() => {
    if (!isCoarseOrTouchDevice()) return;
    if (!slug) return;
    if (!streamUrl || userStopped) return;
    if (document.visibilityState !== "visible") return;

    const interval = window.setInterval(() => {
      const s = useRadioPlayerStore.getState();
      if (!s.slug || !s.streamUrl || s.userStopped) return;
      if (document.visibilityState !== "visible") return;
      if (systemInterruptedRef.current) return;

      const el = getActiveAudio();
      if (!el) return;

      // store는 playing인데 실제 엘리먼트가 paused면 UI/복구가 막히므로 즉시 동기화
      if (s.isPlaying && el.paused) setPlaying(false);

      if (el.paused) {
        restoreAudibleOutput();
        setTimeout(() => {
          const stillPaused = !!getActiveAudio()?.paused;
          const st2 = useRadioPlayerStore.getState();
          if (!st2.userStopped && st2.streamUrl && stillPaused) scheduleNeedsTapAfterRecoveryRef.current();
        }, 220);
      }
    }, 1200);

    return () => window.clearInterval(interval);
  }, [slug, streamUrl, userStopped, getActiveAudio, restoreAudibleOutput, setPlaying]);

  useEffect(() => {
    if (!slug) return;
    const schedule = scheduleRadioRecoveryAfterSystemPause;
    const onMediaStall = () => {
      if (document.visibilityState !== "visible") return;
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
          // 곡 전환 타이밍에 nowPlaying이 잠깐 비는 메시지가 올 수 있음(TWA에서 더 빈번).
          // 여기서 clear()로 slug까지 날리면 "1곡 끝나고 플레이바가 사라짐"이 발생하므로,
          // 방송 종료는 radio_broadcast_ended에서만 clear 처리한다.
          setPlaying(false);
          scheduleNeedsTapAfterRecoveryRef.current();
          scheduleRadioRecoveryAfterSystemPause();
        } else {
          const newStreamUrl = objPath != null ? objPath : musicId != null ? `/api/music/${musicId}/stream` : null;
          if (newStreamUrl) {
            const current = useRadioPlayerStore.getState().streamUrl;
            const activeEl = activeIndexRef.current === 0 ? audioARef.current : audioBRef.current;
            // URL이 같더라도 오디오 src가 비어있으면(트랙 종료 후) 다시 로드
            const needsReload = !activeEl?.src || activeEl.src === window.location.href;
            if (newStreamUrl !== current || needsReload) {
              // 비로그인은 첫 곡 종료 이후에는 다음 곡으로 넘기지 않음
              const guestBlocked = !everAuthenticatedRef.current && isGuestPlaybackBlocked();
              if (guestBlocked && unauthFirstEndedCountRef.current >= 1) return;
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
  }, [slug, channelName, subscribe, clear, setStream, isAuthenticated, authLoading, scheduleRadioRecoveryAfterSystemPause, setPlaying]);

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
    invalidateDeferredNeedsTap();
    setNeedsTap(false);
    setIsMuted(false);
    setUserStopped(false);
    systemInterruptedRef.current = false;
    const el = getActiveAudio();
    if (el) {
      el.muted = false;
      el.volume = 1;
      void el.play().catch(() => {
        setPlaying(false);
        setNeedsTap(true);
      });
    }
  }, [setUserStopped, getActiveAudio, setPlaying, invalidateDeferredNeedsTap]);

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
    const tId = setTimeout(() => {
      if (cancelled) return;
      // 곡 종료 직후 client-advance 경합으로 streamUrl 문자열이 같아도 setStream이 다시 오는 경우가 있음(streamHandoffSeq).
      // 이전 ended 락이 남으면 timeupdate/연속 재생이 영구 정지할 수 있어 핸드오프 시작 시 락을 해제한다.
      trackEndLockRef.current = false;
      const active = getActiveAudio();
      const inactive = getInactiveAudio();
      const matchSrc = (el: HTMLAudioElement | null) => {
        if (!el?.src) return false;
        try { return new URL(el.src, location.origin).pathname === new URL(streamUrl, location.origin).pathname; } catch { return el.src === streamUrl; }
      };
      const userStoppedNow = () => useRadioPlayerStore.getState().userStopped;
      const tryPlay = (el: HTMLAudioElement, playOpts?: { holdMutedOutputMs?: number }) => {
        const releaseTrackEndLock = () => {
          // 모바일에서 play()가 거절되면 onAudioPlay가 안 와서 ended 처리 락이 풀리지 않고 연속 재생이 멈출 수 있음
          trackEndLockRef.current = false;
        };
        const holdMs = playOpts?.holdMutedOutputMs ?? 0;
        const scheduleUnmuteAfterHandoff = () => {
          if (holdMs <= 0) return;
          if (handoffUnmuteTimerRef.current != null) {
            clearTimeout(handoffUnmuteTimerRef.current);
            handoffUnmuteTimerRef.current = null;
          }
          handoffUnmuteTimerRef.current = window.setTimeout(() => {
            handoffUnmuteTimerRef.current = null;
            if (userStoppedNow()) return;
            if (systemInterruptedRef.current) return;
            el.muted = false;
            setIsMuted(false);
          }, holdMs);
        };
        el.volume = 1;
        if (holdMs > 0) {
          el.muted = true;
        } else {
          el.muted = false;
        }
        el.play()
          .then(() => {
            releaseTrackEndLock();
            invalidateDeferredNeedsTap();
            setNeedsTap(false);
            if (holdMs > 0) {
              scheduleUnmuteAfterHandoff();
            } else {
              setIsMuted(false);
            }
            setPlaying(true);
          })
          .catch(() => {
            el.muted = true;
            el.play()
              .then(() => {
                releaseTrackEndLock();
                invalidateDeferredNeedsTap();
                setNeedsTap(false);
                setPlaying(true);
                if (holdMs > 0) {
                  scheduleUnmuteAfterHandoff();
                } else {
                  setIsMuted(true);
                }
              })
              .catch(() => {
                setPlaying(false);
                scheduleNeedsTapAfterRecoveryRef.current();
                releaseTrackEndLock();
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
        // 연속 재생 안정성이 최우선: activeIndex는 즉시 스왑해 requestPlay/복구 루틴이 "다음 곡 버퍼"를 보도록 만든다.
        // 다음 트랙은 짧게 뮤트로 재생한 뒤 출력(tryPlay holdMutedOutputMs) — 이전 tryPlay가 즉시 unmute 하던 문제 보완.
        activeIndexRef.current = 1 - activeIndexRef.current;
        setActiveIndex(activeIndexRef.current);
        // 이전 곡 버퍼: pause만(형제 src 강제 제거는 경합 시 중간 끊김·재버퍼링을 키울 수 있음). 겹침 방지는 pause로 유지.
        [audioARef.current, audioBRef.current].forEach((el) => {
          if (!el || el === inactiveEl) return;
          try {
            el.pause();
          } catch {
            /* ignore */
          }
        });
        try {
          oldActive?.pause();
        } catch {
          /* ignore */
        }
        inactiveEl.volume = 1;
        tryPlay(inactiveEl, { holdMutedOutputMs: NEXT_TRACK_HANDOFF_UNMUTE_MS });
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
          invalidateDeferredNeedsTap();
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
      if (handoffUnmuteTimerRef.current != null) {
        clearTimeout(handoffUnmuteTimerRef.current);
        handoffUnmuteTimerRef.current = null;
      }
    };
  }, [streamUrl, streamHandoffSeq, getActiveAudio, getInactiveAudio, invalidateDeferredNeedsTap]);

  useEffect(() => {
    if (playTrigger <= 0 || userStopped) return;
    const id = window.setTimeout(() => {
      const s = useRadioPlayerStore.getState();
      if (s.userStopped) return;
      const wanted = s.streamUrl;
      const el = getActiveAudio();
      if (!el) return;
      if (wanted && !radioAudioPathMatchesStream(el, wanted)) return;
      void el.play().catch(() => {
        setPlaying(false);
        scheduleNeedsTapAfterRecoveryRef.current();
      });
    }, 0);
    return () => clearTimeout(id);
  }, [playTrigger, userStopped, getActiveAudio, setPlaying]);

  useEffect(() => {
    const el = getActiveAudio();
    if (!el) return;
    if (pauseTrigger > 0) el.pause();
  }, [pauseTrigger, getActiveAudio]);

  const handleStop = useCallback(() => {
    setPlayError(false);
    invalidateDeferredNeedsTap();
    setNeedsTap(false);
    setIsMuted(false);
    [audioARef.current, audioBRef.current].forEach((el) => {
      if (el) { el.pause(); el.removeAttribute("src"); el.load(); }
    });
    activeIndexRef.current = 0;
    setActiveIndex(0);
    setListenerCount(null);
    clear();
  }, [clear, invalidateDeferredNeedsTap]);

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
      if (el) {
        void el.play().catch(() => {
          setPlaying(false);
          scheduleNeedsTapAfterRecoveryRef.current();
        });
      }
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
  }, [streamUrl, channelName, getActiveAudio, handleStop, setUserStopped, t, setPlaying]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  const onAudioPlay = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (e.target === getActiveAudio()) {
      const el = e.target as HTMLAudioElement;
      if (el.volume < 0.05) el.volume = 1;
      trackEndLockRef.current = false;
      systemInterruptedRef.current = false;
      invalidateDeferredNeedsTap();
      setNeedsTap(false);
      setPlaying(true);
    }
  }, [getActiveAudio, setPlaying, invalidateDeferredNeedsTap]);

  const onAudioPause = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (e.target !== getActiveAudio()) return;
    setPlaying(false);
    const s = useRadioPlayerStore.getState();
    // 사용자가 직접 멈춘 게 아닌데 시스템/브라우저가 pause를 걸면(통화/오디오포커스 등)
    // 자동 play 재시도로 맞서지 말고, 사용자 탭으로만 재개하게 한다.
    if (!s.userStopped && s.streamUrl && s.slug) {
      systemInterruptedRef.current = true;
      setNeedsTap(true);
    }
  }, [getActiveAudio, setPlaying]);

  const processActiveTrackEnded = useCallback(
    (el: HTMLAudioElement) => {
      if (trackEndLockRef.current) return;
      if (el !== getActiveAudio()) return;
      trackEndLockRef.current = true;

      const endedSrc = el.src;
      setPlaying(false);
      const shouldLimit = !everAuthenticatedRef.current && isGuestPlaybackBlocked();
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
      const midFromSrc =
        musicIdFromSiteMusicStreamUrl(endedSrc) ?? musicIdFromSiteMusicStreamUrl(state.streamUrl ?? null);
      const advanceBody =
        midFromSrc != null && Number.isFinite(midFromSrc)
          ? JSON.stringify({ currentMusicId: midFromSrc })
          : JSON.stringify({});

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
        // TWA/모바일에서 keepalive fetch가 간헐적으로 실패하면 여기서 streamUrl을 null로 만들어
        // "1곡 끝나고 멈춤"이 발생한다. 실패 시에는 스트림을 끊지 말고(=streamUrl 유지),
        // 폴링/WS 동기화 및 복구 루틴이 다음 곡으로 이어가게 한다.
        scheduleNeedsTapAfterRecoveryRef.current();
        releaseEndLockAndClearAudio();
        scheduleRadioRecoveryAfterSystemPause();
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
            // 재생은 streamUrl effect의 tryPlay/handoff에 맡김(setStream 직후 requestPlay는 스왑 전 구 버퍼에 play()가 걸림)
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
      scheduleRadioRecoveryAfterSystemPause,
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
