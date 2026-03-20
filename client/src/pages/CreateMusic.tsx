import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/PageTransition";
import { Music, Sparkles, Wand2, Loader2, Download, AlertCircle, Trash2, CloudUpload, Search, Play, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LOGIN_PATH } from "@/lib/site-paths";
import { useToast } from "@/hooks/use-toast";
import { usePlayerStore } from "@/components/AudioPlayer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

const POLL_INTERVAL_MS = 3000;
const AI_MUSIC_TASK_KEY = "ai_music_last_task";
const SAVED_TRACKS_KEY = "createMusic_savedTracks";

type TTranslate = (key: string, fallback?: string) => string;

function sanitizeFilename(name: string): string {
  const s = name.replace(/[/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return s || "audio";
}

function TrackCard({
  track,
  order,
  onRemove,
  onUpload,
  onDownload,
  onPlay,
  onPublish,
  isPublishing,
  isPublished,
  t,
}: {
  track: SavedTrack;
  order: number;
  onRemove: () => void;
  onUpload: () => void;
  onDownload: () => void;
  onPlay: () => void;
  onPublish: () => void;
  isPublishing: boolean;
  isPublished: boolean;
  t: TTranslate;
}) {
  const [showLyrics, setShowLyrics] = useState(false);
  const [showStyle, setShowStyle] = useState(false);
  const title = track.title || t("createMusic.untitled", "제목 없음");
  const isLyricsMode = track.custom_mode === true;
  const fullText = (isLyricsMode && track.original_prompt ? track.original_prompt : track.prompt || track.tags || "").trim();
  const styleDescription = (track.tags ?? "").trim() || (track.prompt ?? "").trim() || "";
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3 flex gap-3 items-start w-full">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground">
        {order}
      </span>
      {track.image_url && (
        <img src={track.image_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2 h-10">
          <div className="flex-1 min-w-0 h-10 flex flex-col justify-center pr-1 gap-0.5">
            <p className="text-xs font-medium truncate leading-none">{title}</p>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0 text-[11px] text-primary">
              <button
                type="button"
                onClick={() => setShowLyrics((v) => !v)}
                className="inline-flex items-center gap-0.5 hover:underline"
              >
                {showLyrics ? t("createMusic.hideLyrics", "가사 접기") : t("createMusic.lyricsLabel", "가사")}
              </button>
              {styleDescription && (
                <button
                  type="button"
                  onClick={() => setShowStyle((v) => !v)}
                  className="inline-flex items-center gap-0.5 hover:underline"
                >
                  {showStyle ? t("createMusic.hideStyle", "스타일 접기") : t("createMusic.styleLabel", "스타일")}
                </button>
              )}
              {track.audio_url && (
                <>
                  <button type="button" onClick={onPlay} className="inline-flex items-center gap-0.5 hover:underline" title={t("createMusic.play", "재생")}>
                    <Play className="w-3 h-3" />
                    {t("createMusic.play", "재생")}
                  </button>
                  <button type="button" onClick={onDownload} className="inline-flex items-center gap-0.5 hover:underline">
                    <Download className="w-3 h-3" />
                    {t("createMusic.download", "다운로드")}
                    {typeof track.downloadCount === "number" && track.downloadCount > 0 && (
                      <span className="text-[10px] text-muted-foreground ml-0.5">({track.downloadCount})</span>
                    )}
                  </button>
                  <button type="button" onClick={onUpload} className="inline-flex items-center gap-0.5 hover:underline">
                    <CloudUpload className="w-3 h-3" />
                    {t("createMusic.uploadThis", "업로드")}
                    {typeof track.uploadCount === "number" && track.uploadCount > 0 && (
                      <span className="text-[10px] text-muted-foreground ml-0.5">({track.uploadCount})</span>
                    )}
                  </button>
                  {isPublished ? (
                    <span className="inline-flex items-center gap-0.5 text-green-500 font-medium">
                      <Globe className="w-3 h-3" />
                      {t("createMusic.published", "공개됨")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={onPublish}
                      disabled={isPublishing}
                      className="inline-flex items-center gap-0.5 hover:underline text-violet-500 disabled:opacity-50"
                    >
                      {isPublishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
                      {t("createMusic.publishToSite", "신곡으로 공개")}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            title={t("createMusic.remove", "목록에서 삭제")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
        {(showLyrics || showStyle) && (
          <div className="mt-1 pt-2 border-t border-border/50 space-y-3">
            {showStyle && styleDescription && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">{t("createMusic.musicStyleLabel", "음악스타일")}</p>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-sans max-h-24 overflow-y-auto bg-muted/30 rounded p-2">
                  {styleDescription}
                </pre>
              </div>
            )}
            {showLyrics && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {isLyricsMode ? t("createMusic.lyricsLabel", "가사") : t("createMusic.descriptionEnteredLabel", "입력한 음악 설명")}
                </p>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-sans max-h-40 overflow-y-auto bg-muted/30 rounded p-2">
                  {fullText || t("createMusic.noLyricsOrDescription", "저장된 가사/설명이 없습니다.")}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type CreateMode = "custom" | "description";

type GeneratedTrack = {
  clip_id?: string;
  state?: string;
  title?: string;
  tags?: string;
  prompt?: string;
  /** 사용자가 입력한 가사(커스텀 모드). API가 수정할 수 있으므로 풀가사에는 이걸 우선 표시 */
  original_prompt?: string;
  audio_url?: string;
  image_url?: string;
  duration?: number;
  custom_mode?: boolean;
};

type SavedTrack = GeneratedTrack & {
  id: string;
  createdAt: number;
  uploadCount?: number;
  downloadCount?: number;
};

export default function CreateMusic() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: aiUsage } = useQuery<{ limit: number; usedThisMonth: number; isPaidTier: boolean }>({
    queryKey: ["/api/ai-music/usage"],
    enabled: !!user,
  });

  const [mode, setMode] = useState<CreateMode>("description");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "running" | "succeeded" | "failed">("idle");
  const [resultTracks, setResultTracks] = useState<GeneratedTrack[]>([]);
  const [savedTracks, setSavedTracks] = useState<SavedTrack[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [taskProvider, setTaskProvider] = useState<string | null>(null);
  const [savedTracksSearch, setSavedTracksSearch] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);
  const generationStartRef = useRef<number | null>(null);
  const submitModeRef = useRef<CreateMode>("description");
  const submittedLyricsRef = useRef<string>("");
  const submittedTitleRef = useRef<string>("");
  const submittedTagsRef = useRef<string>("");

  const totalUploads = useMemo(
    () => savedTracks.reduce((sum, t) => sum + (t.uploadCount ?? 0), 0),
    [savedTracks]
  );
  const totalDownloads = useMemo(
    () => savedTracks.reduce((sum, t) => sum + (t.downloadCount ?? 0), 0),
    [savedTracks]
  );

  useEffect(() => {
    if (status !== "pending" && status !== "running") return;
    const t = setInterval(() => {
      const start = generationStartRef.current;
      if (start) setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [status]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_TRACKS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      const arr = Array.isArray(parsed)
        ? parsed
        : (parsed && typeof parsed === "object" && Array.isArray((parsed as { data?: unknown[] }).data))
          ? (parsed as { data: unknown[] }).data
          : (parsed && typeof parsed === "object" && Array.isArray((parsed as { tracks?: unknown[] }).tracks))
            ? (parsed as { tracks: unknown[] }).tracks
            : [];
      if (arr.length === 0) return;
      const normalized: SavedTrack[] = arr.map((item: unknown, i: number) => {
        const t = item as Record<string, unknown>;
        const id = typeof t.id === "string" ? t.id : `saved-${Date.now()}-${i}-${t.clip_id ?? t.id ?? i}`;
        const createdAt = typeof t.createdAt === "number" ? t.createdAt : (typeof t.created_at === "number" ? t.created_at : Date.now());
        const uploadCount = typeof t.uploadCount === "number" ? t.uploadCount : 0;
        const downloadCount = typeof t.downloadCount === "number" ? t.downloadCount : 0;
        return {
          ...(item as object),
          id,
          createdAt,
          uploadCount,
          downloadCount,
          audio_url: (t.audio_url ?? t.audioUrl) as string | undefined,
          image_url: (t.image_url ?? t.imageUrl) as string | undefined,
          clip_id: t.clip_id ?? t.id,
          title: t.title,
          tags: t.tags,
          prompt: t.prompt,
          original_prompt: t.original_prompt ?? t.prompt,
          custom_mode: Boolean(t.custom_mode),
        } as SavedTrack;
      });
      setSavedTracks(normalized);
    } catch {
      // 손상된 데이터면 무시 (기존 목록 유지 불가)
    }
  }, []);

  const persistTracks = useCallback((tracks: SavedTrack[]) => {
    try {
      const toPersist = tracks.map((t) => ({
        id: t.id,
        createdAt: t.createdAt,
        clip_id: t.clip_id,
        audio_url: t.audio_url,
        image_url: t.image_url,
        title: t.title,
        tags: t.tags,
        prompt: t.prompt,
        original_prompt: t.original_prompt,
        custom_mode: t.custom_mode,
      }));
      localStorage.setItem(SAVED_TRACKS_KEY, JSON.stringify(toPersist));
    } catch {}
  }, []);

  const removeSavedTrack = useCallback(
    (id: string) => {
      setSavedTracks((prev) => {
        const next = prev.filter((t) => t.id !== id);
        persistTracks(next);
        return next;
      });
    },
    [persistTracks]
  );

  // ── 신곡 공개 ──
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishedIds, setPublishedIds] = useState<Set<string>>(new Set());
  const [publishConfirmTrack, setPublishConfirmTrack] = useState<SavedTrack | null>(null);

  const handlePublishTrack = useCallback(async (track: SavedTrack) => {
    if (!track.audio_url) return;
    setPublishingId(track.id);
    try {
      const res = await fetch("/api/ai-music/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          audioUrl: track.audio_url,
          imageUrl: track.image_url,
          title: track.title,
          tags: track.tags,
          prompt: track.original_prompt ?? track.prompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "공개 실패",
          description: data.message || "오류가 발생했습니다.",
          variant: "destructive",
        });
        return;
      }
      setPublishedIds((prev) => new Set([...prev, track.id]));
      toast({
        title: "신곡으로 공개되었습니다!",
        description: `"${track.title || "AI 생성 음악"}"이(가) 사이트에 공개되었습니다. AI 생성 배지가 표시됩니다.`,
      });
    } catch {
      toast({ title: "공개 실패", description: "네트워크 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setPublishingId(null);
    }
  }, [toast]);

  const goUploadWithTrack = useCallback(
    (track: SavedTrack) => {
      try {
        if (track.image_url) sessionStorage.setItem("createMusic_uploadCoverUrl", track.image_url);
        if (track.title) sessionStorage.setItem("createMusic_uploadTitle", track.title);
        if (track.audio_url) sessionStorage.setItem("createMusic_uploadAudioUrl", track.audio_url);
        const lyricsText = (track.original_prompt ?? track.prompt ?? "").trim();
        if (lyricsText) sessionStorage.setItem("createMusic_uploadLyrics", lyricsText);
      } catch {}
      // 업로드 횟수 카운트
      setSavedTracks((prev) => {
        const next = prev.map((t) =>
          t.id === track.id ? { ...t, uploadCount: (t.uploadCount ?? 0) + 1 } : t
        );
        persistTracks(next);
        return next;
      });
      setLocation("/upload");
    },
    [setLocation, persistTracks]
  );

  const playTrackInGlobalPlayer = useCallback((track: SavedTrack) => {
    if (!track.audio_url) return;
    usePlayerStore.getState().playExternalTrack({
      url: track.audio_url,
      title: track.title || "제목 없음",
      artist: track.tags,
      imageUrl: track.image_url,
    });
  }, []);

  const handleDownloadTrack = useCallback(async (track: SavedTrack) => {
    if (!track.audio_url) return;
    const baseName = sanitizeFilename(track.title || "제목 없음");
    try {
      const proxyUrl = `/api/ai-music/audio-proxy?url=${encodeURIComponent(track.audio_url)}`;
      const res = await fetch(proxyUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const type = blob.type || "audio/mpeg";
      const ext = type.includes("ogg") ? ".ogg" : type.includes("wav") ? ".wav" : ".mp3";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      const a = document.createElement("a");
      a.href = track.audio_url;
      a.download = `${baseName}.mp3`;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    }
    // 다운로드 횟수 카운트
    setSavedTracks((prev) => {
      const next = prev.map((t) =>
        t.id === track.id ? { ...t, downloadCount: (t.downloadCount ?? 0) + 1 } : t
      );
      persistTracks(next);
      return next;
    });
  }, []);

  const pollTask = useCallback(
    async (tid: string, provider?: string) => {
      const q = provider ? `?provider=${encodeURIComponent(provider)}` : "";
      const res = await fetch(`/api/ai-music/task/${tid}${q}`, { credentials: "include" });
      if (!res.ok) {
        setStatus("failed");
        setErrorMessage("작업 조회에 실패했습니다.");
        return;
      }
      const data = await res.json();
      const state = data.state ?? "pending";
      setStatus(state);
      if (state === "succeeded" && Array.isArray(data.data)) {
        generationStartRef.current = null;
        setResultTracks(data.data);
        setTaskId(null);
        const now = Date.now();
        const userTitle = submittedTitleRef.current.trim();
        const userTags = submittedTagsRef.current.trim();
        const toSave: SavedTrack[] = (data.data as GeneratedTrack[]).map((tr, i) => {
          const t = tr as Record<string, unknown>;
          return {
            ...tr,
            title: userTitle ? userTitle : (tr.title ?? (t.title as string | undefined)),
            tags: userTags ? userTags : (tr.tags ?? (t.tags as string | undefined)),
            audio_url: (tr.audio_url ?? t.audioUrl) as string | undefined,
            image_url: (tr.image_url ?? t.imageUrl) as string | undefined,
            id: `saved-${now}-${i}-${tr.clip_id ?? i}`,
            createdAt: now,
            custom_mode: tr.custom_mode ?? (submitModeRef.current === "custom"),
            original_prompt: submitModeRef.current === "custom" ? submittedLyricsRef.current : undefined,
            uploadCount: 0,
            downloadCount: 0,
          };
        });
        setSavedTracks((prev) => {
          const next = [...toSave, ...prev];
          persistTracks(next);
          return next;
        });
      }
      if (state === "failed") {
        generationStartRef.current = null;
        setErrorMessage(data.message ?? "생성에 실패했습니다.");
        setTaskId(null);
      }
      if (state === "pending" || state === "running") {
        setTimeout(() => pollTask(tid, provider), POLL_INTERVAL_MS);
      }
    },
    [persistTracks]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const customMode = mode === "custom";
    const promptTrim = prompt.trim();
    if (customMode && !promptTrim) {
      toast({ title: "가사를 입력해 주세요.", variant: "destructive" });
      return;
    }
    if (!customMode && !promptTrim) {
      toast({ title: "음악에 대한 설명을 입력해 주세요.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setResultTracks([]);
    setStatus("pending");
    setElapsedSec(0);
    generationStartRef.current = Date.now();
    submitModeRef.current = mode;
    if (mode === "custom") submittedLyricsRef.current = promptTrim;
    submittedTitleRef.current = title.trim();
    submittedTagsRef.current = tags.trim();
    try {
      const body: Record<string, unknown> = {
        custom_mode: customMode,
        mv: "sonic-v4-5",
        title: title.trim() || undefined,
        tags: tags.trim() || undefined,
      };
      if (customMode) body.prompt = promptTrim;
      else body.gpt_description_prompt = promptTrim;

      const res = await fetch("/api/ai-music/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("failed");
        setErrorMessage(data.message ?? "생성 요청에 실패했습니다.");
        if (res.status === 403 && (data as { code?: string }).code === "AI_MUSIC_LIMIT_REACHED") {
          toast({ title: data.message, variant: "destructive" });
          queryClient.invalidateQueries({ queryKey: ["/api/ai-music/usage"] });
        }
        return;
      }
      const tid = data.task_id;
      const provider = data.provider ?? undefined;
      if (!tid) {
        setStatus("failed");
        setErrorMessage("서버 응답 오류.");
        return;
      }
      setTaskId(tid);
      setTaskProvider(provider ?? null);
      queryClient.invalidateQueries({ queryKey: ["/api/ai-music/usage"] });
      try {
        sessionStorage.setItem(AI_MUSIC_TASK_KEY, JSON.stringify({ task_id: tid, provider }));
      } catch {}
      pollTask(tid, provider);
    } catch {
      setStatus("failed");
      setErrorMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />

        <section className="relative overflow-hidden py-12 px-4">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-background to-pink-900/20 pointer-events-none" />
          <div className="container max-w-[1600px] mx-auto relative z-10 px-4 md:px-6">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm mb-4">
                <Sparkles className="w-4 h-4" />
                {t("createMusic.badge", "AI 음악 생성")}
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">
                {t("createMusic.heroTitle1", "프롬프트로")}{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                  {t("createMusic.heroTitle2", "나만의 음악")}
                </span>{" "}
                {t("createMusic.heroTitle3", "만들기")}
              </h1>
              <p className="text-muted-foreground">
                {t("createMusic.heroDesc", "가사나 스타일을 입력하면 AI가 음악을 생성합니다. 생성된 곡은 재생·다운로드 후 업로드하여 공유할 수 있습니다.")}
              </p>
            </div>

            {!authLoading && !user && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center max-w-xl mx-auto">
                <p className="text-amber-200 mb-4">{t("createMusic.loginRequired", "로그인 후 음악 생성을 이용할 수 있습니다.")}</p>
                <Link href={LOGIN_PATH}>
                  <Button className="rounded-full">{t("nav.login", "로그인")}</Button>
                </Link>
              </div>
            )}

            {user && (
              <>
                {aiUsage && aiUsage.limit > 0 && (
                  <p className="text-center text-sm text-muted-foreground mb-2">
                    {t("createMusic.usageThisMonth", "이번 달")} {aiUsage.usedThisMonth}/{aiUsage.limit}
                    {aiUsage.limit <= 10 ? t("createMusic.usageSongs", "곡 생성") : t("createMusic.usageCredits", " 크레딧")}
                    {aiUsage.usedThisMonth >= aiUsage.limit && (
                      <Link href="/pricing" className="ml-1 text-primary hover:underline">
                        {aiUsage.isPaidTier ? t("createMusic.upgradePlan", "플랜 업그레이드") : t("createMusic.upgradeToUnlimited", "Pro로 업그레이드")}
                      </Link>
                    )}
                  </p>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,1fr),minmax(480px,1.5fr)] gap-8 lg:gap-10 items-start w-full">
                  {/* 왼쪽: 생성 폼 */}
                  <div className="flex flex-col items-start">
                    <form onSubmit={handleSubmit} className="rounded-2xl border border-border/60 bg-muted/20 p-6 md:p-8 w-full max-w-xl space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">{t("createMusic.modeLabel", "생성 방식")}</label>
                        <div className="flex gap-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="mode" checked={mode === "description"} onChange={() => setMode("description")} className="rounded-full" />
                            <span>{t("createMusic.modeDescription", "설명으로 생성")}</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="mode" checked={mode === "custom"} onChange={() => setMode("custom")} className="rounded-full" />
                            <span>{t("createMusic.modeCustom", "가사 직접 입력")}</span>
                          </label>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">{t("createMusic.titleLabel", "제목 (선택)")}</label>
                        <input
                          type="text"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="w-full rounded-lg bg-background/80 border border-border px-4 py-2"
                          placeholder={t("createMusic.titlePlaceholder", "예: Starry Night")}
                          maxLength={80}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">{t("createMusic.styleLabel", "음악스타일 작성")}</label>
                        <input
                          type="text"
                          value={tags}
                          onChange={(e) => setTags(e.target.value)}
                          className="w-full rounded-lg bg-background/80 border border-border px-4 py-2"
                          placeholder={t("createMusic.stylePlaceholder", "예: K-ballad, 남성 보컬, 피아노와 스트링")}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          {mode === "custom" ? t("createMusic.promptLabel", "가사 (필수)") : t("createMusic.lyricsInputLabel", "가사입력 (가사가 있는 곡은 가사를 입력하세요)")}
                        </label>
                        <textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          className="w-full rounded-lg bg-background/80 border border-border px-4 py-3 min-h-[120px] resize-y"
                          placeholder={
                            mode === "custom"
                              ? t("createMusic.promptPlaceholder", "[Verse]\n가사 입력...\n\n[Chorus]\n후렴구...")
                              : t("createMusic.lyricsInputPlaceholder", "가사가 있으면 가사를 입력하고, 없으면 원하는 분위기나 설명을 입력하세요.")
                          }
                          required
                        />
                        {mode === "custom" && (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {t("createMusic.lyricsHint", "입력한 가사는 그대로 전달됩니다. [Verse], [Chorus] 등 구조를 쓰면 반영이 좋습니다. 실제 노래는 AI 서비스에 따라 다를 수 있습니다.")}
                          </p>
                        )}
                      </div>
                      <Button type="submit" disabled={isSubmitting || status === "pending" || status === "running"} className="w-full rounded-full gap-2" size="lg">
                        {(status === "pending" || status === "running") && <Loader2 className="w-5 h-5 animate-spin" />}
                        {status === "pending" || status === "running"
                          ? (() => {
                              const m = Math.floor(elapsedSec / 60);
                              const s = elapsedSec % 60;
                              const elapsed = m > 0 ? `${m}분 ${s}초` : `${s}초`;
                              return t("createMusic.generatingElapsed", "생성 중... (경과 %s)", elapsed)?.replace("%s", elapsed) || `생성 중... (경과 ${elapsed})`;
                            })()
                          : t("createMusic.submit", "음악 생성하기")}
                      </Button>
                    </form>

                    {status === "failed" && errorMessage && (
                      <div className="mt-4 w-full max-w-xl rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-red-200">{t("createMusic.failed", "생성 실패")}</p>
                          <p className="text-sm text-red-200/80">{errorMessage}</p>
                        </div>
                      </div>
                    )}

                    <div className="mt-6 flex flex-wrap gap-3">
                      <Link href="/suno-guide">
                        <Button variant="outline" className="rounded-full gap-2">
                          <Wand2 className="w-4 h-4" />
                          {t("createMusic.guideCta", "음악 만들기 가이드")}
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {/* 오른쪽: 생성된 곡 목록 (저장됨, 삭제할 때까지 유지) */}
                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 md:p-6 lg:min-h-[320px] min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <h2 className="text-lg font-bold">
                        {t("createMusic.resultsTitle", "생성된 곡")} ({savedTracks.length})
                      </h2>
                      {savedTracks.length > 0 && (totalUploads > 0 || totalDownloads > 0) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          {totalDownloads > 0 && (
                            <span>
                              {t("createMusic.download", "다운로드")}: {totalDownloads}
                            </span>
                          )}
                          {totalUploads > 0 && (
                            <span>
                              {t("createMusic.uploadThis", "업로드")}: {totalUploads}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {savedTracks.length > 0 && (
                      <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          value={savedTracksSearch}
                          onChange={(e) => setSavedTracksSearch(e.target.value)}
                          placeholder={t("createMusic.searchPlaceholder", "제목·스타일·가사로 검색")}
                          className="w-full rounded-lg bg-background/80 border border-border pl-9 pr-3 py-2 text-sm"
                        />
                      </div>
                    )}
                    {(status === "pending" || status === "running") && (() => {
                        const m = Math.floor(elapsedSec / 60);
                        const s = elapsedSec % 60;
                        const elapsed = m > 0 ? `${m}분 ${s}초` : `${s}초`;
                        return (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-4">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t("createMusic.generatingElapsed", "생성 중... (경과 %s)", elapsed)?.replace("%s", elapsed) || `생성 중... (경과 ${elapsed})`}
                      </div>
                        );
                      })()}
                    {savedTracks.length === 0 && status !== "pending" && status !== "running" ? (
                      <p className="text-muted-foreground text-sm">{t("createMusic.noTracksYet", "아직 생성된 곡이 없습니다. 왼쪽에서 음악을 생성해 보세요.")}</p>
                    ) : (() => {
                      const q = savedTracksSearch.trim().toLowerCase();
                      const filtered =
                        q === ""
                          ? [...savedTracks].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
                          : [...savedTracks]
                              .filter(
                                (t) =>
                                  (t.title ?? "").toLowerCase().includes(q) ||
                                  (t.tags ?? "").toLowerCase().includes(q) ||
                                  (t.prompt ?? "").toLowerCase().includes(q) ||
                                  (t.original_prompt ?? "").toLowerCase().includes(q)
                              )
                              .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
                      if (filtered.length === 0) {
                        return (
                          <p className="text-muted-foreground text-sm">
                            {t("createMusic.noSearchResults", "검색 결과가 없습니다.")}
                          </p>
                        );
                      }
                      return (
                        <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1 scrollbar-thin">
                          {filtered.map((track, index) => (
                            <TrackCard
                              key={track.id}
                              track={track}
                              order={index + 1}
                              onRemove={() => removeSavedTrack(track.id)}
                              onUpload={() => goUploadWithTrack(track)}
                              onDownload={() => handleDownloadTrack(track)}
                              onPlay={() => playTrackInGlobalPlayer(track)}
                              onPublish={() => setPublishConfirmTrack(track)}
                              isPublishing={publishingId === track.id}
                              isPublished={publishedIds.has(track.id)}
                              t={t as TTranslate}
                            />
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        <Footer />
      </div>

      {/* 신곡 공개 동의 다이얼로그 */}
      <Dialog open={!!publishConfirmTrack} onOpenChange={(open) => { if (!open) setPublishConfirmTrack(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-violet-500" />
              신곡으로 사이트에 공개
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <span className="font-semibold text-foreground">"{publishConfirmTrack?.title || "AI 생성 음악"}"</span>을(를)
                  베니사운드 신곡 목록에 공개합니다.
                </p>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs space-y-1.5">
                  <p className="font-semibold text-amber-700 dark:text-amber-400">공개 전 확인해주세요</p>
                  <ul className="list-disc list-inside space-y-1 text-amber-700 dark:text-amber-500">
                    <li>AI 생성 배지가 자동으로 표시됩니다</li>
                    <li>무료 플랜은 AI 공개곡 1곡으로 제한됩니다</li>
                    <li>수익화(유료 다운로드)는 Pro 플랜에서만 허용됩니다</li>
                    <li>Venysound 이용약관 및 저작권법을 준수해야 합니다</li>
                    <li>부적절한 내용은 관리자에 의해 삭제될 수 있습니다</li>
                  </ul>
                </div>
                <p className="text-xs">
                  위 내용에 동의하고 신곡으로 공개하시겠습니까?
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPublishConfirmTrack(null)}>
              취소
            </Button>
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white"
              disabled={publishingId === publishConfirmTrack?.id}
              onClick={() => {
                if (publishConfirmTrack) {
                  handlePublishTrack(publishConfirmTrack);
                  setPublishConfirmTrack(null);
                }
              }}
            >
              {publishingId === publishConfirmTrack?.id ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-1" />공개 중...</>
              ) : (
                <><Globe className="w-4 h-4 mr-1" />동의하고 공개</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
