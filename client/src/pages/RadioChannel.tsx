import { useRef, useState, useEffect, useMemo } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link, Redirect } from "wouter";
import { Radio as RadioIcon, ArrowLeft, Headphones, Mic2, Users, Gift, MessageCircle, Music2, UserPlus, UserMinus, Settings, ImagePlus, Loader2, Play, Pause } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { resolveStorageUrl } from "@/lib/utils";
import { useRadioRoom } from "@/hooks/use-radio-room";
import { useWs } from "@/contexts/WsContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { redirectToLogin } from "@/lib/queryClient";
import { useRadioPlayerStore } from "@/stores/radio-player";
import { useRadioWaveformRef } from "@/contexts/RadioWaveformContext";

type SyncedLyricLine = { time: number; text: string };

function parseLrcToSyncedLines(lyrics?: string | null): SyncedLyricLine[] {
  if (!lyrics) return [];
  const raw = String(lyrics);
  const rows = raw.split(/\r?\n/);
  const result: SyncedLyricLine[] = [];
  const timeRe = /\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
  for (const row of rows) {
    const line = row.trim();
    if (!line) continue;
    let match: RegExpExecArray | null;
    let lastIdx = 0;
    const times: number[] = [];
    timeRe.lastIndex = 0;
    while ((match = timeRe.exec(line))) {
      const mm = parseInt(match[1], 10) || 0;
      const ss = parseInt(match[2], 10) || 0;
      const frac =
        match[3] != null
          ? parseInt((match[3] + "00").slice(0, 3), 10) / 1000
          : 0;
      times.push(mm * 60 + ss + frac);
      lastIdx = timeRe.lastIndex;
    }
    const content = line.slice(lastIdx).trim();
    if (!content || !times.length) continue;
    for (const t of times) {
      result.push({ time: t, text: content });
    }
  }
  result.sort((a, b) => a.time - b.time);
  return result;
}

/** /radio/channels·/radio/create 와 충돌 시 :slug 가 잡히는 경우 방지 */
function reservedRadioPathRedirect(slug: string) {
  const s = slug.trim().toLowerCase();
  if (s === "channels") return "/radio/channels" as const;
  if (s === "create") return "/radio/create" as const;
  return null;
}

export default function RadioChannel() {
  const [, params] = useRoute("/radio/:slug");
  const slug = params?.slug ?? "";
  const reservedTo = slug ? reservedRadioPathRedirect(slug) : null;

  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const presentUserIdsRef = useRef<Set<string>>(new Set());
  const [currentLyric, setCurrentLyric] = useState<string | null>(null);
  

  const { data: channel, isLoading, error, refetch: refetchChannel } = useQuery<{
    id: number;
    ownerId: string;
    name: string;
    slug: string;
    description: string | null;
    coverFilename: string | null;
    status: string;
    nowPlayingMusicId: number | null;
    nowPlayingStartedAt: string | null;
    nowPlayingObjectPath?: string | null;
    nowPlayingLocalTitle?: string | null;
    nowPlayingElapsedSeconds?: number | null;
    canManage?: boolean;
    ownerDisplayName?: string;
    currentHostId?: string | null;
    currentHostUsername?: string | null;
    scheduledStartAt?: string | null;
    scheduledEndAt?: string | null;
    notice?: string | null;
  }>({
    queryKey: ["/api/radio/channels", slug],
    queryFn: async () => {
      const res = await fetch(`/api/radio/channels/${slug.trim().toLowerCase()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!slug && !reservedTo,
    refetchInterval: (data) => (data?.status === "live" ? 3000 : false),
    refetchIntervalInBackground: false,
  });

  const isOwner = user?.id === channel?.ownerId;
  const canManage = !!channel?.canManage;
  const isLive = channel?.status === "live";
  const nowPlayingId = channel?.nowPlayingMusicId ?? null;
  const nowPlayingObjectPath = channel?.nowPlayingObjectPath ?? null;
  const displayName = user?.username ?? user?.firstName ?? null;
  const { listenerCount } = useRadioRoom(reservedTo ? undefined : slug, displayName);

  // 현재 재생 중인 음원 정보 (로컬 송출 시에는 없음)
  const { data: nowPlayingMusic } = useQuery<{
    id: number;
    title?: string;
    artist?: string;
    filename?: string | null;
    lyrics?: string | null;
  }>({
    queryKey: ["/api/music", nowPlayingId],
    queryFn: async () => {
      const res = await fetch(`/api/music/${nowPlayingId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!nowPlayingId && !!isLive,
  });

  const syncedLyrics = useMemo(
    () => parseLrcToSyncedLines(nowPlayingMusic?.lyrics ?? null),
    [nowPlayingMusic?.lyrics],
  );

  const firstLyricLine = useMemo(() => {
    if (!nowPlayingMusic?.lyrics) return "";
    return (
      nowPlayingMusic.lyrics
        .split(/\r?\n/)
        .map((line) => line.replace(/\[[^\]]+\]/g, "").trim())
        .find((line) => line.length > 0) || ""
    );
  }, [nowPlayingMusic?.lyrics]);

  const lastSyncedIndexRef = useRef<number>(-1);

  const { setStream: setRadioStream, setTrackTitle: setRadioTrackTitle, requestPlay: radioRequestPlay, requestPause: radioRequestPause, clear: clearRadioPlayer, isPlaying: radioIsPlaying } = useRadioPlayerStore();


  function formatScheduleTime(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const h = d.getHours();
    const m = d.getMinutes();
    if (m === 0) return `${h}${t("radio.hour", "시")}`;
    return `${h}${t("radio.hour", "시")} ${m}${t("radio.minute", "분")}`;
  }

  const listenerAudioSrc = useMemo(() => {
    if (!isLive) return null;
    if (nowPlayingId != null) return `/api/music/${nowPlayingId}/stream`;
    if (nowPlayingObjectPath != null) return nowPlayingObjectPath;
    return null;
  }, [isLive, nowPlayingId, nowPlayingObjectPath]);

  // 채널 페이지가 활성일 때: 전역 플레이어에 스트림을 동기화 후 즉시 재생 시도
  // 채널 페이지에서 나갈 때(unmount): 전역 플레이어가 이어받아 재생 지속
  useEffect(() => {
    if (!channel || !listenerAudioSrc) return;
    setRadioStream(slug, channel.name, listenerAudioSrc, channel?.nowPlayingElapsedSeconds ?? undefined);
    // 스트림이 설정되자마자 재생 요청 (사용자 제스처 컨텍스트가 유효할 때 빠르게 시도)
    if (!isOwner) {
      radioRequestPlay();
    }
  }, [slug, channel?.name, listenerAudioSrc]);

  // 곡 제목을 전역 store에 동기화 (글로벌 플레이바에 표시)
  useEffect(() => {
    const title = nowPlayingMusic?.title
      ?? channel?.nowPlayingLocalTitle
      ?? null;
    const artist = nowPlayingMusic?.artist ?? null;
    const full = title ? (artist ? `${title} – ${artist}` : title) : null;
    setRadioTrackTitle(full);
  }, [nowPlayingMusic?.title, nowPlayingMusic?.artist, channel?.nowPlayingLocalTitle, setRadioTrackTitle]);

  // unmount 시 전역 플레이어로 재생을 넘긴다
  useEffect(() => {
    return () => {
      const state = useRadioPlayerStore.getState();
      if (state.slug && state.streamUrl) {
        state.requestPlay();
      }
    };
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveformWrapRef = useRef<HTMLDivElement | null>(null);
  const radioWaveformRef = useRadioWaveformRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = waveformWrapRef.current;
    if (!canvas || !wrap || !isLive || !listenerAudioSrc) return;
    let rafId = 0;
    function draw() {
      rafId = requestAnimationFrame(draw);
      const cw = wrap!.clientWidth;
      const ch = wrap!.clientHeight;
      if (cw > 0 && ch > 0 && (canvas!.width !== cw || canvas!.height !== ch)) {
        canvas!.width = cw;
        canvas!.height = ch;
      }
      const w = canvas!.width;
      const h = canvas!.height;
      if (w <= 0 || h <= 0) return;
      const data = radioWaveformRef?.current;
      const g = canvas!.getContext("2d");
      if (!g) return;
      g.fillStyle = "rgba(15,15,18,0.4)";
      g.fillRect(0, 0, w, h);
      if (!data) return;
      g.strokeStyle = "#7c3aed";
      g.lineWidth = 2;
      g.beginPath();
      const step = w / data.length;
      for (let i = 0; i < data.length; i++) {
        const x = i * step;
        const y = (data[i] / 128) * (h / 2) + h / 2;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    draw();
    return () => cancelAnimationFrame(rafId);
  }, [isLive, listenerAudioSrc, radioWaveformRef]);


  const { toast } = useToast();
  const { send: wsSend, subscribe, ready: wsReady, authenticated: wsAuthenticated } = useWs();

  useEffect(() => {
    if (isOwner || !slug || !listenerAudioSrc) return;
    const onFirstInteraction = () => { radioRequestPlay(); };
    const opts: AddEventListenerOptions = { capture: true, once: true };
    document.addEventListener("click", onFirstInteraction, opts);
    document.addEventListener("keydown", onFirstInteraction, opts);
    return () => {
      document.removeEventListener("click", onFirstInteraction, opts);
      document.removeEventListener("keydown", onFirstInteraction, opts);
    };
  }, [isOwner, slug, listenerAudioSrc, radioRequestPlay]);

  type ChatMsg = { id: number | string; userId: string; username?: string | null; content?: string; createdAt: string; type?: "system_join" | "system_leave" };
  const { data: chatList } = useQuery<ChatMsg[]>({
    queryKey: ["/api/radio/channels", slug, "chat"],
    queryFn: async () => {
      const res = await fetch(`/api/radio/channels/${slug}/chat`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!slug && !!user && !reservedTo,
  });
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const canSeeChatRef = useRef(false);
  const [broadcastEndedMessage, setBroadcastEndedMessage] = useState<string | null>(null);
  useEffect(() => {
    setBroadcastEndedMessage(null);
  }, [slug]);

  useEffect(() => {
    canSeeChatRef.current = !!user && !!wsAuthenticated;
    if (!canSeeChatRef.current) {
      setMessages([]);
      presentUserIdsRef.current.clear();
    }
  }, [user, wsAuthenticated]);

  useEffect(() => {
    if (!syncedLyrics.length || !isLive || nowPlayingId == null) {
      setCurrentLyric(null);
      lastSyncedIndexRef.current = -1;
      return;
    }
    const interval = setInterval(() => {
      const t = useRadioPlayerStore.getState().currentTimeRef.current;
      let idx = lastSyncedIndexRef.current;
      if (idx < 0 || idx >= syncedLyrics.length || syncedLyrics[idx].time > t) {
        idx = 0;
      }
      while (idx + 1 < syncedLyrics.length && syncedLyrics[idx + 1].time <= t) {
        idx++;
      }
      if (idx !== lastSyncedIndexRef.current) {
        lastSyncedIndexRef.current = idx;
        setCurrentLyric(syncedLyrics[idx].text);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [syncedLyrics, isLive, nowPlayingId]);
  useEffect(() => {
    if (channel?.status === "live") setBroadcastEndedMessage(null);
  }, [channel?.status]);
  const subscribeRef = useRef(subscribe);
  subscribeRef.current = subscribe;
  useEffect(() => {
    if (!Array.isArray(chatList)) return;
    if (!canSeeChatRef.current) return;
    const normalized = chatList.map((m) => ({
      ...m,
      createdAt: typeof m.createdAt === "string" ? m.createdAt : (m.createdAt as Date).toISOString(),
    }));
    setMessages(normalized);
  }, [chatList]);
  useEffect(() => {
    if (!slug) return;
    const normalizedSlug = slug.trim().toLowerCase();
    const unsub = subscribeRef.current((msg) => {
      if (msg.type === "radio_user_joined" && msg.userId) {
        if (!canSeeChatRef.current) return;
        const userId = String(msg.userId);
        const username = msg.username != null ? String(msg.username) : undefined;
        // 이미 방에 있다고 판단되면 중복 입장 메시지 스킵
        if (presentUserIdsRef.current.has(userId)) return;
        presentUserIdsRef.current.add(userId);
        setMessages((prev) => [
          ...prev,
          {
            id: "join-" + userId + "-" + Date.now(),
            userId,
            username: username ?? null,
            type: "system_join",
            createdAt: new Date().toISOString(),
          } as ChatMsg,
        ]);
        return;
      }
      if (msg.type === "radio_user_left" && msg.userId) {
        if (!canSeeChatRef.current) return;
        const userId = String(msg.userId);
        const username = msg.username != null ? String(msg.username) : undefined;
        // 방에 없는 유저 퇴장 이벤트는 무시
        if (!presentUserIdsRef.current.has(userId)) return;
        presentUserIdsRef.current.delete(userId);
        setMessages((prev) => [
          ...prev,
          {
            id: "left-" + userId + "-" + Date.now(),
            userId,
            username: username ?? null,
            type: "system_leave",
            createdAt: new Date().toISOString(),
          } as ChatMsg,
        ]);
        return;
      }
      if (msg.type === "radio_now_playing" && (msg.slug == null || String(msg.slug).toLowerCase() === normalizedSlug)) {
        const musicId = msg.musicId != null ? Number(msg.musicId) : null;
        const elapsedSeconds = typeof msg.elapsedSeconds === "number" && msg.elapsedSeconds >= 0 ? msg.elapsedSeconds : 0;
        const startedAt = (msg as { startedAt?: string }).startedAt ?? null;
        const wsObjectPath = (msg as any).nowPlayingObjectPath ?? null;
        const wsLocalTitle = (msg as any).nowPlayingLocalTitle ?? null;
        queryClient.setQueryData(
          ["/api/radio/channels", slug],
          (old: Record<string, unknown> | undefined) => {
            if (!old) return old;
            return {
              ...old,
              nowPlayingMusicId: musicId,
              nowPlayingStartedAt: startedAt,
              nowPlayingElapsedSeconds: elapsedSeconds,
              nowPlayingObjectPath: wsObjectPath,
              nowPlayingLocalTitle: wsLocalTitle,
            };
          }
        );
        queryClient.invalidateQueries({ queryKey: ["/api/music"] });
        // 즉시 refetch 시 서버 반영 전 응답으로 캐시가 덮어써져 같은 곡이 1초쯤 재생 후 처음부터 다시 로드되는 현상 방지
        setTimeout(() => refetchChannel(), 1500);
        if (musicId === null && !(msg as any).nowPlayingObjectPath) {
          clearRadioPlayer();
        }
      }
      if (msg.type === "radio_broadcast_ended" && msg.hostDisplayName && (msg.slug == null || String(msg.slug).toLowerCase() === normalizedSlug)) {
        setBroadcastEndedMessage(String(msg.hostDisplayName));
        setMessages([]);
        presentUserIdsRef.current.clear();
        queryClient.invalidateQueries({ queryKey: ["/api/radio/channels", slug, "chat"] });
        refetchChannel();
        clearRadioPlayer();
        return;
      }
      if (msg.type !== "radio_chat" || !msg.message) return;
      if (!canSeeChatRef.current) return;
      const incoming = msg.message as ChatMsg;
      setMessages((prev) => {
        const withoutOptimistic = prev.filter(
          (m) => !(typeof m.id === "number" && m.id < 0 && m.userId === incoming.userId && m.content === incoming.content)
        );
        if (withoutOptimistic.some((m) => m.id === incoming.id)) return prev;
        return [...withoutOptimistic, incoming];
      });
    });
    return unsub;
  }, [slug, clearRadioPlayer, queryClient]);

  const [tipOpen, setTipOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState(500);
  const [tipMessage, setTipMessage] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCover, setEditCover] = useState("");
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null);
  const [editUploading, setEditUploading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const editFileRef = useRef<HTMLInputElement>(null);

  const openEditDialog = () => {
    if (!channel) return;
    setEditName(channel.name);
    setEditDesc(channel.description ?? "");
    setEditCover(channel.coverFilename ?? "");
    setEditCoverPreview(channel.coverFilename ? resolveStorageUrl(channel.coverFilename) : null);
    setEditOpen(true);
  };

  const handleEditCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditCoverPreview(URL.createObjectURL(file));
    setEditUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("desiredFilename", file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/uploads/local", { method: "POST", credentials: "include", body: fd });
      if (!res.ok) throw new Error(t("radio.uploadFailedGeneric", "업로드 실패"));
      const data = await res.json();
      const objectPath = data.objectPath || data.objectUrl || data.url || "";
      setEditCover(objectPath);
    } catch {
      toast({ title: t("radio.imageUploadFailed", "이미지 업로드에 실패했습니다."), variant: "destructive" });
      setEditCoverPreview(channel?.coverFilename ? resolveStorageUrl(channel.coverFilename) : null);
      setEditCover(channel?.coverFilename ?? "");
    } finally {
      setEditUploading(false);
    }
  };

  const handleEditSave = async () => {
    if (!channel || !editName.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/radio/channels/${channel.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || null,
          coverFilename: editCover.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || t("radio.channelPatchFailed", "수정 실패"));
      }
      toast({ title: t("radio.channelInfoUpdated", "채널 정보가 수정되었습니다.") });
      queryClient.invalidateQueries({ queryKey: ["/api/radio/channels", slug] });
      setEditOpen(false);
    } catch (err: any) {
      toast({ title: err.message ?? t("radio.channelInfoUpdateFailed", "수정 실패"), variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };
  const tipMutation = useMutation({
    mutationFn: async (data: { toUserId: string; amount: number; message?: string }) => {
      const res = await fetch("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        let message: string | undefined;
        try {
          const err = await res.json();
          message = err?.message as string | undefined;
        } catch {
          // ignore
        }
        if (res.status === 401) {
          redirectToLogin();
          throw new Error(t("music.loginRequired", "로그인이 필요한 서비스입니다"));
        }
        throw new Error(message || t("music.tipFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("music.tipSuccess"), description: t("music.tipSuccessDesc", { amount: tipAmount.toLocaleString() }) });
      setTipOpen(false);
      setTipAmount(500);
      setTipMessage("");
      // 후원 성공 시 크레딧/수익 관련 캐시 갱신
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/earnings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tips/sent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tips/received"] });
    },
    onError: (e: Error) => toast({ title: t("music.tipFailed"), description: e.message, variant: "destructive" }),
  });

  const [chatInput, setChatInput] = useState("");
  const chatContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chatContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const filteredMessages = useMemo(() => {
    const seenJoin = new Set<string>();
    const seenLeave = new Set<string>();
    return messages.filter((m) => {
      const msgType = (m as { type?: string }).type;
      if (msgType === "system_join") {
        if (seenJoin.has(m.userId)) return false;
        seenJoin.add(m.userId);
      } else if (msgType === "system_leave") {
        if (seenLeave.has(m.userId)) return false;
        seenLeave.add(m.userId);
      }
      return true;
    });
  }, [messages]);

  const [requestSearch, setRequestSearch] = useState("");
  const [requestResults, setRequestResults] = useState<{ id: number; title: string; artist: string }[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<{ id: number; title: string; artist: string } | null>(null);
  const requestSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (requestSearchTimeout.current) clearTimeout(requestSearchTimeout.current);
    if (!slug) return;
    requestSearchTimeout.current = setTimeout(() => {
      const q = requestSearch.trim();
      const url = q ? `/api/music?search=${encodeURIComponent(q)}&limit=20` : "/api/music?limit=20";
      fetch(url, { credentials: "include" })
        .then((r) => r.ok ? r.json() : { data: [] })
        .then((data: { data?: { id: number; title: string; artist: string }[] }) => {
          const list = Array.isArray(data?.data) ? data.data : [];
          setRequestResults(list);
        })
        .catch(() => setRequestResults([]));
    }, 300);
    return () => {
      if (requestSearchTimeout.current) clearTimeout(requestSearchTimeout.current);
    };
  }, [requestSearch, slug]);

  const requestMutation = useMutation({
    mutationFn: async (song: { id: number; title: string; artist: string }) => {
      const normalizedSlug = slug.trim().toLowerCase();
      const res = await fetch(`/api/radio/channels/${encodeURIComponent(normalizedSlug)}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ musicId: song.id, title: song.title, artist: song.artist }),
        credentials: "include",
      });
      if (!res.ok) {
        let message = t("radio.requestFailed", "신청 실패");
        try {
          const err = await res.json();
          if (err && typeof err.message === "string") message = err.message;
        } catch {
          if (res.status === 401) message = t("radio.requestLoginRequired", "로그인이 필요합니다.");
          else if (res.status === 404) message = t("radio.requestChannelNotFound", "채널을 찾을 수 없습니다.");
        }
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("radio.requestSubmitted", "신청곡이 접수되었습니다.") });
      setSelectedRequest(null);
    },
    onError: (e: Error) => toast({ title: t("radio.requestFailed", "신청 실패"), description: e.message, variant: "destructive" }),
  });

  const normalizedSlug = slug.trim().toLowerCase();
  const { data: staffList = [], refetch: refetchStaff } = useQuery<{ id: number; userId: string; role: string; username?: string | null }[]>({
    queryKey: ["/api/radio/channels", normalizedSlug, "staff"],
    queryFn: async () => {
      const res = await fetch(`/api/radio/channels/${encodeURIComponent(normalizedSlug)}/staff`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!normalizedSlug && !reservedTo,
  });
  const [staffUsername, setStaffUsername] = useState("");
  function getRoleForUser(userId: string): "owner" | "dj" | "sub_host" | "staff" | null {
    if (!channel) return null;
    if (channel.ownerId === userId) return "owner";
    if (isLive && channel.currentHostId === userId) return "dj";
    const s = staffList.find((x) => x.userId === userId);
    if (s) return s.role === "sub_host" ? "sub_host" : "staff";
    return null;
  }
  function RoleBadge({ role }: { role: "owner" | "dj" | "sub_host" | "staff" }) {
    const labels = {
      owner: t("radio.roleOwner", "국장"),
      dj: t("radio.roleDj", "DJ"),
      sub_host: t("radio.roleSubHost", "부국장"),
      staff: t("radio.roleStaff", "스텝"),
    };
    const styles = {
      owner: "bg-primary/20 text-primary border border-primary/30",
      dj: "bg-violet-500/20 text-violet-300 border border-violet-500/30",
      sub_host: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
      staff: "bg-muted text-muted-foreground border border-white/10",
    };
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${styles[role]}`}>
        {labels[role]}
      </span>
    );
  }
  const [staffRole, setStaffRole] = useState<"staff" | "sub_host">("staff");
  const addStaffMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/radio/channels/${encodeURIComponent(normalizedSlug)}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: staffUsername.trim(), role: staffRole }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || t("radio.addFailed", "추가 실패"));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("radio.staffAddedToast", "스텝이 추가되었습니다.") });
      setStaffUsername("");
      refetchStaff();
    },
    onError: (e: Error) => toast({ title: t("radio.staffAddFailed", "스텝 추가 실패"), description: e.message, variant: "destructive" }),
  });
  const removeStaffMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/radio/channels/${encodeURIComponent(normalizedSlug)}/staff/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || t("radio.removeFailed", "제거 실패"));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("radio.staffRemovedToast", "스텝이 제거되었습니다.") });
      refetchStaff();
    },
    onError: (e: Error) => toast({ title: t("radio.staffRemoveFailed", "스텝 제거 실패"), description: e.message, variant: "destructive" }),
  });

  if (!slug) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-background flex flex-col">
          <Navigation />
          <div className="container px-4 py-10 text-center">
            <p className="text-muted-foreground">{t("radio.channelNotFound")}</p>
            <Link href="/radio">
              <Button variant="outline" className="mt-4">
                {t("radio.goToRadio", "방송국 가기")}
              </Button>
            </Link>
          </div>
        </div>
      </PageTransition>
    );
  }

  if (reservedTo) {
    return <Redirect to={reservedTo} />;
  }

  if (isLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-background flex flex-col">
          <Navigation />
          <div className="container px-4 py-20 text-center text-muted-foreground">
            {t("radio.loading")}
          </div>
        </div>
      </PageTransition>
    );
  }

  if (error || !channel) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-background flex flex-col">
          <Navigation />
          <div className="container px-4 py-10 text-center">
            <p className="text-muted-foreground">{t("radio.channelNotFound")}</p>
            <Link href="/radio">
              <Button variant="outline" className="mt-4">
                {t("radio.goToRadio", "방송국 가기")}
              </Button>
            </Link>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div
        className="min-h-screen flex flex-col pb-24 lg:h-screen lg:overflow-hidden"
        style={{
          background: "radial-gradient(circle at top, #1d2333 0, #020617 55%)",
        }}
      >
        <Navigation />
        <div className="container px-4 py-6 max-w-6xl mx-auto">
          <Link href="/radio" className="block mb-3">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
              <ArrowLeft size={16} />
              {t("radio.backToRadio", "방송국으로")}
            </Button>
          </Link>

          {/* Hero (studio-style) */}
          <div
            className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-muted/10 shadow-[0_28px_70px_rgba(0,0,0,0.45)]"
            style={{
              backgroundImage: "url('/studio-hero.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="relative h-[150px] sm:h-[190px]">
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
                {isLive ? (
                  /* ON AIR 깜박임 */
                  <div className="flex items-center gap-3">
                    <span
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-red-500 shadow-[0_0_10px_3px_rgba(239,68,68,0.7)]"
                      style={{ animation: "onair-blink 1s ease-in-out infinite" }}
                    />
                    <span
                      className="text-3xl sm:text-5xl font-black tracking-widest text-white drop-shadow-[0_0_24px_rgba(239,68,68,0.9)]"
                      style={{ animation: "onair-blink 1s ease-in-out infinite", textShadow: "0 0 24px rgba(239,68,68,0.9), 0 4px 16px rgba(0,0,0,0.8)" }}
                    >
                      ON AIR
                    </span>
                    {typeof listenerCount === "number" && listenerCount > 0 && (
                      <span className="text-sm font-semibold text-red-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                        {t("radio.listenersBadge", "청취자 {{count}}명", { count: listenerCount })}
                      </span>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-violet-200 drop-shadow-[0_10px_28px_rgba(0,0,0,0.75)]">
                      {t("radio.heroTitle", "Veny Radio Studio")}
                    </div>
                    <div className="text-xs sm:text-sm text-white/80 drop-shadow-[0_10px_28px_rgba(0,0,0,0.75)]">
                      {channel.name}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <style>{`@keyframes onair-blink { 0%,100%{opacity:1} 50%{opacity:0.25} }`}</style>

          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr_280px] gap-4 lg:gap-6">
            {/* 1번: 채팅 (왼쪽) - 입력창 하단 고정, 메시지만 스크롤 */}
            <aside className="order-2 lg:order-1 flex flex-col min-h-0 max-h-[85vh] lg:max-h-[75vh]">
              <Card className="overflow-hidden flex flex-col flex-1 min-h-0 border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.96)] shadow-[0_22px_60px_rgba(15,23,42,0.65)]">
                <CardContent className="p-0 flex flex-col flex-1 min-h-0 min-w-0">
                  <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2 shrink-0">
                    <MessageCircle size={18} className="text-muted-foreground" />
                    <span className="font-medium text-sm">{t("radio.chatTitle", "채팅")} {t("radio.chatGroupSuffix", "(단체)")}</span>
                    {typeof listenerCount === "number" && (
                      <span className="text-muted-foreground text-xs">
                        · {t("radio.chatParticipating", "{{count}}명 참여 중", { count: listenerCount })}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs px-4 pt-1 shrink-0">{t("radio.chatGroupHint", "같은 채널 청취자가 모두 보는 단체 채팅입니다.")}</p>
                  <div ref={chatContainerRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                    {!user || !wsAuthenticated ? (
                      <p className="text-muted-foreground text-sm text-center py-6">{t("radio.chatLoginRequired", "로그인하면 채팅을 볼 수 있습니다.")}</p>
                    ) : filteredMessages.length === 0 ? (
                      <p className="text-muted-foreground text-sm text-center py-6">{t("radio.noChatYet", "아직 메시지가 없습니다.")}</p>
                    ) : (
                      filteredMessages.map((m) => {
                        const msgType = (m as { type?: string }).type;
                        const isJoin = msgType === "system_join";
                        const isLeave = msgType === "system_leave";
                        const displayName = m.username?.trim() || (m.userId ? String(m.userId).slice(0, 8) : "?");
                        const role = getRoleForUser(m.userId);
                        if (isJoin) {
                          return (
                            <p key={"join-" + m.userId + "-" + (m as { createdAt: string }).createdAt} className="text-xs text-muted-foreground text-center py-1 flex items-center justify-center gap-1.5 flex-wrap">
                              <span>{displayName}</span>
                              {role && <RoleBadge role={role} />}
                              <span>{t("radio.joinedChat", "님이 입장했습니다.")}</span>
                            </p>
                          );
                        }
                        if (isLeave) {
                          return (
                            <p key={"left-" + m.userId + "-" + (m as { createdAt: string }).createdAt} className="text-xs text-muted-foreground text-center py-1 flex items-center justify-center gap-1.5 flex-wrap">
                              <span>{displayName}</span>
                              {role && <RoleBadge role={role} />}
                              <span>{t("radio.leftChat", "님이 퇴장했습니다.")}</span>
                            </p>
                          );
                        }
                        return (
                          <div key={m.id} className="text-sm flex items-start gap-2 flex-wrap">
                            <span className="font-medium text-muted-foreground flex items-center gap-1.5 shrink-0">
                              {displayName}
                              {role && <RoleBadge role={role} />}
                            </span>
                            <span className="text-foreground">{m.content}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="p-3 border-t border-white/10 flex flex-col gap-2 shrink-0 bg-card">
                    {(!user || !wsReady || !wsAuthenticated) && (
                      <p className="text-xs text-muted-foreground">
                        {!user
                          ? t("radio.chatLoginRequired", "로그인하면 채팅할 수 있습니다.")
                          : !wsReady
                            ? t("radio.chatConnecting", "연결 중...")
                            : t("radio.chatAuthWaiting", "채팅 연결 확인 중...")}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Input
                        placeholder={t("radio.chatPlaceholder", "메시지를 입력하세요...")}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            const c = chatInput.trim();
                            if (c && user && wsReady && wsAuthenticated) {
                              setMessages((prev) => [
                                ...prev,
                                {
                                  id: -Date.now(),
                                  userId: user.id,
                                  username: user.username ?? user.firstName ?? null,
                                  content: c,
                                  createdAt: new Date().toISOString(),
                                },
                              ]);
                              setChatInput("");
                              wsSend({ type: "radio_chat", slug: slug.trim().toLowerCase(), content: c });
                            }
                          }
                        }}
                        disabled={!user || !wsReady || !wsAuthenticated}
                        aria-label={!user ? t("radio.chatLoginRequired", "로그인하면 채팅할 수 있습니다.") : !wsReady ? t("radio.chatConnecting", "연결 중...") : !wsAuthenticated ? t("radio.chatAuthWaiting", "채팅 연결 확인 중...") : undefined}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const c = chatInput.trim();
                          if (c && user && wsReady && wsAuthenticated) {
                            setMessages((prev) => [
                              ...prev,
                              {
                                id: -Date.now(),
                                userId: user.id,
                                username: user.username ?? user.firstName ?? null,
                                content: c,
                                createdAt: new Date().toISOString(),
                              },
                            ]);
                            setChatInput("");
                            wsSend({ type: "radio_chat", slug: slug.trim().toLowerCase(), content: c });
                          }
                        }}
                        disabled={!user || !wsReady || !wsAuthenticated || !chatInput.trim()}
                      >
                        {t("radio.chatSend", "전송")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </aside>

            {/* 가운데: 메인 (방송 정보 + 재생) */}
            <main className="order-1 lg:order-2 min-w-0">
          <Card className="overflow-hidden border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.96)] shadow-[0_22px_60px_rgba(15,23,42,0.65)]">
            <CardContent className="p-0">
              {/* 1번: 현재 송출 중인 음원 정보 */}
              {(isLive && ((nowPlayingId != null && nowPlayingMusic) || nowPlayingObjectPath)) && (
                <div className="px-4 py-3 bg-muted/20 border-b border-white/10 flex items-center gap-3">
                  <Music2 size={20} className="text-primary shrink-0" />
                  <div className="min-w-0 flex-1 min-h-[2.5rem] flex flex-col justify-center">
                    <p className="text-sm font-medium text-foreground truncate">
                      {nowPlayingMusic?.title
                        ?? channel?.nowPlayingLocalTitle
                        ?? (nowPlayingObjectPath ? t("radio.localTrack", "로컬 곡") : t("radio.nowPlaying", "지금 재생 중"))}
                      {nowPlayingMusic?.artist != null && nowPlayingMusic.artist !== "" && ` – ${nowPlayingMusic.artist}`}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5 min-h-[1.25rem]">
                      {currentLyric || firstLyricLine || "\u00A0"}
                    </p>
                  </div>
                </div>
              )}
              <div ref={waveformWrapRef} className="h-12 sm:h-14 md:h-16 bg-muted/30 flex items-center justify-center relative overflow-hidden">
                {isLive && (nowPlayingId != null || nowPlayingObjectPath) && listenerAudioSrc && !isOwner ? (
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                    width={1}
                    height={1}
                    style={{ width: "100%", height: "100%", display: "block" }}
                  />
                ) : isLive && (nowPlayingId != null || nowPlayingObjectPath) && listenerAudioSrc && isOwner ? (
                  <p className="text-xs text-muted-foreground text-center px-3">
                    {t("radio.waveformListenerHint", "파형은 청취자로 접속하면 표시됩니다.")}
                  </p>
                ) : channel.coverFilename ? (
                  <img src={resolveStorageUrl(channel.coverFilename)} alt={channel.name} className="w-full h-full object-cover" />
                ) : (
                  <RadioIcon size={64} className="text-muted-foreground" />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h1 className="text-2xl font-bold">{channel.name}</h1>
                  {isOwner && (
                    <button
                      onClick={openEditDialog}
                      className="p-1 rounded-md hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
                      title={t("radio.editChannelTitleAttr", "채널 수정")}
                    >
                      <Settings size={16} />
                    </button>
                  )}
                  {channel.status === "live" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      LIVE
                    </span>
                  )}
                  {channel.status === "live" && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
                      <Users size={14} />
                      {t("radio.listenersCount", "{{count}}명 청취 중", { count: listenerCount })}
                    </span>
                  )}
                </div>
                {channel.description && (
                  <p className="text-muted-foreground text-sm mb-4">{channel.description}</p>
                )}
                {broadcastEndedMessage && channel.status === "ended" && (
                  <p className="text-sm text-amber-600 dark:text-amber-400 mb-4 rounded-md bg-amber-500/10 px-3 py-2 border border-amber-500/20">
                    <strong>{broadcastEndedMessage}</strong>{t("radio.broadcastEndedBy", "님이 방송을 종료했습니다.")}
                  </p>
                )}
                {channel.notice && !broadcastEndedMessage && (
                  <p className="text-sm text-green-600 dark:text-green-400 mb-4 rounded-md bg-muted/30 px-3 py-2">
                    <span className="flex items-center gap-2">
                      <strong>{channel.currentHostUsername ?? channel.ownerDisplayName ?? "DJ"}</strong>
                      <RoleBadge role={channel.currentHostId ? "dj" : "owner"} />
                    </span>
                    <span className="block mt-1 text-foreground">
                      {channel.notice}
                    </span>
                  </p>
                )}
                
                {!isOwner && (
                  <Dialog open={tipOpen} onOpenChange={setTipOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2 mb-4">
                        <Gift size={16} />
                        {t("radio.tipToDj", "DJ에게 후원")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t("radio.tipToDj", "DJ에게 후원")}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <div>
                          <Label>{t("music.tipAmount")}</Label>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {[100, 200, 300, 400, 500, 1000].map((amt) => (
                              <Button key={amt} type="button" variant={tipAmount === amt ? "default" : "outline"} size="sm" onClick={() => setTipAmount(amt)}>
                                {amt.toLocaleString()}
                              </Button>
                            ))}
                          </div>
                          <Input type="number" min={100} value={tipAmount} onChange={(e) => setTipAmount(Math.max(100, parseInt(e.target.value, 10) || 100))} className="mt-2" />
                        </div>
                        <div>
                          <Label>{t("music.tipMessage")}</Label>
                          <Input value={tipMessage} onChange={(e) => setTipMessage(e.target.value)} placeholder={t("music.tipMessagePlaceholder")} className="mt-1" />
                        </div>
                        <Button
                          className="w-full"
                          onClick={() => tipMutation.mutate({ toUserId: channel.ownerId, amount: tipAmount, message: tipMessage.trim() || undefined })}
                          disabled={tipMutation.isPending || tipAmount < 100}
                        >
                          {tipMutation.isPending ? t("music.tipping") : `${tipAmount.toLocaleString()} ${t("credits.creditUnit")} ${t("music.tipSubmit")}`}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
                {canManage && user ? (
                  <Link href={`/radio/${encodeURIComponent(channel.slug)}/studio`}>
                    <Button size="sm" className="gap-1.5 w-full sm:w-auto h-8 px-3 text-xs">
                      <Mic2 size={16} />
                      {t("radio.goToStudio", "방송 스튜디오")}
                    </Button>
                  </Link>
                ) : isLive ? (
                  <div className="rounded-lg border border-white/10 bg-muted/20 p-4 space-y-3">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Headphones size={18} />
                      <span>
                        {radioIsPlaying
                          ? t("radio.listeningTo", "지금 재생 중")
                          : listenerAudioSrc
                            ? t("radio.tapToPlay", "▶ 재생 버튼을 눌러 청취를 시작하세요.")
                            : t("radio.listenComingSoon", "준비 중입니다. 곡이 등록되면 자동으로 시작됩니다.")}
                      </span>
                    </p>
                    {listenerAudioSrc && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => radioIsPlaying ? radioRequestPause() : radioRequestPlay()}
                          className="gap-2"
                        >
                          {radioIsPlaying ? <Pause size={16} /> : <Play size={16} />}
                          {radioIsPlaying ? t("radio.listenPause") : t("radio.listenPlay")}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Headphones size={18} />
                    <span>
                      {t("radio.listenComingSoon")}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

            </main>

            {/* 2번: 신청곡 (오른쪽) */}
            <aside className="order-3">
              <Card className="overflow-hidden h-full border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.96)] shadow-[0_22px_60px_rgba(15,23,42,0.65)]">
                <CardContent className="p-0">
                  <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2">
                    <Music2 size={18} className="text-muted-foreground" />
                    <span className="font-medium text-sm">{t("radio.songRequest", "신청곡")}</span>
                  </div>
                  <p className="text-muted-foreground text-xs px-4 pt-2">{t("radio.songRequestHint", "곡을 검색해 선택한 뒤 신청하면 DJ가 확인합니다.")}</p>
                  <div className="p-4 space-y-3">
                    {!user ? (
                      <p className="text-sm text-muted-foreground">{t("radio.loginToRequest", "로그인 후 신청할 수 있습니다.")}</p>
                    ) : (
                      <>
                        <Input
                          placeholder={t("radio.searchSongToRequest", "곡 검색...")}
                          value={requestSearch}
                          onChange={(e) => setRequestSearch(e.target.value)}
                          className="bg-muted/30"
                        />
                        {requestResults.length > 0 && (
                          <div className="max-h-40 overflow-y-auto rounded-md border border-white/10 divide-y divide-white/5">
                            {requestResults.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 flex justify-between items-start gap-2"
                                onClick={() => setSelectedRequest({ id: m.id, title: m.title, artist: m.artist })}
                              >
                                <span className="leading-snug break-words">
                                  {m.title} – {m.artist}
                                </span>
                                {selectedRequest?.id === m.id && (
                                  <span className="text-primary text-xs shrink-0">
                                    {t("radio.selected", "선택됨")}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                        {selectedRequest && (
                          <div className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-3 py-2 text-sm">
                            <span className="truncate">{selectedRequest.title} – {selectedRequest.artist}</span>
                            <div className="flex gap-2 flex-shrink-0">
                              <Button variant="ghost" size="sm" onClick={() => setSelectedRequest(null)}>
                                {t("common.cancel", "취소")}
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => requestMutation.mutate(selectedRequest)}
                                disabled={requestMutation.isPending}
                              >
                                {requestMutation.isPending ? t("radio.requesting", "신청 중...") : t("radio.submitRequest", "신청하기")}
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </div>
      {/* 채널 수정 다이얼로그 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("radio.editChannel", "채널 수정")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>{t("radio.channelName", "채널 이름")}</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={50}
                className="mt-1 bg-background border-white/10"
              />
            </div>
            <div>
              <Label>{t("radio.channelDescription", "한 줄 소개")}</Label>
              <Input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                maxLength={200}
                className="mt-1 bg-background border-white/10"
                placeholder={t("radio.descriptionPlaceholder", "예: 편하게 들을 수 있는 음악방")}
              />
            </div>
            <div>
              <Label>{t("radio.channelCover", "배경 이미지")}</Label>
              <div className="mt-1 flex items-center gap-3">
                {editCoverPreview ? (
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-white/10 shrink-0">
                    <img src={editCoverPreview} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      className="absolute top-0 right-0 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-bl-md hover:bg-red-600 transition-colors"
                      onClick={() => { setEditCover(""); setEditCoverPreview(null); }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-lg border border-dashed border-white/20 flex items-center justify-center text-muted-foreground shrink-0">
                    <ImagePlus size={24} />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={editUploading}
                    onClick={() => editFileRef.current?.click()}
                    className="gap-2"
                  >
                    {editUploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                    {editUploading ? t("radio.uploadingCoverImage") : t("radio.pickCoverImage")}
                  </Button>
                  <p className="text-xs text-muted-foreground">{t("radio.coverFormatHint")}</p>
                </div>
                <input
                  ref={editFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleEditCoverFile}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditOpen(false)}>
                {t("common.cancel", "취소")}
              </Button>
              <Button onClick={handleEditSave} disabled={editSaving || !editName.trim()} className="gap-2">
                {editSaving && <Loader2 size={14} className="animate-spin" />}
                {editSaving ? t("common.saving", "저장 중...") : t("common.save", "저장")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
