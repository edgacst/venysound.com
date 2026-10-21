import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { MusicCard } from "@/components/MusicCard";
import { InternationalReleaseCard, type InternationalReleaseItem } from "@/components/InternationalReleaseCard";
import { useMusicList } from "@/hooks/use-music";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Play, Pause, ChevronLeft, ChevronRight, ListMusic, TrendingUp, Globe, Loader2 } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePlayerStore } from "@/components/AudioPlayer";
import { PageTransition } from "@/components/PageTransition";
import { StreamingPlatformsStrip } from "@/components/StreamingPlatformsStrip";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from 'react-i18next';
import { resolveStorageUrl } from "@/lib/utils";
import { redirectToLogin } from "@/lib/auth-utils";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const ITEMS_PER_PAGE = 30;

const DISPLAY_GENRES = [
  "전체", "케이팝", "팝", "발라드", "힙합", "R&B", "록", "재즈",
  "클래식", "EDM", "트로트", "국내가요", "OST", "힐링", "찬양", "기타",
];

export default function Explore() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const pageFromSearch = useMemo(() => {
    const rawPage = new URLSearchParams(searchString).get("page");
    const page = Number(rawPage);
    return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  }, [searchString]);
  const catalogTab = useMemo(() => {
    const p = new URLSearchParams(searchString);
    return p.get("catalog") === "international" ? "international" as const : "site" as const;
  }, [searchString]);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(pageFromSearch);
  const [isStartingPlayAll, setIsStartingPlayAll] = useState(false);
  const didInitPagingReset = useRef(false);
  
  const debouncedSearch = useDebounce(searchTerm, 500);

  /** /music?q=… 또는 ?search=… 로 들어올 때 사이트 탭 검색창에 반영 */
  useEffect(() => {
    const p = new URLSearchParams(searchString);
    const q = (p.get("q") || p.get("search") || "").trim();
    if (q) setSearchTerm(q);
  }, [searchString]);

  useEffect(() => {
    setCurrentPage(pageFromSearch);
  }, [pageFromSearch]);

  const replacePageParam = (page: number) => {
    const params = new URLSearchParams(searchString);
    if (page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/music?${qs}` : "/music");
  };

  const pushPageParam = (page: number) => {
    const params = new URLSearchParams(searchString);
    if (page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
    const qs = params.toString();
    setLocation(qs ? `/music?${qs}` : "/music");
  };

  useEffect(() => {
    if (!didInitPagingReset.current) return;
    if (currentPage === 1) return;
    setCurrentPage(1);
    replacePageParam(1);
  }, [debouncedSearch, selectedGenre]);

  useEffect(() => {
    if (!didInitPagingReset.current) {
      didInitPagingReset.current = true;
      return;
    }
    if (currentPage === 1) return;
    setCurrentPage(1);
    replacePageParam(1);
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

  const { playMusic, setPlaylist, activeMusicId, pauseRequested, togglePause } = usePlayerStore();

  const sitePageIds = useMemo(() => {
    if (!musicList || musicList.length === 0) return [];
    return musicList.map((m) => m.id);
  }, [musicList]);
  const { data: curatedPlaylists } = useQuery<{ id: number; name: string; description: string | null; slug: string; sortOrder: number; coverImageFilename: string | null; genreMain?: string | null; genreSub?: string | null }[]>({
    queryKey: ["/api/curated-playlists"],
    queryFn: async () => {
      const res = await fetch("/api/curated-playlists");
      if (!res.ok) return [];
      return res.json();
    },
  });
  const hasCuratedPlaylists = Array.isArray(curatedPlaylists) && curatedPlaylists.length > 0;

  const { data: popularTracks } = useQuery<any[]>({
    queryKey: ["/api/music/popular"],
    queryFn: async () => {
      const res = await fetch("/api/music/popular");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const popularIds = useMemo(() => {
    if (!Array.isArray(popularTracks) || popularTracks.length === 0) return [];
    return popularTracks.map((m) => m.id);
  }, [popularTracks]);

  const genres = DISPLAY_GENRES;

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    pushPageParam(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePlayAllSiteMusic = async () => {
    if (!user) return redirectToLogin();
    if (siteTotalCount <= 0 || isStartingPlayAll) return;
    setIsStartingPlayAll(true);
    try {
      const chunkSize = 500;
      const pageCount = Math.ceil(siteTotalCount / chunkSize);
      const pages = await Promise.all(
        Array.from({ length: pageCount }, async (_, index) => {
          const params = new URLSearchParams({
            page: String(index + 1),
            limit: String(chunkSize),
          });
          if (debouncedSearch) params.set("search", debouncedSearch);
          if (selectedGenre && selectedGenre !== "전체" && selectedGenre !== "All") {
            params.set("genre", selectedGenre);
          }
          const response = await fetch(`/api/music?${params.toString()}`, {
            credentials: "include",
          });
          if (!response.ok) throw new Error("Failed to load full playlist");
          return response.json() as Promise<{ data: Array<{ id: number }> }>;
        }),
      );
      const ids = Array.from(new Set(pages.flatMap((page) => page.data.map((music) => music.id))));
      if (ids.length === 0) return;
      setPlaylist(ids);
      playMusic(ids[0]);
    } catch {
      // 기존 재생목록은 유지하고 버튼만 다시 활성화한다.
    } finally {
      setIsStartingPlayAll(false);
    }
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
                  onClick={handlePlayAllSiteMusic}
                  disabled={isStartingPlayAll}
                  data-testid="button-play-all"
                >
                  {isStartingPlayAll ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
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
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide md:gap-3">
              {popularTracks.map((track) => (
                <Link
                  key={track.id}
                  href={`/music/${track.id}`}
                  className="group w-[38vw] min-w-[8.75rem] max-w-[10rem] flex-shrink-0 md:w-[160px]"
                  data-testid={`recommended-square-card-${track.id}`}
                >
                  <div
                    className={`relative aspect-square overflow-hidden rounded-2xl bg-card shadow-[0_16px_36px_-26px_rgba(0,0,0,0.75)] ring-2 transition ${
                      activeMusicId === track.id
                        ? pauseRequested
                          ? "ring-violet-300"
                          : "ring-teal-300"
                        : "ring-white/10"
                    }`}
                  >
                    <img
                      src={track.imageFilename ? resolveStorageUrl(track.imageFilename) : "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop"}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/10 to-transparent" />
                    {track.isAi ? (
                      <span className="absolute left-2 top-2 rounded-full bg-teal-300/95 px-1.5 py-0.5 text-[10px] font-black text-teal-950">
                        AI
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPlaylist(popularIds);
                        if (activeMusicId === track.id) {
                          togglePause();
                          return;
                        }
                        playMusic(track.id);
                      }}
                      className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-violet-950 shadow-lg"
                      aria-label={activeMusicId === track.id && !pauseRequested ? "pause" : "play"}
                    >
                      {activeMusicId === track.id && !pauseRequested ? (
                        <Pause className="h-4 w-4 fill-current" />
                      ) : (
                        <Play className="ml-0.5 h-4 w-4 fill-current" />
                      )}
                    </button>
                  </div>
                  <p className="mt-2 truncate text-sm font-black text-foreground">{track.title}</p>
                  <p className="truncate text-xs font-semibold text-muted-foreground">{track.artist}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {catalogTab === "site" && (
          <section id="themed-playlists" className="mb-8 rounded-[28px] border border-primary/10 bg-primary/5 px-3 py-4" data-testid="section-themed-playlists">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <ListMusic size={20} className="text-primary" />
              {t('explore.themedPlaylists', '테마 플레이리스트')}
            </h2>
            {hasCuratedPlaylists ? (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {curatedPlaylists.map((pl) => (
                <Link key={pl.id} href={`/curated/${pl.slug}`}>
                  <div
                    className="w-40 sm:w-48 flex-shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-card shadow-[0_18px_44px_-34px_rgba(124,58,237,0.75)] transition-colors hover:border-primary/40 cursor-pointer"
                    data-testid={`curated-card-${pl.slug}`}
                  >
                    <div className="aspect-square bg-muted/50 flex items-center justify-center overflow-hidden">
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
                    <div className="p-3">
                      <p className="text-sm font-black truncate" title={pl.name}>{t(`explore.curatedPlaylist.${pl.slug}.name`, pl.name)}</p>
                    {(pl.genreMain || pl.genreSub) && (
                      <p className="text-[11px] font-semibold text-primary/80 truncate mt-0.5">
                        {[pl.genreMain, pl.genreSub].filter(Boolean).join(" / ")}
                      </p>
                    )}
                    {(() => {
                      const desc = t(`explore.curatedPlaylist.${pl.slug}.description`, pl.description || '');
                      return desc ? <p className="text-xs text-muted-foreground line-clamp-2 mt-1" title={desc}>{desc}</p> : null;
                    })()}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            ) : (
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-5 text-sm font-semibold text-white/75 backdrop-blur">
                {t('explore.emptyThemedPlaylists', '테마 플레이리스트를 준비 중입니다.')}
              </div>
            )}
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
            <div className="music-grid grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4 xl:grid-cols-5">
              {musicList?.map((music) => (
                <div key={music.id} className="origin-top-left md:scale-90">
                  <MusicCard music={music} playlistIds={sitePageIds} />
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
