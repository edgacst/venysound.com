import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { MusicCard } from "@/components/MusicCard";
import { usePlayerStore } from "@/components/AudioPlayer";
import { Button } from "@/components/ui/button";
import { Play, ListMusic, ArrowLeft } from "lucide-react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { redirectToLogin } from "@/lib/auth-utils";

export default function CuratedPlaylist() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const { playMusic, setPlaylist } = usePlayerStore();

  const { data: playlist, isLoading, isError } = useQuery<{
    id: number;
    name: string;
    description: string | null;
    slug: string;
    coverImageFilename?: string | null;
    genreMain?: string | null;
    genreSub?: string | null;
    tracks: any[];
  }>({
    queryKey: ["/api/curated-playlists", slug],
    queryFn: async () => {
      const res = await fetch(`/api/curated-playlists/${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!slug,
  });

  const handlePlayAll = () => {
    if (!playlist?.tracks?.length) return;
    if (!user) return redirectToLogin();
    const ids = playlist.tracks.map((m: any) => m.id);
    setPlaylist(ids);
    playMusic(playlist.tracks[0].id);
  };

  if (!slug) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-background flex flex-col">
          <Navigation />
          <div className="container px-4 py-12 text-center text-muted-foreground">
            <p>{t("curated.notFound", "플레이리스트를 찾을 수 없습니다.")}</p>
            <Link href="/music">
              <Button variant="link" className="mt-2">{t("curated.backToMusic", "음원 목록으로")}</Button>
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
        <div className="min-h-screen bg-background flex flex-col pb-24">
          <Navigation />
          <div className="container px-4 py-8">
            <div className="h-8 w-48 bg-muted rounded animate-pulse mb-4" />
            <div className="h-4 w-full max-w-xl bg-muted rounded animate-pulse mb-8" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />
              ))}
            </div>
          </div>
          <Footer />
        </div>
      </PageTransition>
    );
  }

  if (isError || !playlist) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-background flex flex-col">
          <Navigation />
          <div className="container px-4 py-12 text-center text-muted-foreground">
            <ListMusic size={48} className="mx-auto mb-4 opacity-50" />
            <p>{t("curated.notFound", "플레이리스트를 찾을 수 없습니다.")}</p>
            <Link href="/music">
              <Button variant="outline" className="mt-4 gap-2">
                <ArrowLeft size={16} />
                {t("curated.backToMusic", "음원 목록으로")}
              </Button>
            </Link>
          </div>
          <Footer />
        </div>
      </PageTransition>
    );
  }

  const playlistTrackIds = playlist.tracks.map((track: any) => track.id);

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="container px-4 py-8">
          <Link href="/music">
            <Button variant="ghost" size="sm" className="mb-4 gap-2 text-muted-foreground">
              <ArrowLeft size={16} />
              {t("curated.backToMusic", "음원 목록으로")}
            </Button>
          </Link>

          <div className="flex flex-col gap-3 mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold" data-testid="curated-playlist-title">
                {playlist.name}
              </h1>
              {playlist.description && (
                <p className="text-muted-foreground mt-1 max-w-2xl">{playlist.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                {playlist.tracks.length} {t("curated.tracks", "곡")}
              </p>
              {playlist.tracks.length > 0 && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={handlePlayAll}
                  className="gap-1 h-5 px-0 text-sm text-primary"
                  data-testid="curated-play-all"
                >
                  <Play size={14} />
                  {t("curated.playAll", "전체 재생")}
                </Button>
              )}
            </div>
          </div>

          {playlist.tracks.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center">{t("curated.empty", "아직 수록곡이 없습니다.")}</p>
          ) : (
            <div className="flex max-w-4xl flex-col gap-3" data-testid="curated-track-list">
              {playlist.tracks.map((track: any, index: number) => (
                <div
                  key={track.id}
                  className="relative rounded-[22px] border border-primary/10 bg-gradient-to-r from-primary/10 via-card to-card p-1 shadow-[0_18px_44px_-34px_rgba(124,58,237,0.65)]"
                  data-testid={`curated-track-row-${track.id}`}
                >
                  <span className="absolute -left-1.5 -top-1.5 z-10 rounded-full bg-primary px-2 py-0.5 text-[11px] font-black text-primary-foreground shadow-lg">
                    {index + 1}
                  </span>
                  <MusicCard music={track} variant="homeLikedRow" playlistIds={playlistTrackIds} />
                </div>
              ))}
            </div>
          )}
        </div>
        <Footer />
      </div>
    </PageTransition>
  );
}
