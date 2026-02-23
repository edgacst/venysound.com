import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { MusicCard } from "@/components/MusicCard";
import { usePlayerStore } from "@/components/AudioPlayer";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Search, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";

const GENRE_KEYS = [
  "팝뮤직",
  "국내가요",
  "케이팝",
  "발라드",
  "트로트",
  "재즈",
  "클래식",
  "월드뮤직",
  "경음악",
  "기타",
];

export default function Explore() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const { playMusic, setPlaylist } = usePlayerStore();

  const { data, isLoading } = useQuery<{ data: any[]; total: number }>({
    queryKey: ["/api/music", { genre, search, limit: 50 }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (genre) params.set("genre", genre);
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", "50");
      const res = await fetch(`/api/music?${params}`);
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const musicList = data?.data ?? [];
  const total = data?.total ?? musicList.length;

  const handlePlayAll = () => {
    if (!musicList?.length) return;
    const ids = musicList.map((m: any) => m.id);
    setPlaylist(ids);
    playMusic(ids[0]);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      <Navigation />

      <div className="container px-4 py-8">
        <h1 className="text-3xl font-display font-bold mb-6" data-testid="text-explore-title">
          {t("explore.title")}
        </h1>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input
              placeholder={t("explore.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="input-explore-search"
            />
          </div>
          <Button onClick={handlePlayAll} disabled={!musicList.length} className="shrink-0 gap-2" data-testid="button-play-all">
            <Play size={18} />
            {t("explore.playAll")}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <Button
            variant={genre === null ? "default" : "outline"}
            size="sm"
            onClick={() => setGenre(null)}
            data-testid="filter-all"
          >
            {t("explore.all")}
          </Button>
          {GENRE_KEYS.map((g) => (
            <Button
              key={g}
              variant={genre === g ? "default" : "outline"}
              size="sm"
              onClick={() => setGenre(g)}
              data-testid={`filter-genre-${g}`}
            >
              {t(`explore.genres.${g}`, g)}
            </Button>
          ))}
        </div>

        <p className="text-muted-foreground mb-6" data-testid="text-total-count">
          {t("explore.totalCount", { count: total })}
        </p>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-primary" size={40} />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {musicList.map((music: any) => (
              <MusicCard key={music.id} music={music} />
            ))}
            {musicList.length === 0 && (
              <div className="col-span-full text-center py-20 text-muted-foreground" data-testid="text-no-results">
                {t("explore.noResults")}
              </div>
            )}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
