import { useState, useRef, useCallback, useEffect } from "react";
import { Music } from "@shared/schema";
import { Play, Pause, Heart, Headphones, MoreVertical, Pencil, Trash2, Flag, Gift, Download, DollarSign, User as UserIcon, ListPlus, ImagePlus, Loader2 as Loader2Icon, X as XIcon, ExternalLink, Timer, RotateCcw, Check, Sparkles } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "./AudioPlayer";
import { useLikeMusic, useMyLikes, useLikeCounts, usePlayCounts, useUpdateMusic, useDeleteMusic } from "@/hooks/use-music";
import { useAuth } from "@/hooks/use-auth";
import { redirectToLogin } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePlaylists, useAddToPlaylist } from "@/hooks/use-playlists";
import { motion } from "framer-motion";
import { resolveStorageUrl } from "@/lib/utils";
import { useTranslation } from 'react-i18next';
import { DonationBadge } from "@/components/DonationBadge";
import { parseSpotifyAlbumIdFromUserInput } from "@shared/spotify-album-id";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function formatLrcTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export function LyricsSyncEditor({ audioUrl, plainLyrics, onSave, onClose }: {
  audioUrl: string;
  plainLyrics: string;
  onSave: (lrc: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const lines = plainLyrics.split("\n").filter((l, i, arr) => {
    if (l.trim()) return true;
    const prev = arr[i - 1];
    const next = arr[i + 1];
    return prev && prev.trim() && next && next.trim();
  });
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [timestamps, setTimestamps] = useState<(number | null)[]>(new Array(lines.length).fill(null));
  const activeLineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentLineIndex]);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => setIsPlaying(false));
    }
  };

  const stampCurrentLine = () => {
    if (currentLineIndex >= lines.length) return;
    const audio = audioRef.current;
    if (!audio) return;
    const newTimestamps = [...timestamps];
    newTimestamps[currentLineIndex] = audio.currentTime;
    setTimestamps(newTimestamps);
    setCurrentLineIndex(prev => Math.min(prev + 1, lines.length));

    if (!isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    }
  };

  const resetSync = () => {
    setTimestamps(new Array(lines.length).fill(null));
    setCurrentLineIndex(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSave = () => {
    const lrcLines = lines.map((text, i) => {
      const t = timestamps[i];
      if (t !== null && t !== undefined) {
        return `[${formatLrcTime(t)}]${text}`;
      }
      return text;
    });
    onSave(lrcLines.join("\n"));
  };

  const allDone = currentLineIndex >= lines.length;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-4">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        preload="auto"
      />

      <div className="flex items-center gap-3">
        <Button size="icon" variant="outline" onClick={togglePlay} data-testid="button-sync-play">
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </Button>
        <div className="flex-1 bg-muted rounded-full h-2 relative">
          <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap" style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatLrcTime(currentTime)} / {formatLrcTime(duration)}
        </span>
      </div>

      <div className="border border-border rounded-lg max-h-[250px] overflow-y-auto p-2 space-y-1 bg-background">
        {lines.map((line, i) => (
          <div
            key={i}
            ref={i === currentLineIndex ? activeLineRef : undefined}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
              i === currentLineIndex
                ? "bg-primary/15 text-white font-semibold"
                : i < currentLineIndex
                  ? "text-muted-foreground/60"
                  : "text-muted-foreground"
            }`}
            data-testid={`sync-line-${i}`}
          >
            <span className="w-16 shrink-0 text-xs text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
              {timestamps[i] !== null && timestamps[i] !== undefined ? (
                <span className="text-primary">[{formatLrcTime(timestamps[i]!)}]</span>
              ) : (
                <span className="text-muted-foreground/40">--:--.--</span>
              )}
            </span>
            <span className="truncate" title={line}>{line}</span>
          </div>
        ))}
        {allDone && (
          <div className="text-center py-2 text-sm text-green-400">
            <Check size={14} className="inline mr-1" />
            {t('music.syncComplete')}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          className="flex-1 gap-2"
          onClick={stampCurrentLine}
          disabled={allDone}
          data-testid="button-stamp-line"
        >
          <Timer size={16} />
          {allDone ? t('music.syncDone') : t('music.stampLine', { n: currentLineIndex + 1 })}
        </Button>
        <Button size="icon" variant="outline" onClick={resetSync} data-testid="button-sync-reset">
          <RotateCcw size={16} />
        </Button>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={handleSave} disabled={timestamps.every(t => t === null)} data-testid="button-sync-save">
          {t('music.syncApply')}
        </Button>
      </div>
    </div>
  );
}

interface MusicCardProps {
  music: Music;
  /** 홈 주간 차트 등 순위 표시 (멜론식 배지) */
  chartRank?: number;
}

export function MusicCard({ music, chartRank }: MusicCardProps) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { playMusic, activeMusicId } = usePlayerStore();
  const { mutate: likeMusic } = useLikeMusic();
  const { mutate: updateMusic, isPending: isUpdating } = useUpdateMusic();
  const { mutate: deleteMusic, isPending: isDeleting } = useDeleteMusic();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: myLikes } = useMyLikes();
  const { data: likeCounts } = useLikeCounts();
  const { data: playCounts } = usePlayCounts();
  const likeCount = likeCounts?.[music.id] || 0;
  const playCount = playCounts?.[music.id] ?? 0;
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(music.title);
  const [editArtist, setEditArtist] = useState(music.artist);
  const [editGenre, setEditGenre] = useState(music.genre || "");
  const [editTags, setEditTags] = useState(music.tags || "");
  const [editIsAi, setEditIsAi] = useState(music.isAi || false);
  const [editLyrics, setEditLyrics] = useState(music.lyrics || "");
  const [editCoverUrl, setEditCoverUrl] = useState<string | null>(null);
  const [editIsDownloadable, setEditIsDownloadable] = useState<boolean>(music.isDownloadable || false);
  const [editPrice, setEditPrice] = useState<number | "">(music.price ?? 0);
  const [editSpotifyAlbumId, setEditSpotifyAlbumId] = useState(() => (music as { spotifyAlbumId?: string | null }).spotifyAlbumId ?? "");
  const [isFetchingEditCover, setIsFetchingEditCover] = useState(false);
  const [syncEditorOpen, setSyncEditorOpen] = useState(false);

  const [reportReason, setReportReason] = useState("");
  const [reportOriginalArtist, setReportOriginalArtist] = useState("");
  const [reportOriginalTitle, setReportOriginalTitle] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [tipOpen, setTipOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState(500);
  const [tipMessage, setTipMessage] = useState("");
  const [buyOpen, setBuyOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  const { data: playlists, refetch: refetchPlaylists } = usePlaylists();
  const { mutate: addToPlaylist, isPending: isAddingToPlaylist } = useAddToPlaylist();

  const handleOpenPlaylistDialog = () => {
    refetchPlaylists();
    setPlaylistOpen(true);
  };

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
    enabled: !!user,
  });

  const reportMutation = useMutation({
    mutationFn: async (data: { musicId: number; reason: string; originalArtist?: string; originalTitle?: string; details?: string }) => {
      const res = await fetch("/api/copyright-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || t('music.reportFailed'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/copyright-reports/my"] });
      toast({ title: t('music.reportSuccess'), description: t('music.reportSuccessDesc') });
      setReportOpen(false);
      resetReportForm();
    },
    onError: (error: Error) => {
      toast({ title: t('toast.error'), description: error.message, variant: "destructive" });
    },
  });

  const tipMutation = useMutation({
    mutationFn: async (data: { toUserId: string; musicId: number; amount: number; message?: string }) => {
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
      // 후원 성공 시 크레딧/수익/후원 목록이 즉시 갱신되도록 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/earnings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tips/sent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tips/received"] });
    },
    onError: (error: Error) => {
      toast({ title: t("music.tipFailed"), description: error.message, variant: "destructive" });
    },
  });

  const alignLyricsMutation = useMutation({
    mutationFn: async ({ lyrics }: { lyrics: string }) => {
      const res = await fetch(`/api/music/${music.id}/align-lyrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lyrics }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err?.message as string) || t("music.alignLyricsFailedDefault", "가사 정렬 실패"));
      }
      return res.json() as Promise<{ lyrics: string }>;
    },
    onSuccess: (data) => {
      setEditLyrics(data.lyrics);
      toast({ title: t("music.alignLyricsSuccess") });
      queryClient.invalidateQueries({ queryKey: ["/api/music", music.id] });
    },
    onError: (error: Error) => {
      toast({ title: t("music.alignLyricsFailed"), description: error.message, variant: "destructive" });
    },
  });

  const purchaseMutation = useMutation({
    mutationFn: async (musicId: number) => {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ musicId }),
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
          throw new Error(t("music.loginRequired", "로그인이 필요합니다"));
        }
        throw new Error(message || t("music.buyFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("music.buySuccess"), description: t("music.buySuccessDesc", { title: music.title }) });
      setBuyOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: t("music.buyFailed"), description: error.message, variant: "destructive" });
    },
  });

  const isOwner = user?.id === music.userId;
  const isAdmin = adminCheck?.isAdmin === true;
  /** 관리자는 타인 음원에도 Spotify 앨범 ID만 저장 가능(API와 동일) */
  const isAdminSpotifyOnly = isAdmin && !isOwner;
  const canEdit = isOwner;
  const canDelete = isOwner || isAdmin;
  const canReport = !!user && !isOwner;
  const uploaderTier = (music as { uploaderSubscriptionTier?: string | null }).uploaderSubscriptionTier;
  const uploaderIsPremium = uploaderTier === "premium";
  const uploaderDonationBadge = (music as { uploaderDonationBadge?: string | null }).uploaderDonationBadge ?? null;

  const isPlaying = activeMusicId === music.id;
  const isLiked = myLikes?.includes(music.id) ?? false;

  const imageUrl = music.imageFilename 
    ? resolveStorageUrl(music.imageFilename)
    : "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop";

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return toast({ title: t('music.loginRequired'), variant: "destructive" });
    likeMusic(music.id);
  };

  const handleEdit = () => {
    setEditTitle(music.title);
    setEditArtist(music.artist);
    setEditGenre(music.genre || "");
    setEditTags(music.tags || "");
    setEditIsAi(music.isAi || false);
    setEditLyrics(music.lyrics || "");
    setEditCoverUrl(null);
    setEditIsDownloadable(music.isDownloadable || false);
    setEditPrice(music.price ?? 0);
    setEditSpotifyAlbumId((music as { spotifyAlbumId?: string | null }).spotifyAlbumId ?? "");
    setEditOpen(true);
  };

  const handleFetchEditCover = async () => {
    setIsFetchingEditCover(true);
    try {
      const res = await fetch("/api/music/random-cover");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setEditCoverUrl(data.imageUrl);
    } catch {
      toast({ title: t('music.fetchImageFailed'), variant: "destructive" });
    } finally {
      setIsFetchingEditCover(false);
    }
  };

  const handleEditSubmit = () => {
    const prevSpotify = ((music as { spotifyAlbumId?: string | null }).spotifyAlbumId ?? "").trim();
    const rawSpotify = editSpotifyAlbumId.trim();
    let nextSpotify = "";
    if (rawSpotify) {
      const parsed = parseSpotifyAlbumIdFromUserInput(rawSpotify);
      if (!parsed) {
        toast({
          title: t("music.spotifyAlbumIdInvalidTitle", "Spotify ID 형식"),
          description: t(
            "music.spotifyAlbumIdInvalidDesc",
            "앨범·싱글 링크 전체를 붙여넣거나, 주소 중 /album/ 뒤의 ID만 입력해 주세요.",
          ),
          variant: "destructive",
        });
        return;
      }
      nextSpotify = parsed;
    }

    if (isAdminSpotifyOnly) {
      if (nextSpotify === prevSpotify) {
        setEditOpen(false);
        return;
      }
      updateMusic(
        { id: music.id, data: { spotifyAlbumId: nextSpotify || null } },
        { onSuccess: () => setEditOpen(false) },
      );
      return;
    }

    const data: any = { title: editTitle, artist: editArtist, genre: editGenre, tags: editTags, lyrics: editLyrics, isAi: editIsAi };
    if (uploaderIsPremium) {
      data.isDownloadable = editIsDownloadable;
      const priceValue = typeof editPrice === "number" ? editPrice : 0;
      data.price = editIsDownloadable ? priceValue : 0;
    }
    if (editCoverUrl) {
      data.imageFilename = editCoverUrl;
    }
    if (nextSpotify !== prevSpotify) {
      data.spotifyAlbumId = nextSpotify || null;
    }
    updateMusic({ id: music.id, data }, {
      onSuccess: () => setEditOpen(false),
    });
  };

  const handleDelete = () => {
    deleteMusic(music.id, {
      onSuccess: () => setDeleteOpen(false),
    });
  };

  const resetReportForm = () => {
    setReportReason("");
    setReportOriginalArtist("");
    setReportOriginalTitle("");
    setReportDetails("");
  };

  const handleReportSubmit = () => {
    reportMutation.mutate({
      musicId: music.id,
      reason: reportReason,
      originalArtist: reportOriginalArtist || undefined,
      originalTitle: reportOriginalTitle || undefined,
      details: reportDetails || undefined,
    });
  };

  const showMenu = canEdit || canDelete || canReport || !!user;

  return (
    <>
      <motion.div 
        whileHover={{ y: -5 }}
        className={`group relative bg-card rounded-xl overflow-hidden border transition-all duration-300 shadow-lg cursor-pointer ${
          isPlaying
            ? "border-emerald-400/80 shadow-emerald-400/40"
            : "border-white/5 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10"
        }`}
        data-testid={`card-music-${music.id}`}
        onClick={() => navigate(`/music/${music.id}`)}
      >
        <div className="aspect-square relative overflow-hidden">
          <img 
            src={imageUrl} 
            alt={music.title} 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />

          {isPlaying && (
            <div className="absolute bottom-2 left-2 z-10">
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-xs text-black font-semibold shadow-md">
                <span className="h-2 w-2 rounded-full bg-emerald-200 rounded-full animate-ping" />
                <span>{t('music.nowPlaying', '지금 재생중')}</span>
              </div>
            </div>
          )}

          {isPlaying && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex items-end gap-0.5 h-8">
                <span className="w-1.5 bg-white/90 rounded-full animate-pulse" style={{ height: "60%" }} />
                <span className="w-1.5 bg-white/80 rounded-full animate-[pulse_1s_ease-in-out_infinite_alternate]" style={{ height: "90%" }} />
                <span className="w-1.5 bg-white/70 rounded-full animate-pulse" style={{ height: "50%" }} />
                <span className="w-1.5 bg-white/80 rounded-full animate-[pulse_1.2s_ease-in-out_infinite_alternate]" style={{ height: "80%" }} />
                <span className="w-1.5 bg-white/60 rounded-full animate-pulse" style={{ height: "40%" }} />
              </div>
              <div className="absolute bottom-2 right-2">
                <Loader2Icon className="w-4 h-4 text-white/90 animate-spin" />
              </div>
            </div>
          )}

          <div className={`absolute inset-0 bg-black/40 flex items-center justify-center gap-4 transition-opacity duration-300 ${isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <Button 
              size="icon" 
              className="rounded-full bg-primary shadow-lg scale-90 group-hover:scale-100 transition-all duration-300"
              onClick={(e) => { e.stopPropagation(); playMusic(music.id); }}
              data-testid={`button-play-${music.id}`}
            >
              <Play fill="white" className="ml-1" />
            </Button>
          </div>

          {chartRank != null && chartRank > 0 && (
            <span
              className="absolute top-2 left-2 z-[12] flex h-8 min-w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 px-1.5 text-sm font-black tabular-nums text-black shadow-lg ring-2 ring-black/20"
              data-testid={`badge-chart-rank-${music.id}`}
            >
              {chartRank}
            </span>
          )}

          <div className={`absolute ${chartRank != null && chartRank > 0 ? "top-11" : "top-2"} left-2 z-[11] flex flex-wrap items-center gap-1 max-w-[calc(100%-3rem)]`}>
            {music.isAi && (
              <span className="text-xs bg-blue-600/80 text-white px-2 py-0.5 rounded-full">
                AI{(music as any).aiProvider ? ` · ${(music as any).aiProvider}` : ""}
              </span>
            )}
            {music.lyrics && (
              <span className="text-xs bg-purple-600/80 text-white px-2 py-0.5 rounded-full" data-testid={`badge-lyrics-${music.id}`}>{t('music.lyrics')}</span>
            )}
          </div>

          {showMenu && (
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ visibility: 'visible' }} onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="bg-black/50 text-white" data-testid={`button-music-menu-${music.id}`}>
                    <MoreVertical size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit && (
                    <DropdownMenuItem onClick={handleEdit} data-testid={`button-edit-music-${music.id}`}>
                      <Pencil size={14} className="mr-2" />
                      {t('music.edit')}
                    </DropdownMenuItem>
                  )}
                  {isAdminSpotifyOnly && (
                    <DropdownMenuItem onClick={handleEdit} data-testid={`button-admin-spotify-music-${music.id}`}>
                      <Pencil size={14} className="mr-2" />
                      {t("music.adminSpotifyLink", "Spotify 앨범 ID (관리자)")}
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-red-500 focus:text-red-500" data-testid={`button-delete-music-${music.id}`}>
                      <Trash2 size={14} className="mr-2" />
                      {`${t('music.delete')}${isAdmin && !isOwner ? ` (${t('nav.admin')})` : ""}`}
                    </DropdownMenuItem>
                  )}
                  {user && (
                    <>
                      {(canEdit || isAdminSpotifyOnly || canDelete) && <DropdownMenuSeparator />}
                      <DropdownMenuItem onClick={handleOpenPlaylistDialog} data-testid={`button-add-to-playlist-${music.id}`}>
                        <ListPlus size={14} className="mr-2" />
                        {t('music.addToPlaylist')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        usePlayerStore.getState().addToQueue(music.id);
                        toast({ title: t('music.addedToQueue'), description: t('music.addedToQueueDesc', { title: music.title }) });
                      }} data-testid={`button-add-to-queue-${music.id}`}>
                        <ListPlus size={14} className="mr-2" />
                        {t('music.addToQueue')}
                      </DropdownMenuItem>
                    </>
                  )}
                  {canReport && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setReportOpen(true)} className="text-orange-500 focus:text-orange-500" data-testid={`button-report-music-${music.id}`}>
                        <Flag size={14} className="mr-2" />
                        {t('music.copyrightReport')}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        <div className="p-3.5 sm:p-4">
          <Link href={`/music/${music.id}`}>
            <h3 className="font-semibold truncate text-lg group-hover:text-primary transition-colors cursor-pointer hover:underline" data-testid={`text-title-${music.id}`}>{music.title}</h3>
          </Link>
          <p className="text-xs sm:text-sm text-muted-foreground truncate flex items-center gap-1.5" data-testid={`text-artist-${music.id}`}>
            <span className="truncate" title={music.artist}>{music.artist}</span>
            {uploaderDonationBadge && <DonationBadge badge={uploaderDonationBadge} showLabel={false} size="sm" />}
          </p>
          
          <div className="mt-2 pt-2 border-t border-white/5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-1.5 overflow-hidden">
              <span className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground truncate max-w-[65%]">
                {music.genre || t('music.other')}
              </span>
              {uploaderIsPremium && music.isDownloadable && music.price && music.price > 0 && (
                <span
                  className="text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0"
                  data-testid={`badge-price-${music.id}`}
                >
                  <DollarSign size={10} />
                  {music.price.toLocaleString()} {t('credits.creditUnit')}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-0.5">
                {uploaderIsPremium && !isOwner && user && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={(e) => { e.stopPropagation(); setTipOpen(true); }} 
                    data-testid={`button-tip-${music.id}`}
                    title={t('music.tipTitle')}
                  >
                    <Gift size={14} className="text-yellow-500" />
                  </Button>
                )}
                {uploaderIsPremium && !isOwner && user && music.isDownloadable && music.price && music.price > 0 && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={(e) => { e.stopPropagation(); setBuyOpen(true); }} 
                    data-testid={`button-buy-${music.id}`}
                    title={t('music.buyTitle')}
                  >
                    <Download size={14} className="text-green-400" />
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleLike} 
                  className="gap-1 px-1.5"
                  data-testid={`button-like-${music.id}`}
                >
                  <Heart 
                    size={14} 
                    className={isLiked ? "text-red-500 fill-red-500" : ""}
                  />
                  <span className="text-xs tabular-nums" data-testid={`text-like-count-${music.id}`}>{likeCount}</span>
                </Button>
                <span className="flex items-center gap-1 text-xs text-muted-foreground px-1.5" data-testid={`text-play-count-${music.id}`} title={t('music.playCount', '재생 수')}>
                  <Headphones size={12} className="shrink-0" />
                  <span className="tabular-nums">{playCount}</span>
                </span>
              </div>
              <span className="flex items-center gap-1 text-xs text-muted-foreground truncate" data-testid={`text-uploader-${music.id}`} title={music.userId}>
                <UserIcon size={11} className="shrink-0" />
                <span className="truncate">{music.userId}</span>
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isAdminSpotifyOnly
                ? t("music.adminSpotifyDialogTitle", "Spotify 앨범·싱글 ID (관리자)")
                : t("music.editMusic")}
            </DialogTitle>
            {isAdminSpotifyOnly && (
              <p className="text-sm text-muted-foreground pt-1">
                {music.title} — {music.artist} (ID: {music.id})
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4">
            {!isAdminSpotifyOnly && (
              <>
            <div>
              <Label htmlFor="edit-title">{t('music.title')}</Label>
              <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} data-testid="input-edit-title" />
            </div>
            <div>
              <Label htmlFor="edit-artist">{t('music.artist')}</Label>
              <Input id="edit-artist" value={editArtist} onChange={(e) => setEditArtist(e.target.value)} data-testid="input-edit-artist" />
            </div>
            <div>
              <Label htmlFor="edit-genre">{t('music.genre')}</Label>
              <Input id="edit-genre" value={editGenre} onChange={(e) => setEditGenre(e.target.value)} data-testid="input-edit-genre" />
            </div>
            <div>
              <Label htmlFor="edit-tags">{t('music.tagsComma')}</Label>
              <Input id="edit-tags" value={editTags} onChange={(e) => setEditTags(e.target.value)} data-testid="input-edit-tags" />
            </div>
              </>
            )}
            <div>
              <Label htmlFor="edit-spotify-album-id">{t("music.spotifyAlbumIdLabel", "Spotify 앨범·싱글 ID (선택)")}</Label>
              <Input
                id="edit-spotify-album-id"
                value={editSpotifyAlbumId}
                onChange={(e) => setEditSpotifyAlbumId(e.target.value)}
                onBlur={() => {
                  const raw = editSpotifyAlbumId.trim();
                  if (!raw) return;
                  const p = parseSpotifyAlbumIdFromUserInput(raw);
                  if (p) setEditSpotifyAlbumId(p);
                }}
                placeholder={t(
                  "music.spotifyAlbumIdPlaceholder",
                  "ID 또는 open.spotify.com/album/… 전체 링크",
                )}
                className="font-mono text-xs"
                data-testid="input-edit-spotify-album-id"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("music.spotifyAlbumIdHint", "해외 출시 목록과 이 곡을 정확히 연결할 때만 입력하세요. 비우면 제목·아티스트로 자동 매칭을 시도합니다.")}
              </p>
            </div>
            {!isAdminSpotifyOnly && (
              <>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="edit-lyrics">{t('music.lyricsLabel')}</Label>
                {editLyrics.trim() && (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => setSyncEditorOpen(true)}
                      data-testid="button-open-sync-editor"
                    >
                      <Timer size={14} />
                      {t('music.syncLyrics')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={alignLyricsMutation.isPending}
                      onClick={() => alignLyricsMutation.mutate({ lyrics: editLyrics })}
                      data-testid="button-align-lyrics-ai"
                    >
                      {alignLyricsMutation.isPending ? <Loader2Icon size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      {t('music.alignLyricsAi')}
                    </Button>
                  </div>
                )}
              </div>
              <Textarea
                id="edit-lyrics"
                value={editLyrics}
                onChange={(e) => setEditLyrics(e.target.value)}
                placeholder={t('music.lyricsPlaceholder')}
                className="min-h-[120px] resize-y"
                data-testid="input-edit-lyrics"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="edit-isai" checked={editIsAi} onCheckedChange={(v) => setEditIsAi(v === true)} data-testid="checkbox-edit-isai" />
              <Label htmlFor="edit-isai">{t('music.isAiMusic')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-downloadable"
                checked={editIsDownloadable}
                onCheckedChange={(v) => setEditIsDownloadable(v === true)}
                disabled={!uploaderIsPremium}
                data-testid="checkbox-edit-downloadable"
              />
              <Label htmlFor="edit-downloadable">
                {t('music.downloadable', '다운로드 판매 허용')}
                {!uploaderIsPremium && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    {t('music.premiumOnly', '프리미엄 업로더 전용')}
                  </span>
                )}
              </Label>
            </div>
            <div>
              <Label htmlFor="edit-price">{t('music.price', '판매 금액')}</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  id="edit-price"
                  type="number"
                  min={0}
                  step={100}
                  value={editPrice === "" ? "" : editPrice}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") {
                      setEditPrice("");
                      return;
                    }
                    const n = Number(v);
                    if (Number.isNaN(n) || n < 0) return;
                    setEditPrice(n);
                  }}
                  disabled={!uploaderIsPremium || !editIsDownloadable}
                  data-testid="input-edit-price"
                />
                <span className="text-sm text-muted-foreground">{t('credits.creditUnit')}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {uploaderIsPremium
                  ? t('upload.priceDesc', '최소 100 크레딧부터 설정 가능합니다')
                  : t('music.premiumPriceHint', '판매 금액 설정은 프리미엄 업로더만 가능합니다')}
              </p>
            </div>
            <div>
              <Label>{t('music.currentCover')}</Label>
              <div className="flex items-center gap-3 mt-2">
                <img
                  src={editCoverUrl || imageUrl}
                  alt={t('music.coverAlt')}
                  className="w-16 h-16 rounded-md object-cover border border-white/10"
                />
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleFetchEditCover}
                    disabled={isFetchingEditCover}
                    data-testid="button-edit-random-cover"
                  >
                    {isFetchingEditCover ? (
                      <Loader2Icon className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <ImagePlus className="mr-1 h-3 w-3" />
                    )}
                    {t('music.changeCover')}
                  </Button>
                  {editCoverUrl && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline text-left"
                      onClick={() => setEditCoverUrl(null)}
                      data-testid="button-edit-remove-cover"
                    >
                      {t("music.revertCover", "원래 커버로 되돌리기")}
                    </button>
                  )}
                </div>
              </div>
            </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={handleEditSubmit}
              disabled={isUpdating || (!isAdminSpotifyOnly && (!editTitle.trim() || !editArtist.trim()))}
              data-testid="button-save-edit"
            >
              {isUpdating ? t('music.saving') : t('music.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={syncEditorOpen} onOpenChange={(open) => { if (!open) setSyncEditorOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('music.syncLyrics')}</DialogTitle>
            <DialogDescription>
              {t("music.syncLyricsEditorDesc", "음원을 재생하면서 가사가 나올 때마다 아래 버튼을 누르세요. 자동으로 타이밍이 기록됩니다.")}
            </DialogDescription>
          </DialogHeader>
          <LyricsSyncEditor
            audioUrl={`/api/music/${music.id}/stream`}
            plainLyrics={editLyrics.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, "")}
            onSave={(lrc) => {
              setEditLyrics(lrc);
              setSyncEditorOpen(false);
            }}
            onClose={() => setSyncEditorOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('music.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('music.deleteConfirmDesc', { title: music.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700" data-testid="button-confirm-delete">
              {isDeleting ? t('music.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={reportOpen} onOpenChange={(open) => { setReportOpen(open); if (!open) resetReportForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('music.reportTitle')}</DialogTitle>
            <DialogDescription>
              {t("music.reportCopyrightDescription", '"{{title}}" - {{artist}} 음원에 대한 저작권 신고', {
                title: music.title,
                artist: music.artist,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('music.reportReason')}</Label>
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger data-testid="select-report-reason">
                  <SelectValue placeholder={t('music.reportReasonPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unauthorized_use">{t('music.reportReasonUnauthorized')}</SelectItem>
                  <SelectItem value="plagiarism">{t('music.reportReasonSimilar')}</SelectItem>
                  <SelectItem value="false_attribution">{t('music.reportReasonCover')}</SelectItem>
                  <SelectItem value="ai_without_credit">{t("music.reportReasonAiNoCredit", "AI 생성물 미표기")}</SelectItem>
                  <SelectItem value="other">{t('music.reportReasonOther')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="report-original-artist">{t('music.reportOriginalArtist')}</Label>
              <Input id="report-original-artist" value={reportOriginalArtist} onChange={(e) => setReportOriginalArtist(e.target.value)} placeholder={t('music.reportOriginalArtistPlaceholder')} data-testid="input-report-original-artist" />
            </div>
            <div>
              <Label htmlFor="report-original-title">{t('music.reportOriginalTitle')}</Label>
              <Input id="report-original-title" value={reportOriginalTitle} onChange={(e) => setReportOriginalTitle(e.target.value)} placeholder={t('music.reportOriginalTitlePlaceholder')} data-testid="input-report-original-title" />
            </div>
            <div>
              <Label htmlFor="report-details">{t('music.reportDetails')}</Label>
              <Textarea id="report-details" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} placeholder={t('music.reportDetailsPlaceholder')} rows={4} data-testid="textarea-report-details" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReportOpen(false); resetReportForm(); }}>{t('common.cancel')}</Button>
            <Button onClick={handleReportSubmit} disabled={reportMutation.isPending || !reportReason} className="bg-orange-600 hover:bg-orange-700" data-testid="button-submit-report">
              {reportMutation.isPending ? t('music.reporting') : t('music.submitReport')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tipOpen} onOpenChange={setTipOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="text-yellow-500" size={20} /> {t('music.tipTitle')}
            </DialogTitle>
            <DialogDescription>
              "{music.title}" - {music.artist}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('music.tipAmount')}</Label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {[100, 200, 300, 400, 500, 1000].map((amt) => (
                  <Button
                    key={amt}
                    type="button"
                    variant={tipAmount === amt ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTipAmount(amt)}
                    data-testid={`button-tip-amount-${amt}`}
                  >
                    {amt.toLocaleString()} {t('credits.creditUnit')}
                  </Button>
                ))}
              </div>
              <Input
                type="number"
                min={100}
                step={100}
                value={tipAmount}
                onChange={(e) => setTipAmount(Number(e.target.value))}
                className="mt-2"
                placeholder={t('music.tipCustom')}
                data-testid="input-tip-custom-amount"
              />
            </div>
            <div>
              <Label>{t('music.tipMessage')}</Label>
              <Input
                value={tipMessage}
                onChange={(e) => setTipMessage(e.target.value)}
                placeholder={t('music.tipMessagePlaceholder')}
                className="mt-1"
                data-testid="input-tip-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTipOpen(false)}>{t('common.cancel')}</Button>
            <Button 
              onClick={() => tipMutation.mutate({ toUserId: music.userId, musicId: music.id, amount: tipAmount, message: tipMessage || undefined })}
              disabled={tipMutation.isPending || tipAmount < 100}
              data-testid="button-confirm-tip"
            >
              {tipMutation.isPending ? t('music.tipping') : `${tipAmount.toLocaleString()} ${t('credits.creditUnit')} ${t('music.tipSubmit')}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="text-green-400" size={20} /> {t('music.buyTitle')}
            </DialogTitle>
            <DialogDescription>
              "{music.title}" - {music.artist}
            </DialogDescription>
          </DialogHeader>
          <div className="text-center py-4">
            <p className="text-3xl font-bold text-foreground">{(music.price || 0).toLocaleString()} {t('credits.creditUnit')}</p>
            <p className="text-sm text-muted-foreground mt-2">{t("music.buyAfterDownloadHint", "구매 후 음원을 다운로드할 수 있습니다")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuyOpen(false)}>{t('common.cancel')}</Button>
            <Button 
              onClick={() => purchaseMutation.mutate(music.id)}
              disabled={purchaseMutation.isPending}
              data-testid="button-confirm-purchase"
            >
              {purchaseMutation.isPending ? t('music.buying') : t('music.buySubmit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={playlistOpen} onOpenChange={setPlaylistOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListPlus className="text-primary" size={20} /> {t('music.addToPlaylist')}
            </DialogTitle>
            <DialogDescription>
              {t("music.addToPlaylistDescription", '"{{title}}"을(를) 추가할 플레이리스트를 선택하세요', { title: music.title })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {playlists && playlists.length > 0 ? (
              playlists.map((pl: any) => (
                <Button
                  key={pl.id}
                  variant="outline"
                  className="w-full justify-start gap-2"
                  disabled={isAddingToPlaylist}
                  onClick={() => {
                    addToPlaylist({ playlistId: pl.id, musicId: music.id }, {
                      onSuccess: () => setPlaylistOpen(false),
                    });
                  }}
                  data-testid={`button-select-playlist-${pl.id}`}
                >
                  <ListPlus size={14} />
                  {pl.name}
                </Button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('music.noPlaylist')}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlaylistOpen(false)}>{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
