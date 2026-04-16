import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { MusicCard } from "@/components/MusicCard";
import { InternationalReleaseCard, type InternationalReleaseItem } from "@/components/InternationalReleaseCard";
import { useMusicList } from "@/hooks/use-music";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Play, ChevronLeft, ChevronRight, ListMusic, TrendingUp, Globe, Loader2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePlayerStore } from "@/components/AudioPlayer";
import { PageTransition } from "@/components/PageTransition";
import { StreamingPlatformsStrip } from "@/components/StreamingPlatformsStrip";
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

const FALLBACK_GENRES = ["전체", "팝뮤직", "국내가요", "월드뮤직", "경음악", "힐링", "케이팝", "발라드", "트로트", "재즈", "클래식", "찬양", "기타"];

export default function Explore() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const catalogTab = useMemo(() => {
    const p = new URLSearchParams(searchString);
    return p.get("catalog") === "international" ? "international" as const : "site" as const;
  }, [searchString]);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  
  const debouncedSearch = useDebounce(searchTerm, 500);

  /** /music?q=… 또는 ?search=… 로 들어올 때 사이트 탭 검색창에 반영 */
  useEffect(() => {
    const p = new URLSearchParams(searchString);
    const q = (p.get("q") || p.get("search") || "").trim();
    if (q) setSearchTerm(q);
  }, [searchString]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedGenre]);

  useEffect(() => {
    setCurrentPage(1);
  }, [catalogTab]);

  const setCatalogTab = (next: "site" | "international") => {
    if (next === "international") {
      setLocation("/music?catalog=international");
    } else {
      setLocation("/music");
    }
  };

  const { data: musicResult, isLoading, isError, error, refetch: refetchMusicList } = useMusicList({ 
    search: debouncedSearch,
    genre: selectedGenre,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
    enabled: catalogTab === "site",
  });

  const { data: intlResult, isLoading: intlLoading } = useQuery<{
    data: InternationalReleaseItem[];
    total: number;
  }>({
    queryKey: ["/api/music/international-releases", currentPage, ITEMS_PER_PAGE],
    queryFn: async () => {
      const qs = new URLSearchParams({
        page: String(currentPage),
        limit: String(ITEMS_PER_PAGE),
      });
      const res = await fetch(`/api/music/international-releases?${qs}`);
      if (!res.ok) throw new Error("international-releases");
      return res.json();
    },
    enabled: catalogTab === "international",
  });

  const musicList = musicResult?.data;
  const siteTotalCount = musicResult?.total || 0;
  const intlList = intlResult?.data;
  const intlTotal = intlResult?.total ?? 0;
  const totalCount = catalogTab === "international" ? intlTotal : siteTotalCount;
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

  const { data: popularTracks } = useQuery<any[]>({
    queryKey: ["/api/music/popular"],
    queryFn: async () => {
      const res = await fetch("/api/music/popular");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: genreList } = useQuery<string[]>({
    queryKey: ["/api/music/genres"],
    queryFn: async () => {
      const res = await fetch("/api/music/genres");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const genres = genreList && genreList.length > 0 ? ["전체", ...genreList] : FALLBACK_GENRES;

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
      
        <div className={`container px-4 ${catalogTab === "international" ? "py-4" : "py-8"}`}>
        <div
          className={`flex flex-col md:flex-row items-center justify-between flex-wrap min-w-0 ${catalogTab === "international" ? "gap-0.5 mb-1.5" : "gap-4 mb-4"}`}
        >
          <div className="flex flex-col min-w-0 gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-display font-bold" data-testid="text-page-title">
                {catalogTab === "international"
                  ? t("explore.internationalPageTitle", "우리가 만든 곡 해외 출시 목록")
                  : t("explore.title")}
              </h1>
              <span className="text-sm text-muted-foreground" data-testid="text-total-count">
                {t("explore.totalCount", { count: totalCount })}
              </span>
            </div>
            {catalogTab === "international" ? (
              <p className="text-[12px] sm:text-[13px] text-muted-foreground leading-tight max-w-3xl py-0">
                {t(
                  "explore.internationalIntroLead",
                  "VenySound는 회원 아티스트의 음원을 해외 스트리밍 플랫폼에 출시할 수 있도록 지원하고 있습니다. 다만 해당 플랫폼에서 정책상 거절되거나 삭제될 수 있음을 알려드립니다. 이 사이트에 표시되는 내용은 Spotify 출시 내역만 해당됩니다.",
                )}
              </p>
            ) : null}
          </div>

          {catalogTab === "site" ? (
            <div className="flex items-center gap-3 flex-wrap w-full md:w-auto">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <Input
                  placeholder={t("explore.searchPlaceholder")}
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
                    const ids = musicList.map((m) => m.id);
                    setPlaylist(ids);
                    if (musicList[0]) playMusic(musicList[0].id);
                  }}
                  data-testid="button-play-all"
                >
                  <Play size={16} />
                  {t("explore.playAll")}
                </Button>
              )}
            </div>
          ) : null}
        </div>

        <div
          className={`flex gap-2 overflow-x-auto scrollbar-hide ${catalogTab === "international" ? "pb-1.5 mb-0.5" : "pb-6"}`}
          data-testid="catalog-tabs"
        >
          <button
            type="button"
            onClick={() => setCatalogTab("site")}
            data-testid="button-catalog-site"
            className={`
              px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2
              ${catalogTab === "site" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}
            `}
          >
            <ListMusic size={16} />
            {t("explore.catalogSite", "사이트 음원")}
          </button>
          <button
            type="button"
            onClick={() => setCatalogTab("international")}
            data-testid="button-catalog-international"
            className={`
              px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2
              ${catalogTab === "international" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}
            `}
          >
            <Globe size={16} />
            {t("explore.catalogInternational", "해외 출시")}
          </button>
        </div>

        {catalogTab === "international" && (
          <div
            className="mb-2 rounded-lg border border-primary/25 bg-primary/5 px-2 py-1.5 text-sm space-y-1"
            data-testid="international-info-banner"
          >
            <StreamingPlatformsStrip />
            <Link
              href="/global-distribution-guide"
              className="inline-flex text-primary text-xs sm:text-sm font-medium hover:underline underline-offset-2 leading-tight"
              data-testid="link-international-distribution-guide"
            >
              {t("explore.internationalBannerGuideCta")}
            </Link>
          </div>
        )}

        {catalogTab === "site" && Array.isArray(popularTracks) && popularTracks.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <TrendingUp size={20} className="text-primary" />
              {t('explore.recommendedForYou', '이런 곡은 어때요')}
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {popularTracks.map((track) => (
                <div key={track.id} className="w-[140px] sm:w-[160px] flex-shrink-0">
                  <MusicCard music={track} />
                </div>
              ))}
            </div>
          </section>
        )}

        {catalogTab === "site" && Array.isArray(curatedPlaylists) && curatedPlaylists.length > 0 && (
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
                    <p className="font-medium truncate" title={pl.name}>{t(`explore.curatedPlaylist.${pl.slug}.name`, pl.name)}</p>
                    {(pl.genreMain || pl.genreSub) && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {[pl.genreMain, pl.genreSub].filter(Boolean).join(" / ")}
                      </p>
                    )}
                    {(() => {
                      const desc = t(`explore.curatedPlaylist.${pl.slug}.description`, pl.description || '');
                      return desc ? <p className="text-xs text-muted-foreground truncate mt-0.5" title={desc}>{desc}</p> : null;
                    })()}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {catalogTab === "site" && (
        <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
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
        )}

        {catalogTab === "site" && (
          <>
            <div className="music-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {musicList?.map((music) => (
                <div key={music.id} className="transform scale-90 md:scale-90 origin-top-left">
                  <MusicCard music={music} />
                </div>
              ))}
            </div>

            {isError && !isLoading && (
              <div className="text-center py-20 space-y-4 px-4" data-testid="text-music-list-error">
                <p className="text-destructive font-medium">
                  {t("explore.musicListLoadError", "목록을 불러오지 못했습니다. API 연결을 확인해 주세요.")}
                </p>
                <p className="text-xs text-muted-foreground break-all max-w-lg mx-auto">
                  {error instanceof Error ? error.message : String(error)}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => void refetchMusicList()}>
                  {t("explore.retryLoad", "다시 시도")}
                </Button>
              </div>
            )}
            {musicList?.length === 0 && !isLoading && !isError && (
              <div className="text-center py-20 text-muted-foreground" data-testid="text-no-results">
                {t("explore.noResults")}
              </div>
            )}
          </>
        )}

        {catalogTab === "international" && (
          <>
            {intlLoading ? (
              <div className="flex justify-center py-24" data-testid="intl-loading">
                <Loader2 className="animate-spin text-primary" size={40} />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:gap-3 w-full">
                  {intlList?.map((item, idx) => (
                    <InternationalReleaseCard
                      key={item.siteMusicId != null ? `m-${item.siteMusicId}` : `${item.id}-${idx}`}
                      item={item}
                    />
                  ))}
                </div>
                {intlList?.length === 0 && (
                  <div
                    className="flex flex-col items-center justify-center py-20 px-4 text-center rounded-xl border border-dashed border-white/10 bg-card/30"
                    data-testid="text-intl-empty"
                  >
                    <Globe className="text-muted-foreground mb-4" size={48} strokeWidth={1.25} />
                    <p className="text-lg font-medium text-foreground mb-2">
                      {t("explore.internationalEmptyTitle", "표시할 해외 출시 곡이 없습니다")}
                    </p>
                    <p className="text-sm text-muted-foreground max-w-md">
                      {t(
                        "explore.internationalEmptyDesc",
                        "서버에 Spotify 연동과 출시 아티스트 ID가 설정되어 있는지 확인해 주세요.",
                      )}
                    </p>
                  </div>
                )}
              </>
            )}
          </>
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
