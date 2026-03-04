import { useRef, useState, useEffect, useMemo } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Radio as RadioIcon, ArrowLeft, Headphones, Mic2, Users, Gift, MessageCircle, Music2, UserPlus, UserMinus } from "lucide-react";
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

export default function RadioChannel() {
  const [, params] = useRoute("/radio/:slug");
  const slug = params?.slug ?? "";
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasSeekedForTrackRef = useRef<number | null>(null);
  const lastNowPlayingRef = useRef<{ musicId: number | null; elapsedSeconds: number; receivedAt: number }>({ musicId: null, elapsedSeconds: 0, receivedAt: 0 });
  const channelElapsedRef = useRef<{ musicId: number; elapsed: number; receivedAt: number } | null>(null);
  const presentUserIdsRef = useRef<Set<string>>(new Set());
  const [userStopped, setUserStopped] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

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
    enabled: !!slug,
    refetchInterval: (data) => (data?.status === "live" ? 2000 : false),
  });

  const isOwner = user?.id === channel?.ownerId;
  const canManage = !!channel?.canManage;
  const isLive = channel?.status === "live";
  const nowPlayingId = channel?.nowPlayingMusicId ?? null;
  const displayName = user?.username ?? user?.firstName ?? null;
  const { listenerCount } = useRadioRoom(slug, displayName);

  // 방송이 끝나거나 곡이 완전히 끊기면 사용자 수동 정지 상태·재생 상태 초기화
  useEffect(() => {
    if (!isLive || nowPlayingId == null) {
      setUserStopped(false);
      setIsPlaying(false);
    }
  }, [isLive, nowPlayingId]);

  // 채널/곡 정보가 바뀔 때마다 동기화 기준 초기화
  useEffect(() => {
    if (nowPlayingId == null || channel?.nowPlayingElapsedSeconds == null) return;
    channelElapsedRef.current = {
      musicId: nowPlayingId,
      elapsed: channel.nowPlayingElapsedSeconds,
      receivedAt: Date.now(),
    };
  }, [slug, nowPlayingId, channel?.nowPlayingElapsedSeconds]);

  // 슬러그나 곡이 바뀌면 seek 플래그와 마지막 nowPlaying 상태를 초기화
  useEffect(() => {
    hasSeekedForTrackRef.current = null;
    lastNowPlayingRef.current = { musicId: null, elapsedSeconds: 0, receivedAt: 0 };
  }, [slug, nowPlayingId]);

  function formatScheduleTime(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const h = d.getHours();
    const m = d.getMinutes();
    if (m === 0) return `${h}${t("radio.hour", "시")}`;
    return `${h}${t("radio.hour", "시")} ${m}${t("radio.minute", "분")}`;
  }

  const { data: nowPlayingMusic } = useQuery<{ id: number; title?: string; artist?: string; filename?: string | null; lyrics?: string | null }>({
    queryKey: ["/api/music", nowPlayingId],
    queryFn: async () => {
      const res = await fetch(`/api/music/${nowPlayingId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!nowPlayingId && !!isLive,
  });
  const rawAudioUrl =
    nowPlayingId == null
      ? null
      : nowPlayingMusic?.filename?.startsWith("/objects/")
        ? nowPlayingMusic.filename
        : `/api/music/${nowPlayingId}/stream`;
  // 스트림 URL로 바로 재생(버퍼만 채우면 시작). 전체 파일 다운로드 후 재생하면 30초 이상 지연됨
  const audioStreamUrl = rawAudioUrl;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode } | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  useEffect(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas || !audioStreamUrl) return;
    // 이전에 같은 audio에 연결된 소스가 있으면 해제 (재연결 시 InvalidStateError 방지)
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.disconnect();
      } catch (_) {}
      audioSourceRef.current = null;
    }
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = ctx.createMediaElementSource(audio);
    audioSourceRef.current = source;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    analyserRef.current = { ctx, analyser };
    let rafId = 0;
    const data = new Uint8Array(analyser.frequencyBinCount);
    function draw() {
      rafId = requestAnimationFrame(draw);
      if (!analyserRef.current) return;
      analyser.getByteTimeDomainData(data);
      const w = canvas.width;
      const h = canvas.height;
      const g = canvas.getContext("2d");
      if (!g) return;
      g.fillStyle = "rgba(15,15,18,0.4)";
      g.fillRect(0, 0, w, h);
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
    return () => {
      cancelAnimationFrame(rafId);
      analyserRef.current = null;
      try {
        source.disconnect();
      } catch (_) {}
      audioSourceRef.current = null;
      ctx.close();
    };
  }, [audioStreamUrl]);
  const { toast } = useToast();
  const { send: wsSend, subscribe, ready: wsReady, authenticated: wsAuthenticated } = useWs();

  type ChatMsg = { id: number | string; userId: string; username?: string | null; content?: string; createdAt: string; type?: "system_join" | "system_leave" };
  const { data: chatList } = useQuery<ChatMsg[]>({
    queryKey: ["/api/radio/channels", slug, "chat"],
    queryFn: async () => {
      const res = await fetch(`/api/radio/channels/${slug}/chat`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!slug,
  });
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [broadcastEndedMessage, setBroadcastEndedMessage] = useState<string | null>(null);
  useEffect(() => {
    setBroadcastEndedMessage(null);
  }, [slug]);
  useEffect(() => {
    if (channel?.status === "live") setBroadcastEndedMessage(null);
  }, [channel?.status]);
  const subscribeRef = useRef(subscribe);
  subscribeRef.current = subscribe;
  useEffect(() => {
    if (!Array.isArray(chatList)) return;
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
        lastNowPlayingRef.current = { musicId, elapsedSeconds, receivedAt: Date.now() };
        if (musicId === null) {
          refetchChannel();
          const audio = audioRef.current;
          if (audio) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
          }
        }
      }
      if (msg.type === "radio_broadcast_ended" && msg.hostDisplayName && (msg.slug == null || String(msg.slug).toLowerCase() === normalizedSlug)) {
        setBroadcastEndedMessage(String(msg.hostDisplayName));
        setMessages([]);
        presentUserIdsRef.current.clear();
        queryClient.invalidateQueries({ queryKey: ["/api/radio/channels", slug, "chat"] });
        refetchChannel();
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
        return;
      }
      if (msg.type !== "radio_chat" || !msg.message) return;
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
  }, [slug]);

  const [tipOpen, setTipOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState(1000);
  const [tipMessage, setTipMessage] = useState("");
  const tipMutation = useMutation({
    mutationFn: async (data: { toUserId: string; amount: number; message?: string }) => {
      const res = await fetch("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Tip failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("music.tipSuccess"), description: t("music.tipSuccessDesc", { amount: tipAmount.toLocaleString() }) });
      setTipOpen(false);
      setTipAmount(1000);
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
        let message = "신청 실패";
        try {
          const err = await res.json();
          if (err && typeof err.message === "string") message = err.message;
        } catch {
          if (res.status === 401) message = "로그인이 필요합니다.";
          else if (res.status === 404) message = "채널을 찾을 수 없습니다.";
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
    enabled: !!normalizedSlug,
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
    const labels = { owner: "방장", dj: "DJ", sub_host: "부방장", staff: "스텝" };
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
        throw new Error(err.message || "추가 실패");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "스텝이 추가되었습니다." });
      setStaffUsername("");
      refetchStaff();
    },
    onError: (e: Error) => toast({ title: "스텝 추가 실패", description: e.message, variant: "destructive" }),
  });
  const removeStaffMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/radio/channels/${encodeURIComponent(normalizedSlug)}/staff/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "제거 실패");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "스텝이 제거되었습니다." });
      refetchStaff();
    },
    onError: (e: Error) => toast({ title: "스텝 제거 실패", description: e.message, variant: "destructive" }),
  });

  if (!slug) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-background flex flex-col">
          <Navigation />
          <div className="container px-4 py-10 text-center">
            <p className="text-muted-foreground">{t("radio.channelNotFound", "??? ?? ? ????.")}</p>
            <Link href="/radio">
              <Button variant="outline" className="mt-4">?????</Button>
            </Link>
          </div>
          <Footer />
        </div>
      </PageTransition>
    );
  }

  if (isLoading) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-background flex flex-col">
          <Navigation />
          <div className="container px-4 py-20 text-center text-muted-foreground">
            {t("radio.loading", "???? ?...")}
          </div>
          <Footer />
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
            <p className="text-muted-foreground">{t("radio.channelNotFound", "??? ?? ? ????.")}</p>
            <Link href="/radio">
              <Button variant="outline" className="mt-4">?????</Button>
            </Link>
          </div>
          <Footer />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="container px-4 py-10 max-w-6xl mx-auto">
          <Link href="/radio" className="block mb-4">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
              <ArrowLeft size={16} />
              {t("radio.backToRadio", "방송국으로")}
            </Button>
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr_280px] gap-4 lg:gap-6">
            {/* 1번: 채팅 (왼쪽) - 입력창 하단 고정, 메시지만 스크롤 */}
            <aside className="order-2 lg:order-1 flex flex-col min-h-0 max-h-[85vh] lg:max-h-[75vh]">
              <Card className="border-white/5 bg-card/50 overflow-hidden flex flex-col flex-1 min-h-0">
                <CardContent className="p-0 flex flex-col flex-1 min-h-0 min-w-0">
                  <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2 shrink-0">
                    <MessageCircle size={18} className="text-muted-foreground" />
                    <span className="font-medium text-sm">{t("radio.chatTitle", "채팅")} (단체)</span>
                    {typeof listenerCount === "number" && (
                      <span className="text-muted-foreground text-xs">· {listenerCount}명 참여 중</span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs px-4 pt-1 shrink-0">같은 채널 시청자가 모두 보는 단체 채팅입니다.</p>
                  <div ref={chatContainerRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                    {filteredMessages.length === 0 ? (
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
                              <span>님이 퇴장했습니다.</span>
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
          <Card className="border-white/5 bg-card/50 overflow-hidden">
            <CardContent className="p-0">
              {/* 1번: 현재 송출 중인 음원 정보 */}
              {isLive && nowPlayingId != null && nowPlayingMusic && (
                <div className="px-4 py-3 bg-muted/20 border-b border-white/10 flex items-center gap-3">
                  <Music2 size={20} className="text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {nowPlayingMusic.title ?? t("radio.nowPlaying", "지금 재생 중")}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {nowPlayingMusic.artist ?? ""}
                    </p>
                  </div>
                </div>
              )}
              <div className="aspect-video bg-muted/30 flex items-center justify-center relative overflow-hidden">
                {isLive && nowPlayingId != null && audioStreamUrl && !isOwner ? (
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                    width={640}
                    height={360}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : channel.coverFilename ? (
                  <img src={resolveStorageUrl(channel.coverFilename)} alt={channel.name} className="w-full h-full object-cover" />
                ) : (
                  <RadioIcon size={64} className="text-muted-foreground" />
                )}
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h1 className="text-2xl font-bold">{channel.name}</h1>
                  {channel.status === "live" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      LIVE
                    </span>
                  )}
                  {channel.status === "live" && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
                      <Users size={14} />
                      {t("radio.listenersCount", "{{count}}명 시청 중", { count: listenerCount })}
                    </span>
                  )}
                </div>
                {channel.description && (
                  <p className="text-muted-foreground text-sm mb-4">{channel.description}</p>
                )}
                {broadcastEndedMessage && channel.status === "ended" && (
                  <p className="text-sm text-amber-600 dark:text-amber-400 mb-4 rounded-md bg-amber-500/10 px-3 py-2 border border-amber-500/20">
                    <strong>{broadcastEndedMessage}</strong>님이 방송을 종료했습니다.
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
                            {[500, 1000, 2000, 5000].map((amt) => (
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
                          {tipMutation.isPending ? t("music.tipping") : `${tipAmount.toLocaleString()} ${t("common.won")} ${t("music.tipSubmit")}`}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
                {canManage ? (
                  <a href={`/radio-dj-ui-mockup.html?slug=${encodeURIComponent(channel.slug)}`} target="_blank" rel="noopener noreferrer">
                    <Button className="gap-2 w-full sm:w-auto">
                      <Mic2 size={18} />
                      {t("radio.goToStudio", "방송 스튜디오")}
                    </Button>
                  </a>
                ) : isLive && nowPlayingId != null && audioStreamUrl ? (
                  <div className="rounded-lg border border-white/10 bg-muted/20 p-4 space-y-2">
                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Headphones size={18} />
                      {t("radio.listeningTo", "지금 재생 중")}
                    </p>
                    {typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|webOS|Mobile/i.test(navigator.userAgent) && (
                      <p className="text-xs text-muted-foreground">{t("radio.tapToPlayHint", "모바일에서는 재생 버튼을 눌러 들으세요.")}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={isPlaying ? "outline" : "default"}
                        disabled={isPlaying}
                        onClick={() => {
                          const el = audioRef.current;
                          if (!el) return;
                          const ctx = analyserRef.current?.ctx;
                          if (ctx?.state === "suspended") {
                            ctx.resume();
                          }
                          el.play().catch(() => {});
                          setUserStopped(false);
                        }}
                      >
                        {t("radio.listenPlay", "재생")}
                      </Button>
                      <Button
                        size="sm"
                        variant={isPlaying ? "secondary" : "outline"}
                        disabled={!isPlaying}
                        onClick={() => {
                          const el = audioRef.current;
                          if (!el) return;
                          el.pause();
                          setUserStopped(true);
                        }}
                      >
                        {t("radio.listenPause", "일시정지")}
                      </Button>
                    </div>
                    <audio
                      key={audioStreamUrl}
                      ref={audioRef}
                      src={audioStreamUrl}
                      className="hidden"
                      autoPlay={typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|webOS|Mobile/i.test(navigator.userAgent) ? false : !userStopped}
                      onPlay={() => {
                        setIsPlaying(true);
                        setUserStopped(false);
                      }}
                      onPause={() => {
                        setIsPlaying(false);
                        const audio = audioRef.current;
                        if (!audio) return;
                        if (audio.ended) return;
                        if (audio.currentTime > 0) {
                          setUserStopped(true);
                        }
                      }}
                      onEnded={() => {
                        setIsPlaying(false);
                        setUserStopped(false);
                      }}
                      onCanPlay={() => {
                        if (isOwner || !audioRef.current) return;
                        if (hasSeekedForTrackRef.current === nowPlayingId) return;
                        const last = lastNowPlayingRef.current;
                        let seekSec: number | null = null;
                        if (last?.musicId === nowPlayingId) {
                          const delay = last.receivedAt ? (Date.now() - last.receivedAt) / 1000 : 0;
                          seekSec = last.elapsedSeconds + delay;
                        } else if (channelElapsedRef.current?.musicId === nowPlayingId) {
                          const { elapsed, receivedAt } = channelElapsedRef.current;
                          seekSec = elapsed + (Date.now() - receivedAt) / 1000;
                        } else if (channel?.nowPlayingElapsedSeconds != null) {
                          channelElapsedRef.current = {
                            musicId: nowPlayingId!,
                            elapsed: channel.nowPlayingElapsedSeconds,
                            receivedAt: Date.now(),
                          };
                          seekSec = channel.nowPlayingElapsedSeconds;
                        }
                        if (seekSec != null && seekSec > 0) {
                          const target = Math.max(0, seekSec);
                          const cur = audioRef.current.currentTime;
                          if (target > cur - 0.5) {
                            audioRef.current.currentTime = target;
                          }
                          setTimeout(() => {
                            if (audioRef.current && hasSeekedForTrackRef.current === nowPlayingId) {
                              const c = audioRef.current.currentTime;
                              if (c < target - 1.5 && target > c) {
                                audioRef.current.currentTime = target;
                              }
                            }
                          }, 300);
                        }
                        hasSeekedForTrackRef.current = nowPlayingId;
                      }}
                      onError={() => toast({ title: "재생 오류", description: "음원을 불러올 수 없습니다.", variant: "destructive" })}
                    />
                    {nowPlayingMusic?.lyrics?.trim() && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">{t("radio.lyrics", "가사")}</p>
                        <div className="max-h-40 overflow-y-auto rounded-md bg-background/50 p-3 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                          {nowPlayingMusic.lyrics}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Headphones size={18} />
                    <span>
                      {isLive
                        ? t("radio.listenComingSoon", "?? ??? ?? ????.")
                        : t("radio.listenComingSoon", "?? ??? ?? ????.")}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {canManage && isOwner && (
            <Card className="border-white/5 bg-card/50 mt-4 overflow-hidden">
              <CardContent className="p-0">
                <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2">
                  <UserPlus size={18} className="text-muted-foreground" />
                  <span className="font-medium text-sm">스텝 관리 (부방장·스텝)</span>
                </div>
                <p className="text-muted-foreground text-xs px-4 pt-2">스텝은 방송 스튜디오 접속이 가능합니다. 로그인 아이디 또는 이메일로 추가하세요.</p>
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap gap-2 items-end">
                    <Input
                      placeholder="사용자 아이디 (username)"
                      value={staffUsername}
                      onChange={(e) => setStaffUsername(e.target.value)}
                      className="flex-1 min-w-[120px]"
                    />
                    <select
                      value={staffRole}
                      onChange={(e) => setStaffRole(e.target.value as "staff" | "sub_host")}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="staff">스텝</option>
                      <option value="sub_host">부방장</option>
                    </select>
                    <Button
                      size="sm"
                      onClick={() => addStaffMutation.mutate()}
                      disabled={!staffUsername.trim() || addStaffMutation.isPending}
                    >
                      {addStaffMutation.isPending ? "추가 중..." : "추가"}
                    </Button>
                  </div>
                  {staffList.length > 0 ? (
                    <ul className="space-y-1.5 text-sm">
                      {staffList.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{s.username || s.userId.slice(0, 8)}</span>
                            <RoleBadge role={s.role === "sub_host" ? "sub_host" : "staff"} />
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive h-8"
                            onClick={() => removeStaffMutation.mutate(s.userId)}
                            disabled={removeStaffMutation.isPending}
                          >
                            <UserMinus size={14} />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-sm">등록된 스텝이 없습니다.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
            </main>

            {/* 2번: 신청곡 (오른쪽) */}
            <aside className="order-3">
              <Card className="border-white/5 bg-card/50 overflow-hidden h-full">
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
                                className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 flex justify-between items-center gap-2"
                                onClick={() => setSelectedRequest({ id: m.id, title: m.title, artist: m.artist })}
                              >
                                <span className="truncate">{m.title} – {m.artist}</span>
                                {selectedRequest?.id === m.id && <span className="text-primary text-xs">{t("radio.selected", "선택됨")}</span>}
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
        <Footer />
      </div>
    </PageTransition>
  );
}
