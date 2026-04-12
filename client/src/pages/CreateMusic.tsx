import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/PageTransition";
import {
  Music,
  Sparkles,
  Wand2,
  Loader2,
  Download,
  AlertCircle,
  Trash2,
  CloudUpload,
  Search,
  Play,
  Globe,
  Coins,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LOGIN_PATH } from "@/lib/site-paths";
import { cn } from "@/lib/utils";
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
import { Checkbox } from "@/components/ui/checkbox";

/** 생성된 곡 목록 페이지당 개수 */
const SAVED_TRACKS_LIST_PAGE_SIZE = 6;

/** 장르 칩 → API/스타일 문자열(영문 위주로 모델에 전달) */
const GENRE_PRESET_IDS = [
  "kpop",
  "rnb",
  "rock",
  "hiphop",
  "jazz",
  "classical",
  "edm",
  "ballad",
  "indie",
  "folk",
  "trot",
  "ost",
  "metal",
  "reggae",
  "soul",
  "latin",
  "ambient",
  "gospel",
  "worship_praise",
  "pop_ballad",
  "world_music",
  "cafe_music",
] as const;
type GenrePresetId = (typeof GENRE_PRESET_IDS)[number];

const GENRE_API_TOKEN: Record<GenrePresetId, string> = {
  kpop: "K-pop",
  rnb: "R&B",
  rock: "Rock",
  hiphop: "Hip-hop",
  jazz: "Jazz",
  classical: "Classical",
  edm: "EDM",
  ballad: "Ballad",
  indie: "Indie",
  folk: "Folk / acoustic",
  trot: "Trot",
  ost: "TV / film soundtrack",
  metal: "Metal",
  reggae: "Reggae",
  soul: "Soul",
  latin: "Latin",
  ambient: "Ambient",
  gospel: "Gospel",
  worship_praise: "Christian worship / hymn",
  pop_ballad: "Pop ballad",
  world_music: "World music",
  cafe_music: "Cafe-style mellow acoustic",
};

/** 동시에 고를 수 있는 장르 프리셋 개수(늘리려면 상수만 올리면 됨) */
const MAX_GENRE_PRESETS = 6;

/** 스타일 칩 → API 문자열 */
const STYLE_PRESET_IDS = [
  "male_vocal",
  "female_vocal",
  "duet",
  "piano",
  "acoustic_guitar",
  "electric_guitar",
  "strings",
  "synth",
  "drums_808",
  "bass",
  "slow_tempo",
  "upbeat",
  "orchestral",
  "brass",
  "lo_fi",
  "emotional",
  "chant",
  "harp",
] as const;
type StylePresetId = (typeof STYLE_PRESET_IDS)[number];

const STYLE_API_TOKEN: Record<StylePresetId, string> = {
  male_vocal: "male vocal",
  female_vocal: "female vocal",
  duet: "duet vocals",
  piano: "piano",
  acoustic_guitar: "acoustic guitar",
  electric_guitar: "electric guitar",
  strings: "strings",
  synth: "synth",
  drums_808: "808 drums",
  bass: "prominent bass",
  slow_tempo: "slow tempo",
  upbeat: "upbeat",
  orchestral: "orchestral arrangement",
  brass: "brass section",
  lo_fi: "lo-fi texture",
  emotional: "emotional delivery",
  chant: "chant / choir layers",
  harp: "harp",
};

/** 동시에 고를 수 있는 스타일 프리셋 개수 */
const MAX_STYLE_PRESETS = 6;

/** 장르 블록 + 스타일 블록(각 칩·직접입력)을 서버 `tags` 한 줄로 합침 */
function buildTagsForApi(
  genreIds: GenrePresetId[],
  genreOther: string,
  styleIds: StylePresetId[],
  styleOther: string,
): string {
  const genreFromPresets = genreIds.map((id) => GENRE_API_TOKEN[id]).filter(Boolean);
  const go = genreOther.trim();
  const g = [...genreFromPresets, go].filter(Boolean).join(", ");

  const styleFromPresets = styleIds.map((id) => STYLE_API_TOKEN[id]).filter(Boolean);
  const so = styleOther.trim();
  const s = [...styleFromPresets, so].filter(Boolean).join(", ");

  if (g && s) return `${g} · ${s}`;
  return g || s;
}

/** 외부 AI가 끝난 뒤 화면에 반영되기까지의 지연을 줄이기 위한 폴링 (생성 자체 속도는 API 한계) */
function nextAiMusicPollMs(apiState: string): number {
  if (apiState === "running") return 1500;
  return 2200;
}
/** 로컬 캐시 키(계정별). 서버 `GET/PUT /api/ai-music/library`와 병합해 PC·모바일 동기화. */
/** React Query 키에 userId 포함 — 키를 공유하면 계정 전환 시 타인 라이브러리 캐시가 섞일 수 있음 */
function aiMusicLibraryQueryKey(userId: string | undefined) {
  return ["/api/ai-music/library", userId ?? "__none__"] as const;
}

function savedTracksStorageKey(userId: string): string {
  return `createMusic_savedTracks:${userId}`;
}

function lastAiMusicTaskSessionKey(userId: string): string {
  return `ai_music_last_task:${userId}`;
}

type TTranslate = (key: string, fallback?: string) => string;

function sanitizeFilename(name: string): string {
  const s = name.replace(/[/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return s || "audio";
}

function isLikelyBadAiMusicAudioUrl(u: string): boolean {
  const s = u.trim();
  if (s.length < 12) return true;
  if (/\/None\.(mp3|wav|ogg)/i.test(s)) return true;
  if (/undefined|null/i.test(s)) return true;
  return false;
}

/** 서버 pickRemoteClipAudioUrl 과 동일 우선순위 — 임시 stream·깨진 audioUrl 로 한 곡만 나중에 무음 되는 경우 완화 */
function pickSavedTrackAudioUrl(t: Record<string, unknown>): string | undefined {
  const keys = [
    "source_audio_url",
    "source_stream_audio_url",
    "audio_url",
    "audioUrl",
    "stream_audio_url",
    "streamAudioUrl",
  ] as const;
  for (const k of keys) {
    const v = t[k];
    if (typeof v === "string") {
      const s = v.trim();
      if (s && !isLikelyBadAiMusicAudioUrl(s)) return s;
    }
  }
  for (const k of ["stream_audio_url", "streamAudioUrl", "audio_url", "audioUrl"] as const) {
    const v = t[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function TrackCard({
  track,
  order,
  onRemove,
  onUpload,
  onDownload,
  onScoreExport,
  scoreExportLoading,
  scorePdfEnabled,
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
  onScoreExport: (format: "pdf" | "musicxml" | "zip") => void;
  scoreExportLoading: boolean;
  scorePdfEnabled: boolean;
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
  const hasDownloaded = (track.downloadCount ?? 0) > 0;
  const hasUploaded = (track.uploadCount ?? 0) > 0;
  const doneActionClass = "text-emerald-600 dark:text-emerald-400 font-medium";
  /** 다크 배경에서 primary보다 대비가 좋은 액션 색(시안 계열) */
  const actionLinkClass =
    "text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors";
  const publishLinkClass =
    "text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors";
  const countBadgeClass =
    "inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold tabular-nums leading-none";
  return (
    <div className="rounded-xl border border-border/80 bg-muted/25 shadow-sm p-3 flex gap-3 items-start w-full">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground">
        {order}
      </span>
      {track.image_url && (
        <img src={track.image_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 flex flex-col gap-1 pr-1">
            <p className="text-xs font-medium truncate leading-none">{title}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <button
                type="button"
                onClick={() => setShowLyrics((v) => !v)}
                className={`inline-flex items-center gap-0.5 hover:underline ${actionLinkClass}`}
              >
                {showLyrics ? t("createMusic.hideLyrics", "가사 접기") : t("createMusic.lyricsLabel", "가사")}
              </button>
              {styleDescription && (
                <button
                  type="button"
                  onClick={() => setShowStyle((v) => !v)}
                  className={`inline-flex items-center gap-0.5 hover:underline ${actionLinkClass}`}
                >
                  {showStyle ? t("createMusic.hideStyle", "스타일 접기") : t("createMusic.styleLabel", "스타일")}
                </button>
              )}
              {track.audio_url && (
                <>
                  <button
                    type="button"
                    onClick={onPlay}
                    className={`inline-flex items-center gap-0.5 hover:underline ${actionLinkClass}`}
                    title={t("createMusic.play", "재생")}
                  >
                    <Play className="w-3 h-3" />
                    {t("createMusic.play", "재생")}
                  </button>
                  <button
                    type="button"
                    onClick={onDownload}
                    className={`inline-flex items-center gap-1 hover:underline ${hasDownloaded ? doneActionClass : actionLinkClass}`}
                  >
                    <Download className="w-3 h-3 flex-shrink-0" />
                    {t("createMusic.download", "다운로드")}
                    {typeof track.downloadCount === "number" && track.downloadCount > 0 && (
                      <span className={countBadgeClass}>{track.downloadCount}</span>
                    )}
                  </button>
                  {scorePdfEnabled && (
                    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="inline-flex items-center gap-0.5 text-cyan-600 dark:text-cyan-400 shrink-0" aria-hidden>
                        <FileText className="w-3 h-3" />
                        <span className="text-[11px] font-medium">{t("createMusic.scoreLabel", "악보")}</span>
                      </span>
                      <span className="text-muted-foreground/60 text-[10px] select-none" aria-hidden>
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => onScoreExport("pdf")}
                        disabled={scoreExportLoading}
                        title={t("createMusic.scorePdfTitle", "보기·인쇄용 PDF (자동 전사 초안)")}
                        className={`inline-flex items-center gap-0.5 hover:underline disabled:opacity-50 ${actionLinkClass}`}
                      >
                        {scoreExportLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : null}
                        {t("createMusic.scoreFormatPdf", "PDF")}
                      </button>
                      <span className="text-muted-foreground/60 text-[10px] select-none" aria-hidden>
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => onScoreExport("musicxml")}
                        disabled={scoreExportLoading}
                        title={t(
                          "createMusic.scoreMusicxmlTitle",
                          "MuseScore 등에서 열어 수정할 수 있는 파일",
                        )}
                        className={`inline-flex items-center gap-0.5 hover:underline disabled:opacity-50 ${actionLinkClass}`}
                      >
                        {t("createMusic.scoreMusicxml", "MusicXML")}
                      </button>
                      <span className="text-muted-foreground/60 text-[10px] select-none" aria-hidden>
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => onScoreExport("zip")}
                        disabled={scoreExportLoading}
                        title={t("createMusic.scoreZipTitle", "PDF와 MusicXML을 ZIP으로 한 번에")}
                        className={`inline-flex items-center gap-0.5 hover:underline disabled:opacity-50 ${actionLinkClass}`}
                      >
                        {t("createMusic.scoreZip", "PDF+XML")}
                      </button>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={onUpload}
                    className={`inline-flex items-center gap-1 hover:underline ${hasUploaded ? doneActionClass : actionLinkClass}`}
                  >
                    <CloudUpload className="w-3 h-3 flex-shrink-0" />
                    {t("createMusic.uploadThis", "업로드")}
                    {typeof track.uploadCount === "number" && track.uploadCount > 0 && (
                      <span className={countBadgeClass}>{track.uploadCount}</span>
                    )}
                  </button>
                  {isPublished ? (
                    <span className={`inline-flex items-center gap-1 ${doneActionClass}`}>
                      <Globe className="w-3 h-3 flex-shrink-0" />
                      {t("createMusic.published", "공개됨")}
                      <span className={countBadgeClass} title={t("createMusic.published", "공개됨")}>
                        1
                      </span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={onPublish}
                      disabled={isPublishing}
                      className={`inline-flex items-center gap-0.5 hover:underline disabled:opacity-50 ${publishLinkClass}`}
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
  /** 사이트에 신곡 공개 완료 여부 (localStorage 유지) */
  publishedToSite?: boolean;
  /** 생성 요청 task_id — 공개 시 관리자 로그와 연결 */
  generationTaskId?: string;
  generationProvider?: string;
};

function parseLocalStorageRawToArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { data?: unknown[] }).data)) {
    return (parsed as { data: unknown[] }).data;
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { tracks?: unknown[] }).tracks)) {
    return (parsed as { tracks: unknown[] }).tracks;
  }
  return [];
}

function normalizeRawToSavedTracks(arr: unknown[]): SavedTrack[] {
  if (!arr.length) return [];
  return arr.map((item: unknown, i: number) => {
    const t = item as Record<string, unknown>;
    const id = typeof t.id === "string" ? t.id : `saved-${Date.now()}-${i}-${t.clip_id ?? t.id ?? i}`;
    const createdAt =
      typeof t.createdAt === "number" ? t.createdAt : typeof t.created_at === "number" ? t.created_at : Date.now();
    const uploadCount = typeof t.uploadCount === "number" ? t.uploadCount : 0;
    const downloadCount = typeof t.downloadCount === "number" ? t.downloadCount : 0;
    return {
      ...(item as object),
      id,
      createdAt,
      uploadCount,
      downloadCount,
      generationTaskId: typeof t.generationTaskId === "string" ? t.generationTaskId : undefined,
      generationProvider: typeof t.generationProvider === "string" ? t.generationProvider : undefined,
      audio_url: pickSavedTrackAudioUrl(t),
      image_url: (t.image_url ?? t.imageUrl ?? t.image_large_url ?? t.imageLargeUrl) as string | undefined,
      clip_id: t.clip_id ?? t.id,
      title: t.title as string | undefined,
      tags: t.tags as string | undefined,
      prompt: t.prompt as string | undefined,
      original_prompt: (t.original_prompt ?? t.prompt) as string | undefined,
      custom_mode: Boolean(t.custom_mode),
      publishedToSite: Boolean(t.publishedToSite ?? t.published_to_site),
    } as SavedTrack;
  });
}

function loadSavedTracksFromLocalStorage(userId: string): SavedTrack[] {
  try {
    const raw = localStorage.getItem(savedTracksStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return normalizeRawToSavedTracks(parseLocalStorageRawToArray(parsed));
  } catch {
    return [];
  }
}

function preferNonEmptyMediaUrl(serverVal?: string, localVal?: string): string | undefined {
  const s = (serverVal ?? "").trim();
  if (s) return serverVal;
  const l = (localVal ?? "").trim();
  if (l) return localVal;
  return serverVal ?? localVal;
}

/** 서버·로컬 합집합 — 메타는 서버 우선, URL은 보완. 공개·다운로드·업로드 카운트는 로컬/서버 중 더 진행된 값 유지 */
function mergeAiMusicLibrary(server: SavedTrack[], local: SavedTrack[]): SavedTrack[] {
  const byId = new Map<string, SavedTrack>();
  for (const t of server) {
    if (t.id) byId.set(t.id, { ...t });
  }
  for (const t of local) {
    if (!t.id) continue;
    const existing = byId.get(t.id);
    if (!existing) {
      byId.set(t.id, t);
    } else {
      byId.set(t.id, {
        ...existing,
        audio_url: preferNonEmptyMediaUrl(existing.audio_url, t.audio_url),
        image_url: preferNonEmptyMediaUrl(existing.image_url, t.image_url),
        uploadCount: Math.max(existing.uploadCount ?? 0, t.uploadCount ?? 0),
        downloadCount: Math.max(existing.downloadCount ?? 0, t.downloadCount ?? 0),
        publishedToSite: Boolean(existing.publishedToSite) || Boolean(t.publishedToSite),
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

function tracksToWirePayload(tracks: SavedTrack[]) {
  return tracks.map((t) => ({
    id: t.id,
    createdAt: t.createdAt,
    clip_id: t.clip_id,
    /** undefined는 JSON에서 키가 빠져 서버 upsert가 URL을 null로 덮을 수 있음 */
    audio_url: t.audio_url ?? null,
    image_url: t.image_url ?? null,
    title: t.title,
    tags: t.tags,
    prompt: t.prompt,
    original_prompt: t.original_prompt,
    custom_mode: t.custom_mode,
    generationTaskId: t.generationTaskId,
    generationProvider: t.generationProvider,
    uploadCount: t.uploadCount,
    downloadCount: t.downloadCount,
    publishedToSite: t.publishedToSite,
  }));
}

export default function CreateMusic() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: aiUsage } = useQuery<{
    limit: number;
    usedThisMonth: number;
    usagePeriodKey?: string;
    isPaidTier: boolean;
    walletCredits?: number;
    creditsBalance?: number;
    quota?: { kind: "songs" | "subscription_credits" | "unlimited"; used: number; limit: number };
    creditsPerMusicCreate?: number;
    wonPerMusicCreate?: number;
    deductsCreditsPerCreate?: boolean;
    /** 구독 지갑 경로: 플랜 월 공급가(원) — basic 단일이면 9000 */
    subscriptionAiPlanGrantWon?: number;
    subscriptionAiWalletRemainingWon?: number;
  }>({
    queryKey: ["/api/ai-music/usage"],
    enabled: !!user,
  });

  const libraryHydratedForUserRef = useRef<string | null>(null);
  const librarySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 이탈·백그라운드 직전 flush용 — 디바운스 PUT이 취소돼도 서버에 최종 목록이 올라가게 함 */
  const libraryPendingSyncRef = useRef<{
    userId: string;
    payload: ReturnType<typeof tracksToWirePayload>;
    removedClientIds?: string[];
  } | null>(null);
  /** 매 렌더 최신 로그인 id — 계정 바꾼 뒤 예전 setTimeout/pagehide가 다른 계정 세션으로 PUT 하는 것 방지 */
  const sessionUserIdRef = useRef<string | undefined>(undefined);
  sessionUserIdRef.current = user?.id;

  const { data: libraryRemote, isFetched: libraryFetched } = useQuery<{ tracks?: unknown[] }>({
    queryKey: aiMusicLibraryQueryKey(user?.id),
    queryFn: async () => {
      const res = await fetch("/api/ai-music/library", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 503) return { tracks: [] };
        throw new Error("library");
      }
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: "always",
    retry: 1,
  });

  const [mode, setMode] = useState<CreateMode>("description");
  const [title, setTitle] = useState("");
  const [selectedGenreIds, setSelectedGenreIds] = useState<GenrePresetId[]>([]);
  const [genreOther, setGenreOther] = useState("");
  const [selectedStyleIds, setSelectedStyleIds] = useState<StylePresetId[]>([]);
  const [styleOther, setStyleOther] = useState("");
  /** 서버 `make_instrumental` — 무보컬(연주) 생성 요청 */
  const [instrumentalOnly, setInstrumentalOnly] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "running" | "succeeded" | "failed">("idle");
  const [resultTracks, setResultTracks] = useState<GeneratedTrack[]>([]);
  const [savedTracks, setSavedTracks] = useState<SavedTrack[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [taskProvider, setTaskProvider] = useState<string | null>(null);
  const [savedTracksSearch, setSavedTracksSearch] = useState("");
  const [savedTracksListPage, setSavedTracksListPage] = useState(1);
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

  const sortedFilteredSavedTracks = useMemo(() => {
    const q = savedTracksSearch.trim().toLowerCase();
    const base =
      q === ""
        ? [...savedTracks]
        : savedTracks.filter(
            (tr) =>
              (tr.title ?? "").toLowerCase().includes(q) ||
              (tr.tags ?? "").toLowerCase().includes(q) ||
              (tr.prompt ?? "").toLowerCase().includes(q) ||
              (tr.original_prompt ?? "").toLowerCase().includes(q)
          );
    return base.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [savedTracks, savedTracksSearch]);

  const savedTracksTotalPages = Math.max(
    1,
    Math.ceil(sortedFilteredSavedTracks.length / SAVED_TRACKS_LIST_PAGE_SIZE)
  );
  const savedTracksSafePage = Math.min(savedTracksListPage, savedTracksTotalPages);

  useEffect(() => {
    setSavedTracksListPage(1);
  }, [savedTracksSearch]);

  useEffect(() => {
    setSavedTracksListPage((p) => Math.min(p, savedTracksTotalPages));
  }, [savedTracksTotalPages]);

  const savedTracksPageSlice = useMemo(() => {
    const start = (savedTracksSafePage - 1) * SAVED_TRACKS_LIST_PAGE_SIZE;
    return sortedFilteredSavedTracks.slice(start, start + SAVED_TRACKS_LIST_PAGE_SIZE);
  }, [sortedFilteredSavedTracks, savedTracksSafePage]);

  useEffect(() => {
    if (status !== "pending" && status !== "running") return;
    const t = setInterval(() => {
      const start = generationStartRef.current;
      if (start) setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [status]);

  useEffect(() => {
    const flushPendingLibrary = () => {
      const p = libraryPendingSyncRef.current;
      if (!p) return;
      if (p.userId !== sessionUserIdRef.current) {
        libraryPendingSyncRef.current = null;
        return;
      }
      const body: Record<string, unknown> = { tracks: p.payload };
      if (p.removedClientIds?.length) body.removedClientIds = p.removedClientIds;
      void fetch("/api/ai-music/library", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {
        void queryClient.invalidateQueries({ queryKey: ["/api/ai-music/library"] });
      });
    };
    const onPageHide = () => {
      if (librarySyncTimerRef.current) {
        clearTimeout(librarySyncTimerRef.current);
        librarySyncTimerRef.current = null;
      }
      flushPendingLibrary();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      if (librarySyncTimerRef.current) {
        clearTimeout(librarySyncTimerRef.current);
        librarySyncTimerRef.current = null;
      }
      flushPendingLibrary();
    };
  }, []);

  useEffect(() => {
    if (librarySyncTimerRef.current) {
      clearTimeout(librarySyncTimerRef.current);
      librarySyncTimerRef.current = null;
    }
    if (!user?.id) {
      libraryHydratedForUserRef.current = null;
      libraryPendingSyncRef.current = null;
      setSavedTracks([]);
      setTaskId(null);
      setStatus("idle");
      setResultTracks([]);
      setErrorMessage(null);
      return;
    }
    libraryHydratedForUserRef.current = null;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !libraryFetched) return;
    if (libraryHydratedForUserRef.current === user.id) return;
    libraryHydratedForUserRef.current = user.id;

    const serverTracks = normalizeRawToSavedTracks(
      Array.isArray(libraryRemote?.tracks) ? libraryRemote.tracks : [],
    );
    const localTracks = loadSavedTracksFromLocalStorage(user.id);
    const merged = mergeAiMusicLibrary(serverTracks, localTracks);
    setSavedTracks(merged);

    const payload = tracksToWirePayload(merged);
    try {
      localStorage.setItem(savedTracksStorageKey(user.id), JSON.stringify(payload));
    } catch {}
    queryClient.setQueryData(aiMusicLibraryQueryKey(user.id), { tracks: payload });

    const serverIds = new Set(serverTracks.map((t) => t.id));
    const needsPush =
      (serverTracks.length === 0 && localTracks.length > 0) ||
      localTracks.some((t) => Boolean(t.id) && !serverIds.has(t.id)) ||
      merged.length !== serverTracks.length;

    if (needsPush) {
      void fetch("/api/ai-music/library", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks: payload }),
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/ai-music/library"] }))
        .catch(() => {
          setErrorMessage("서버 동기화에 실패했습니다. 네트워크 상태를 확인해 주세요.");
          queryClient.invalidateQueries({ queryKey: ["/api/ai-music/library"] });
        });
    }
  }, [user?.id, libraryFetched, libraryRemote, queryClient]);

  const persistTracks = useCallback(
    (tracks: SavedTrack[], opts?: { immediate?: boolean; removedClientIds?: string[] }) => {
      const uid = user?.id;
      if (!uid) return;
      const payload = tracksToWirePayload(tracks);
      const removedClientIds = opts?.removedClientIds?.length ? [...opts.removedClientIds] : undefined;
      libraryPendingSyncRef.current = { userId: uid, payload, removedClientIds };
      try {
        localStorage.setItem(savedTracksStorageKey(uid), JSON.stringify(payload));
      } catch {}
      queryClient.setQueryData(aiMusicLibraryQueryKey(uid), { tracks: payload });
      if (librarySyncTimerRef.current) clearTimeout(librarySyncTimerRef.current);
      const send = () => {
        librarySyncTimerRef.current = null;
        if (uid !== sessionUserIdRef.current) return;
        const body: Record<string, unknown> = { tracks: payload };
        if (removedClientIds?.length) body.removedClientIds = removedClientIds;
        void fetch("/api/ai-music/library", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
          .then(() => queryClient.invalidateQueries({ queryKey: ["/api/ai-music/library"] }))
          .catch(() => {
            setErrorMessage("서버 동기화에 실패했습니다. 네트워크 상태를 확인해 주세요.");
            queryClient.invalidateQueries({ queryKey: ["/api/ai-music/library"] });
          });
      };
      if (opts?.immediate) {
        send();
        return;
      }
      librarySyncTimerRef.current = setTimeout(send, 850);
    },
    [user?.id, queryClient],
  );

  const removeSavedTrack = useCallback(
    (id: string) => {
      setSavedTracks((prev) => {
        const next = prev.filter((t) => t.id !== id);
        persistTracks(next, { immediate: true, removedClientIds: [id] });
        return next;
      });
    },
    [persistTracks]
  );

  // ── 신곡 공개 ──
  const [publishingId, setPublishingId] = useState<string | null>(null);
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
          taskId: track.generationTaskId,
          clipId: typeof track.clip_id === "string" ? track.clip_id : track.clip_id != null ? String(track.clip_id) : undefined,
          generationProvider: track.generationProvider,
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
      setSavedTracks((prev) => {
        const next = prev.map((row) => (row.id === track.id ? { ...row, publishedToSite: true } : row));
        persistTracks(next, { immediate: true });
        return next;
      });
      toast({
        title: "신곡으로 공개되었습니다!",
        description: `"${track.title || "AI 생성 음악"}"이(가) 사이트에 공개되었습니다. AI 생성 배지가 표시됩니다.`,
      });
    } catch {
      toast({ title: "공개 실패", description: "네트워크 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setPublishingId(null);
    }
  }, [toast, persistTracks]);

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
        persistTracks(next, { immediate: true });
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
  }, [persistTracks]);

  const [scorePdfEnabled, setScorePdfEnabled] = useState(false);
  const [scorePdfTrackId, setScorePdfTrackId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setScorePdfEnabled(false);
      return;
    }
    let cancelled = false;
    void fetch("/api/ai-music/score-pdf/availability", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => {
        if (!cancelled) setScorePdfEnabled(!!d.enabled);
      })
      .catch(() => {
        if (!cancelled) setScorePdfEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleScoreExport = useCallback(
    async (track: SavedTrack, format: "pdf" | "musicxml" | "zip") => {
      if (!track.audio_url) return;
      setScorePdfTrackId(track.id);
      toast({
        title: t("createMusic.scoreExportStarting", "악보 파일 생성 중…"),
        description: t("createMusic.scorePdfWait", "서버에서 전사·조판하므로 1~3분 걸릴 수 있습니다."),
      });
      const baseName = sanitizeFilename(track.title || "score");
      const expectCt =
        format === "pdf"
          ? (ct: string) => ct.includes("pdf")
          : format === "musicxml"
            ? (ct: string) => ct.includes("xml") || ct.includes("musicxml")
            : (ct: string) => ct.includes("zip");
      const ext = format === "pdf" ? "pdf" : format === "musicxml" ? "musicxml" : "zip";
      const doneTitle =
        format === "pdf"
          ? t("createMusic.scorePdfDone", "PDF를 저장했습니다.")
          : format === "musicxml"
            ? t("createMusic.scoreMusicxmlDone", "MusicXML을 저장했습니다.")
            : t("createMusic.scoreZipDone", "ZIP을 저장했습니다.");
      try {
        const res = await fetch("/api/ai-music/score-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ clientId: track.id, format }),
        });
        const ct = res.headers.get("content-type") || "";
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { message?: string; detail?: string };
          const desc =
            [data.message, data.detail].filter(Boolean).join(" — ").trim() || `HTTP ${res.status}`;
          toast({
            title: t("createMusic.scoreExportFailed", "악보내기 실패"),
            description: desc.slice(0, 1200),
            variant: "destructive",
          });
          return;
        }
        if (!expectCt(ct)) {
          toast({
            title: t("createMusic.scoreExportFailed", "악보내기 실패"),
            description: t("createMusic.scorePdfBadResponse", "응답 형식이 올바르지 않습니다."),
            variant: "destructive",
          });
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${baseName}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: doneTitle });
      } catch {
        toast({
          title: t("createMusic.scoreExportFailed", "악보내기 실패"),
          description: t("createMusic.networkErrorGeneric", "네트워크 오류가 발생했습니다."),
          variant: "destructive",
        });
      } finally {
        setScorePdfTrackId(null);
      }
    },
    [t, toast],
  );

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
        const genTaskId = tid;
        const genProvider = provider ?? undefined;
        const toSave: SavedTrack[] = (data.data as GeneratedTrack[]).map((tr, i) => {
          const t = tr as Record<string, unknown>;
          return {
            ...tr,
            title: userTitle ? userTitle : (tr.title ?? (t.title as string | undefined)),
            tags: userTags ? userTags : (tr.tags ?? (t.tags as string | undefined)),
            audio_url: pickSavedTrackAudioUrl(t) ?? (tr.audio_url as string | undefined),
            image_url: (tr.image_url ?? t.imageUrl) as string | undefined,
            id: `saved-${now}-${i}-${tr.clip_id ?? i}`,
            createdAt: now,
            custom_mode: tr.custom_mode ?? (submitModeRef.current === "custom"),
            original_prompt: submitModeRef.current === "custom" ? submittedLyricsRef.current : undefined,
            uploadCount: 0,
            downloadCount: 0,
            generationTaskId: genTaskId,
            generationProvider: genProvider,
          };
        });
        setSavedTracks((prev) => {
          const next = [...toSave, ...prev];
          persistTracks(next, { immediate: true });
          return next;
        });
        void fetch("/api/ai-music/publish-nudge", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: tid }),
        })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          })
          .catch(() => {});
      }
      if (state === "failed") {
        generationStartRef.current = null;
        setErrorMessage(data.message ?? "생성에 실패했습니다.");
        setTaskId(null);
      }
      if (state === "pending" || state === "running") {
        setTimeout(() => pollTask(tid, provider), nextAiMusicPollMs(state));
      }
    },
    [persistTracks, queryClient]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const customMode = mode === "custom";
    const promptTrim = prompt.trim();
    if (customMode && !promptTrim && !instrumentalOnly) {
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
    const mergedTags = buildTagsForApi(selectedGenreIds, genreOther, selectedStyleIds, styleOther);
    submittedTagsRef.current = mergedTags;
    try {
      const body: Record<string, unknown> = {
        custom_mode: customMode,
        mv: "sonic-v4-5",
        title: title.trim() || undefined,
        tags: mergedTags || undefined,
      };
      if (instrumentalOnly) body.make_instrumental = true;
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
        if (res.status === 402 && (data as { code?: string }).code === "INSUFFICIENT_CREDITS") {
          toast({ title: data.message ?? "지갑 잔액이 부족합니다.", variant: "destructive" });
          queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
          queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
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
      const wonCharged =
        Number((data as { won_charged?: number }).won_charged) ||
        Number((data as { credits_charged?: number }).credits_charged) ||
        0;
      const creditsBalanceAfter = (data as { balance_won?: unknown; credits_balance?: unknown }).balance_won ?? (data as { credits_balance?: unknown }).credits_balance;
      const balNum = typeof creditsBalanceAfter === "number" ? creditsBalanceAfter : Number(creditsBalanceAfter);
      if (wonCharged > 0) {
        toast({
          title: t("createMusic.toastWonDeductTitle", "차감 안내"),
          description:
            Number.isFinite(balNum) && balNum >= 0
              ? t("createMusic.toastWonDeductWithBalance", "{{n}}원이 차감되었습니다. 지갑 잔액 {{bal}}원", {
                  n: wonCharged.toLocaleString(),
                  bal: balNum.toLocaleString(),
                })
              : t("createMusic.toastWonDeduct", "{{n}}원이 차감되었습니다.", { n: wonCharged.toLocaleString() }),
        });
      }
      if (Number.isFinite(balNum) && balNum >= 0) {
        queryClient.setQueryData(["/api/credits"], { credits: balNum, balanceWon: balNum });
        queryClient.setQueryData(["/api/ai-music/usage"], (prev: typeof aiUsage) =>
          prev ? { ...prev, creditsBalance: balNum, walletCredits: balNum } : prev,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["/api/ai-music/usage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      try {
        sessionStorage.setItem(lastAiMusicTaskSessionKey(user.id), JSON.stringify({ task_id: tid, provider }));
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
              <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400 max-w-2xl mx-auto leading-relaxed underline decoration-red-600 dark:decoration-red-400 underline-offset-2">
                {t(
                  "createMusic.heroCopyrightWarning",
                  "유명가수를 모방하는 내용을 사용하면 알고리즘에 의해 저작권에 걸리므로 주의하세요",
                )}
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
                {aiUsage != null && (
                  <div className="max-w-2xl mx-auto mb-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Link
                        href="/credits"
                        className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-center hover:bg-amber-500/15 transition-colors min-h-[5.5rem]"
                      >
                        <div className="flex items-center gap-2 text-xs font-medium text-amber-200/90">
                          <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                          {t("createMusic.walletBalanceLabel", "지갑 잔액")}
                        </div>
                        <strong className="text-xl tabular-nums text-white">
                          {Math.max(0, Number(aiUsage.walletCredits ?? aiUsage.creditsBalance ?? 0)).toLocaleString()}
                          <span className="text-sm font-medium text-amber-100/90 ml-0.5">{t("common.won", "원")}</span>
                        </strong>
                        <span className="text-[11px] text-amber-100/70 leading-tight px-1">
                          {t("createMusic.walletBalanceSub", "후원·유료 음원 구매 등 (지갑 충전 페이지)")}
                        </span>
                      </Link>
                      <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-violet-500/35 bg-violet-500/10 px-4 py-3 text-center min-h-[5.5rem]">
                        {(() => {
                          /** 서버와 동일 규칙(한도 숫자로 추측하지 않음 — 캐시/구버전 응답에서 PC·모바일 표시 불일치 방지) */
                          const q =
                            aiUsage.quota ??
                            {
                              kind:
                                user?.role === "admin"
                                  ? ("unlimited" as const)
                                  : (user?.subscriptionTier ?? "free") === "free"
                                    ? ("songs" as const)
                                    : ("subscription_credits" as const),
                              used: aiUsage.usedThisMonth,
                              limit: aiUsage.limit,
                            };
                          if (q.kind === "unlimited") {
                            return (
                              <>
                                <div className="flex items-center gap-2 text-xs font-medium text-violet-200/90">
                                  <Sparkles className="w-4 h-4 text-violet-300 shrink-0" />
                                  {t("createMusic.aiQuotaTitle", "AI 사용 한도")}
                                </div>
                                <strong className="text-lg text-white">{t("createMusic.quotaUnlimited", "무제한")}</strong>
                                <span className="text-[11px] text-violet-100/70">{t("createMusic.quotaAdminNote", "관리자 계정")}</span>
                              </>
                            );
                          }
                          if (q.kind === "songs") {
                            return (
                              <>
                                <div className="flex items-center gap-2 text-xs font-medium text-violet-200/90">
                                  <Sparkles className="w-4 h-4 text-violet-300 shrink-0" />
                                  {t("createMusic.freeAiQuotaLabel", "무료 AI 생성")}
                                </div>
                                <strong className="text-xl tabular-nums text-white">
                                  {t("createMusic.freeAiQuotaCount", "이번 달 {{used}} / {{limit}}곡", {
                                    used: q.used,
                                    limit: Math.max(0, q.limit),
                                  })}
                                </strong>
                                <span className="text-[11px] text-violet-100/70 leading-tight px-1">
                                  {t("createMusic.freeAiQuotaSub", "충전 크레딧과 별도 · 월이 바뀌면 초기화")}
                                </span>
                              </>
                            );
                          }
                          const remaining = q.limit >= 0 ? Math.max(0, q.limit - q.used) : 0;
                          return (
                            <>
                              <div className="flex items-center gap-2 text-xs font-medium text-violet-200/90">
                                <Sparkles className="w-4 h-4 text-violet-300 shrink-0" />
                                {t("createMusic.subscriptionAiLabelWon", "구독 AI 한도(원, 이월 포함)")}
                              </div>
                              <strong className="text-xl tabular-nums text-white">
                                {t("createMusic.subscriptionAiQuotaCountWon", "이번 달 {{used}} / {{limit}}원", {
                                  used: q.used.toLocaleString(),
                                  limit: q.limit.toLocaleString(),
                                })}
                              </strong>
                              {typeof aiUsage.subscriptionAiPlanGrantWon === "number" &&
                              typeof aiUsage.subscriptionAiWalletRemainingWon === "number" ? (
                                <span className="text-[10px] text-violet-200/85 leading-tight px-1 block">
                                  {t(
                                    "createMusic.subscriptionAiQuotaBreakdownWon",
                                    "플랜 월 공급가 {{plan}}원 · 이월 지갑 잔액 {{wallet}}원 (총 한도 = 사용 + 잔액)",
                                    {
                                      plan: aiUsage.subscriptionAiPlanGrantWon.toLocaleString(),
                                      wallet: aiUsage.subscriptionAiWalletRemainingWon.toLocaleString(),
                                    },
                                  )}
                                </span>
                              ) : null}
                              <span className="text-[11px] text-violet-100/70 leading-tight px-1">
                                {String(aiUsage.usagePeriodKey ?? "").startsWith("sub:")
                                  ? t(
                                      "createMusic.subscriptionAiQuotaSubWonMonthlyCycle",
                                      "남은 예산 {{n}}원 · 생성 1회당 {{per}}원. 달이 바뀌어도 구독 만료 전까지 한도는 이어지며, 재결제 시 초기화됩니다.",
                                      {
                                        n: remaining.toLocaleString(),
                                        per: (aiUsage.wonPerMusicCreate ?? aiUsage.creditsPerMusicCreate ?? 150).toLocaleString(),
                                      },
                                    )
                                  : t(
                                      "createMusic.subscriptionAiQuotaSubWon",
                                      "남은 월 예산 {{n}}원 · 생성 1회당 {{per}}원 (충전 잔액은 AI에 사용 안 됨)",
                                      {
                                        n: remaining.toLocaleString(),
                                        per: (aiUsage.wonPerMusicCreate ?? aiUsage.creditsPerMusicCreate ?? 150).toLocaleString(),
                                      },
                                    )}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    {aiUsage.deductsCreditsPerCreate ? (
                      <p className="text-sm text-muted-foreground text-center">
                        {t("createMusic.wonDeductHint", "음악 1회 생성 시 지갑에서 {{n}}원이 차감됩니다. (구독 만료 등)", {
                          n: (aiUsage.wonPerMusicCreate ?? aiUsage.creditsPerMusicCreate ?? 150).toLocaleString(),
                        })}
                      </p>
                    ) : user?.role === "admin" ? (
                      <p className="text-sm text-muted-foreground text-center">
                        {t("createMusic.creditsAdminHint", "관리자 계정은 생성 시 지갑이 차감되지 않습니다.")}
                      </p>
                    ) : aiUsage.isPaidTier ? (
                      <p className="text-sm text-muted-foreground text-center">
                        {t(
                          "createMusic.creditsSubscriptionHint",
                          "구독에 포함된 AI 월 예산(원)만 소모됩니다. 지갑 충전액은 AI 생성에 쓰이지 않습니다.",
                        )}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center">
                        {t("createMusic.creditsFreeHint", "무료 플랜은 월 곡 수 한도 내에서 지갑 없이 생성할 수 있습니다.")}
                      </p>
                    )}
                  </div>
                )}
                {aiUsage && aiUsage.limit > 0 && aiUsage.usedThisMonth >= aiUsage.limit && (
                  <p className="text-center text-sm text-muted-foreground mb-2">
                    {t("createMusic.usageThisMonth", "이번 달")} {aiUsage.usedThisMonth}/{aiUsage.limit}
                    {aiUsage.limit <= 10 ? t("createMusic.usageSongs", "곡 생성") : t("createMusic.usageWonBudget", "원 예산 사용")}
                    <Link href="/pricing" className="ml-1 text-primary hover:underline">
                      {aiUsage.isPaidTier ? t("createMusic.upgradePlan", "플랜 업그레이드") : t("createMusic.upgradeToUnlimited", "Pro로 업그레이드")}
                    </Link>
                  </p>
                )}
                <div
                  className="w-full rounded-3xl border-2 border-border/80 bg-card/55 backdrop-blur-md shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_24px_64px_-16px_rgba(0,0,0,0.55)] overflow-hidden"
                  data-testid="create-music-workspace"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,1fr),minmax(480px,1.5fr)] gap-0 items-stretch w-full">
                  {/* 왼쪽: 생성 폼 */}
                  <div className="flex flex-col items-stretch p-5 md:p-7 lg:p-8 border-b-2 border-border/80 lg:border-b-0 lg:border-r-2 lg:border-r-purple-500/25 bg-gradient-to-br from-purple-950/35 via-card/40 to-background/30">
                    <div className="mb-4 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/25 text-purple-200 ring-1 ring-purple-400/30">
                        <Wand2 className="h-4 w-4" aria-hidden />
                      </span>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-purple-200/90">
                          {t("createMusic.sectionCreateLabel", "새로 만들기")}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{t("createMusic.sectionCreateHint", "프롬프트를 입력하고 생성을 누르세요")}</p>
                      </div>
                    </div>
                    <form onSubmit={handleSubmit} className="rounded-2xl border-2 border-purple-500/35 bg-background/85 shadow-inner shadow-black/20 p-6 md:p-8 w-full max-w-xl space-y-4 ring-1 ring-white/5">
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
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-end justify-between gap-2">
                          <label className="block text-sm font-medium">{t("createMusic.genreSectionLabel", "장르")}</label>
                          {(selectedGenreIds.length > 0 || genreOther.trim()) && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedGenreIds([]);
                                setGenreOther("");
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                            >
                              {t("createMusic.genreClear", "장르 선택 초기화")}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {t(
                            "createMusic.genreHint",
                            "자주 쓰는 장르를 탭하거나 아래에 직접 입력하세요. 프리셋은 최대 {{n}}개까지 선택됩니다. 아래 스타일과 합쳐져 AI에 전달됩니다.",
                            { n: MAX_GENRE_PRESETS },
                          )}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {GENRE_PRESET_IDS.map((id) => {
                            const selected = selectedGenreIds.includes(id);
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => {
                                  setSelectedGenreIds((prev) => {
                                    if (prev.includes(id)) return prev.filter((x) => x !== id);
                                    if (prev.length >= MAX_GENRE_PRESETS) {
                                      toast({
                                        title: t(
                                          "createMusic.genreMaxNote",
                                          "장르 프리셋은 최대 {{n}}개까지 선택할 수 있습니다.",
                                          { n: MAX_GENRE_PRESETS },
                                        ),
                                      });
                                      return prev;
                                    }
                                    return [...prev, id];
                                  });
                                }}
                                className={cn(
                                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                                  selected
                                    ? "border-primary/70 bg-primary/25 text-primary-foreground shadow-sm shadow-primary/10"
                                    : "border-border/80 bg-background/70 text-muted-foreground hover:border-primary/35 hover:bg-muted/40",
                                )}
                              >
                                {t(`createMusic.genreChip.${id}`, GENRE_API_TOKEN[id])}
                              </button>
                            );
                          })}
                        </div>
                        <input
                          type="text"
                          value={genreOther}
                          onChange={(e) => setGenreOther(e.target.value)}
                          className="w-full rounded-lg bg-background/80 border border-border px-4 py-2 text-sm"
                          placeholder={t("createMusic.genreOtherPlaceholder", "예: city pop, synthwave")}
                          maxLength={120}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-end justify-between gap-2">
                          <label className="block text-sm font-medium">{t("createMusic.styleSectionLabel", "스타일")}</label>
                          {(selectedStyleIds.length > 0 || styleOther.trim()) && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedStyleIds([]);
                                setStyleOther("");
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                            >
                              {t("createMusic.styleClear", "스타일 초기화")}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {t(
                            "createMusic.styleHint",
                            "보컬·악기·템포 등을 칩으로 고르거나 아래에 직접 입력하세요. 프리셋은 최대 {{n}}개까지 선택됩니다.",
                            { n: MAX_STYLE_PRESETS },
                          )}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {STYLE_PRESET_IDS.map((id) => {
                            const selected = selectedStyleIds.includes(id);
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => {
                                  setSelectedStyleIds((prev) => {
                                    if (prev.includes(id)) return prev.filter((x) => x !== id);
                                    if (prev.length >= MAX_STYLE_PRESETS) {
                                      toast({
                                        title: t(
                                          "createMusic.styleMaxNote",
                                          "스타일 프리셋은 최대 {{n}}개까지 선택할 수 있습니다.",
                                          { n: MAX_STYLE_PRESETS },
                                        ),
                                      });
                                      return prev;
                                    }
                                    return [...prev, id];
                                  });
                                }}
                                className={cn(
                                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                                  selected
                                    ? "border-fuchsia-500/70 bg-fuchsia-500/20 text-fuchsia-100 shadow-sm shadow-fuchsia-500/10"
                                    : "border-border/80 bg-background/70 text-muted-foreground hover:border-fuchsia-500/35 hover:bg-muted/40",
                                )}
                              >
                                {t(`createMusic.styleChip.${id}`, STYLE_API_TOKEN[id])}
                              </button>
                            );
                          })}
                        </div>
                        <input
                          type="text"
                          value={styleOther}
                          onChange={(e) => setStyleOther(e.target.value)}
                          className="w-full rounded-lg bg-background/80 border border-border px-4 py-2 text-sm"
                          placeholder={t("createMusic.styleOtherPlaceholder", "예: reverb-heavy mix, lo-fi crackle")}
                          maxLength={160}
                        />
                      </div>
                      <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/15 px-4 py-3">
                        <Checkbox
                          id="create-music-instrumental"
                          checked={instrumentalOnly}
                          onCheckedChange={(v) => setInstrumentalOnly(v === true)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 space-y-1">
                          <label htmlFor="create-music-instrumental" className="text-sm font-medium leading-snug cursor-pointer block">
                            {t("createMusic.instrumentalLabel", "연주만 (보컬 없음)")}
                          </label>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {t(
                              "createMusic.instrumentalHint",
                              "켜면 서버에 무보컬 생성을 요청합니다. 피아노·기타 등은 스타일 칩·직접 입력으로 지정하고, 설명 모드에서는 아래 칸에 연주곡 분위기를 적어 주세요.",
                            )}
                          </p>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          {mode === "custom"
                            ? instrumentalOnly
                              ? t("createMusic.promptLabelInstrumental", "가사 (연주만이면 비워도 됨)")
                              : t("createMusic.promptLabel", "가사 (필수)")
                            : t("createMusic.lyricsInputLabel", "가사입력 (가사가 있는 곡은 가사를 입력하세요)")}
                        </label>
                        <textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          className="w-full rounded-lg bg-background/80 border border-border px-4 py-3 min-h-[120px] resize-y"
                          placeholder={
                            mode === "custom"
                              ? instrumentalOnly
                                ? t(
                                    "createMusic.promptPlaceholderInstrumental",
                                    "연주만일 때는 비워도 됩니다. 멜로디·분위기 힌트를 적으면 선택입니다.",
                                  )
                                : t("createMusic.promptPlaceholder", "[Verse]\n가사 입력...\n\n[Chorus]\n후렴구...")
                              : instrumentalOnly
                                ? t(
                                    "createMusic.lyricsInputPlaceholderInstrumental",
                                    "예: 잔잔한 솔로 피아노, 카페 배경용으로 부드럽게, 보컬 없이",
                                  )
                                : t("createMusic.lyricsInputPlaceholder", "가사가 있으면 가사를 입력하고, 없으면 원하는 분위기나 설명을 입력하세요.")
                          }
                          required={mode === "description" || (mode === "custom" && !instrumentalOnly)}
                        />
                        {mode === "custom" && !instrumentalOnly && (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {t("createMusic.lyricsHint", "입력한 가사는 그대로 전달됩니다. [Verse], [Chorus] 등 구조를 쓰면 반영이 좋습니다. 실제 노래는 AI 서비스에 따라 다를 수 있습니다.")}
                          </p>
                        )}
                        {mode === "custom" && instrumentalOnly && (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {t(
                              "createMusic.instrumentalCustomHint",
                              "연주만 + 가사 직접 입력 모드에서는 스타일(장르·스타일 칩)과 제목이 중요합니다. 가사 칸은 비워도 됩니다.",
                            )}
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
                        <Button variant="outline" className="rounded-full gap-2 border-purple-500/30 bg-background/60 hover:bg-purple-500/10">
                          <Wand2 className="w-4 h-4" />
                          {t("createMusic.guideCta", "음악 만들기 가이드")}
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {/* 오른쪽: 생성된 곡 목록 (저장됨, 삭제할 때까지 유지) */}
                  <div className="flex flex-col p-5 md:p-7 lg:p-8 lg:min-h-[320px] min-w-0 bg-gradient-to-bl from-fuchsia-950/20 via-card/30 to-background/30">
                    <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/25">
                        <Music className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1 basis-[min(100%,14rem)]">
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[11px] leading-snug">
                          <span className="text-xs font-semibold uppercase tracking-wider text-fuchsia-200/90 shrink-0">
                            {t("createMusic.sectionLibraryLabel", "생성된 곡")}
                          </span>
                          <span className="text-muted-foreground/70 shrink-0 select-none" aria-hidden>
                            ·
                          </span>
                          <span className="text-muted-foreground shrink-0">
                            {t("createMusic.sectionLibraryHint", "재생·다운로드·업로드·공개")}
                          </span>
                        </div>
                      </div>
                      {scorePdfEnabled ? (
                        <p className="w-full min-w-0 text-[10px] sm:text-[11px] text-red-600/90 dark:text-red-400/90 leading-relaxed break-words">
                          {t(
                            "createMusic.sectionLibraryScoreNotice",
                            "※ 악보는 자동으로 만든 참고용 초안입니다. 원곡·실제 연주와 다를 수 있으며, 그대로 연습·공연에 쓰기 어려울 수 있어요.",
                          )}
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border-2 border-fuchsia-500/30 bg-background/80 shadow-inner shadow-black/15 p-4 md:p-6 flex-1 flex flex-col min-h-0 ring-1 ring-white/5">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3 min-w-0">
                      <h2 className="text-lg font-bold shrink-0">
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
                      <div className="mb-4 space-y-1.5">
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t("createMusic.generatingElapsed", "생성 중... (경과 %s)", elapsed)?.replace("%s", elapsed) || `생성 중... (경과 ${elapsed})`}
                        </div>
                        <p className="text-xs text-muted-foreground/90 leading-relaxed pl-6">
                          {t(
                            "createMusic.generatingSlowHint",
                            "음원은 보통 1~3분 걸리며, 품질·대기열에 따라 더 길어질 수 있습니다. 이 페이지를 닫지 마세요.",
                          )}
                        </p>
                      </div>
                        );
                      })()}
                    {savedTracks.length === 0 && status !== "pending" && status !== "running" ? (
                      <p className="text-muted-foreground text-sm">{t("createMusic.noTracksYet", "아직 생성된 곡이 없습니다. 왼쪽에서 음악을 생성해 보세요.")}</p>
                    ) : sortedFilteredSavedTracks.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        {t("createMusic.noSearchResults", "검색 결과가 없습니다.")}
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-col gap-4 min-w-0">
                          <div className="flex-1 min-w-0 space-y-3 pr-1">
                            {savedTracksPageSlice.map((track, index) => (
                              <TrackCard
                                key={track.id}
                                track={track}
                                order={(savedTracksSafePage - 1) * SAVED_TRACKS_LIST_PAGE_SIZE + index + 1}
                                onRemove={() => removeSavedTrack(track.id)}
                                onUpload={() => goUploadWithTrack(track)}
                                onDownload={() => handleDownloadTrack(track)}
                                onScoreExport={(fmt) => void handleScoreExport(track, fmt)}
                                scoreExportLoading={scorePdfTrackId === track.id}
                                scorePdfEnabled={scorePdfEnabled}
                                onPlay={() => playTrackInGlobalPlayer(track)}
                                onPublish={() => setPublishConfirmTrack(track)}
                                isPublishing={publishingId === track.id}
                                isPublished={!!track.publishedToSite}
                                t={t as TTranslate}
                              />
                            ))}
                          </div>
                        </div>
                        {savedTracksTotalPages > 1 && (
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 pt-4 border-t border-border/50">
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {t("createMusic.listPaginationRange", "{{from}}–{{to}}번째 / 총 {{total}}곡", {
                                from:
                                  (savedTracksSafePage - 1) * SAVED_TRACKS_LIST_PAGE_SIZE + 1,
                                to: Math.min(
                                  sortedFilteredSavedTracks.length,
                                  savedTracksSafePage * SAVED_TRACKS_LIST_PAGE_SIZE
                                ),
                                total: sortedFilteredSavedTracks.length,
                              })}
                            </p>
                            <div className="flex items-center gap-2 justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                disabled={savedTracksSafePage <= 1}
                                onClick={() => setSavedTracksListPage((p) => Math.max(1, p - 1))}
                              >
                                <ChevronLeft className="w-4 h-4" />
                                {t("createMusic.listPagePrev", "이전")}
                              </Button>
                              <span className="text-sm text-muted-foreground tabular-nums min-w-[5.5rem] text-center">
                                {savedTracksSafePage} / {savedTracksTotalPages}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                disabled={savedTracksSafePage >= savedTracksTotalPages}
                                onClick={() =>
                                  setSavedTracksListPage((p) => Math.min(savedTracksTotalPages, p + 1))
                                }
                              >
                                {t("createMusic.listPageNext", "다음")}
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    </div>
                  </div>
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
