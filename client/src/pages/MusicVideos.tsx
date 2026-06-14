import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Loader2, Play, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type MusicVideo = {
  id: number;
  title: string;
  description?: string | null;
  videoUrl: string;
  originalFilename?: string | null;
  durationSec?: number | null;
  fileSize?: number | null;
  createdAt: string;
  creator: {
    id: string;
    name: string;
    profileImageUrl?: string | null;
  };
};

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const { uploadFile, isUploading, progress } = useUpload();
  const { data: videos = [], isLoading } = useQuery({
    queryKey: ["/api/music-videos"],
    queryFn: fetchMusicVideos,
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

  return (
    <PageTransition>
      <Navigation />
      <main className="min-h-screen bg-slate-950 text-white">
        <section className="border-b border-white/10 bg-slate-950 px-4 py-6 md:py-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
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
              <div className="hidden grid-cols-3 gap-4 md:grid">
                {videos.map((video) => (
                  <Card key={video.id} className="overflow-hidden border-white/10 bg-white/5 text-white">
                    <CardContent className="p-0">
                      <video src={video.videoUrl} controls preload="metadata" className="aspect-video w-full bg-black object-contain" />
                      <div className="space-y-1 p-4">
                        <h2 className="line-clamp-1 text-base font-semibold">{video.title}</h2>
                        <p className="text-sm text-slate-300">{video.creator.name}</p>
                        <p className="text-xs text-slate-500">{formatDate(video.createdAt)} {formatSize(video.fileSize)}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="md:hidden">
                <div className="h-[calc(100dvh-8rem)] snap-y snap-mandatory overflow-y-auto rounded-lg border border-white/10 bg-black">
                  {videos.map((video) => (
                    <article key={video.id} className="relative flex h-[calc(100dvh-8rem)] snap-start flex-col bg-black">
                      <video src={video.videoUrl} controls playsInline preload="metadata" className="min-h-0 flex-1 bg-black object-contain" />
                      <div className="border-t border-white/10 bg-slate-950/95 p-4">
                        <h2 className="line-clamp-1 text-lg font-semibold">{video.title}</h2>
                        <p className="mt-1 text-sm text-slate-300">{video.creator.name}</p>
                        {video.description ? <p className="mt-2 line-clamp-2 text-sm text-slate-400">{video.description}</p> : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </main>
      <Footer />
    </PageTransition>
  );
}
