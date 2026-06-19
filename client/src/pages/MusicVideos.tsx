import { usePlayerStore } from "@/components/AudioPlayer";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Download, Eye, Film, Heart, Loader2, MessageCircle, MoreVertical, Pause, Play, Reply, Share2, Smile, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type MusicVideo = {
  id: number;
  title: string;
  description?: string | null;
  videoUrl: string;
  originalFilename?: string | null;
  durationSec?: number | null;
  fileSize?: number | null;
  playCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  likedByMe?: boolean;
  purchasedByMe?: boolean;
  downloadPrice?: number;
  createdAt: string;
  creator: {
    id: string;
    name: string;
    profileImageUrl?: string | null;
  };
};

type MusicVideoComment = {
  id: number;
  parentId?: number | null;
  content: string;
  createdAt: string;
  likeCount?: number;
  likedByMe?: boolean;
  user: {
    id: string;
    name: string;
    profileImageUrl?: string | null;
  };
};

function playVideoWithSoftStart(el: HTMLVideoElement): Promise<void> {
  const targetVolume = Number.isFinite(el.volume) ? Math.max(0, Math.min(1, el.volume || 1)) : 1;
  el.muted = false;
  el.volume = 0;
  return el.play().then(
    () =>
      new Promise<void>((resolve) => {
        const startedAt = performance.now();
        const tick = () => {
          const ratio = Math.min(1, (performance.now() - startedAt) / 90);
          el.volume = targetVolume * ratio;
          if (ratio < 1) {
            requestAnimationFrame(tick);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(tick);
      }),
    (err) => {
      el.volume = targetVolume;
      throw err;
    },
  );
}

function formatSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 100 ? 0 : 1)}MB`;
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

/** 업로드 UI — 다시 켤 때 true */
const SHOW_MUSIC_VIDEO_UPLOAD = false;

async function fetchMusicVideos(): Promise<MusicVideo[]> {
  const res = await fetch("/api/music-videos", { credentials: "include" });
  if (!res.ok) throw new Error("뮤직비디오 목록을 불러오지 못했습니다.");
  return res.json();
}

async function getVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? Math.round(video.duration) : null;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

export default function MusicVideos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const closePlayer = usePlayerStore((s) => s.closePlayer);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const countedPlayIdsRef = useRef<Set<number>>(new Set());
  const mobileScrollerRef = useRef<HTMLDivElement | null>(null);
  const mobileVideoIndexRef = useRef(0);
  const mobilePlayLockRef = useRef(false);
  const mobileScrollTimerRef = useRef<number | null>(null);
  const mobileTransitionVideoIdRef = useRef<string | null>(null);
  const shouldAutoPlayMobileRef = useRef(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [commentsVideo, setCommentsVideo] = useState<MusicVideo | null>(null);
  const [commentText, setCommentText] = useState("");
  const [replyToComment, setReplyToComment] = useState<MusicVideoComment | null>(null);
  const [shouldAutoPlayMobile, setShouldAutoPlayMobile] = useState(false);
  const [mobilePlayingId, setMobilePlayingId] = useState<number | null>(null);
  const { uploadFile, isUploading, progress } = useUpload();
  const isAdmin = user?.role === "admin";
  const { data: videos = [], isLoading } = useQuery({
    queryKey: ["/api/music-videos"],
    queryFn: fetchMusicVideos,
  });

  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey: ["/api/music-videos", commentsVideo?.id, "comments"],
    enabled: Boolean(commentsVideo),
    queryFn: async (): Promise<MusicVideoComment[]> => {
      const res = await fetch(`/api/music-videos/${commentsVideo?.id}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("댓글을 불러오지 못했습니다.");
      return res.json();
    },
  });

  const likeMutation = useMutation({
    mutationFn: async (video: MusicVideo) => {
      if (!user) throw new Error("로그인이 필요합니다.");
      const res = await fetch(`/api/music-videos/${video.id}/like`, { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "좋아요 반영에 실패했습니다.");
      return { videoId: video.id, liked: Boolean(body.liked), likeCount: Number(body.likeCount ?? 0) };
    },
    onSuccess: ({ videoId, liked, likeCount }) => {
      queryClient.setQueryData<MusicVideo[]>(["/api/music-videos"], (prev) =>
        prev?.map((v) => (v.id === videoId ? { ...v, likedByMe: liked, likeCount } : v)),
      );
    },
    onError: (err) => {
      toast({ title: "좋아요 실패", description: err instanceof Error ? err.message : "다시 시도해 주세요.", variant: "destructive" });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async ({ videoId, content, parentId }: { videoId: number; content: string; parentId?: number | null }) => {
      if (!user) throw new Error("로그인이 필요합니다.");
      const res = await fetch(`/api/music-videos/${videoId}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, parentId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "댓글 작성에 실패했습니다.");
      return videoId;
    },
    onSuccess: (videoId) => {
      setCommentText("");
      setReplyToComment(null);
      void queryClient.invalidateQueries({ queryKey: ["/api/music-videos", videoId, "comments"] });
      queryClient.setQueryData<MusicVideo[]>(["/api/music-videos"], (prev) =>
        prev?.map((v) => (v.id === videoId ? { ...v, commentCount: (v.commentCount ?? 0) + 1 } : v)),
      );
    },
    onError: (err) => {
      toast({ title: "댓글 실패", description: err instanceof Error ? err.message : "다시 시도해 주세요.", variant: "destructive" });
    },
  });

  const commentLikeMutation = useMutation({
    mutationFn: async (comment: MusicVideoComment) => {
      if (!user) throw new Error("로그인이 필요합니다.");
      const res = await fetch(`/api/music-videos/comments/${comment.id}/like`, { method: "POST", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "댓글 좋아요 반영에 실패했습니다.");
      return { commentId: comment.id, liked: Boolean(body.liked), likeCount: Number(body.likeCount ?? 0) };
    },
    onSuccess: ({ commentId, liked, likeCount }) => {
      if (!commentsVideo) return;
      queryClient.setQueryData<MusicVideoComment[]>(["/api/music-videos", commentsVideo.id, "comments"], (prev) =>
        prev?.map((comment) => (comment.id === commentId ? { ...comment, likedByMe: liked, likeCount } : comment)),
      );
    },
    onError: (err) => {
      toast({ title: "댓글 좋아요 실패", description: err instanceof Error ? err.message : "다시 시도해 주세요.", variant: "destructive" });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (comment: MusicVideoComment) => {
      if (!user) throw new Error("로그인이 필요합니다.");
      const res = await fetch(`/api/music-videos/comments/${comment.id}`, { method: "DELETE", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "댓글 삭제에 실패했습니다.");
      return { comment, commentCount: Number(body.commentCount ?? 0) };
    },
    onSuccess: ({ comment, commentCount }) => {
      if (!commentsVideo) return;
      queryClient.setQueryData<MusicVideoComment[]>(["/api/music-videos", commentsVideo.id, "comments"], (prev) =>
        prev?.filter((item) => item.id !== comment.id && item.parentId !== comment.id),
      );
      queryClient.setQueryData<MusicVideo[]>(["/api/music-videos"], (prev) =>
        prev?.map((video) => (video.id === commentsVideo.id ? { ...video, commentCount } : video)),
      );
      if (replyToComment?.id === comment.id) setReplyToComment(null);
    },
    onError: (err) => {
      toast({ title: "댓글 삭제 실패", description: err instanceof Error ? err.message : "다시 시도해 주세요.", variant: "destructive" });
    },
  });

  const deleteVideoMutation = useMutation({
    mutationFn: async (video: MusicVideo) => {
      if (!isAdmin) throw new Error("관리자 권한이 필요합니다.");
      const res = await fetch(`/api/music-videos/${video.id}`, { method: "DELETE", credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "뮤직비디오 삭제에 실패했습니다.");
      return video.id;
    },
    onSuccess: (videoId) => {
      queryClient.setQueryData<MusicVideo[]>(["/api/music-videos"], (prev) => prev?.filter((video) => video.id !== videoId));
      if (commentsVideo?.id === videoId) setCommentsVideo(null);
      toast({ title: "뮤직비디오가 삭제되었습니다." });
    },
    onError: (err) => {
      toast({
        title: "뮤직비디오 삭제 실패",
        description: err instanceof Error ? err.message : "다시 시도해 주세요.",
        variant: "destructive",
      });
    },
  });

  const previewUrl = useMemo(() => (selectedFile ? URL.createObjectURL(selectedFile) : ""), [selectedFile]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("MP4 파일을 선택해 주세요.");
      if (!selectedFile.type.includes("mp4") && !selectedFile.name.toLowerCase().endsWith(".mp4")) {
        throw new Error("MP4 파일만 업로드할 수 있습니다.");
      }
      const upload = await uploadFile(selectedFile, { preferredName: selectedFile.name });
      if (!upload?.objectPath) throw new Error("영상 업로드에 실패했습니다.");
      const durationSec = await getVideoDuration(selectedFile);
      const res = await fetch("/api/music-videos", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || selectedFile.name.replace(/\.[^.]+$/, ""),
          description: description.trim(),
          videoUrl: upload.objectPath,
          originalFilename: selectedFile.name,
          durationSec,
          fileSize: selectedFile.size,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "뮤직비디오를 등록하지 못했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      setSelectedFile(null);
      setTitle("");
      setDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["/api/music-videos"] });
      toast({ title: "뮤직비디오가 등록되었습니다." });
    },
    onError: (err) => {
      toast({
        title: "뮤직비디오 등록 실패",
        description: err instanceof Error ? err.message : "다시 시도해 주세요.",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    if (!file.type.includes("mp4") && !file.name.toLowerCase().endsWith(".mp4")) {
      toast({ title: "MP4 파일만 업로드할 수 있습니다.", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const handleVideoPlay = (videoId: number, el: HTMLVideoElement) => {
    closePlayer();
    shouldAutoPlayMobileRef.current = true;
    setShouldAutoPlayMobile(true);
    setMobilePlayingId(videoId);
    document.querySelectorAll<HTMLVideoElement>("video[data-music-video-id]").forEach((videoEl) => {
      if (videoEl !== el && !videoEl.paused) videoEl.pause();
    });
    if (countedPlayIdsRef.current.has(videoId)) return;
    countedPlayIdsRef.current.add(videoId);
    void fetch(`/api/music-videos/${videoId}/play`, { method: "POST", credentials: "include" })
      .then((res) => res.json().catch(() => ({})))
      .then((body: { playCount?: number }) => {
        queryClient.setQueryData<MusicVideo[]>(["/api/music-videos"], (prev) =>
          prev?.map((v) => (v.id === videoId ? { ...v, playCount: Number(body.playCount ?? (v.playCount ?? 0) + 1) } : v)),
        );
      })
      .catch(() => {
        countedPlayIdsRef.current.delete(videoId);
      });
  };

  const handleVideoPause = (videoId: number) => {
    setMobilePlayingId((current) => (current === videoId ? null : current));
  };

  useEffect(() => {
    const root = mobileScrollerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target.querySelector("video[data-music-video-id]") as HTMLVideoElement | null;
          if (!video) return;
          if (mobileTransitionVideoIdRef.current === video.dataset.musicVideoId) return;
          if (entry.intersectionRatio < 0.55) {
            if (!video.paused) video.pause();
          }
        });
      },
      { root, threshold: [0, 0.35, 0.65, 0.9] },
    );
    root.querySelectorAll<HTMLElement>("[data-music-video-slide]").forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [shouldAutoPlayMobile, videos.length]);

  const handleShare = async (video: MusicVideo) => {
    const url = `${window.location.origin}/music-videos?video=${video.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: video.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "공유 링크를 복사했습니다." });
      }
    } catch {
      // user canceled native share
    }
  };

  const playCenteredMobileVideo = () => {
    const root = mobileScrollerRef.current;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const slides = Array.from(root.querySelectorAll<HTMLElement>("[data-music-video-slide]"));
    if (slides.length === 0) return;
    const index = Math.max(0, Math.min(slides.length - 1, Math.round(root.scrollTop / Math.max(1, rootRect.height))));
    mobileVideoIndexRef.current = index;
    const best = slides[index]?.querySelector("video[data-music-video-id]") as HTMLVideoElement | null;
    if (!best) return;
    if (!shouldAutoPlayMobileRef.current && !shouldAutoPlayMobile) return;
    document.querySelectorAll<HTMLVideoElement>("video[data-music-video-id]").forEach((videoEl) => {
      if (videoEl !== best && !videoEl.paused) videoEl.pause();
    });
    best.muted = false;
    void playVideoWithSoftStart(best).catch(() => {
      // The visible play button still works if the browser blocks programmatic playback.
    });
  };

  const handleMobileScroll = () => {
    if (commentsVideo) return;
    if (mobileScrollTimerRef.current) window.clearTimeout(mobileScrollTimerRef.current);
    mobileScrollTimerRef.current = window.setTimeout(() => {
      playCenteredMobileVideo();
    }, 140);
  };

  const toggleMobileVideo = (videoId: number, el: HTMLVideoElement | null) => {
    if (!el || mobilePlayLockRef.current) return;
    if (el.paused) {
      mobilePlayLockRef.current = true;
      closePlayer();
      shouldAutoPlayMobileRef.current = true;
      setShouldAutoPlayMobile(true);
      document.querySelectorAll<HTMLVideoElement>("video[data-music-video-id]").forEach((videoEl) => {
        if (videoEl !== el && !videoEl.paused) videoEl.pause();
      });
      el.muted = false;
      el.playsInline = true;
      void playVideoWithSoftStart(el)
        .catch(() => {
          // The button remains available if the browser requires a second tap.
        })
        .finally(() => {
          window.setTimeout(() => {
            mobilePlayLockRef.current = false;
          }, 350);
        });
    } else {
      el.pause();
      handleVideoPause(videoId);
    }
  };

  const handleDownload = async (video: MusicVideo) => {
    if (!user) {
      toast({ title: "로그인이 필요합니다.", variant: "destructive" });
      return;
    }
    const isOwner = String(user.id) === String(video.creator.id);
    if (!isOwner && !video.purchasedByMe) {
      const ok = window.confirm(`이 MP4를 다운로드하려면 ${Number(video.downloadPrice ?? 300).toLocaleString()}원이 차감됩니다. 진행할까요?`);
      if (!ok) return;
    }
    setDownloadingId(video.id);
    try {
      const res = await fetch(`/api/music-videos/${video.id}/download`, { credentials: "include" });
      const contentType = res.headers.get("Content-Type") || "";
      if (!res.ok) {
        const errBody = contentType.includes("application/json") ? await res.json().catch(() => ({})) : {};
        throw new Error(errBody.message || "MP4 다운로드에 실패했습니다.");
      }
      const cd = res.headers.get("Content-Disposition");
      let filename = `${video.title || "music-video"}.mp4`;
      const match = cd?.match(/filename\*?=(?:UTF-8'')?([^;]+)/);
      if (match) {
        try {
          filename = decodeURIComponent(match[1].replace(/^["']|["']$/g, ""));
        } catch {
          // keep fallback
        }
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename.endsWith(".mp4") ? filename : `${filename}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      queryClient.setQueryData<MusicVideo[]>(["/api/music-videos"], (prev) =>
        prev?.map((v) => (v.id === video.id ? { ...v, purchasedByMe: true } : v)),
      );
      void queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
      toast({ title: "MP4 다운로드를 시작했습니다.", description: isOwner ? "본인 영상은 무료로 다운로드됩니다." : "구매 후 다운로드됩니다." });
    } catch (err) {
      toast({
        title: "MP4 다운로드 실패",
        description: err instanceof Error ? err.message : "다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const renderActionRail = (video: MusicVideo, compact = false) => (
    <div data-testid={compact ? "music-video-mobile-actions" : "music-video-card-actions"} className={compact ? "flex flex-col items-center gap-4" : "flex flex-nowrap items-center gap-0.5 overflow-hidden"}>
      <div className={compact ? "flex flex-col items-center gap-1 text-white" : "inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md bg-white/10 px-1 text-[11px] leading-none text-white"}>
        <Eye className={compact ? "h-5 w-5" : "h-3.5 w-3.5"} />
        <span className={compact ? "text-xs" : "text-[11px] leading-none"}>{(video.playCount ?? 0).toLocaleString()}</span>
      </div>
      <button
        type="button"
        onClick={() => likeMutation.mutate(video)}
        className={compact ? "flex flex-col items-center gap-1 text-white" : "inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md bg-white/10 px-1 text-[11px] leading-none text-white hover:bg-white/15"}
      >
        <Heart className={`${compact ? "h-5 w-5" : "h-3.5 w-3.5"} ${video.likedByMe ? "fill-rose-500 text-rose-500" : ""}`} />
        <span className={compact ? "text-xs" : "text-[11px] leading-none"}>{(video.likeCount ?? 0).toLocaleString()}</span>
      </button>
      <button
        type="button"
        onClick={() => setCommentsVideo(video)}
        className={compact ? "flex flex-col items-center gap-1 text-white" : "inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md bg-white/10 px-1 text-[11px] leading-none text-white hover:bg-white/15"}
      >
        <MessageCircle className={compact ? "h-5 w-5" : "h-3.5 w-3.5"} />
        <span className={compact ? "text-xs" : "text-[11px] leading-none"}>{(video.commentCount ?? 0).toLocaleString()}</span>
      </button>
      <button
        type="button"
        onClick={() => void handleShare(video)}
        className={compact ? "flex flex-col items-center gap-1 text-white" : "inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md bg-white/10 px-1 text-[11px] leading-none text-white hover:bg-white/15"}
      >
        <Share2 className={compact ? "h-5 w-5" : "h-3.5 w-3.5"} />
        <span className={compact ? "text-xs" : "text-[11px] leading-none"}>공유</span>
      </button>
      {String(user?.id || "") === String(video.creator.id) ? (
        <button
          type="button"
          onClick={() => void handleDownload(video)}
          disabled={downloadingId === video.id}
          className={compact ? "flex flex-col items-center gap-1 text-white disabled:opacity-60" : "inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md bg-white/10 px-1 text-[11px] leading-none text-white hover:bg-white/15 disabled:opacity-60"}
        >
          {downloadingId === video.id ? <Loader2 className={compact ? "h-5 w-5 animate-spin" : "h-3.5 w-3.5 animate-spin"} /> : <Download className={compact ? "h-5 w-5" : "h-3.5 w-3.5"} />}
          <span className={compact ? "text-xs" : "text-[11px] leading-none"}>MP4</span>
        </button>
      ) : null}
      {isAdmin && !compact ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={compact ? "flex flex-col items-center gap-1 text-white" : "inline-flex h-6 shrink-0 items-center justify-center rounded-md bg-white/10 px-1 text-white hover:bg-white/15"}
              aria-label="뮤직비디오 관리"
            >
              <MoreVertical className={compact ? "h-5 w-5" : "h-3.5 w-3.5"} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-red-500 focus:text-red-500"
              disabled={deleteVideoMutation.isPending}
              onClick={() => {
                if (window.confirm("뮤직비디오를 삭제할까요?")) deleteVideoMutation.mutate(video);
              }}
              data-testid={`button-delete-music-video-${video.id}`}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );

  return (
    <PageTransition>
      <main className="min-h-screen bg-slate-950 text-white">
        <section className="border-b border-white/10 bg-slate-950 px-4 py-6 md:py-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => window.history.back()}
                className="mb-3 gap-2 px-0 text-slate-300 hover:bg-transparent hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                뒤로가기
              </Button>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-300">
                <Film className="h-4 w-4" />
                Music Video
              </div>
              <h1 className="text-3xl font-bold tracking-normal md:text-4xl">뮤직비디오</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                MP4 영상을 업로드하고, 모바일에서는 위아래 스와이프로 다음 영상을 이어 볼 수 있습니다.
              </p>
            </div>
            {user && SHOW_MUSIC_VIDEO_UPLOAD ? (
              <Button onClick={() => fileInputRef.current?.click()} className="gap-2 bg-teal-500 text-slate-950 hover:bg-teal-400">
                <UploadCloud className="h-4 w-4" />
                MP4 업로드
              </Button>
            ) : null}
          </div>
        </section>

        {user && SHOW_MUSIC_VIDEO_UPLOAD ? (
          <section className="border-b border-white/10 bg-slate-900/80 px-4 py-5">
            <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4"
                  className="hidden"
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                />
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="영상 제목"
                  className="border-white/10 bg-white text-slate-950"
                />
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="설명"
                  className="min-h-[84px] border-white/10 bg-white text-slate-950"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-2"
                    disabled={isUploading || createMutation.isPending}
                  >
                    <UploadCloud className="h-4 w-4" />
                    파일 선택
                  </Button>
                  <Button
                    type="button"
                    onClick={() => createMutation.mutate()}
                    disabled={!selectedFile || isUploading || createMutation.isPending}
                    className="gap-2 bg-teal-500 text-slate-950 hover:bg-teal-400"
                  >
                    {isUploading || createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    등록
                  </Button>
                  <span className="text-sm text-slate-300">
                    {selectedFile ? `${selectedFile.name} ${formatSize(selectedFile.size)}` : "선택된 MP4 파일 없음"}
                    {isUploading ? ` · ${progress}%` : ""}
                  </span>
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border border-white/10 bg-black">
                {previewUrl ? (
                  <video src={previewUrl} controls className="aspect-video w-full bg-black object-contain" />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-sm text-slate-500">미리보기</div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        <section className="mx-auto max-w-6xl px-4 py-6 md:py-8">
          {isLoading ? (
            <div className="flex h-52 items-center justify-center text-slate-300">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              불러오는 중
            </div>
          ) : videos.length === 0 ? (
            <div className="flex h-52 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300">
              등록된 뮤직비디오가 없습니다.
            </div>
          ) : (
            <>
              <div data-testid="music-video-desktop-grid" className="hidden gap-3 md:grid md:grid-cols-5">
                {videos.map((video) => (
                  <Card key={video.id} data-testid="music-video-card" className="overflow-hidden border-white/10 bg-white/5 text-white">
                    <CardContent className="p-0">
                      <video
                        src={video.videoUrl}
                        controls
                        preload="metadata"
                        data-music-video-id={video.id}
                        onPlay={(e) => handleVideoPlay(video.id, e.currentTarget)}
                        className="aspect-video w-full bg-black object-contain"
                      />
                      <div className="space-y-1 p-3">
                        <h2 className="line-clamp-1 text-sm font-semibold">{video.title}</h2>
                        <p data-testid="music-video-card-meta" className="line-clamp-1 text-xs text-slate-400">
                          <span className="text-slate-300">{video.creator.name}</span>
                          <span className="ml-1">{formatDate(video.createdAt)} {formatSize(video.fileSize)}</span>
                        </p>
                        <div className="pt-1">{renderActionRail(video)}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="fixed inset-0 z-40 bg-black md:hidden">
                <div
                  ref={mobileScrollerRef}
                  onScroll={handleMobileScroll}
                  data-testid="music-video-mobile-scroller"
                  className="h-dvh snap-y snap-mandatory overflow-y-auto overscroll-y-contain bg-black [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {videos.map((video) => (
                    <article
                      key={video.id}
                      data-music-video-slide
                      data-testid="music-video-mobile-slide"
                      className="relative h-dvh snap-start snap-always bg-black"
                    >
                      <video
                        src={video.videoUrl}
                        playsInline
                        preload="metadata"
                        data-music-video-id={video.id}
                        onPlay={(e) => handleVideoPlay(video.id, e.currentTarget)}
                        onPause={() => handleVideoPause(video.id)}
                        className="h-full w-full bg-black object-cover"
                      />
                      <button
                        type="button"
                        className="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchEnd={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          const videoEl = e.currentTarget.parentElement?.querySelector("video[data-music-video-id]") as HTMLVideoElement | null;
                          toggleMobileVideo(video.id, videoEl);
                        }}
                        aria-label={mobilePlayingId === video.id ? "일시정지" : "재생"}
                      >
                        {mobilePlayingId === video.id ? <Pause className="h-8 w-8 fill-white" /> : <Play className="ml-1 h-8 w-8 fill-white" />}
                      </button>
                      <div className="absolute right-3 top-[68%] z-10 -translate-y-1/2 pointer-events-auto">
                        {renderActionRail(video, true)}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </main>
      <Dialog
        open={Boolean(commentsVideo)}
        onOpenChange={(open) => {
          if (!open) {
            setCommentsVideo(null);
            setReplyToComment(null);
            setCommentText("");
          }
        }}
      >
        <DialogContent className="left-0 top-auto bottom-[calc(env(safe-area-inset-bottom)+56px)] z-[90] max-h-[62dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-t-2xl border-0 bg-white p-0 text-slate-950 shadow-2xl sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[88vh] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg">
          <DialogHeader className="border-b border-slate-200 px-4 py-3 text-left">
            <DialogTitle>댓글</DialogTitle>
          </DialogHeader>
          <div className="max-h-[calc(62dvh-148px)] space-y-3 overflow-y-auto bg-white px-4 py-3 pb-4 sm:max-h-[58vh]">
            {commentsLoading ? (
              <div className="flex items-center justify-center py-10 text-sm text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                불러오는 중
              </div>
            ) : comments.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">첫 댓글을 남겨보세요.</div>
            ) : (
              comments
                .filter((comment) => !comment.parentId)
                .map((comment) => {
                  const replies = comments.filter((reply) => reply.parentId === comment.id);
                  return (
                    <div key={comment.id} className="space-y-2">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs text-slate-500">
                          <span className="font-semibold text-slate-900">{comment.user.name}</span>
                          <span>{formatDate(comment.createdAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-slate-800">{comment.content}</p>
                        <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                          <button type="button" onClick={() => commentLikeMutation.mutate(comment)} className="inline-flex items-center gap-1 hover:text-rose-500">
                            <Heart className={comment.likedByMe ? "h-3.5 w-3.5 fill-rose-500 text-rose-500" : "h-3.5 w-3.5"} />
                            {(comment.likeCount ?? 0).toLocaleString()}
                          </button>
                          <button type="button" onClick={() => setReplyToComment(comment)} className="inline-flex items-center gap-1 hover:text-slate-900">
                            <Reply className="h-3.5 w-3.5" />
                            답글
                          </button>
                          {String(user?.id || "") === String(comment.user.id) ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm("댓글을 삭제할까요?")) deleteCommentMutation.mutate(comment);
                              }}
                              disabled={deleteCommentMutation.isPending}
                              className="inline-flex items-center gap-1 hover:text-red-600 disabled:opacity-60"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              삭제
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {replies.length > 0 ? (
                        <div className="ml-5 space-y-2 border-l border-slate-200 pl-3">
                          {replies.map((reply) => (
                            <div key={reply.id} className="rounded-lg bg-slate-50 p-3">
                              <div className="mb-1 flex items-center justify-between gap-3 text-xs text-slate-500">
                                <span className="font-semibold text-slate-900">{reply.user.name}</span>
                                <span>{formatDate(reply.createdAt)}</span>
                              </div>
                              <p className="whitespace-pre-wrap text-sm text-slate-800">{reply.content}</p>
                              <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                                <button type="button" onClick={() => commentLikeMutation.mutate(reply)} className="inline-flex items-center gap-1 hover:text-rose-500">
                                  <Heart className={reply.likedByMe ? "h-3.5 w-3.5 fill-rose-500 text-rose-500" : "h-3.5 w-3.5"} />
                                  {(reply.likeCount ?? 0).toLocaleString()}
                                </button>
                                {String(user?.id || "") === String(reply.user.id) ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (window.confirm("댓글을 삭제할까요?")) deleteCommentMutation.mutate(reply);
                                    }}
                                    disabled={deleteCommentMutation.isPending}
                                    className="inline-flex items-center gap-1 hover:text-red-600 disabled:opacity-60"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    삭제
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
            )}
          </div>
          <div className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-3">
            {replyToComment ? (
              <div className="mb-2 flex items-center justify-between rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
                <span>{replyToComment.user.name}님에게 답글 작성 중</span>
                <button type="button" onClick={() => setReplyToComment(null)} className="font-medium text-slate-900">취소</button>
              </div>
            ) : null}
            <div className="mb-2 flex items-center gap-2">
              <Smile className="h-4 w-4 text-slate-500" />
              {["😀","🔥","👏","❤️","🎵"].map((emoji) => (
                <button key={emoji} type="button" onClick={() => setCommentText((prev) => prev + emoji)} className="rounded-full bg-slate-100 px-2 py-1 text-sm hover:bg-slate-200">
                  {emoji}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={replyToComment ? "답글을 입력하세요" : "댓글을 입력하세요"}
                className="border-slate-200 bg-white text-slate-950"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && commentsVideo && commentText.trim()) {
                    commentMutation.mutate({ videoId: commentsVideo.id, content: commentText.trim(), parentId: replyToComment?.id ?? null });
                  }
                }}
              />
              <Button
                type="button"
                disabled={!commentsVideo || !commentText.trim() || commentMutation.isPending}
                onClick={() => {
                  if (!commentsVideo || !commentText.trim()) return;
                  commentMutation.mutate({ videoId: commentsVideo.id, content: commentText.trim(), parentId: replyToComment?.id ?? null });
                }}
              >
                {commentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "등록"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
