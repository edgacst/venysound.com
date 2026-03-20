import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { LOGIN_PATH } from "@/lib/site-paths";
import { useToast } from "@/hooks/use-toast";
import { Download, Music, Loader2, ShoppingBag } from "lucide-react";
import { Link } from "wouter";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PageTransition } from "@/components/PageTransition";
import { resolveStorageUrl } from "@/lib/utils";
import { usePlayerStore } from "@/components/AudioPlayer";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface PurchasedMusic {
  id: number;
  musicId: number;
  purchasedAt: string;
  music: {
    id: number;
    title: string;
    artist: string;
    imageFilename?: string;
    price: number;
    genre?: string;
  };
}

export default function MyLibrary() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const playMusic = usePlayerStore((s) => s.playMusic);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const { data: purchases, isLoading } = useQuery<PurchasedMusic[]>({
    queryKey: ["/api/purchases/my"],
    enabled: !!user,
  });

  const handleDownload = async (musicId: number, title: string) => {
    setDownloadingId(musicId);
    try {
      const res = await fetch(`/api/music/${musicId}/download`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "다운로드 실패");
      }
      const blob = await res.blob();
      const contentDisposition = res.headers.get("Content-Disposition") || "";
      let filename = title + ".mp3";
      const filenameMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
      if (filenameMatch) {
        filename = decodeURIComponent(filenameMatch[1].replace(/"/g, ""));
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t('myLibrary.downloadComplete', '다운로드 완료'), description: t('myLibrary.downloadCompleteDesc', '{{title}} 파일이 다운로드되었습니다.', { title }) });
    } catch (err: any) {
      toast({ title: t('myLibrary.downloadFailed', '다운로드 실패'), description: err.message, variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  if (!user) {
    return (
      <>
        <Navigation />
        <PageTransition>
          <main className="min-h-screen bg-background pt-16">
            <div className="max-w-2xl mx-auto px-4 py-20 text-center">
              <Music size={48} className="mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">{t('myLibrary.loginRequired', '로그인이 필요합니다')}</h2>
              <p className="text-muted-foreground mb-6">{t('myLibrary.loginRequiredDesc', '내 라이브러리를 보려면 로그인해주세요.')}</p>
              <Link href={LOGIN_PATH}>
                <Button>{t('myLibrary.login', '로그인')}</Button>
              </Link>
            </div>
          </main>
        </PageTransition>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navigation />
      <PageTransition>
        <main className="min-h-screen bg-background pt-16">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="flex items-center gap-3 mb-8">
              <ShoppingBag size={28} className="text-primary" />
              <div>
                <h1 className="text-2xl font-bold">{t('myLibrary.title', '내 라이브러리')}</h1>
                <p className="text-muted-foreground text-sm mt-0.5">{t('myLibrary.subtitle', '구매한 음원을 다운로드하세요')}</p>
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 size={32} className="animate-spin text-muted-foreground" />
              </div>
            ) : !purchases || purchases.length === 0 ? (
              <div className="text-center py-20">
                <Music size={48} className="mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">{t('myLibrary.emptyTitle', '구매한 음원이 없습니다')}</h2>
                <p className="text-muted-foreground mb-6">{t('myLibrary.emptyDesc', '음원을 구매하면 여기에 표시됩니다.')}</p>
                <Link href="/">
                  <Button>{t('myLibrary.browseMusic', '음원 둘러보기')}</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground mb-4">
                  {t('myLibrary.purchasedCount', '총 {{count}}개의 음원을 구매했습니다.', { count: purchases.length })}
                </p>
                {purchases.map((p) => {
                  const imgUrl = p.music?.imageFilename
                    ? resolveStorageUrl(p.music.imageFilename)
                    : "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=80&h=80&fit=crop";
                  return (
                    <Card key={p.id} className="flex items-center gap-4 p-4">
                      <img
                        src={imgUrl}
                        alt={p.music?.title}
                        className="w-14 h-14 rounded-md object-cover shrink-0 cursor-pointer"
                        onClick={() => p.music?.id && playMusic(p.music.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-semibold truncate cursor-pointer hover:text-primary transition-colors"
                          onClick={() => p.music?.id && playMusic(p.music.id)}
                        >
                          {p.music?.title || t('myLibrary.unknownTrack', '알 수 없는 음원')}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">{p.music?.artist}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {p.music?.genre && (
                            <Badge variant="secondary" className="text-xs">
                              {p.music.genre}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(p.purchasedAt).toLocaleDateString("ko-KR")} {t('myLibrary.purchased', '구매')}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleDownload(p.music.id, p.music?.title || "music")}
                        disabled={downloadingId === p.music?.id}
                        className="shrink-0 gap-2"
                      >
                        {downloadingId === p.music?.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                        {t('myLibrary.download', '다운로드')}
                      </Button>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </PageTransition>
      <Footer />
    </>
  );
}
