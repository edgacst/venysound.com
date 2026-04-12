import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/use-auth";
import { LOGIN_PATH } from "@/lib/site-paths";
import { useRoute, Link, useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLikeMusic, useMyLikes, useLikeCounts, usePlayCounts } from "@/hooks/use-music";
import { useFollowUser } from "@/hooks/use-user-profile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DonationBadge } from "@/components/DonationBadge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePlayerStore } from "@/components/AudioPlayer";
import { PageTransition } from "@/components/PageTransition";
import { apiRequest, queryClient, redirectToLogin } from "@/lib/queryClient";
import { useState, useEffect, useMemo } from "react";
import { resolveStorageUrl } from "@/lib/utils";
import { useTranslation } from 'react-i18next';
import {
  Play, Pause, Heart, UserPlus, UserCheck, Music, Clock, Tag,
  MessageSquare, Send, Loader2, ArrowLeft, Gift, Download, Bell,
  DollarSign, ListPlus, Share2, Disc3, Headphones, BarChart3, TrendingUp,
  FileText, ChevronDown, ChevronUp, BookOpen, PenLine, Trash2
} from "lucide-react";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function MiniMusicCard({ item, onPlay }: { item: any; onPlay: (id: number) => void }) {
  const [, navigate] = useLocation();
  const { activeMusicId } = usePlayerStore();
  const { data: likeCounts } = useLikeCounts();
  const { data: playCounts } = usePlayCounts();
  const isActive = activeMusicId === item.id;
  const coverImg = item.imageFilename
    ? (item.imageFilename.startsWith("http") ? item.imageFilename : resolveStorageUrl(item.imageFilename))
    : `https://picsum.photos/seed/${item.id}/200/200`;

  return (
    <div
      className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer group"
      onClick={() => navigate(`/music/${item.id}`)}
      data-testid={`mini-card-${item.id}`}
    >
      <div className="relative w-12 h-12 rounded-md overflow-hidden shrink-0">
        <img src={coverImg} alt={item.title} className="w-full h-full object-cover" />
        <div
          className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onPlay(item.id); }}
        >
          <Play size={16} className="text-white" />
        </div>
        {isActive && (
          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
            <Disc3 size={16} className="text-primary animate-spin" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" title={item.title}>{item.title}</p>
        <p className="text-xs text-muted-foreground truncate" title={item.artist}>{item.artist}</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
        <span className="flex items-center gap-0.5">
          <Heart size={10} />
          <span>{likeCounts?.[item.id] || 0}</span>
        </span>
        <span className="flex items-center gap-0.5">
          <Headphones size={10} />
          <span>{playCounts?.[item.id] ?? 0}</span>
        </span>
      </div>
    </div>
  );
}

function StoryCommentsList({ storyId }: { storyId: number }) {
  const { t } = useTranslation();
  const { data: comments = [], isLoading } = useQuery<any[]>({
    queryKey: ["story-comments", storyId],
    queryFn: async () => {
      const res = await fetch(`/api/stories/${storyId}/comments`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (isLoading) return <Loader2 className="animate-spin mx-auto my-2 text-muted-foreground" size={16} />;
  if (!comments.length) return <p className="text-xs text-muted-foreground py-2" data-testid={`text-no-story-comments-${storyId}`}>{t('musicDetail.noCommentsYet', '아직 댓글이 없습니다.')}</p>;

  return (
    <div className="space-y-2 mt-3">
      {comments.map((item: any) => {
        const c = item.comment;
        const u = item.user;
        return (
          <div key={c.id} className="flex gap-2 p-2 rounded-md bg-white/5" data-testid={`story-comment-${c.id}`}>
            <Link href={`/profile/${c.userId}`}>
              <Avatar className="w-6 h-6 cursor-pointer shrink-0">
                <AvatarImage src={u?.profileImageUrl} />
                <AvatarFallback className="text-[10px]">{u?.firstName?.[0] || "U"}</AvatarFallback>
              </Avatar>
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/profile/${c.userId}`}>
                  <span className="text-xs font-medium cursor-pointer hover:underline">
                    {u?.firstName || t('musicDetail.user', '사용자')}{u?.lastName ? ` ${u.lastName}` : ""}
                  </span>
                </Link>
                <span className="text-[10px] text-muted-foreground">{formatDate(c.createdAt)}</span>
              </div>
              <p className="text-xs text-foreground/80 mt-0.5" data-testid={`text-story-comment-content-${c.id}`}>{c.content}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MusicDetail() {
  const { t } = useTranslation();
  const [, params] = useRoute("/music/:id");
  const paramsAlt = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const rawId = params?.id ?? paramsAlt?.id ?? (typeof window !== "undefined" ? /^\/music\/(\d+)/.exec(window.location.pathname)?.[1] : undefined);
  const musicId = rawId != null && rawId !== "" ? Number(rawId) : NaN;
  const musicIdValid = Number.isFinite(musicId) && musicId > 0;
  const { user } = useAuth();
  const { toast } = useToast();
  const { playMusic, playMusicWithLyrics, activeMusicId, togglePause, pauseRequested } = usePlayerStore();
  const { mutate: likeMusic } = useLikeMusic();
  const { data: myLikes } = useMyLikes();
  const { data: likeCounts } = useLikeCounts();
  const { mutate: followUser } = useFollowUser();
  const qc = useQueryClient();

  const [reviewContent, setReviewContent] = useState("");
  const [showLyrics, setShowLyrics] = useState(false);
  const [storyContent, setStoryContent] = useState("");
  const [storyCommentTexts, setStoryCommentTexts] = useState<Record<number, string>>({});
  const [expandedStories, setExpandedStories] = useState<Set<number>>(new Set());
  const [isRingtoneDownloading, setIsRingtoneDownloading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const { data: musicData, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/music", musicId],
    queryFn: async () => {
      const res = await fetch(`/api/music/${musicId}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || ` ${res.status}`);
      }
      return res.json();
    },
    enabled: musicIdValid,
  });

  const { data: reviews, isLoading: reviewsLoading } = useQuery<any[]>({
    queryKey: ["/api/music", musicId, "reviews"],
    enabled: !!musicId,
  });

  const { data: followStatus } = useQuery<any>({
    queryKey: ["/api/users", musicData?.uploader?.id, "profile"],
    enabled: !!musicData?.uploader?.id && !!user,
  });

  const { data: purchasedData } = useQuery<{ purchased: boolean }>({
    queryKey: ["/api/purchases/check", musicId],
    queryFn: async () => {
      const res = await fetch(`/api/purchases/check/${musicId}`);
      if (!res.ok) return { purchased: false };
      return res.json();
    },
    enabled: !!user && !!musicId,
  });
  const hasPurchased = purchasedData?.purchased === true;

  const { data: similarTracks } = useQuery<any[]>({
    queryKey: ["/api/music", musicId, "similar"],
    queryFn: async () => {
      const res = await fetch(`/api/music/${musicId}/similar?limit=8`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: musicIdValid,
  });

  const { data: sameGenreData } = useQuery<any>({
    queryKey: ["/api/music", "genre-related", musicData?.genre],
    queryFn: async () => {
      if (!musicData?.genre) return { music: [] };
      const res = await fetch(`/api/music?genre=${encodeURIComponent(musicData.genre)}&limit=10`);
      return res.json();
    },
    enabled: !!musicData?.genre,
  });

  const { data: allMusicData } = useQuery<any>({
    queryKey: ["/api/music", "all-for-detail"],
    queryFn: async () => {
      const res = await fetch(`/api/music?limit=50`);
      return res.json();
    },
    enabled: !!musicData,
  });

  const artistOtherTracks = useMemo(() => {
    if (!allMusicData?.music || !musicData) return [];
    return allMusicData.music
      .filter((m: any) => m.userId === musicData.userId && m.id !== musicId)
      .slice(0, 5);
  }, [allMusicData, musicData, musicId]);

  const recommendedTracks = useMemo(() => {
    const fromApi = Array.isArray(similarTracks) && similarTracks.length > 0 ? similarTracks : [];
    if (fromApi.length > 0) return fromApi;
    const genreList = sameGenreData?.music || [];
    const filtered = genreList.filter((m: any) => m.id !== musicId && !artistOtherTracks.some((a: any) => a.id === m.id));
    return filtered.slice(0, 6);
  }, [similarTracks, sameGenreData, musicId, artistOtherTracks]);

  const streamingStats = useQuery<any>({
    queryKey: ["/api/streaming-stats", "music", musicId],
    queryFn: async () => {
      const res = await fetch(`/api/streaming-log/music/${musicId}`);
      if (!res.ok) return { totalPlays: 0, totalDuration: 0 };
      return res.json();
    },
    enabled: !!musicId,
  });

  const createReviewMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/music/${musicId}/reviews`, { content });
      return res.json();
    },
    onSuccess: () => {
      setReviewContent("");
      qc.invalidateQueries({ queryKey: ["/api/music", musicId, "reviews"] });
      toast({ title: t('musicDetail.reviewSubmitted', '리뷰가 등록되었습니다') });
    },
    onError: () => {
      toast({ title: t('musicDetail.reviewFailed', '리뷰 등록 실패'), variant: "destructive" });
    },
  });

  const { data: stories = [], isLoading: storiesLoading } = useQuery<any[]>({
    queryKey: ["/api/music", musicId, "stories"],
    queryFn: async () => {
      const res = await fetch(`/api/music/${musicId}/stories`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!musicId,
  });

  const createStoryMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/music/${musicId}/stories`, { content });
      return res.json();
    },
    onSuccess: () => {
      setStoryContent("");
      qc.invalidateQueries({ queryKey: ["/api/music", musicId, "stories"] });
      toast({ title: t('musicDetail.storySubmitted', '창작 히스토리가 등록되었습니다') });
    },
    onError: () => {
      toast({ title: t('musicDetail.submitFailed', '등록 실패'), variant: "destructive" });
    },
  });

  const deleteStoryMutation = useMutation({
    mutationFn: async (storyId: number) => {
      const res = await apiRequest("DELETE", `/api/stories/${storyId}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/music", musicId, "stories"] });
      toast({ title: t('musicDetail.storyDeleted', '창작 히스토리가 삭제되었습니다') });
    },
  });

  const createStoryCommentMutation = useMutation({
    mutationFn: async ({ storyId, content }: { storyId: number; content: string }) => {
      const res = await apiRequest("POST", `/api/stories/${storyId}/comments`, { content });
      return res.json();
    },
    onSuccess: (_, variables) => {
      setStoryCommentTexts((prev) => ({ ...prev, [variables.storyId]: "" }));
      qc.invalidateQueries({ queryKey: ["story-comments", variables.storyId] });
      toast({ title: t('musicDetail.commentSubmitted', '댓글이 등록되었습니다') });
    },
    onError: () => {
      toast({ title: t('musicDetail.commentFailed', '댓글 등록 실패'), variant: "destructive" });
    },
  });

  const isActive = activeMusicId === musicId;
  const isCurrentlyPlaying = isActive && !pauseRequested;
  const isLiked = myLikes?.includes(musicId);
  const likeCount = likeCounts?.[musicId] || 0;
  const isOwner = user?.id === musicData?.userId;
  const uploaderIsPremium = musicData?.uploaderSubscriptionTier === "premium";
  const uploaderDonationBadge = (musicData as { uploaderDonationBadge?: string | null } | undefined)?.uploaderDonationBadge ?? null;
  const isFollowingUploader = followStatus?.isFollowing === true;
  const canDownload =
    !!musicData &&
    (isOwner ||
      (!!musicData.isDownloadable &&
        (Number(musicData.price || 0) === 0 || hasPurchased)));

  async function handleDownload(asRingtone: boolean) {
    if (!user) {
      if (asRingtone) redirectToLogin();
      return;
    }
    const endpoint = asRingtone ? `/api/music/${musicId}/ringtone` : `/api/music/${musicId}/download`;
    if (asRingtone) setIsRingtoneDownloading(true);
    else setIsDownloading(true);
    try {
      const res = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg =
          errBody.message || (asRingtone ? "벨소리 다운로드 실패" : "다운로드 실패");
        throw { message: msg, insufficientCredits: errBody.insufficientCredits === true };
      }
      const cd = res.headers.get("Content-Disposition");
      let filename = musicData?.title || "music";
      if (asRingtone) filename = `${filename}_벨소리`;
      const match = cd?.match(/filename\*?=(?:UTF-8'')?([^;]+)/);
      if (match) {
        try {
          filename = decodeURIComponent(match[1].replace(/^["']|["']$/g, ""));
        } catch {}
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename + (filename.includes(".mp3") ? "" : ".mp3");
      a.click();
      URL.revokeObjectURL(url);
      if (asRingtone && !isOwner) {
        queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
        queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      }
      toast({
        title: asRingtone
          ? t("musicDetail.ringtoneDownloadComplete", "벨소리용 파일이 다운로드되었습니다")
          : t("myLibrary.downloadComplete", "다운로드 완료"),
        description: musicData?.title,
      });
    } catch (err: any) {
      const insufficient = err?.insufficientCredits === true;
      toast({
        title: insufficient
          ? t("musicDetail.ringtoneInsufficientCredits", "지갑 잔액이 부족합니다")
          : asRingtone
            ? t("musicDetail.ringtoneDownloadFailed", "벨소리 다운로드 실패")
            : t("myLibrary.downloadFailed", "다운로드 실패"),
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      if (asRingtone) setIsRingtoneDownloading(false);
      else setIsDownloading(false);
    }
  }

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [musicId]);

  // 플레이어에서 곡이 끝나고 다음 곡으로 넘어가면 상세 페이지 URL도 함께 이동
  useEffect(() => {
    if (activeMusicId && activeMusicId !== musicId) {
      navigate(`/music/${activeMusicId}`);
    }
  }, [activeMusicId, musicId, navigate]);

  if (!musicIdValid) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Music className="mx-auto mb-4 text-muted-foreground" size={48} />
            <h2 className="text-xl font-bold mb-2">{t('musicDetail.notFound', '음원을 찾을 수 없습니다')}</h2>
            <Link href="/music">
              <Button variant="outline" className="mt-4" data-testid="button-back-to-list">
                <ArrowLeft size={16} className="mr-2" /> {t('musicDetail.backToList', '음원 목록으로')}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={40} />
        </div>
      </div>
    );
  }

  if (isError || !musicData) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Music className="mx-auto mb-4 text-muted-foreground" size={48} />
            <h2 className="text-xl font-bold mb-2">{t('musicDetail.notFound', '음원을 찾을 수 없습니다')}</h2>
            <Link href="/music">
              <Button variant="outline" className="mt-4" data-testid="button-back-to-list">
                <ArrowLeft size={16} className="mr-2" /> {t('musicDetail.backToList', '음원 목록으로')}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const coverImage = musicData.imageFilename 
    ? (musicData.imageFilename.startsWith("http") ? musicData.imageFilename : resolveStorageUrl(musicData.imageFilename))
    : `https://picsum.photos/seed/${musicData.id}/600/600`;
  const uploader = musicData.uploader;
  const totalPlays = streamingStats.data?.totalPlays || 0;
  const totalDuration = streamingStats.data?.totalDuration || 0;
  const streamingHours = Math.floor(totalDuration / 3600);
  const streamingMinutes = Math.floor((totalDuration % 3600) / 60);
  const streamingSeconds = Math.floor(totalDuration % 60);
  const streamingTimeStr = streamingHours > 0
    ? `${streamingHours}${t('musicDetail.hours', '시간')} ${streamingMinutes}${t('musicDetail.minutes', '분')} ${streamingSeconds}${t('musicDetail.seconds', '초')}`
    : streamingMinutes > 0
      ? `${streamingMinutes}${t('musicDetail.minutes', '분')} ${streamingSeconds}${t('musicDetail.seconds', '초')}`
      : `${streamingSeconds}${t('musicDetail.seconds', '초')}`;

  return (
    <PageTransition>
      <div className="min-h-screen flex flex-col pb-24 relative">
        <div className="fixed inset-0 z-0 pointer-events-none">
          <img
            src={coverImage}
            alt=""
            className="w-full h-full object-cover blur-2xl scale-150 opacity-90"
          />
          <div className="absolute inset-0 bg-black/30" />
        </div>

        <div className="relative z-10">
        <Navigation />

        <div className="relative h-[280px] md:h-[360px] overflow-hidden">
          <img
            src={coverImage}
            alt={musicData.title}
            className="w-full h-full object-cover blur-xl scale-110 opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        </div>

        <div className="container px-4 -mt-52 md:-mt-56 relative z-10">
          <div className="flex flex-col md:flex-row gap-6 md:gap-8 mb-8">
            <div className="shrink-0">
              <img
                src={coverImage}
                alt={musicData.title}
                className="w-56 h-56 md:w-64 md:h-64 rounded-md object-cover shadow-2xl mx-auto md:mx-0"
                data-testid="img-music-cover"
              />
            </div>

            <div className="flex-1 flex flex-col justify-end">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {musicData.genre && (
                  <Badge variant="secondary" className="text-xs" data-testid="badge-genre">
                    {musicData.genre}
                  </Badge>
                )}
                {musicData.isAi && (
                  <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-400" data-testid="badge-ai">
                    AI
                  </Badge>
                )}
                {uploaderIsPremium && musicData.isDownloadable && musicData.price > 0 && (
                  <Badge variant="outline" className="text-xs border-green-500/30 text-green-400" data-testid="badge-price">
                    <DollarSign size={10} className="mr-0.5" />{musicData.price.toLocaleString()} {t('credits.creditUnit')}
                  </Badge>
                )}
              </div>

              <h1 className="text-2xl md:text-4xl font-display font-bold mb-1 text-foreground" data-testid="text-music-title">
                {musicData.title}
              </h1>

              <div className="flex items-center gap-3 mb-3 flex-wrap">
                {uploader && (
                  <Link href={`/profile/${uploader.id}`}>
                    <div className="flex items-center gap-2 hover-elevate rounded-md px-2 py-1 cursor-pointer" data-testid="link-uploader">
                      <Avatar className="w-7 h-7">
                        <AvatarImage src={uploader.profileImageUrl} />
                        <AvatarFallback>{uploader.firstName?.[0] || "U"}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-foreground">
                        {uploader.firstName || t('musicDetail.user', '사용자')}{uploader.lastName ? ` ${uploader.lastName}` : ""}
                      </span>
                      {uploaderDonationBadge && <DonationBadge badge={uploaderDonationBadge} showLabel={true} size="sm" />}
                    </div>
                  </Link>
                )}
                <span className="text-sm text-muted-foreground">
                  {musicData.artist}
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 flex-wrap">
                <Clock size={14} />
                <span>{formatDate(musicData.createdAt)}</span>
                {musicData.tags && (
                  <>
                    <span className="mx-1">·</span>
                    <Tag size={14} />
                    <span>{musicData.tags}</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  size="lg"
                  className="rounded-full px-8 gap-2 bg-primary text-white"
                  onClick={() => {
                    if (isActive) {
                      togglePause();
                      if (pauseRequested && musicData?.lyrics) {
                        usePlayerStore.setState({ lyricsRequested: true });
                      }
                    } else {
                      musicData?.lyrics ? playMusicWithLyrics(musicId) : playMusic(musicId);
                    }
                  }}
                  data-testid="button-play"
                >
                  {isCurrentlyPlaying ? <Pause size={20} /> : <Play size={20} />}
                  {isCurrentlyPlaying ? t('musicDetail.pause', '일시정지') : t('musicDetail.play', '재생')}
                </Button>

                {user && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => likeMusic(musicId)}
                    data-testid="button-like"
                  >
                    <Heart size={18} className={isLiked ? "fill-red-500 text-red-500" : ""} />
                  </Button>
                )}

                <span className="text-sm text-muted-foreground" data-testid="text-like-count">
                  {likeCount}
                </span>

                {!isOwner && user && uploader && (
                  <>
                    <Button
                      variant={isFollowingUploader ? "default" : "outline"}
                      size="sm"
                      className={`rounded-full gap-1 ${isFollowingUploader ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}`}
                      onClick={() => followUser(uploader.id)}
                      data-testid="button-follow-uploader"
                    >
                      {isFollowingUploader ? <><UserCheck size={14} /> {t('musicDetail.following', '팔로잉')}</> : <><UserPlus size={14} /> {t('musicDetail.follow', '팔로우')}</>}
                    </Button>
                    <Link href={`/messages/${uploader.id}`}>
                      <Button variant="outline" size="sm" className="rounded-full gap-1" data-testid="button-message-uploader">
                        <MessageSquare size={14} /> {t('musicDetail.sendMessage', '메시지 보내기')}
                      </Button>
                    </Link>
                  </>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast({ title: t('musicDetail.linkCopied', '링크가 복사되었습니다') });
                  }}
                  data-testid="button-share"
                >
                  <Share2 size={18} />
                </Button>

                {user && canDownload && hasPurchased && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full gap-1.5"
                    disabled={isDownloading}
                    onClick={() => handleDownload(false)}
                    data-testid="button-download"
                    title={t('musicDetail.download', '다운로드')}
                  >
                    {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    {t('musicDetail.download', '다운로드')}
                  </Button>
                )}
                {musicData && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full gap-1.5"
                    disabled={isRingtoneDownloading}
                    onClick={() => {
                      if (!user) {
                        redirectToLogin();
                        return;
                      }
                      handleDownload(true);
                    }}
                    data-testid="button-ringtone"
                    title={
                      !user
                        ? t("musicDetail.ringtoneLoginHint", "로그인 후 벨소리를 받을 수 있습니다")
                        : isOwner
                          ? t("musicDetail.ringtoneHint", "다운로드 후 휴대폰 설정에서 벨소리로 지정해 주세요")
                          : `${t("musicDetail.ringtoneFeeHover", "유료로 200원이 차감됩니다. 차감 금액은 업로더에게 지급됩니다.")} ${t("musicDetail.ringtoneHint", "다운로드 후 휴대폰 설정에서 벨소리로 지정해 주세요")}`
                    }
                  >
                    {isRingtoneDownloading ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
                    {t('musicDetail.ringtoneDownload', '벨소리용')}
                  </Button>
                )}
              </div>
              {musicData && (
                <p className="text-xs text-muted-foreground mt-2" data-testid="text-ringtone-notice">
                  {!user
                    ? t("musicDetail.ringtoneNoticeLogin", "※ 벨소리를 받으려면 로그인해 주세요. 앞 50초 MP3이며 휴대폰에서 벨소리로 지정해 주세요.")
                    : isOwner
                      ? t("musicDetail.ringtoneNotice", "※ 앞 50초 구간이 MP3로 내려받아집니다. 벨소리 설정은 각 휴대폰의 설정 메뉴에서 직접 지정해 주세요.")
                      : !canDownload
                        ? t(
                            "musicDetail.ringtoneNoticeNoPermission",
                            "※ 다운로드가 허용되지 않았거나 유료 구매 전인 곡은 벨소리를 받을 수 없습니다. (허용·무료·구매 후 가능)",
                          )
                        : t(
                            "musicDetail.ringtoneNoticeFee",
                            "※ 타인 음원 벨소리는 음원 유료·무료와 관계없이 200원이 차감되며, 차감액은 업로더에게 지급됩니다. 앞 50초 구간이 MP3로 내려받아집니다. 휴대폰 설정에서 벨소리로 지정해 주세요.",
                          )}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <Card className="p-4 text-center bg-black/40 border-white/10 backdrop-blur-sm">
              <Headphones size={20} className="mx-auto mb-1 text-primary" />
              <p className="text-lg font-bold" data-testid="text-stat-plays">{totalPlays.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{t('musicDetail.totalPlays', '총 재생')}</p>
            </Card>
            <Card className="p-4 text-center bg-black/40 border-white/10 backdrop-blur-sm">
              <Heart size={20} className="mx-auto mb-1 text-red-400" />
              <p className="text-lg font-bold" data-testid="text-stat-likes">{likeCount}</p>
              <p className="text-xs text-muted-foreground">{t('musicDetail.likes', '좋아요')}</p>
            </Card>
            <Card className="p-4 text-center bg-black/40 border-white/10 backdrop-blur-sm">
              <MessageSquare size={20} className="mx-auto mb-1 text-blue-400" />
              <p className="text-lg font-bold" data-testid="text-stat-reviews">{reviews?.length || 0}</p>
              <p className="text-xs text-muted-foreground">{t('musicDetail.reviews', '리뷰')}</p>
            </Card>
            <Card className="p-4 text-center bg-black/40 border-white/10 backdrop-blur-sm">
              <BarChart3 size={20} className="mx-auto mb-1 text-green-400" />
              <p className="text-lg font-bold" data-testid="text-stat-minutes">{streamingTimeStr}</p>
              <p className="text-xs text-muted-foreground">{t('musicDetail.streamingTime', '스트리밍 시간')}</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2 space-y-6">
              {recommendedTracks.length > 0 && (
                <Card className="p-6 bg-black/40 border-white/10 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp size={18} className="text-primary" />
                    <h2 className="text-lg font-bold" data-testid="text-recommended-title">{t('musicDetail.ifYouLikedThis', '이 곡을 좋아한다면')}</h2>
                    {musicData.genre && (
                      <Badge variant="secondary" className="text-xs">{musicData.genre}</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {recommendedTracks.map((track: any) => (
                      <MiniMusicCard key={track.id} item={track} onPlay={playMusic} />
                    ))}
                  </div>
                </Card>
              )}

              {musicData?.lyrics && (
                <Card className="p-6 bg-black/40 border-white/10 backdrop-blur-sm" data-testid="card-lyrics">
                  <button
                    className="flex items-center justify-between w-full gap-2 mb-2"
                    onClick={() => setShowLyrics(!showLyrics)}
                    data-testid="button-toggle-lyrics"
                  >
                    <div className="flex items-center gap-2">
                      <FileText size={18} className="text-primary" />
                      <h2 className="text-lg font-bold">{t('musicDetail.lyrics', '가사')}</h2>
                    </div>
                    {showLyrics ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
                  </button>
                  {showLyrics && (
                    <div className="mt-4 whitespace-pre-wrap text-base text-muted-foreground leading-relaxed text-center" data-testid="text-lyrics-content">
                      {musicData.lyrics}
                    </div>
                  )}
                </Card>
              )}

              <Card className="p-6 bg-black/40 border-white/10 backdrop-blur-sm" data-testid="card-creative-story">
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen size={18} className="text-primary" />
                  <h2 className="text-lg font-bold" data-testid="text-stories-title">
                    {t('musicDetail.creativeHistory', '창작 히스토리')} ({stories.length})
                  </h2>
                </div>

                {isOwner && (
                  <div className="mb-4">
                    <Textarea
                      placeholder={t('musicDetail.storyPlaceholder', '이 음원의 창작 배경, 영감, 제작 과정 등을 공유해주세요...')}
                      value={storyContent}
                      onChange={(e) => setStoryContent(e.target.value)}
                      className="resize-none mb-3 bg-white/5 border-white/10"
                      rows={4}
                      data-testid="input-story"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => storyContent.trim() && createStoryMutation.mutate(storyContent.trim())}
                        disabled={!storyContent.trim() || createStoryMutation.isPending}
                        className="gap-2"
                        data-testid="button-submit-story"
                      >
                        {createStoryMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <PenLine size={14} />}
                        {t('musicDetail.submitStory', '히스토리 등록')}
                      </Button>
                    </div>
                  </div>
                )}

                {storiesLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="animate-spin text-muted-foreground" size={24} />
                  </div>
                ) : stories.length > 0 ? (
                  <div className="space-y-4">
                    {stories.map((item: any) => {
                      const s = item.story;
                      const u = item.user;
                      const isExpanded = expandedStories.has(s.id);
                      const commentText = storyCommentTexts[s.id] || "";
                      return (
                        <div key={s.id} className="rounded-md bg-secondary/30 overflow-hidden" data-testid={`story-item-${s.id}`}>
                          <div className="p-4">
                            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                              <div className="flex items-center gap-2">
                                <Link href={`/profile/${s.userId}`}>
                                  <Avatar className="w-7 h-7 cursor-pointer shrink-0">
                                    <AvatarImage src={u?.profileImageUrl} />
                                    <AvatarFallback>{u?.firstName?.[0] || "U"}</AvatarFallback>
                                  </Avatar>
                                </Link>
                                <div>
                                  <Link href={`/profile/${s.userId}`}>
                                    <span className="text-sm font-medium cursor-pointer hover:underline" data-testid={`text-story-author-${s.id}`}>
                                      {u?.firstName || t('musicDetail.user', '사용자')}{u?.lastName ? ` ${u.lastName}` : ""}
                                    </span>
                                  </Link>
                                  <span className="text-xs text-muted-foreground ml-2">{formatDate(s.createdAt)}</span>
                                </div>
                              </div>
                              {isOwner && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteStoryMutation.mutate(s.id)}
                                  data-testid={`button-delete-story-${s.id}`}
                                >
                                  <Trash2 size={14} className="text-muted-foreground" />
                                </Button>
                              )}
                            </div>
                            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed" data-testid={`text-story-content-${s.id}`}>
                              {s.content}
                            </p>
                          </div>

                          <div className="border-t border-white/10 px-4 py-2">
                            <button
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => {
                                setExpandedStories((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(s.id)) next.delete(s.id);
                                  else next.add(s.id);
                                  return next;
                                });
                              }}
                              data-testid={`button-toggle-story-comments-${s.id}`}
                            >
                              <MessageSquare size={12} />
                              {isExpanded ? t('musicDetail.hideComments', '댓글 접기') : t('musicDetail.showComments', '댓글 보기')}
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>

                            {isExpanded && (
                              <div className="mt-2">
                                <StoryCommentsList storyId={s.id} />
                                {user && (
                                  <div className="flex gap-2 mt-3">
                                    <input
                                      type="text"
                                      placeholder={t('musicDetail.commentPlaceholder', '댓글을 남겨주세요...')}
                                      value={commentText}
                                      onChange={(e) => setStoryCommentTexts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                                      className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                      data-testid={`input-story-comment-${s.id}`}
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => commentText.trim() && createStoryCommentMutation.mutate({ storyId: s.id, content: commentText.trim() })}
                                      disabled={!commentText.trim() || createStoryCommentMutation.isPending}
                                      data-testid={`button-submit-story-comment-${s.id}`}
                                    >
                                      {createStoryCommentMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-6 text-sm" data-testid="text-no-stories">
                    {isOwner ? t('musicDetail.noStoriesOwner', '아직 창작 히스토리가 없습니다. 이 음원의 창작 배경을 공유해보세요!') : t('musicDetail.noStories', '아직 창작 히스토리가 없습니다.')}
                  </p>
                )}
              </Card>

              <Card className="p-6 bg-black/40 border-white/10 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-6">
                  <MessageSquare size={18} className="text-primary" />
                  <h2 className="text-lg font-bold" data-testid="text-reviews-title">
                    {t('musicDetail.reviewsTitle', '리뷰')} ({reviews?.length || 0})
                  </h2>
                </div>

                {user ? (
                  <div className="mb-6">
                    <Textarea
                      placeholder={t('musicDetail.reviewPlaceholder', '이 음악에 대한 리뷰를 남겨주세요...')}
                      value={reviewContent}
                      onChange={(e) => setReviewContent(e.target.value)}
                      className="resize-none mb-3 bg-white/5 border-white/10"
                      rows={3}
                      data-testid="input-review"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => reviewContent.trim() && createReviewMutation.mutate(reviewContent.trim())}
                        disabled={!reviewContent.trim() || createReviewMutation.isPending}
                        className="gap-2"
                        data-testid="button-submit-review"
                      >
                        {createReviewMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        {t('musicDetail.submitReview', '등록')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mb-6 p-4 rounded-md bg-white/5 border border-white/10 text-center">
                    <p className="text-sm text-muted-foreground mb-3">{t('musicDetail.loginToReview', '리뷰를 작성하려면 로그인이 필요합니다')}</p>
                    <Link href={LOGIN_PATH}>
                      <Button size="sm" className="gap-2" data-testid="button-login-for-review">
                        {t('musicDetail.loginAndReview', '로그인하고 리뷰 작성하기')}
                      </Button>
                    </Link>
                  </div>
                )}

                {reviewsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-muted-foreground" size={24} />
                  </div>
                ) : reviews && reviews.length > 0 ? (
                  <div className="space-y-4">
                    {reviews.map((item: any) => {
                      const r = item.review || item;
                      const u = item.user;
                      return (
                        <div key={r.id} className="flex gap-3 p-3 rounded-md bg-secondary/30" data-testid={`review-item-${r.id}`}>
                          <Link href={`/profile/${r.userId}`}>
                            <Avatar className="w-8 h-8 cursor-pointer shrink-0">
                              <AvatarImage src={u?.profileImageUrl} />
                              <AvatarFallback>{u?.firstName?.[0] || "U"}</AvatarFallback>
                            </Avatar>
                          </Link>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Link href={`/profile/${r.userId}`}>
                                <span className="text-sm font-medium cursor-pointer hover:underline" data-testid={`text-reviewer-${r.id}`}>
                                  {u?.firstName || t('musicDetail.user', '사용자')}{u?.lastName ? ` ${u.lastName}` : ""}
                                </span>
                              </Link>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(r.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm text-foreground/90" data-testid={`text-review-content-${r.id}`}>
                              {r.content}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8" data-testid="text-no-reviews">
                    {t('musicDetail.noReviews', '아직 리뷰가 없습니다. 첫 번째 리뷰를 남겨보세요!')}
                  </p>
                )}
              </Card>

            </div>

            <div className="space-y-4">
              <Card className="p-5 bg-black/40 border-white/10 backdrop-blur-sm">
                <h3 className="font-semibold text-sm mb-4">{t('musicDetail.trackInfo', '곡 정보')}</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t('musicDetail.infoTitle', '제목')}</span>
                    <span className="font-medium text-right truncate" data-testid="text-info-title" title={musicData.title}>{musicData.title}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t('musicDetail.infoArtist', '아티스트')}</span>
                    <span className="font-medium text-right truncate" data-testid="text-info-artist" title={musicData.artist}>{musicData.artist}</span>
                  </div>
                  {musicData.genre && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t('musicDetail.infoGenre', '장르')}</span>
                      <span className="font-medium" data-testid="text-info-genre">{musicData.genre}</span>
                    </div>
                  )}
                  {musicData.tags && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t('musicDetail.infoTags', '태그')}</span>
                      <span className="font-medium text-right truncate" data-testid="text-info-tags" title={musicData.tags}>{musicData.tags}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t('musicDetail.infoUpload', '업로드')}</span>
                    <span className="font-medium" data-testid="text-info-date">{formatDate(musicData.createdAt)}</span>
                  </div>
                  {musicData.isAi && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t('musicDetail.infoType', '유형')}</span>
                      <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-400 no-default-hover-elevate no-default-active-elevate">{t('musicDetail.aiGenerated', 'AI 생성')}</Badge>
                    </div>
                  )}
                  {uploaderIsPremium && musicData.isDownloadable && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t('musicDetail.infoDownload', '다운로드')}</span>
                      <span className="font-medium text-green-400">
                        {musicData.price > 0 ? `${musicData.price.toLocaleString()} ${t('credits.creditUnit')}` : t('musicDetail.free', '무료')}
                      </span>
                    </div>
                  )}
                </div>
              </Card>

              {uploader && (
                <Card className="p-5 bg-black/40 border-white/10 backdrop-blur-sm">
                  <h3 className="font-semibold text-sm mb-4">{t('musicDetail.uploader', '업로더')}</h3>
                  <Link href={`/profile/${uploader.id}`}>
                    <div className="flex items-center gap-3 hover-elevate rounded-md p-2 cursor-pointer" data-testid="link-uploader-card">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={uploader.profileImageUrl} />
                        <AvatarFallback className="text-lg">{uploader.firstName?.[0] || "U"}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {uploader.firstName || t('musicDetail.user', '사용자')}{uploader.lastName ? ` ${uploader.lastName}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{uploader.email}</p>
                      </div>
                    </div>
                  </Link>
                  {!isOwner && user && (
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="default"
                        size="sm"
                        className={`flex-1 gap-2 ${isFollowingUploader ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}`}
                        onClick={() => followUser(uploader.id)}
                        data-testid="button-follow-sidebar"
                      >
                        {isFollowingUploader ? <><UserCheck size={14} /> {t('musicDetail.following', '팔로잉')}</> : <><UserPlus size={14} /> {t('musicDetail.follow', '팔로우')}</>}
                      </Button>
                      <Link href={`/messages/${uploader.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full gap-2" data-testid="button-message-uploader-sidebar">
                          <MessageSquare size={14} /> {t('musicDetail.sendMessage', '메시지')}
                        </Button>
                      </Link>
                    </div>
                  )}
                </Card>
              )}

              {artistOtherTracks.length > 0 && (
                <Card className="p-5 bg-black/40 border-white/10 backdrop-blur-sm">
                  <h3 className="font-semibold text-sm mb-3">
                    {uploader ? `${uploader.firstName || t('musicDetail.thisArtist', '이 아티스트')}${t('musicDetail.otherTracks', '의 다른 음원')}` : t('musicDetail.otherTracksGeneric', '다른 음원')}
                  </h3>
                  <div className="space-y-1">
                    {artistOtherTracks.map((track: any) => (
                      <MiniMusicCard key={track.id} item={track} onPlay={playMusic} />
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>

        <Footer />
        </div>
      </div>
    </PageTransition>
  );
}
