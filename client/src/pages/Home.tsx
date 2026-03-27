import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { MusicCard } from "@/components/MusicCard";
import { useMusicList } from "@/hooks/use-music";
import { Loader2, Search, HelpCircle, ChevronLeft, ChevronRight, Wand2, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { resolveStorageUrl } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioBannerWaveformCanvas } from "@/components/RadioBannerWaveformCanvas";
import banner1 from "@/assets/images/banner-1.png";
import banner2 from "@/assets/images/banner-2.png";
import banner3 from "@/assets/images/banner-3.png";
import banner4 from "@/assets/images/banner-4.png";

const ANNOUNCEMENT_SEEN_KEY = (userId: string | undefined, announcementId: number) =>
  userId ? `announcement_seen_${userId}_${announcementId}` : `announcement_seen_guest_${announcementId}`;

export default function Home() {
  const { t, i18n } = useTranslation();
  const { user, isLoading: isAuthLoading } = useAuth();
  const userId = user?.id;
  const { data: musicResult, isLoading } = useMusicList({ limit: 500 });
  const musicList = musicResult?.data;

  const { data: weeklyTop } = useQuery<any[]>({
    queryKey: ["/api/music/top-weekly", 16],
    queryFn: async () => {
      const res = await fetch("/api/music/top-weekly?limit=16");
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

  const liveTickerText = liveChannels?.length
    ? liveChannels
        .map((ch) => {
          const startAt = ch.scheduledStartAt ? new Date(ch.scheduledStartAt) : (ch.updatedAt ? new Date(ch.updatedAt) : null);
          const endAt = ch.scheduledEndAt ? new Date(ch.scheduledEndAt) : null;
          const startStr = startAt ? startAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
          const endStr = endAt ? endAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
          if (startStr && endStr) return `${ch.name} 채널 ${startStr}~${endStr} 방송중`;
          if (startStr) return `${ch.name} 채널 ${startStr}부터 방송중`;
          return `${ch.name} 채널 지금 방송중`;
        })
        .join("    ★    ")
    : "";

  const banners = [
    { image: banner1, title: t('home.banner1Title'), subtitle: t('home.banner1Subtitle'), link: "/upload", buttonText: t('home.banner1Button') },
    { image: banner2, title: t('home.banner2Title'), subtitle: t('home.banner2Subtitle'), link: "/music", buttonText: t('home.banner2Button') },
    { image: banner3, title: t('home.banner3Title'), subtitle: t('home.banner3Subtitle'), link: "/pricing", buttonText: t('home.banner3Button') },
    { image: banner4, title: t('home.banner4Title'), subtitle: t('home.banner4Subtitle'), link: "/upload", buttonText: t('home.banner4Button') },
    {
      image: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80",
      title: t('home.makeMusicTitle'),
      subtitle: t('home.makeMusicSubtitle'),
      link: "/suno-guide",
      buttonText: t('home.makeMusicButton'),
    },
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

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

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
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3 md:gap-4">
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
                className="group flex flex-col items-center rounded-xl border border-border/60 bg-card/30 p-2 md:p-3 text-center transition-colors hover:bg-muted/40 hover:border-primary/30 min-w-0"
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

  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      <Dialog open={showAnnouncement} onOpenChange={(open) => !open && handleAnnouncementDismiss()}>
        <DialogContent
          className={`sm:max-w-md p-0 overflow-hidden ${activeAnnouncement?.imageUrl ? "border-2 border-white/30 shadow-2xl shadow-black/60 ring-2 ring-white/10" : ""}`}
          style={activeAnnouncement?.imageUrl ? {
            backgroundImage: `url(${activeAnnouncement.imageUrl.startsWith("http") ? activeAnnouncement.imageUrl : resolveStorageUrl(activeAnnouncement.imageUrl)})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            minHeight: "320px",
          } : undefined}
        >
          <div className={activeAnnouncement?.imageUrl ? "absolute inset-0 bg-black/60" : ""} />
          <div className={`relative p-5 ${activeAnnouncement?.imageUrl ? "text-white" : ""}`}>
            <DialogHeader>
              <DialogTitle className={activeAnnouncement?.imageUrl ? "text-white drop-shadow-md" : ""}>
                {t('home.announcementTitle', '공지')}
              </DialogTitle>
            </DialogHeader>
            <div className={`whitespace-pre-wrap py-2 ${activeAnnouncement?.textSize === "lg" ? "text-lg" : activeAnnouncement?.textSize === "sm" ? "text-xs" : "text-sm"} ${activeAnnouncement?.imageUrl ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" : "text-muted-foreground"}`}>
              {activeAnnouncement?.content}
            </div>
            <Button
              className={`w-full mt-2 ${activeAnnouncement?.imageUrl ? "bg-white text-black hover:bg-white/90 border border-white/50" : ""}`}
              onClick={handleAnnouncementDismiss}
              variant="default"
            >
              {t('home.announcementConfirm', '확인')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Navigation />
      <section className="relative min-h-[500px] flex items-center justify-center overflow-hidden pt-16 md:pt-0">
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
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400">_Sound</span>
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
            className="text-lg text-white/80 mb-2 drop-shadow-sm"
          >
            {t('home.shareNow')}
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
            className="flex gap-4 justify-center flex-wrap"
          >
            <Link href="/music">
              <Button size="lg" className="rounded-full px-8 bg-primary text-white shadow-lg shadow-primary/25" data-testid="button-start-listening">
                {t('home.listenMusic')}
              </Button>
            </Link>
            <Link href="/upload">
              <Button size="lg" variant="outline" className="rounded-full px-8 border-white/20 text-white bg-white/10 backdrop-blur-sm" data-testid="button-upload-track">
                {t('home.uploadTrack')}
              </Button>
            </Link>
            <Link href="/guide">
              <Button size="lg" variant="outline" className="rounded-full px-8 border-yellow-400/30 text-yellow-300 bg-yellow-400/10 backdrop-blur-sm" data-testid="button-guide">
                <HelpCircle size={18} className="mr-1" />
                {t('home.newHere')}
              </Button>
            </Link>
            <Link href="/suno-guide">
              <Button size="lg" variant="outline" className="rounded-full px-8 border-pink-400/40 text-pink-300 bg-pink-500/10 backdrop-blur-sm hover:bg-pink-500/20">
                <Wand2 size={18} className="mr-1" />
                {t('home.makeMusicBtn', '음악 만들러 가기')}
              </Button>
            </Link>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 }}
            className="mt-3 flex justify-center"
          >
            <Link href="/global-distribution-guide">
              <Button
                size="lg"
                variant="outline"
                className="rounded-full px-4 sm:px-8 border-cyan-300/40 text-cyan-200 bg-cyan-500/10 backdrop-blur-sm hover:bg-cyan-500/20 whitespace-normal leading-tight max-w-[90vw]"
              >
                글로벌 음원출시로 수익방법
              </Button>
            </Link>
          </motion.div>
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
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/40 to-purple-950/30 px-5 py-4 hover:border-cyan-400/35 transition-colors"
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

      {Array.isArray(weeklyTop) && weeklyTop.length > 0 && (
        <section className="container px-4 pt-16 pb-4">
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <h2 className="text-2xl md:text-3xl font-display font-bold" data-testid="text-weekly-top-section">
              {t('home.weeklyTop', '이번 주 많이 들은 곡')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('home.weeklyTopDesc', '최근 7일 동안 재생이 많았던 트랙입니다.')}
            </p>
          </div>
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="music-grid grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4"
          >
            {weeklyTop.slice(0, 16).map((music) => (
              <motion.div key={music.id} variants={item} className="min-w-0">
                <MusicCard music={music} />
              </motion.div>
            ))}
          </motion.div>
        </section>
      )}

      <WeeklyTopArtistSection />

      <section className="container px-4 py-12">
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <h2 className="text-2xl md:text-3xl font-display font-bold" data-testid="text-recent-section">{t('home.recentUploads')}</h2>
          <Link href="/music">
            <Button variant="link" className="text-primary" data-testid="link-view-all">{t('home.viewAll')}</Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-primary" size={40} />
          </div>
        ) : (
          <motion.div 
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="music-grid grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4"
          >
            {musicList?.slice(0, 16).map((music) => (
              <motion.div key={music.id} variants={item} className="min-w-0">
                <MusicCard music={music} />
              </motion.div>
            ))}
            {musicList?.length === 0 && (
              <div className="col-span-full text-center py-20 text-muted-foreground" data-testid="text-no-music">
                {t('home.noMusic')}
              </div>
            )}
          </motion.div>
        )}
      </section>
      <Footer />
    </div>
  );
}
