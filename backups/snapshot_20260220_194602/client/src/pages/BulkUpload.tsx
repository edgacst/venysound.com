import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useCreateMusic } from "@/hooks/use-music";
import { useLocation, Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Music as MusicIcon,
  CheckCircle,
  ArrowLeft,
  CloudUpload,
  Trash2,
  Upload,
  XCircle,
  FolderUp,
  ImagePlus,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from 'react-i18next';

const mainGenres: Record<string, string[]> = {
  "팝뮤직": ["팝발라드", "댄스팝", "일렉트로팝", "인디팝", "틴팝", "신스팝", "드림팝", "시티팝"],
  "국내가요": ["케이팝", "발라드", "트로트", "국내OST", "어쿠스틱가요"],
  "월드뮤직": ["라틴음악", "아프로비트", "레게", "플라멩코", "켈틱", "인도음악", "중동음악"],
  "경음악": ["재즈", "클래식", "뉴에이지", "태교음악", "카페음악"],
  "기타": []
};

interface TrackItem {
  id: string;
  file: File;
  title: string;
  artist: string;
  mainGenre: string;
  subGenre: string;
  genre: string;
  tags: string;
  isAi: boolean;
  coverUrl: string | null;
  isFetchingCover: boolean;
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
}

function getFileNameWithoutExt(name: string) {
  return name.replace(/\.[^/.]+$/, "");
}

export default function BulkUpload() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { mutateAsync: createMusic } = useCreateMusic();
  const { toast } = useToast();

  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalArtist, setGlobalArtist] = useState("");
  const [globalMainGenre, setGlobalMainGenre] = useState("");
  const [globalSubGenre, setGlobalSubGenre] = useState("");
  const [globalIsAi, setGlobalIsAi] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (user?.firstName && !globalArtist) {
      setGlobalArtist(user.firstName);
    }
  }, [user]);

  if (isAuthLoading || !isAuthenticated) return null;

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newTracks: TrackItem[] = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      title: getFileNameWithoutExt(file.name),
      artist: globalArtist || user?.firstName || "",
      mainGenre: globalMainGenre,
      subGenre: globalSubGenre,
      genre: globalSubGenre || globalMainGenre,
      tags: "",
      isAi: globalIsAi,
      coverUrl: null,
      isFetchingCover: false,
      status: "pending" as const,
    }));
    setTracks((prev) => [...prev, ...newTracks]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const updateTrack = (id: string, updates: Partial<TrackItem>) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  };

  const removeTrack = (id: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== id));
  };

  const applyGlobalSettings = () => {
    setTracks((prev) =>
      prev.map((t) =>
        t.status === "pending" || t.status === "error"
          ? {
              ...t,
              artist: globalArtist || t.artist,
              mainGenre: globalMainGenre || t.mainGenre,
              subGenre: globalSubGenre || t.subGenre,
              genre: globalSubGenre || globalMainGenre || t.genre,
              isAi: globalIsAi,
            }
          : t
      )
    );
    toast({ title: t('bulkUpload.settingsApplied', '일괄 설정이 적용되었습니다') });
  };

  const fetchRandomCover = async (trackId: string) => {
    updateTrack(trackId, { isFetchingCover: true });
    try {
      const res = await fetch("/api/music/random-cover");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      updateTrack(trackId, { coverUrl: data.imageUrl, isFetchingCover: false });
    } catch {
      toast({ title: t('bulkUpload.coverFetchFailed', '이미지를 가져오는데 실패했습니다'), variant: "destructive" });
      updateTrack(trackId, { isFetchingCover: false });
    }
  };

  const handleMainGenreChange = (id: string, value: string) => {
    const subGenres = mainGenres[value] || [];
    updateTrack(id, {
      mainGenre: value,
      subGenre: "",
      genre: subGenres.length === 0 ? value : "",
    });
  };

  const handleSubGenreChange = (id: string, value: string) => {
    updateTrack(id, { subGenre: value, genre: value });
  };

  const uploadSingleTrack = async (track: TrackItem) => {
    if (!track.title.trim() || !track.artist.trim()) {
      updateTrack(track.id, { status: "error", errorMsg: t('bulkUpload.titleArtistRequired', '제목과 아티스트를 입력해주세요') });
      return;
    }

    updateTrack(track.id, { status: "uploading" });
    try {
      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: track.file.name,
          size: track.file.size,
          contentType: track.file.type || "application/octet-stream",
        }),
      });
      if (!urlRes.ok) throw new Error(t('bulkUpload.uploadUrlFailed', '업로드 URL 요청 실패'));
      const { uploadURL, objectPath } = await urlRes.json();

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: track.file,
        headers: { "Content-Type": track.file.type || "application/octet-stream" },
      });
      if (!putRes.ok) throw new Error(t('bulkUpload.storageUploadFailed', '파일 저장소 업로드 실패'));

      await createMusic({
        title: track.title,
        artist: track.artist,
        genre: track.genre || undefined,
        tags: track.tags || undefined,
        isAi: track.isAi,
        filename: objectPath,
        imageFilename: track.coverUrl || null,
      });

      updateTrack(track.id, { status: "done" });
    } catch (err: any) {
      updateTrack(track.id, { status: "error", errorMsg: err.message || t('bulkUpload.uploadFailed', '업로드 실패') });
    }
  };

  const handleUploadAll = async () => {
    const pendingTracks = tracks.filter((t) => t.status === "pending" || t.status === "error");
    if (pendingTracks.length === 0) {
      toast({ title: t('bulkUpload.noTracksToUpload', '업로드할 곡이 없습니다'), variant: "destructive" });
      return;
    }

    const invalidTracks = pendingTracks.filter((t) => !t.title.trim() || !t.artist.trim());
    if (invalidTracks.length > 0) {
      invalidTracks.forEach((t) => updateTrack(t.id, { status: "error", errorMsg: t('bulkUpload.titleArtistRequired', '제목과 아티스트를 입력해주세요') }));
      toast({ title: `${invalidTracks.length}${t('bulkUpload.tracksMissingInfo', '곡의 정보가 누락되었습니다')}`, variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    let successCount = 0;
    for (const track of pendingTracks) {
      await uploadSingleTrack(track);
      const updated = tracks.find((t) => t.id === track.id);
      if (updated?.status !== "error") successCount++;
    }
    setIsProcessing(false);

    const finalDone = tracks.filter((t) => t.status === "done").length;
    toast({ title: `${t('bulkUpload.uploadComplete', '업로드 완료!')} (${pendingTracks.length}${t('bulkUpload.tracksProcessed', '곡 처리')})` });
  };

  const pendingCount = tracks.filter((t) => t.status === "pending" || t.status === "error").length;
  const doneCount = tracks.filter((t) => t.status === "done").length;
  const globalSubGenres = globalMainGenre ? mainGenres[globalMainGenre] || [] : [];

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />

        <div className="container max-w-4xl px-4 py-8">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2" data-testid="text-bulk-upload-title">
              <FolderUp className="text-primary" size={24} />
              {t('bulkUpload.title', '대량 업로드')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{t('bulkUpload.subtitle', '여러 음원을 한번에 업로드하세요')}</p>
          </div>
          <Link href="/upload">
            <Button variant="outline" size="sm" className="gap-2" data-testid="link-single-upload">
              <ArrowLeft size={14} />
              {t('bulkUpload.singleUpload', '단일 업로드')}
            </Button>
          </Link>
        </div>

        <Card className="p-4 mb-6 border-white/10 bg-card/50">
          <h3 className="text-sm font-semibold mb-3">{t('bulkUpload.batchSettings', '일괄 설정 (모든 곡에 적용)')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('bulkUpload.artist', '아티스트')}</label>
              <Input
                value={globalArtist}
                onChange={(e) => setGlobalArtist(e.target.value)}
                placeholder={t('bulkUpload.artistPlaceholder', '아티스트 이름')}
                className="bg-background border-white/10"
                data-testid="input-global-artist"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('bulkUpload.mainGenre', '장르 (대분류)')}</label>
              <Select value={globalMainGenre} onValueChange={(v) => { setGlobalMainGenre(v); setGlobalSubGenre(""); }}>
                <SelectTrigger data-testid="select-global-main-genre">
                  <SelectValue placeholder={t('bulkUpload.selectMainGenre', '대분류 선택')} />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(mainGenres).map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {globalSubGenres.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('bulkUpload.subGenre', '장르 (소분류)')}</label>
                <Select value={globalSubGenre} onValueChange={setGlobalSubGenre}>
                  <SelectTrigger data-testid="select-global-sub-genre">
                    <SelectValue placeholder={t('bulkUpload.selectSubGenre', '소분류 선택')} />
                  </SelectTrigger>
                  <SelectContent>
                    {globalSubGenres.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={globalIsAi}
                  onCheckedChange={(v) => setGlobalIsAi(!!v)}
                  data-testid="checkbox-global-ai"
                />
                {t('bulkUpload.aiMusic', 'AI 음원')}
              </label>
              <Button size="sm" variant="outline" onClick={applyGlobalSettings} data-testid="button-apply-global">
                {t('bulkUpload.apply', '적용')}
              </Button>
            </div>
          </div>
        </Card>

        <div
          className="border-2 border-dashed border-white/10 rounded-lg p-8 text-center cursor-pointer transition-colors hover:border-white/20 hover:bg-white/5 mb-6"
          onClick={() => fileInputRef.current?.click()}
          data-testid="dropzone-bulk-audio"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,.ogg"
            multiple
            className="hidden"
            onChange={handleFilesSelected}
          />
          <CloudUpload className="mx-auto w-10 h-10 text-muted-foreground mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">{t('bulkUpload.clickToSelect', '클릭하여 여러 음원 파일을 선택하세요')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('bulkUpload.supportedFormats', 'MP3, WAV, OGG 형식 지원')}</p>
        </div>

        {tracks.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{tracks.length}{t('bulkUpload.tracksSelected', '곡 선택됨')}</span>
                {doneCount > 0 && <Badge variant="default" className="text-xs">{doneCount}{t('bulkUpload.tracksDone', '곡 완료')}</Badge>}
                {pendingCount > 0 && <Badge variant="secondary" className="text-xs">{pendingCount}{t('bulkUpload.tracksPending', '곡 대기')}</Badge>}
              </div>
              <Button
                onClick={handleUploadAll}
                disabled={isProcessing || pendingCount === 0}
                className="gap-2"
                data-testid="button-upload-all"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('bulkUpload.uploading', '업로드 중...')}
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    {pendingCount}{t('bulkUpload.batchUpload', '곡 일괄 업로드')}
                  </>
                )}
              </Button>
            </div>

            <div className="space-y-2">
              {tracks.map((track, idx) => {
                const subGenres = track.mainGenre ? mainGenres[track.mainGenre] || [] : [];
                return (
                  <Card
                    key={track.id}
                    className={`p-3 border-white/5 bg-card/50 ${
                      track.status === "done" ? "opacity-60" : track.status === "error" ? "border-red-500/30" : ""
                    }`}
                    data-testid={`track-item-${idx}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-1">
                        {track.status === "done" ? (
                          <CheckCircle className="text-green-500" size={20} />
                        ) : track.status === "uploading" ? (
                          <Loader2 className="text-primary animate-spin" size={20} />
                        ) : track.status === "error" ? (
                          <XCircle className="text-red-500" size={20} />
                        ) : (
                          <MusicIcon className="text-muted-foreground" size={20} />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground shrink-0">#{idx + 1}</span>
                          <span className="text-xs text-muted-foreground truncate">{track.file.name}</span>
                          {track.status === "error" && (
                            <span className="text-xs text-red-400">{track.errorMsg}</span>
                          )}
                        </div>

                        {track.status !== "done" && (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              <Input
                                value={track.title}
                                onChange={(e) => updateTrack(track.id, { title: e.target.value })}
                                placeholder={t('bulkUpload.titlePlaceholder', '제목 *')}
                                className={`bg-background border-white/10 text-sm ${!track.title.trim() && track.status === "error" ? "border-red-500/50" : ""}`}
                                disabled={track.status === "uploading"}
                                data-testid={`input-track-title-${idx}`}
                              />
                              <Input
                                value={track.artist}
                                onChange={(e) => updateTrack(track.id, { artist: e.target.value })}
                                placeholder={t('bulkUpload.artistPlaceholder2', '아티스트 *')}
                                className={`bg-background border-white/10 text-sm ${!track.artist.trim() && track.status === "error" ? "border-red-500/50" : ""}`}
                                disabled={track.status === "uploading"}
                                data-testid={`input-track-artist-${idx}`}
                              />
                              <Select
                                value={track.mainGenre}
                                onValueChange={(v) => handleMainGenreChange(track.id, v)}
                                disabled={track.status === "uploading"}
                              >
                                <SelectTrigger className="text-sm" data-testid={`select-track-genre-${idx}`}>
                                  <SelectValue placeholder={t('bulkUpload.genre', '장르')} />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.keys(mainGenres).map((g) => (
                                    <SelectItem key={g} value={g}>{g}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {subGenres.length > 0 && (
                                <Select
                                  value={track.subGenre}
                                  onValueChange={(v) => handleSubGenreChange(track.id, v)}
                                  disabled={track.status === "uploading"}
                                >
                                  <SelectTrigger className="text-sm" data-testid={`select-track-subgenre-${idx}`}>
                                    <SelectValue placeholder={t('bulkUpload.selectSubGenre', '소분류')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {subGenres.map((g) => (
                                      <SelectItem key={g} value={g}>{g}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              <Input
                                value={track.tags}
                                onChange={(e) => updateTrack(track.id, { tags: e.target.value })}
                                placeholder={t('bulkUpload.tagsPlaceholder', '태그 (쉼표구분)')}
                                className="bg-background border-white/10 text-sm"
                                disabled={track.status === "uploading"}
                                data-testid={`input-track-tags-${idx}`}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              {track.coverUrl ? (
                                <div className="flex items-center gap-2">
                                  <img src={track.coverUrl} alt={t('bulkUpload.cover', '커버')} className="w-8 h-8 rounded object-cover" />
                                  <span className="text-xs text-muted-foreground">{t('bulkUpload.randomCoverApplied', '랜덤 커버 적용됨')}</span>
                                  <button
                                    type="button"
                                    className="text-xs text-muted-foreground underline"
                                    onClick={() => updateTrack(track.id, { coverUrl: null })}
                                    data-testid={`button-remove-cover-${idx}`}
                                  >
                                    {t('bulkUpload.remove', '제거')}
                                  </button>
                                </div>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => fetchRandomCover(track.id)}
                                  disabled={track.isFetchingCover || track.status === "uploading"}
                                  data-testid={`button-random-cover-${idx}`}
                                >
                                  {track.isFetchingCover ? (
                                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                  ) : (
                                    <ImagePlus className="mr-1 h-3 w-3" />
                                  )}
                                  {t('bulkUpload.randomCover', '랜덤 커버')}
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {track.status !== "uploading" && track.status !== "done" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeTrack(track.id)}
                          className="shrink-0"
                          data-testid={`button-remove-track-${idx}`}
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {tracks.length === 0 && (
          <div className="text-center py-12 text-muted-foreground" data-testid="text-no-tracks">
            {t('bulkUpload.noTracksMessage', '음원 파일을 선택하면 여기에 목록이 표시됩니다')}
          </div>
        )}
      </div>
      <Footer />
      </div>
    </PageTransition>
  );
}
