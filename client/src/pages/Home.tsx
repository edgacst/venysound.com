import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { MusicCard } from "@/components/MusicCard";
import { useMusicList } from "@/hooks/use-music";
import { Loader2, Search, HelpCircle, ChevronLeft, ChevronRight, Wand2, Globe, Radio, Upload, X, Megaphone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { resolveStorageUrl, cn } from "@/lib/utils";
import { useMyLikes } from "@/hooks/use-music";
import type { Music } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { REGISTER_PATH } from "@/lib/site-paths";
import { RadioBannerWaveformCanvas } from "@/components/RadioBannerWaveformCanvas";
import banner1 from "@/assets/images/banner-1.png";
import banner2 from "@/assets/images/banner-2.png";
import banner3 from "@/assets/images/banner-3.png";
import banner4 from "@/assets/images/banner-4.png";

const ANNOUNCEMENT_SEEN_KEY = (userId: string | undefined, announcementId: number) =>
  userId ? `announcement_seen_${userId}_${announcementId}` : `announcement_seen_guest_${announcementId}`;

/** 모바일: 가로 스크롤 / md+: 그리드 (멜론·스포티파이형 행) */
function HomeMusicRow({
  children,
  gridClass = "md:grid md:grid-cols-4 lg:grid-cols-8",
}: {
  children: ReactNode;
  gridClass?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-4 overflow-x-auto pb-2 pt-1 -mx-4 px-4 scroll-smooth snap-x snap-mandatory",
        gridClass,
        "md:mx-0 md:px-0 md:overflow-visible md:snap-none",
      )}
    >
      {children}
    </div>
  );
}

function HomeMusicRowItem({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-[10.5rem] w-[42vw] max-w-[11rem] shrink-0 snap-start md:min-w-0 md:w-auto md:max-w-none md:shrink">
      {children}
    </div>
  );
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const { user, isLoading: isAuthLoading } = useAuth();
  const userId = user?.id;
  const { data: musicResult, isLoading } = useMusicList({ limit: 500 });
  const musicList = musicResult?.data;
  const { data: myLikeIds = [] } = useMyLikes();

  const { data: curatedPlaylists = [] } = useQuery<
    Array<{
      id: number;
      name: string;
      description: string | null;
      slug: string;
      sortOrder: number;
      coverImageFilename: string | null;
    }>
  >({
    queryKey: ["/api/curated-playlists"],
    queryFn: async () => {
      const res = await fetch("/api/curated-playlists");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const homeGreeting = useMemo(() => {
    if (!user) return null;
    const hour = new Date().getHours();
    const name = (user.firstName?.trim() || user.username?.trim() || "") as string;
    if (hour < 12) {
      return name
        ? t("home.greetingMorningNamed", { name, defaultValue: `좋은 아침이에요, ${name}` })
        : t("home.greetingMorning", { defaultValue: "좋은 아침이에요" });
    }
    if (hour < 18) {
      return name
        ? t("home.greetingAfternoonNamed", { name, defaultValue: `좋은 오후예요, ${name}` })
        : t("home.greetingAfternoon", { defaultValue: "좋은 오후예요" });
    }
    return name
      ? t("home.greetingEveningNamed", { name, defaultValue: `좋은 저녁이에요, ${name}` })
      : t("home.greetingEvening", { defaultValue: "좋은 저녁이에요" });
  }, [user, t]);

  const likedTracksForHome = useMemo(() => {
    if (!musicList?.length || !myLikeIds.length) return [] as Music[];
    const map = new Map(musicList.map((m) => [m.id, m]));
    const out: Music[] = [];
    for (const id of myLikeIds) {
      const m = map.get(id);
      if (m) out.push(m);
      if (out.length >= 12) break;
    }
    return out;
  }, [musicList, myLikeIds]);

  const { data: weeklyTop } = useQuery<any[]>({
    queryKey: ["/api/music/top-weekly", 16],
    queryFn: async () => {
      const res = await fetch("/api/music/top-weekly?limit=16");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: homeNewReleases = [], isLoading: newReleasesLoading } = useQuery<Music[]>({
    queryKey: ["/api/music/home-new-releases", 16],
    queryFn: async () => {
      const res = await fetch("/api/music/home-new-releases?limit=16");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: liveChannels } = useQuery<Array<{
    id: number;
    name: string;
    slug: string;
    scheduledStartAt?: string | null;
    scheduledEndAt?: string | null;
    updatedAt?: string;
  }>>({
    queryKey: ["/api/radio/channels/live"],
    queryFn: async () => {
      const res = await fetch("/api/radio/channels/live");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const timeLocale = useMemo(() => {
    const l = (i18n.language || "ko").split("-")[0].toLowerCase();
    if (l === "ja") return "ja-JP";
    if (l === "zh") return "zh-CN";
    if (l === "en") return "en-US";
    return "ko-KR";
  }, [i18n.language]);

  const liveTickerText = useMemo(() => {
    if (!liveChannels?.length) return "";
    const liveWord = t("home.radioLiveShort", "방송중");
    return liveChannels
      .map((ch) => {
        const startAt = ch.scheduledStartAt ? new Date(ch.scheduledStartAt) : ch.updatedAt ? new Date(ch.updatedAt) : null;
        const endAt = ch.scheduledEndAt ? new Date(ch.scheduledEndAt) : null;
        const startStr = startAt
          ? startAt.toLocaleTimeString(timeLocale, { hour: "2-digit", minute: "2-digit", hour12: false })
          : "";
        const endStr = endAt ? endAt.toLocaleTimeString(timeLocale, { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
        if (startStr && endStr) {
          return t("home.liveTickerScheduled", "{{name}} 채널 {{start}}~{{end}} {{live}}", {
            name: ch.name,
            start: startStr,
            end: endStr,
            live: liveWord,
          });
        }
        if (startStr) {
          return t("home.liveTickerFrom", "{{name}} 채널 {{start}}부터 {{live}}", { name: ch.name, start: startStr, live: liveWord });
        }
        return t("home.liveTickerNow", "{{name}} 채널 지금 {{live}}", { name: ch.name, live: liveWord });
      })
      .join("    ★    ");
  }, [liveChannels, t, timeLocale]);

  const banners = [
    { image: banner1, title: t('home.banner1Title'), subtitle: t('home.banner1Subtitle'), link: "/upload", buttonText: t('home.banner1Button') },
    { image: banner2, title: t('home.banner2Title'), subtitle: t('home.banner2Subtitle'), link: "/music", buttonText: t('home.banner2Button') },
    { image: banner3, title: t('home.banner3Title'), subtitle: t('home.banner3Subtitle'), link: "/pricing", buttonText: t('home.banner3Button') },
    { image: banner4, title: t('home.banner4Title'), subtitle: t('home.banner4Subtitle'), link: "/upload", buttonText: t('home.banner4Button') },
  ];

  const [currentBanner, setCurrentBanner] = useState(0);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);

  const lang = (i18n.language || "ko").split("-")[0].toLowerCase();
  const { data: activeAnnouncement } = useQuery<{ id: number; content: string; imageUrl: string | null; textSize?: string; startsAt: string; endsAt: string } | null>({
    queryKey: ["/api/announcement/active", lang],
    queryFn: async () => {
      const res = await fetch(`/api/announcement/active?lang=${encodeURIComponent(lang)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data;
    },
  });

  // 아이디당 1번만 표시: 로그인 확정 후 storage에서 '이미 봤는지' 읽어서 깜빡임 없이 판단
  const hasSeenInStorage =
    typeof window !== "undefined" &&
    activeAnnouncement?.id != null &&
    !isAuthLoading &&
    (userId ? localStorage : sessionStorage).getItem(ANNOUNCEMENT_SEEN_KEY(userId, activeAnnouncement.id)) === "1";

  const showAnnouncement = Boolean(
    !isAuthLoading && activeAnnouncement?.content && !announcementDismissed && !hasSeenInStorage
  );

  const handleAnnouncementDismiss = () => {
    if (activeAnnouncement?.id) {
      const storage = userId ? localStorage : sessionStorage;
      storage.setItem(ANNOUNCEMENT_SEEN_KEY(userId, activeAnnouncement.id), "1");
    }
    setAnnouncementDismissed(true);
  };

  const nextBanner = useCallback(() => {
    setCurrentBanner((prev) => (prev + 1) % banners.length);
  }, [banners.length]);

  const prevBanner = useCallback(() => {
    setCurrentBanner((prev) => (prev - 1 + banners.length) % banners.length);
  }, [banners.length]);

  useEffect(() => {
    const timer = setInterval(nextBanner, 5000);
    return () => clearInterval(timer);
  }, [nextBanner]);

  function WeeklyTopArtistSection() {
    const { t } = useTranslation();
    const { data } = useQuery<{
      artists: Array<{
        userId: string;
        firstName: string | null;
        lastName: string | null;
        profileImageUrl: string | null;
        playCount: number;
        totalSeconds: number;
      }>;
    }>({
      queryKey: ["/api/artists/top-weekly", 8],
      queryFn: async () => {
        const res = await fetch("/api/artists/top-weekly?limit=8");
        if (!res.ok) return { artists: [] };
        return res.json();
      },
    });

    const artists = data?.artists ?? [];
    if (artists.length === 0) return null;

    return (
      <section className="container px-4 pt-8 pb-4" data-testid="section-weekly-artists">
        <div className="mb-6">
          <h2 className="text-2xl md:text-3xl font-display font-bold" data-testid="text-weekly-artist-section-title">
            {t("home.weeklyArtistLabel", "이번주 뮤직크리에이터")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("home.weeklyArtistDesc", "최근 7일 동안 가장 많이 재생된 뮤직크리에이터입니다.")}
          </p>
        </div>
        <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-8 md:overflow-visible scroll-smooth snap-x snap-mandatory md:snap-none">
          {artists.map((a) => {
            const displayName = a.firstName?.trim() || t("home.unknownArtist", "아티스트");
            const avatarSrc =
              a.profileImageUrl != null && a.profileImageUrl !== ""
                ? a.profileImageUrl.startsWith("http")
                  ? a.profileImageUrl
                  : resolveStorageUrl(a.profileImageUrl)
                : undefined;
            const initials = displayName.slice(0, 2).toUpperCase();
            return (
              <Link
                key={a.userId}
                href={`/profile/${a.userId}`}
                className="group flex flex-col items-center rounded-xl border border-border/60 bg-card/30 p-2 md:p-3 text-center transition-colors hover:bg-muted/40 hover:border-primary/30 min-w-[4.5rem] w-[22%] max-w-[5.5rem] shrink-0 snap-start md:min-w-0 md:w-auto md:max-w-none md:shrink"
                data-testid={`link-weekly-artist-${a.userId}`}
              >
                <Avatar className="w-12 h-12 md:w-14 md:h-14 mb-2 ring-2 ring-transparent group-hover:ring-primary/20">
                  <AvatarImage src={avatarSrc} alt="" className="object-cover" />
                  <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
                </Avatar>
                <p className="text-xs md:text-sm font-medium truncate w-full" title={a.firstName ?? undefined}>
                  {displayName}
                </p>
                <p className="text-[10px] md:text-xs text-muted-foreground tabular-nums">
                  {t("home.weeklyArtistPlays", { defaultValue: "{{count}}회", count: a.playCount })}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    );
  }

  const announcementBannerText = (activeAnnouncement?.content ?? "").trim();

  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      <Navigation />
      {showAnnouncement && activeAnnouncement && (
        <div
          role="region"
          aria-label={t("home.announcementTitle", "공지")}
          className="border-b border-amber-500/35 bg-gradient-to-r from-amber-950/90 via-amber-900/85 to-amber-950/90 text-amber-50"
          data-testid="home-announcement-banner"
        >
          <div className="container flex items-start gap-2 sm:items-center py-2 pl-4 pr-1 sm:pr-2">
            <Megaphone className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-amber-300/95" aria-hidden />
            {activeAnnouncement.imageUrl ? (
              <img
                src={
                  activeAnnouncement.imageUrl.startsWith("http")
                    ? activeAnnouncement.imageUrl
                    : resolveStorageUrl(activeAnnouncement.imageUrl)
                }
                alt=""
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-md object-cover shrink-0 border border-white/20"
              />
            ) : null}
            <p
              className={`flex-1 min-w-0 leading-snug line-clamp-2 break-words ${
                activeAnnouncement.textSize === "lg" ? "text-sm sm:text-base" : activeAnnouncement.textSize === "sm" ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm"
              }`}
              title={announcementBannerText || undefined}
            >
              {announcementBannerText || t("home.announcementFallback", "새 공지가 있습니다. 자세한 내용은 공지사항을 확인해 주세요.")}
            </p>
            <button
              type="button"
              onClick={handleAnnouncementDismiss}
              className="shrink-0 p-2 rounded-md hover:bg-white/10 text-amber-100 transition-colors"
              aria-label={t("home.announcementDismiss", "공지 닫기")}
              data-testid="button-announcement-dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <section className="relative min-h-[400px] sm:min-h-[420px] flex flex-col justify-end overflow-hidden pt-20 md:pt-24 pb-5 md:pb-6">
        <div className="absolute inset-0">
          <img 
            src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80" 
            alt={t('home.heroImageAlt')}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/60" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        </div>

        <div className="hero-inner relative z-10 px-4 text-center">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-display font-bold mb-4 text-white drop-shadow-lg"
            data-testid="text-hero-title"
          >
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-purple-400">Veny</span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400">Sound</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 }}
            className="text-sm md:text-base text-white/85 mb-3 drop-shadow-md font-medium"
            data-testid="text-hero-brand-korean"
          >
            {t("home.heroBrandLine")}
          </motion.p>
          {homeGreeting && (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 }}
              className="text-base md:text-lg text-amber-200/95 mb-3 drop-shadow-md font-medium"
              data-testid="text-hero-greeting"
            >
              {homeGreeting}
            </motion.p>
          )}
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-2xl md:text-3xl font-bold mb-4 text-white/90 drop-shadow-md"
            data-testid="text-hero-subtitle"
          >
            {t('home.heroSubtitle')}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-white/80 mb-6 drop-shadow-sm"
            data-testid="text-hero-share-now"
          >
            {t("home.shareNow")}
          </motion.p>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="max-w-xl mx-auto mb-8"
          >
            <Link href="/music">
              <div className="relative cursor-pointer">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
                <Input 
                  placeholder={t('home.searchPlaceholder')} 
                  className="pl-12 h-12 rounded-full bg-white/10 backdrop-blur-md border-white/20 text-white placeholder:text-white/50 cursor-pointer"
                  readOnly
                  data-testid="input-hero-search"
                />
              </div>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex gap-3 justify-center flex-wrap items-center"
          >
            <Link href="/music">
              <Button size="lg" className="rounded-full px-10 bg-primary text-white shadow-lg shadow-primary/25" data-testid="button-start-listening">
                {t('home.listenMusic')}
              </Button>
            </Link>
            {!user ? (
              <Link href={REGISTER_PATH}>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full px-8 border-white/25 text-white bg-white/10 backdrop-blur-sm"
                  data-testid="button-hero-signup"
                >
                  {t("home.heroSignUpCta", "무료 가입")}
                </Button>
              </Link>
            ) : (
              <Link href="/upload">
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full px-8 border-white/25 text-white bg-white/10 backdrop-blur-sm"
                  data-testid="button-hero-upload"
                >
                  {t("home.uploadTrack", "음원업로드")}
                </Button>
              </Link>
            )}
          </motion.div>
        </div>
      </section>

      {/* 빠른 입구: 방송·업로드·가이드·AI (히어로 CTA 부담 분산) */}
      <section className="container px-4 pt-2 pb-6 md:pt-3" data-testid="section-quick-tiles">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          {t("home.quickTilesLabel", "바로 가기")}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
          <Link
            href="/radio/channels"
            className="rounded-xl border-2 border-border/90 bg-card/50 p-3 flex flex-col gap-1 shadow-sm ring-2 ring-border/55 transition-colors hover:bg-muted/50 hover:border-primary/55 hover:ring-primary/35"
            data-testid="quick-tile-radio"
          >
            <Radio className="w-5 h-5 text-purple-400 shrink-0" />
            <span className="font-semibold text-sm leading-tight">{t("home.quickTileRadio", "베니방송국")}</span>
            <span className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">{t("home.quickTileRadioDesc", "회원이면 누구든 나의 방송국을 만들 수 있습니다.")}</span>
          </Link>
          <Link
            href="/upload"
            className="rounded-xl border-2 border-border/90 bg-card/50 p-3 flex flex-col gap-1 shadow-sm ring-2 ring-border/55 transition-colors hover:bg-muted/50 hover:border-primary/55 hover:ring-primary/35"
            data-testid="quick-tile-upload"
          >
            <Upload className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-semibold text-sm leading-tight">{t("home.uploadTrack", "음원업로드")}</span>
            <span className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">{t("home.quickTileUploadDesc", "나만의 음악을 만들고 업로드하여 수익화 해보세요")}</span>
          </Link>
          <Link
            href="/create-music"
            className="group relative rounded-xl border-2 border-pink-400/70 bg-gradient-to-br from-pink-500/25 via-fuchsia-500/15 to-purple-600/18 p-3 flex flex-col gap-1 shadow-md shadow-pink-500/20 ring-2 ring-pink-400/45 transition-all hover:border-pink-300/85 hover:from-pink-500/32 hover:via-fuchsia-500/22 hover:shadow-lg hover:shadow-fuchsia-500/25 hover:ring-pink-300/55"
            data-testid="quick-tile-ai"
          >
            <span className="absolute top-1.5 right-1.5 text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded-full bg-pink-500/90 text-white shadow-sm">
              {t("home.quickTileAiBadge", "AI")}
            </span>
            <Wand2 className="w-5 h-5 text-pink-300 drop-shadow-[0_0_8px_rgba(244,114,182,0.45)] group-hover:text-pink-200 shrink-0" />
            <span className="font-semibold text-sm text-foreground leading-tight pr-6">{t("home.quickTileAi", "AI음악만들기")}</span>
            <span className="text-[11px] text-muted-foreground group-hover:text-foreground/90 line-clamp-2 leading-snug">{t("home.quickTileAiDesc", "간단한 설명으로 세상에 없는 나만의 음악을 가지세요")}</span>
          </Link>
          <Link
            href="/guide"
            className="rounded-xl border-2 border-border/90 bg-card/50 p-3 flex flex-col gap-1 shadow-sm ring-2 ring-border/55 transition-colors hover:bg-muted/50 hover:border-primary/55 hover:ring-primary/35"
            data-testid="quick-tile-guide"
          >
            <HelpCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="font-semibold text-sm leading-tight">{t("home.newHere")}</span>
            <span className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">{t("home.quickTileGuideDesc", "베니사운드의 모든 것을 알아보세요.")}</span>
          </Link>
        </div>
        <div className="mt-3 flex justify-center">
          <Link
            href="/global-distribution-guide"
            className="inline-flex max-w-md items-center justify-center gap-1.5 text-center text-xs font-semibold text-cyan-400 underline-offset-2 hover:text-cyan-300 hover:underline sm:text-sm sm:gap-2"
            data-testid="link-global-distribution-guide"
          >
            <span className="animate-blink leading-snug">
              {t("home.globalDistributionRevenueCta", "글로벌음원출시로 수익내는 방법을 알아보세요")}
            </span>
            <span className="shrink-0 text-cyan-400/90" aria-hidden>
              →
            </span>
          </Link>
        </div>
      </section>

      {/* 베니방송국 배너 — 배경 + 중앙 파형 애니메이션 */}
      <section className="container px-4 py-4" data-testid="section-radio-banner">
        <Link
          href="/radio/channels"
          className="rounded-xl overflow-hidden h-[120px] md:h-[140px] flex flex-col border border-white/10 cursor-pointer hover:opacity-95 transition-opacity group relative bg-cover bg-center"
          style={{
            backgroundImage: "linear-gradient(to right, rgba(30,0,60,0.88) 0%, rgba(60,20,80,0.6) 50%, rgba(80,40,100,0.5) 100%), url('/radio-studio-bg.png'), linear-gradient(to right, rgb(88,28,135), rgb(126,34,206))",
          }}
        >
            {/* 방송중 스크롤 알림 */}
            {liveTickerText ? (
              <div className="flex-shrink-0 h-8 md:h-9 overflow-hidden bg-black/30 flex items-center relative z-10">
                <div className="animate-radio-ticker whitespace-nowrap text-yellow-400 font-medium text-sm md:text-base inline-flex">
                  <span className="inline-block pr-[2em]">{liveTickerText}</span>
                  <span className="inline-block pr-[2em]">{liveTickerText}</span>
                </div>
              </div>
            ) : null}
            <div className="flex-1 flex items-center justify-between gap-4 px-6 md:px-10 min-h-0">
            {/* 중앙 파형 영역 (동그라미 부분) */}
            <RadioBannerWaveformCanvas className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[52px] md:w-[240px] md:h-[60px] pointer-events-none rounded-lg overflow-hidden" />
            <div className="flex items-center gap-4 min-w-0 relative z-0">
              <div className="flex-shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-2xl md:text-3xl">📻</span>
              </div>
              <div className="min-w-0">
                <p className="text-emerald-300 font-bold text-xl md:text-2xl lg:text-3xl animate-blink mb-0.5 drop-shadow-md">
                  {t("home.radioBannerCampaign", "나도 DJ해볼까?")}
                </p>
                <h3 className="text-lg md:text-xl font-bold text-white truncate">
                  {t("home.radioBannerTitle", "베니방송국")}
                </h3>
                <p className="text-white/90 text-sm md:text-base truncate">
                  {t("home.radioBannerSubtitle", "나만의 방송 채널을 만들고 실시간으로 음악을 송출하세요")}
                </p>
              </div>
            </div>
            <span className="flex-shrink-0 text-white/90 group-hover:translate-x-1 transition-transform text-sm font-medium relative z-0">
              {t("home.radioBannerButton", "방송국 가기")} →
            </span>
            </div>
          </Link>
      </section>

      <section className="container px-4 py-8" data-testid="section-banner">
        <div className="relative rounded-md overflow-hidden h-[200px] md:h-[260px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentBanner}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0"
            >
              <img
                src={banners[currentBanner].image}
                alt={banners[currentBanner].title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/50" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
              <div className="absolute inset-0 flex items-center px-8 md:px-12">
                <div className="max-w-md">
                  <h3 className="text-xl md:text-2xl font-bold text-white mb-2 drop-shadow-lg" data-testid="text-banner-title">
                    {banners[currentBanner].title}
                  </h3>
                  <p className="text-sm md:text-base text-white/80 mb-4 drop-shadow-sm">
                    {banners[currentBanner].subtitle}
                  </p>
                  <Link href={banners[currentBanner].link}>
                    <Button size="sm" className="rounded-full px-6 bg-primary text-white" data-testid="button-banner-cta">
                      {banners[currentBanner].buttonText}
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <button
            onClick={prevBanner}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white/80 hover:bg-black/60 transition-colors"
            data-testid="button-banner-prev"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={nextBanner}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white/80 hover:bg-black/60 transition-colors"
            data-testid="button-banner-next"
          >
            <ChevronRight size={18} />
          </button>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {banners.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentBanner(idx)}
                className={`w-2 h-2 rounded-full transition-all ${idx === currentBanner ? 'bg-white w-6' : 'bg-white/40'}`}
                data-testid={`button-banner-dot-${idx}`}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="container px-4 pt-6 pb-2" data-testid="section-international-cta">
        <Link
          href="/music?catalog=international"
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border-2 border-cyan-500/40 bg-gradient-to-r from-cyan-950/45 to-purple-950/35 px-5 py-4 shadow-sm ring-2 ring-cyan-500/25 transition-colors hover:border-cyan-400/55 hover:ring-cyan-400/35"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex-shrink-0 w-11 h-11 rounded-full bg-cyan-500/15 flex items-center justify-center">
              <Globe className="text-cyan-300" size={22} />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-bold text-lg text-foreground">
                {t("home.internationalReleasesCtaTitle", "우리가 만든 곡 · 해외 출시")}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t(
                  "home.internationalReleasesCtaSubtitle",
                  "글로벌 스트리밍에 출시한 우리 아티스트 곡을 음원 목록에서 모아 볼 수 있어요.",
                )}
              </p>
            </div>
          </div>
          <span className="text-sm font-medium text-cyan-300 shrink-0 sm:ml-4">
            {t("home.internationalReleasesCtaButton", "목록 보기 →")}
          </span>
        </Link>
      </section>

      {curatedPlaylists.length > 0 && (
        <section className="container px-4 pt-10 pb-4" data-testid="section-curated-playlists">
          <div className="mb-4">
            <h2 className="text-2xl md:text-3xl font-display font-bold" data-testid="text-curated-section-title">
              {t("home.curatedSectionTitle", "테마 플레이리스트")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("home.curatedSectionDesc", "에디터가 고른 플레이리스트를 만나 보세요.")}
            </p>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scroll-smooth snap-x snap-mandatory md:mx-0 md:px-0">
            {[...curatedPlaylists]
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
              .slice(0, 12)
              .map((pl) => {
                const cover = pl.coverImageFilename
                  ? resolveStorageUrl(pl.coverImageFilename)
                  : "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop";
                return (
                  <Link
                    key={pl.id}
                    href={`/curated/${encodeURIComponent(pl.slug)}`}
                    className="min-w-[9.5rem] max-w-[10rem] shrink-0 snap-start rounded-xl border border-border/60 bg-card/30 overflow-hidden hover:border-primary/40 transition-colors group"
                    data-testid={`link-curated-${pl.slug}`}
                  >
                    <div className="aspect-square relative overflow-hidden">
                      <img src={cover} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    </div>
                    <div className="p-2.5">
                      <p className="font-semibold text-sm line-clamp-2 leading-tight">{pl.name}</p>
                      {pl.description ? (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{pl.description}</p>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
          </div>
        </section>
      )}

      {Array.isArray(weeklyTop) && weeklyTop.length > 0 && (
        <section className="container px-4 pt-16 pb-4">
          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div>
              <h2 className="text-2xl md:text-3xl font-display font-bold" data-testid="text-weekly-top-section">
                {t('home.weeklyTop', '이번 주 많이 들은 곡')}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t('home.weeklyTopDesc', '최근 7일 동안 재생이 많았던 트랙입니다.')}
              </p>
            </div>
            <Link href="/popular">
              <Button variant="outline" size="sm" className="shrink-0 rounded-full" data-testid="link-weekly-chart-more">
                {t("home.chartMoreLink", "인기 차트 더보기")}
              </Button>
            </Link>
          </div>
          <HomeMusicRow>
            {weeklyTop.slice(0, 16).map((music, idx) => (
              <HomeMusicRowItem key={music.id}>
                <MusicCard music={music} chartRank={idx + 1} />
              </HomeMusicRowItem>
            ))}
          </HomeMusicRow>
        </section>
      )}

      <WeeklyTopArtistSection />

      {user && likedTracksForHome.length > 0 && (
        <section className="container px-4 py-10 pb-2" data-testid="section-liked-tracks">
          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div>
              <h2 className="text-2xl md:text-3xl font-display font-bold" data-testid="text-liked-section-title">
                {t("home.likedSectionTitle", "좋아요한 곡")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t("home.likedSectionDesc", "내가 하트 누른 트랙입니다.")}
              </p>
            </div>
          </div>
          <HomeMusicRow>
            {likedTracksForHome.map((music) => (
              <HomeMusicRowItem key={music.id}>
                <MusicCard music={music} />
              </HomeMusicRowItem>
            ))}
          </HomeMusicRow>
        </section>
      )}

      {!newReleasesLoading && homeNewReleases.length > 0 && (
        <section className="container px-4 py-10 pb-2" data-testid="section-new-releases">
          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div>
              <h2 className="text-2xl md:text-3xl font-display font-bold" data-testid="text-new-releases-title">
                {t("home.newReleasesTitle", "신곡 · 공식 발매")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t(
                  "home.newReleasesDesc",
                  "글로벌 배포 발매일·승인일 기준입니다. 부족 시 Spotify 앨범이 연결된 곡이 이어서 표시됩니다.",
                )}
              </p>
            </div>
            <Link href="/music">
              <Button variant="outline" size="sm" className="shrink-0 rounded-full" data-testid="link-new-releases-more">
                {t("home.viewAll")}
              </Button>
            </Link>
          </div>
          <HomeMusicRow>
            {homeNewReleases.map((m) => (
              <HomeMusicRowItem key={m.id}>
                <MusicCard music={m} />
              </HomeMusicRowItem>
            ))}
          </HomeMusicRow>
        </section>
      )}

      <section className="container px-4 py-12">
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h2 className="text-2xl md:text-3xl font-display font-bold" data-testid="text-recent-section">
              {t("home.recentUploadsByUploadTitle", "최근 업로드")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("home.recentUploadsByUploadDesc", "사이트에 파일이 올라온 순서(업로드 시간)입니다. 발매일과 다를 수 있어요.")}
            </p>
          </div>
          <Link href="/music">
            <Button variant="link" className="text-primary" data-testid="link-view-all">{t('home.viewAll')}</Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-primary" size={40} />
          </div>
        ) : (musicList?.length ?? 0) === 0 ? (
          <div className="text-center py-20 text-muted-foreground" data-testid="text-no-music">
            {t('home.noMusic')}
          </div>
        ) : (
          <HomeMusicRow>
            {(musicList ?? []).slice(0, 16).map((music) => (
              <HomeMusicRowItem key={music.id}>
                <MusicCard music={music} />
              </HomeMusicRowItem>
            ))}
          </HomeMusicRow>
        )}
      </section>
      <Footer />
    </div>
  );
}
