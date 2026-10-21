import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useTranslation } from 'react-i18next';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateMusic, useUpdateMusic } from "@/hooks/use-music";
import { useUpload } from "@/hooks/use-upload";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage,
  FormDescription
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Music as MusicIcon, Image as ImageIcon, CheckCircle, ArrowLeft, CloudUpload, ImagePlus, DollarSign, Download, AlertCircle, Crown, Film } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import jsmediatags from "jsmediatags";
import { useAuth } from "@/hooks/use-auth";
import { LOGIN_PATH } from "@/lib/site-paths";
import { useToast } from "@/hooks/use-toast";
import { PageTransition } from "@/components/PageTransition";
import { LyricsSyncEditor } from "@/components/MusicCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const uploadSchema = z.object({
  title: z.string().min(1, "음원 제목을 입력해주세요"),
  artist: z.string().min(1, "아티스트 이름을 입력해주세요"),
  genre: z.string().optional(),
  lyrics: z.string().optional(),
  isAi: z.boolean().optional(),
  isDownloadable: z.boolean().optional(),
  price: z.number().min(0).optional(),
});

type UploadFormValues = z.infer<typeof uploadSchema>;

const mainGenres: Record<string, string[]> = {
  "팝뮤직": ["팝발라드", "댄스팝", "일렉트로팝", "인디팝", "틴팝", "신스팝", "드림팝", "시티팝"],
  "국내가요": ["케이팝", "발라드", "트로트", "국내OST", "어쿠스틱가요"],
  "월드뮤직": ["라틴음악", "아프로비트", "레게", "플라멩코", "켈틱", "인도음악", "중동음악"],
  "경음악": ["재즈", "클래식", "뉴에이지", "태교음악", "카페음악", "힐링"],
  "찬양": ["CCM", "워십", "복음성가"],
  "기타": []
};

const MAX_VIDEO_FILE_SIZE = 500 * 1024 * 1024;

type VideoUploadTicket = {
  uploadURL?: string;
  objectPath?: string;
  localMode?: boolean;
  uploadEndpoint?: string;
  error?: string;
  message?: string;
};

function uploadVideoBody(
  url: string,
  method: "POST" | "PUT",
  body: XMLHttpRequestBodyInit,
  options: { contentType?: string; withCredentials?: boolean; onProgress: (percent: number) => void },
): Promise<VideoUploadTicket> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.withCredentials = options.withCredentials === true;
    if (options.contentType) xhr.setRequestHeader("Content-Type", options.contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        options.onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onerror = () => reject(new Error("영상 파일 전송 중 네트워크 오류가 발생했습니다."));
    xhr.onload = () => {
      let response: VideoUploadTicket = {};
      try {
        response = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        response = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress(100);
        resolve(response);
        return;
      }
      const message =
        xhr.status === 413
          ? "MP4 파일 용량이 서버 허용 범위를 초과했습니다."
          : response.error || response.message || `영상 업로드에 실패했습니다. (HTTP ${xhr.status})`;
      reject(new Error(message));
    };
    xhr.send(body);
  });
}

async function uploadMusicVideoFile(file: File, onProgress: (percent: number) => void): Promise<VideoUploadTicket> {
  onProgress(0);
  const ticketRes = await fetch("/api/uploads/request-url", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type || "video/mp4",
    }),
  });
  const ticket = (await ticketRes.json().catch(() => ({}))) as VideoUploadTicket;
  if (!ticketRes.ok) throw new Error(ticket.error || ticket.message || "영상 업로드 주소를 준비하지 못했습니다.");

  if (ticket.localMode) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("desiredFilename", file.name);
    const uploaded = await uploadVideoBody(ticket.uploadEndpoint || "/api/uploads/local", "POST", formData, {
      withCredentials: true,
      onProgress,
    });
    return uploaded;
  }

  if (!ticket.uploadURL || !ticket.objectPath) throw new Error("영상 업로드 주소가 올바르지 않습니다.");
  await uploadVideoBody(ticket.uploadURL, "PUT", file, {
    contentType: file.type || "video/mp4",
    onProgress,
  });
  return ticket;
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

export default function Upload() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { mutate: createMusic, isPending: isCreating } = useCreateMusic();
  const { mutate: updateMusic, isPending: isUpdatingLyrics } = useUpdateMusic();
  const queryClient = useQueryClient();

  const { uploadFile: uploadAudio, isUploading: isUploadingAudio } = useUpload();
  const { uploadFile: uploadImage, isUploading: isUploadingImage } = useUpload();
  
  const { toast } = useToast();
  const { data: uploadLimit } = useQuery<{ limited: boolean; current: number; limit: number }>({
    queryKey: ["/api/upload-limit"],
    enabled: isAuthenticated,
  });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [unsplashUrl, setUnsplashUrl] = useState<string | null>(null);
  const [extractedCoverUrl, setExtractedCoverUrl] = useState<string | null>(null);
  const [uploadKind, setUploadKind] = useState<"audio" | "video">("audio");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoDescription, setVideoDescription] = useState("");
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [isRegisteringVideo, setIsRegisteringVideo] = useState(false);

  const tryExtractMp3Cover = useCallback((file: File) => {
    setExtractedCoverUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (!file || !(file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3"))) {
      // WAV/OGG 등은 이미 선택한 커버·랜덤 커버를 유지 (이전에는 여기서 imageFile을 비움)
      return;
    }
    jsmediatags.read(file, {
      onSuccess: (tag: { tags?: { picture?: { data: number[]; format: string } } }) => {
        const picture = tag.tags?.picture;
        if (!picture?.data?.length) {
          // 임베디드 없음: 사용자가 먼저 고른 이미지·랜덤 커버는 그대로 둠
          return;
        }
        const blob = new Blob([new Uint8Array(picture.data)], { type: picture.format });
        const ext = picture.format === "image/jpeg" || picture.format === "image/jpg" ? "jpg" : "png";
        const coverFile = new File([blob], `cover.${ext}`, { type: picture.format });
        setImageFile(coverFile);
        setUnsplashUrl(null);
        setExtractedCoverUrl(URL.createObjectURL(blob));
        toast({ title: t("upload.embeddedCoverUsed", "MP3에 포함된 커버를 사용합니다.") });
      },
      onError: () => {
        // 태그 파싱 실패 시에도 수동 커버는 유지
      },
    });
  }, [t]);
  const [isFetchingUnsplash, setIsFetchingUnsplash] = useState(false);
  const [isApplyingFromCreate, setIsApplyingFromCreate] = useState(false);
  const [selectedMainGenre, setSelectedMainGenre] = useState("");
  const [selectedSubGenre, setSelectedSubGenre] = useState("");
  /** 업로드 직후 가사만 넣었을 때 싱크 단계로 넘어가기 위함 */
  const [postUploadSync, setPostUploadSync] = useState<{ musicId: number; lyrics: string } | null>(null);

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      title: "",
      artist: user?.firstName || "",
      genre: "",
      lyrics: "",
      isAi: false,
      isDownloadable: false,
      price: 0,
    },
  });

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      setLocation(LOGIN_PATH);
    }
  }, [isAuthLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    return () => {
      if (extractedCoverUrl) URL.revokeObjectURL(extractedCoverUrl);
    };
  }, [extractedCoverUrl]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const coverUrl = sessionStorage.getItem("createMusic_uploadCoverUrl");
    const audioUrl = sessionStorage.getItem("createMusic_uploadAudioUrl");
    const title = sessionStorage.getItem("createMusic_uploadTitle");
    const lyrics = sessionStorage.getItem("createMusic_uploadLyrics");
    if (title) form.setValue("title", title);
    if (lyrics) form.setValue("lyrics", lyrics);
    if (title || lyrics) {
      try {
        sessionStorage.removeItem("createMusic_uploadTitle");
        sessionStorage.removeItem("createMusic_uploadTags");
        sessionStorage.removeItem("createMusic_uploadLyrics");
      } catch {}
    }
    const hasCreateData = !!(coverUrl || audioUrl);
    if (hasCreateData) setIsApplyingFromCreate(true);

    const finishApplying = () => setIsApplyingFromCreate(false);
    const promises: Promise<void>[] = [];

    if (coverUrl) {
      try {
        sessionStorage.removeItem("createMusic_uploadCoverUrl");
      } catch {}
      const p = fetch(`/api/ai-music/cover-proxy?url=${encodeURIComponent(coverUrl)}`, { credentials: "include" })
        .then((res) => {
          if (!res.ok) throw new Error("Cover fetch failed");
          return res.blob();
        })
        .then((blob) => {
          const file = new File([blob], "cover.jpg", { type: blob.type || "image/jpeg" });
          setImageFile(file);
          setUnsplashUrl(null);
          setExtractedCoverUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
          toast({ title: t("upload.createdTrackCoverApplied", "생성된 곡 커버를 적용했습니다.") });
        })
        .catch(() => {
          toast({
            title: t("upload.createdTrackCoverFailed", "생성된 곡 커버를 불러오지 못했습니다."),
            description: t("upload.createdTrackCoverFailedHint", "앨범 커버를 직접 선택하거나 '커버 랜덤 생성'을 눌러 주세요. 음원은 그대로 업로드할 수 있습니다."),
            variant: "destructive",
          });
        });
      promises.push(p);
    }

    if (audioUrl) {
      try {
        sessionStorage.removeItem("createMusic_uploadAudioUrl");
      } catch {}
      const audioProxyUrl = `/api/ai-music/audio-proxy?url=${encodeURIComponent(audioUrl)}&purpose=file`;
      const p = fetch(audioProxyUrl, { credentials: "include" })
        .then((res) => {
          if (!res.ok) {
            return res.json().then((body) => {
              const msg = (body as { message?: string }).message || "음원을 가져오지 못했습니다.";
              throw new Error(msg);
            }).catch(() => {
              throw new Error("음원을 가져오지 못했습니다.");
            });
          }
          return res.blob();
        })
        .then((blob) => {
          const type = blob.type || "audio/mpeg";
          const ext = type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "mp3";
          const file = new File([blob], `generated.${ext}`, { type });
          setAudioFile(file);
          toast({ title: t("upload.createdTrackAudioApplied", "생성된 곡 음원을 적용했습니다.") });
        })
        .catch((err) => {
          toast({
            title: t("upload.createdTrackAudioFailed", "생성된 곡 음원을 불러오지 못했습니다."),
            description: (err as Error).message || t("upload.createdTrackAudioFailedHint", "음원 파일을 직접 선택해 주세요."),
            variant: "destructive",
          });
        });
      promises.push(p);
    }

    if (promises.length > 0) {
      Promise.allSettled(promises).finally(finishApplying);
    } else {
      finishApplying();
    }
  }, [isAuthenticated]);

  if (isAuthLoading || !isAuthenticated) return null;

  const handleMainGenreChange = (value: string) => {
    setSelectedMainGenre(value);
    setSelectedSubGenre("");
    if (!mainGenres[value] || mainGenres[value].length === 0) {
      form.setValue("genre", value);
    } else {
      form.setValue("genre", "");
    }
  };

  const handleSubGenreChange = (value: string) => {
    setSelectedSubGenre(value);
    form.setValue("genre", value);
  };

  const handleGenerateAiCover = () => {
    if ((user as any)?.subscriptionTier !== "premium") {
      toast({ title: t('upload.premiumOnly', '프리미엄 전용 기능'), description: t('upload.premiumAiCoverDesc', 'AI 커버 생성은 프리미엄 멤버십 구독 후 이용 가능합니다.') });
      setLocation("/pricing");
      return;
    }
    toast({ title: t('upload.aiCoverGenerating', 'AI 커버 생성 중...'), description: t('upload.pleaseWait', '잠시만 기다려주세요.') });
  };

  const handleFetchUnsplash = async () => {
    const title = form.getValues("title");
    const genre = form.getValues("genre");
    const keyword = genre || title || "music";

    setIsFetchingUnsplash(true);
    try {
      const res = await fetch("/api/music/random-cover");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setUnsplashUrl(data.imageUrl);
      setImageFile(null);
      setExtractedCoverUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      toast({ title: t('upload.randomCoverFetched', '랜덤 커버 이미지를 가져왔습니다') });
    } catch (err) {
      toast({ title: t('upload.imageFetchFailed', '이미지를 가져오는데 실패했습니다. 다시 시도해주세요.'), variant: "destructive" });
    } finally {
      setIsFetchingUnsplash(false);
    }
  };

  const onSubmit = async (values: UploadFormValues) => {
    if (!audioFile) {
      toast({ title: t('upload.error', '오류'), description: t('upload.selectAudioFile', '음원 파일을 선택해주세요'), variant: "destructive" });
      return;
    }

    if (uploadLimit?.limited) {
      toast({ title: t('upload.uploadLimit', '업로드 제한'), description: t('upload.uploadLimitDesc', `Free 플랜은 월 ${uploadLimit.limit}곡까지 업로드할 수 있습니다. 프리미엄으로 업그레이드해주세요.`), variant: "destructive" });
      return;
    }

    const isPremium = (user as any)?.subscriptionTier === "pro" || (user as any)?.subscriptionTier === "premium";
    const payload = {
      ...values,
      isDownloadable: isPremium ? values.isDownloadable : false,
      price: isPremium ? (values.price ?? 0) : 0,
    };

    try {
      const audioRes = await uploadAudio(audioFile, { preferredName: values.title });
      if (!audioRes) throw new Error(t('upload.audioUploadFailed', '음원 업로드 실패'));

      let imagePath = unsplashUrl || null;
      if (imageFile) {
        const imageRes = await uploadImage(imageFile);
        if (imageRes) {
          imagePath = imageRes.objectPath;
        } else {
          toast({
            title: t("upload.error", "오류"),
            description: t("upload.coverUploadFailed", "커버 이미지 업로드에 실패했습니다. 형식·용량을 확인한 뒤 다시 시도해 주세요."),
            variant: "destructive",
          });
        }
      }

      createMusic(
        {
          ...payload,
          filename: audioRes.objectPath,
          imageFilename: imagePath,
        },
        {
          onSuccess: (created) => {
            const lyrics = (payload.lyrics ?? "").trim();
            const hasLrcTimestamps = /\[\d{2}:\d{2}(?:\.\d{2,3})?\]/.test(lyrics);
            if (lyrics && !hasLrcTimestamps) {
              setPostUploadSync({ musicId: created.id, lyrics });
              return;
            }
            setLocation("/");
          },
        }
      );

    } catch (error) {
      console.error(t("upload.uploadFailed", "업로드 실패"), error);
      const msg = error instanceof Error ? error.message : t("upload.uploadFailed", "업로드에 실패했습니다. 다시 시도해 주세요.");
      toast({ title: t("upload.error", "오류"), description: msg, variant: "destructive" });
    }
  };

  const handleVideoFileChange = (file: File | null) => {
    if (!file) {
      setVideoFile(null);
      return;
    }
    if (!file.type.includes("mp4") && !file.name.toLowerCase().endsWith(".mp4")) {
      setVideoFile(null);
      toast({ title: "MP4 파일만 업로드할 수 있습니다.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_VIDEO_FILE_SIZE) {
      setVideoFile(null);
      toast({ title: "MP4 파일은 최대 500MB까지 업로드할 수 있습니다.", variant: "destructive" });
      return;
    }
    setVideoFile(file);
    if (!videoTitle.trim()) setVideoTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const handleVideoUpload = async () => {
    if (!videoFile) {
      toast({ title: "MP4 파일을 선택해 주세요.", variant: "destructive" });
      return;
    }

    setIsUploadingVideo(true);
    setVideoUploadProgress(0);
    try {
      const upload = await uploadMusicVideoFile(videoFile, setVideoUploadProgress);
      if (!upload?.objectPath) throw new Error("영상 업로드에 실패했습니다.");

      setIsUploadingVideo(false);
      setIsRegisteringVideo(true);
      const durationSec = await getVideoDuration(videoFile);
      const res = await fetch("/api/music-videos", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: videoTitle.trim() || videoFile.name.replace(/\.[^.]+$/, ""),
          description: videoDescription.trim(),
          videoUrl: upload.objectPath,
          originalFilename: videoFile.name,
          durationSec,
          fileSize: videoFile.size,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "뮤직비디오를 등록하지 못했습니다.");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/music-videos"] });
      toast({ title: "뮤직비디오가 등록되었습니다." });
      setLocation("/music-videos");
    } catch (error) {
      toast({
        title: "뮤직비디오 등록 실패",
        description: error instanceof Error ? error.message : "다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingVideo(false);
      setIsRegisteringVideo(false);
    }
  };

  const subGenres = selectedMainGenre ? mainGenres[selectedMainGenre] || [] : [];

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
      
        <div className="container max-w-2xl px-4 py-12">
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Button
              type="button"
              variant={uploadKind === "audio" ? "default" : "outline"}
              className="w-full gap-2"
              onClick={() => setUploadKind("audio")}
              data-testid="button-audio-upload-mode"
            >
              <MusicIcon size={16} />
              음원 업로드
            </Button>
            <Button
              type="button"
              variant={uploadKind === "video" ? "default" : "outline"}
              className="w-full gap-2"
              onClick={() => setUploadKind("video")}
              data-testid="button-video-upload-mode"
            >
              <Film size={16} />
              MP4 업로드
            </Button>
            <Link href="/bulk-upload" className="block">
              <Button variant="outline" className="w-full gap-2" data-testid="link-bulk-upload">
                <CloudUpload size={16} />
                {t("upload.bulkUpload", "대량 업로드")}
              </Button>
            </Link>
          </div>
        {uploadKind === "audio" ? (
        <Card className="border-white/10 bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="text-primary text-4xl mb-2">
              <CloudUpload className="mx-auto w-10 h-10" />
            </div>
            <CardTitle className="text-2xl font-display" data-testid="text-upload-title">{t('upload.title', '음원 업로드')}</CardTitle>
            <p className="text-muted-foreground text-sm">{t('upload.subtitle', '당신의 음악을 Veny Sound와 공유하세요')}</p>
            {uploadLimit && uploadLimit.limit > 0 && (
              <div className={`mt-3 p-3 rounded-lg text-sm flex items-center gap-2 ${
                uploadLimit.limited 
                  ? "bg-destructive/10 text-destructive border border-destructive/20" 
                  : "bg-primary/10 text-primary border border-primary/20"
              }`} data-testid="text-upload-limit-info">
                {uploadLimit.limited ? (
                  <>
                    <AlertCircle size={16} />
                    {t('upload.limitReached', `이번 달 업로드 한도(${uploadLimit.limit}곡)에 도달했습니다.`)} <Link href="/pricing" className="underline font-semibold">{t('upload.premiumUpgrade', '프리미엄 업그레이드')}</Link>
                  </>
                ) : (
                  <>
                    <MusicIcon size={16} />
                    {t('upload.monthlyUpload', '이번 달 업로드')}: {uploadLimit.current}/{uploadLimit.limit}{t('upload.songsUnit', '곡')}
                  </>
                )}
              </div>
            )}
            {uploadLimit && uploadLimit.limit === -1 && (
              <div className="mt-3 p-3 rounded-lg text-sm flex items-center gap-2 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" data-testid="text-premium-upload">
                <Crown size={16} />
                {t('upload.premiumUnlimited', '프리미엄 회원: 무제한 업로드')}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:items-start">
                  <div className="space-y-2">
                    <FormLabel>{t('upload.audioFile', '음원 파일')}</FormLabel>
                    <div 
                      className={`
                        border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors min-h-[160px] flex flex-col items-center justify-center
                        ${audioFile ? 'border-primary bg-primary/5' : 'border-white/10 hover:border-white/20 hover:bg-white/5'}
                      `}
                      onClick={() => document.getElementById('audio-input')?.click()}
                      data-testid="dropzone-audio"
                    >
                      <input 
                        id="audio-input" 
                        type="file" 
                        accept=".mp3,.wav,.ogg" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setAudioFile(file);
                          if (file) {
                            const titleFromName = file.name.replace(/\.[^/.]+$/, "");
                            form.setValue("title", titleFromName);
                            tryExtractMp3Cover(file);
                          }
                        }}
                      />
                      {audioFile ? (
                        <div className="text-primary flex flex-col items-center">
                          <CheckCircle className="mb-2" />
                          <span className="text-sm truncate max-w-full">{audioFile.name}</span>
                        </div>
                      ) : (
                        <div className="text-muted-foreground flex flex-col items-center">
                          <MusicIcon className="mb-2 w-8 h-8 opacity-50" />
                          <span className="text-sm">{t('upload.dragOrClick', '파일을 여기에 드래그하거나 클릭하세요')}</span>
                          <span className="text-xs text-muted-foreground mt-1">{t('upload.audioFormats', 'MP3, WAV, OGG 형식, 최대 50MB')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <FormLabel>{t('upload.albumCover', '앨범 커버 (선택)')}</FormLabel>
                    <div 
                      className={`
                        border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors min-h-[160px] flex flex-col items-center justify-center
                        ${imageFile || unsplashUrl ? 'border-primary bg-primary/5' : 'border-white/10 hover:border-white/20 hover:bg-white/5'}
                      `}
                      onClick={() => !unsplashUrl && document.getElementById('image-input')?.click()}
                      data-testid="dropzone-image"
                    >
                      <input 
                        id="image-input" 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          setExtractedCoverUrl((prev) => {
                            if (prev) URL.revokeObjectURL(prev);
                            return null;
                          });
                          setImageFile(e.target.files?.[0] || null);
                          setUnsplashUrl(null);
                        }}
                      />
                      {unsplashUrl ? (
                        <div className="text-primary flex flex-col items-center">
                          <img src={unsplashUrl} alt={t('upload.randomCover', '랜덤 커버')} className="w-20 h-20 rounded-md object-cover mb-2" />
                          <span className="text-sm">{t('upload.randomCoverApplied', '랜덤 커버 적용됨')}</span>
                          <button
                            type="button"
                            className="text-xs text-muted-foreground mt-1 underline"
                            onClick={(e) => { e.stopPropagation(); setUnsplashUrl(null); }}
                            data-testid="button-remove-random-cover"
                          >
                            {t('upload.remove', '제거')}
                          </button>
                        </div>
                      ) : imageFile ? (
                        <div className="text-primary flex flex-col items-center">
                          {extractedCoverUrl ? (
                            <img src={extractedCoverUrl} alt="" className="w-20 h-20 rounded-md object-cover mb-2" />
                          ) : (
                            <CheckCircle className="mb-2" />
                          )}
                          <span className="text-sm truncate max-w-full">{imageFile.name}</span>
                        </div>
                      ) : (
                        <div className="text-muted-foreground flex flex-col items-center">
                          <ImageIcon className="mb-2 w-8 h-8 opacity-50" />
                          <span className="text-sm">{t('upload.selectImage', '이미지 선택')}</span>
                          <span className="text-xs text-muted-foreground mt-1">{t('upload.imageFormats', 'PNG, JPG, GIF')}</span>
                        </div>
                      )}
                    </div>
                    {!imageFile && !unsplashUrl && (
                      <div className="flex justify-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleFetchUnsplash}
                          disabled={isFetchingUnsplash}
                          data-testid="button-fetch-random-cover"
                        >
                          {isFetchingUnsplash ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {t('upload.fetching', '가져오는 중...')}
                            </>
                          ) : (
                            <>
                              <ImagePlus className="mr-2 h-4 w-4" />
                              {t('upload.fetchRandomCover', '커버랜덤생성')}
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('upload.songTitle', '음원 제목')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('upload.songTitlePlaceholder', '예: 내 첫 번째 곡')} className="bg-background border-white/10" {...field} data-testid="input-title" />
                      </FormControl>
                      <FormDescription>{t('upload.songTitleDesc', '음원의 제목을 입력해주세요 (최대 100자)')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="artist"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('upload.artistName', '아티스트 이름')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('upload.artistNamePlaceholder', '예: 본인 이름 또는 예명')} className="bg-background border-white/10" {...field} data-testid="input-artist" />
                      </FormControl>
                      <FormDescription>{t('upload.artistNameDesc', '본인의 이름이나 예명을 입력해주세요')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <FormLabel>{t('upload.mainGenre', '장르 (대분류)')}</FormLabel>
                    <Select onValueChange={handleMainGenreChange} value={selectedMainGenre}>
                      <SelectTrigger data-testid="select-main-genre">
                        <SelectValue placeholder={t('upload.mainGenrePlaceholder', '대분류 선택')} />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(mainGenres).map((g) => (
                          <SelectItem key={g} value={g}>
                            {t(`explore.genres.${g}`, g)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {subGenres.length > 0 && (
                    <div className="space-y-2">
                      <FormLabel>{t('upload.subGenre', '장르 (소분류)')}</FormLabel>
                      <Select onValueChange={handleSubGenreChange} value={selectedSubGenre}>
                        <SelectTrigger data-testid="select-sub-genre">
                          <SelectValue placeholder={t('upload.subGenrePlaceholder', '소분류 선택')} />
                        </SelectTrigger>
                        <SelectContent>
                          {subGenres.map((g) => (
                            <SelectItem key={g} value={g}>
                              {t(`explore.genres.${g}`, g)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="lyrics"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('upload.lyrics', '가사 (선택사항)')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('upload.lyricsPlaceholder', '가사를 입력하세요...')}
                          className="bg-background border-white/10 min-h-[120px] resize-y"
                          {...field}
                          data-testid="input-lyrics"
                        />
                      </FormControl>
                      <FormDescription>{t('upload.lyricsDesc', '가사만 입력하면 등록 직후 입싱크 맞추기 단계가 나옵니다. LRC 형식([00:15.00]가사)으로 입력해도 됩니다.')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isAi"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value || false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-ai"
                        />
                      </FormControl>
                      <FormLabel className="font-normal">{t('upload.isAi', 'AI로 만든 음원입니다')}</FormLabel>
                    </FormItem>
                  )}
                />

                <Card className="p-4 border-white/10 bg-secondary/30">
                  <div className="flex items-center gap-2 mb-4">
                    <DollarSign className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-sm">{t('upload.monetization', '수익 창출 설정')}</h3>
                    {((user as any)?.subscriptionTier === "pro" || (user as any)?.subscriptionTier === "premium") && (
                      <span className="text-xs text-primary flex items-center gap-1 ml-auto">
                        <Crown size={12} /> Premium
                      </span>
                    )}
                  </div>
                  <FormField
                    control={form.control}
                    name="isDownloadable"
                    render={({ field }) => {
                      const isPremium = (user as any)?.subscriptionTier === "pro" || (user as any)?.subscriptionTier === "premium";
                      return (
                        <FormItem className="flex flex-row items-center gap-3 space-y-0 mb-4">
                          <FormControl>
                            <Checkbox
                              checked={isPremium ? (field.value || false) : false}
                              disabled={!isPremium}
                              onCheckedChange={(checked) => {
                                if (!isPremium) {
                                  toast({
                                    title: t('upload.premiumRequired', '프리미엄 회원 전용'),
                                    description: t('upload.premiumRequiredDesc', '프리미엄회원에 한해 수익활동이 가능합니다'),
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                field.onChange(checked);
                              }}
                              data-testid="checkbox-downloadable"
                            />
                          </FormControl>
                          <div className="flex-1">
                            <FormLabel className="font-normal flex items-center gap-1">
                              <Download className="w-4 h-4" />
                              {t('upload.allowDownload', '유료 다운로드 허용')}
                            </FormLabel>
                            <FormDescription className="text-xs">
                              {isPremium
                                ? t('upload.downloadDesc', '리스너가 이 음원을 구매하여 다운로드할 수 있습니다')
                                : t('upload.premiumRequiredDesc', '프리미엄회원에 한해 수익활동이 가능합니다')}
                            </FormDescription>
                          </div>
                        </FormItem>
                      );
                    }}
                  />

                  {form.watch("isDownloadable") && ((user as any)?.subscriptionTier === "pro" || (user as any)?.subscriptionTier === "premium") && (
                    <FormField
                      control={form.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('upload.downloadPrice', '다운로드 가격 (원)')}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={100}
                              step={100}
                              placeholder={t('upload.pricePlaceholder', '예: 1000')}
                              className="bg-background border-white/10"
                              value={field.value || ""}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              data-testid="input-price"
                            />
                          </FormControl>
                          <FormDescription>{t('upload.priceDesc', '최소 100원부터 설정 가능합니다')}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </Card>

                <Button 
                  type="submit" 
                  className="w-full bg-primary text-white font-semibold"
                  disabled={isUploadingAudio || isUploadingImage || isCreating || isFetchingUnsplash || isApplyingFromCreate || (uploadLimit?.limited === true)}
                  data-testid="button-submit-upload"
                >
                  {(isApplyingFromCreate || isUploadingAudio || isUploadingImage || isCreating) ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isApplyingFromCreate && !isCreating ? t("upload.applyingFromCreate", "생성된 곡 적용 중...") : t("upload.uploading", "업로드 중...")}
                    </>
                  ) : (
                    t('upload.submitUpload', '음원 업로드')
                  )}
                </Button>
              </form>
            </Form>

            <div className="flex items-center justify-start mt-6">
              <Link href="/">
                <div className="flex items-center gap-2 text-primary cursor-pointer hover:underline" data-testid="link-back-home">
                  <ArrowLeft size={16} />
                  {t('upload.backToHome', '홈으로 돌아가기')}
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
        ) : (
          <Card className="border-white/10 bg-card/50 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="text-primary text-4xl mb-2">
                <Film className="mx-auto h-10 w-10" />
              </div>
              <CardTitle className="text-2xl font-display" data-testid="text-video-upload-title">뮤직비디오 업로드</CardTitle>
              <p className="text-muted-foreground text-sm">MP4 영상을 등록하면 뮤직비디오 페이지에 게시됩니다.</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="video-input">MP4 영상 파일</Label>
                <label
                  htmlFor="video-input"
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors min-h-[160px] flex flex-col items-center justify-center ${
                    videoFile ? "border-primary bg-primary/5" : "border-white/10 hover:border-white/20 hover:bg-white/5"
                  }`}
                  data-testid="dropzone-video"
                >
                  <input
                    id="video-input"
                    type="file"
                    accept="video/mp4,.mp4"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      handleVideoFileChange(file);
                      if (
                        file &&
                        ((!file.type.includes("mp4") && !file.name.toLowerCase().endsWith(".mp4")) || file.size > MAX_VIDEO_FILE_SIZE)
                      ) {
                        e.currentTarget.value = "";
                      }
                    }}
                  />
                  {videoFile ? (
                    <div className="text-primary flex flex-col items-center">
                      <CheckCircle className="mb-2" />
                      <span className="max-w-full truncate text-sm">{videoFile.name}</span>
                      <span className="mt-1 text-xs text-muted-foreground">{(videoFile.size / (1024 * 1024)).toFixed(1)}MB</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground flex flex-col items-center">
                      <Film className="mb-2 h-8 w-8 opacity-50" />
                      <span className="text-sm">MP4 파일을 선택하세요</span>
                      <span className="mt-1 text-xs text-muted-foreground">MP4 형식, 최대 500MB</span>
                    </div>
                  )}
                </label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="video-title">영상 제목</Label>
                <Input
                  id="video-title"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  placeholder="영상 제목"
                  maxLength={180}
                  className="bg-background border-white/10"
                  data-testid="input-video-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="video-description">설명 (선택사항)</Label>
                <Textarea
                  id="video-description"
                  value={videoDescription}
                  onChange={(e) => setVideoDescription(e.target.value)}
                  placeholder="영상 설명을 입력하세요"
                  maxLength={1200}
                  className="min-h-[120px] bg-background border-white/10 resize-y"
                  data-testid="input-video-description"
                />
              </div>

              <Button
                type="button"
                className="w-full bg-primary text-white font-semibold"
                disabled={!videoFile || isUploadingVideo || isRegisteringVideo}
                onClick={() => void handleVideoUpload()}
                data-testid="button-submit-video-upload"
              >
                {isUploadingVideo || isRegisteringVideo ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isUploadingVideo ? `영상 업로드 중... ${videoUploadProgress}%` : "뮤직비디오 등록 중..."}
                  </>
                ) : (
                  "뮤직비디오 업로드"
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
      <Footer />

      <Dialog open={!!postUploadSync} onOpenChange={(open) => { if (!open) { setPostUploadSync(null); setLocation("/"); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('upload.syncLyricsTitle', '가사 입싱크 맞추기')}</DialogTitle>
            <DialogDescription>
              {t('upload.syncLyricsDesc', '음원을 재생하면서 가사가 나올 때마다 버튼을 눌러주세요. 등록 직후 한 번만 맞추면 됩니다.')}
            </DialogDescription>
          </DialogHeader>
          {postUploadSync && (
            <LyricsSyncEditor
              audioUrl={`/api/music/${postUploadSync.musicId}/stream`}
              plainLyrics={postUploadSync.lyrics.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, "").trim()}
              onSave={(lrc) => {
                updateMusic(
                  { id: postUploadSync.musicId, data: { lyrics: lrc } },
                  {
                    onSuccess: () => {
                      toast({ title: t('upload.syncSaved', '가사 싱크가 저장되었습니다') });
                      setPostUploadSync(null);
                      setLocation("/");
                    },
                  }
                );
              }}
              onClose={() => { setPostUploadSync(null); setLocation("/"); }}
            />
          )}
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setPostUploadSync(null); setLocation("/"); }}
              disabled={isUpdatingLyrics}
              data-testid="button-skip-sync"
            >
              {t('upload.skipSync', '나중에 하기')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </PageTransition>
  );
}
