import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { MusicCard } from "@/components/MusicCard";
import { useMusicList } from "@/hooks/use-music";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Play, ChevronLeft, ChevronRight, ListMusic } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePlayerStore } from "@/components/AudioPlayer";
import { PageTransition } from "@/components/PageTransition";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from 'react-i18next';
import { resolveStorageUrl } from "@/lib/utils";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const ITEMS_PER_PAGE = 30;

export default function Explore() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  
  const debouncedSearch = useDebounce(searchTerm, 500);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedGenre]);

  const { data: musicResult, isLoading } = useMusicList({ 
    search: debouncedSearch,
    genre: selectedGenre,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  });

  const musicList = musicResult?.data;
  const totalCount = musicResult?.total || 0;
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const { playMusic, setPlaylist } = usePlayerStore();

  const { data: curatedPlaylists } = useQuery<{ id: number; name: string; description: string | null; slug: string; sortOrder: number; coverImageFilename: string | null; genreMain?: string | null; genreSub?: string | null }[]>({
    queryKey: ["/api/curated-playlists"],
    queryFn: async () => {
      const res = await fetch("/api/curated-playlists");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const genres = ["전체", "팝뮤직", "국내가요", "월드뮤직", "경음악", "케이팝", "발라드", "트로트", "재즈", "클래식", "기타"];

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
      
        <div className="container px-4 py-8">
        <div className="flex flex-col md:flex-row gap-4 mb-8 items-center justify-between flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-display font-bold" data-testid="text-page-title">{t('explore.title')}</h1>
            <span className="text-sm text-muted-foreground" data-testid="text-total-count">
              {t('explore.totalCount', { count: totalCount })}
            </span>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input 
                placeholder={t('explore.searchPlaceholder')} 
                className="pl-10 bg-secondary/50 border-white/5 focus:border-primary/50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search"
              />
            </div>
            {user && musicList && musicList.length > 0 && (
              <Button 
                variant="outline"
                className="gap-2 border-white/10"
                onClick={() => {
                  const ids = musicList.map(m => m.id);
                  setPlaylist(ids);
                  if (musicList[0]) playMusic(musicList[0].id);
                }}
                data-testid="button-play-all"
              >
                <Play size={16} />
                {t('explore.playAll')}
              </Button>
            )}
          </div>
        </div>

        {Array.isArray(curatedPlaylists) && curatedPlaylists.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <ListMusic size={20} className="text-primary" />
              {t('explore.themedPlaylists', '테마 플레이리스트')}
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {curatedPlaylists.map((pl) => (
                <Link key={pl.id} href={`/curated/${pl.slug}`}>
                  <div
                    className="w-40 sm:w-48 flex-shrink-0 rounded-lg border border-border bg-card p-4 hover:bg-card/80 transition-colors cursor-pointer"
                    data-testid={`curated-card-${pl.slug}`}
                  >
                    <div className="aspect-square rounded-md bg-muted/50 flex items-center justify-center mb-3 overflow-hidden">
                      {pl.coverImageFilename ? (
                        <img
                          src={resolveStorageUrl(pl.coverImageFilename)}
                          alt={pl.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ListMusic size={32} className="text-muted-foreground" />
                      )}
                    </div>
                    <p className="font-medium truncate" title={pl.name}>{pl.name}</p>
                    {(pl.genreMain || pl.genreSub) && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {[pl.genreMain, pl.genreSub].filter(Boolean).join(" / ")}
                      </p>
                    )}
                    {pl.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5" title={pl.description}>{pl.description}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="flex gap-2 overflow-x-auto pb-6 scrollbar-hide">
          {genres.map((genre) => (
            <button
              key={genre}
              onClick={() => setSelectedGenre(genre === "전체" ? undefined : genre)}
              data-testid={`button-genre-${genre}`}
              className={`
                px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors
                ${(selectedGenre === genre || (genre === "전체" && selectedGenre === undefined))
                  ? "bg-primary text-white" 
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"}
              `}
            >
              {genre === "전체" ? t('explore.all') : t('explore.genres.' + genre, genre)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {musicList?.map((music) => (
            <div key={music.id} className="transform scale-90 md:scale-90 origin-top-left">
              <MusicCard music={music} />
            </div>
          ))}
        </div>

        {musicList?.length === 0 && !isLoading && (
          <div className="text-center py-20 text-muted-foreground" data-testid="text-no-results">
            {t('explore.noResults')}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-10" data-testid="pagination">
            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="border-white/10"
              data-testid="button-prev-page"
            >
              <ChevronLeft size={18} />
            </Button>
            
            {getPageNumbers().map((page, idx) => (
              typeof page === "number" ? (
                <Button
                  key={idx}
                  variant={page === currentPage ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePageChange(page)}
                  className={page === currentPage ? "" : "border-white/10"}
                  data-testid={`button-page-${page}`}
                >
                  {page}
                </Button>
              ) : (
                <span key={idx} className="px-2 text-muted-foreground">...</span>
              )
            ))}

            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="border-white/10"
              data-testid="button-next-page"
            >
              <ChevronRight size={18} />
            </Button>
          </div>
        )}
      </div>
      <Footer />
      </div>
    </PageTransition>
  );
}
