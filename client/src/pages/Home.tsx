import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { MusicCard } from "@/components/MusicCard";
import { useMusicList } from "@/hooks/use-music";
import { Loader2, HelpCircle, ChevronLeft, ChevronRight, Wand2, Globe, Radio, Upload, X, Megaphone, Sparkles, Building2, Play } from "lucide-react";
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { resolveStorageUrl, cn } from "@/lib/utils";
import { useMyLikes } from "@/hooks/use-music";
import type { Music } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { useIsLgUp } from "@/hooks/use-mobile";
import { REGISTER_PATH } from "@/lib/site-paths";
import { useLoginModalStore } from "@/stores/login-modal";
import { useRadioPlayerStore, radioSeekSecondsForHandoff } from "@/stores/radio-player";
import { isGuestPlaybackBlocked } from "@/lib/guest-listen-quota";
import { usePlayerStore } from "@/components/AudioPlayer";
import { RadioBannerWaveformCanvas } from "@/components/RadioBannerWaveformCanvas";
import { HomeHeroLiveWaveform } from "@/components/HomeHeroLiveWaveform";
import { HomeLearnMoreSheet, type HomeLearnMoreSheetMode } from "@/components/HomeLearnMoreSheet";
import { SiteHelpChatFab } from "@/components/SiteHelpChatFab";
import { MayFamilyEventPopup } from "@/components/MayFamilyEventPopup";
import banner1 from "@/assets/images/banner-1.png";
import banner2 from "@/assets/images/banner-2.png";
import banner3 from "@/assets/images/banner-3.png";
import banner4 from "@/assets/images/banner-4.png";

const ANNOUNCEMENT_SEEN_KEY = (userId: string | undefined, announcementId: number) =>
  userId ? `announcement_seen_${userId}_${announcementId}` : `announcement_seen_guest_${announcementId}`;

const LIKED_HOME_PAGE_SIZE = 10;

/** 히어로 상단 태그라인 — coffee / royalty / composer 그라데이션 + row1·row2 */
const heroTaglineTransComponents = {
  row1: <span className="block whitespace-nowrap" />,
  row2: <span className="mt-2 block whitespace-nowrap sm:mt-2.5" />,
  coffee: (
    <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-amber-200 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(251,191,36,0.35)] max-md:drop-shadow-none" />
  ),
  royalty: (
    <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-cyan-200 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(34,211,238,0.35)] max-md:drop-shadow-none" />
  ),
  composer: (
    <span className="bg-gradient-to-r from-fuchsia-400 via-purple-400 to-pink-400 bg-clip-text text-transparent drop-shadow-[0_0_22px_rgba(232,121,249,0.35)] max-md:from-fuchsia-300 max-md:via-violet-300 max-md:to-purple-300 max-md:drop-shadow-none" />
  ),
};

/** 홈 인사용 표시 이름: 끝 님 제거 후 템플릿에서 붙임, 흔한 붙여쓰기 보정 */
function greetingDisplayName(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  s = s.replace(/님$/u, "").trim();
  if (/^앱개발자$/u.test(s)) s = "앱 개발자";
  return s;
}

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
        "flex gap-2 overflow-x-auto pb-2 pt-1 -mx-4 px-4 scroll-smooth snap-x snap-mandatory md:gap-4",
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
    <div className="min-w-[7.25rem] w-[30vw] max-w-[8rem] shrink-0 snap-start md:min-w-0 md:w-auto md:max-w-none md:shrink">
      {children}
    </div>
  );
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const { scrollY } = useScroll();
  const taglineScaleRaw = useTransform(scrollY, [0, 220], [1, 0.62]);
  const taglineYRaw = useTransform(scrollY, [0, 220], [0, -72]);
  const taglineOpacityRaw = useTransform(scrollY, [0, 220], [1, 0.88]);
  const taglineScale = useSpring(taglineScaleRaw, { stiffness: 120, damping: 32, mass: 0.35 });
  const taglineY = useSpring(taglineYRaw, { stiffness: 120, damping: 32, mass: 0.35 });
  const taglineOpacity = useSpring(taglineOpacityRaw, { stiffness: 120, damping: 32, mass: 0.35 });

  const heroSectionRef = useRef<HTMLElement | null>(null);
  /** 히어로 전체 높이에 걸쳐 0→1 (천천히·넓게) */
  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroSectionRef,
    offset: ["start start", "end start"],
  });
  /** 선형 진행을 smoothstep으로 부드럽게 한 뒤 스프링으로 따라가게 */
  const heroColExitURaw = useTransform(heroScrollProgress, (p) => {
    const t = Math.min(1, p / 0.52);
    return t * t * (3 - 2 * t);
  });
  const heroColExitU = useSpring(heroColExitURaw, { stiffness: 64, damping: 36, mass: 0.55 });
  const heroColLeftX = useTransform(heroColExitU, (u) => {
    if (typeof window === "undefined") return 0;
    return -u * (window.innerWidth * 0.52 + 48);
  });
  const heroColRightX = useTransform(heroColExitU, (u) => {
    if (typeof window === "undefined") return 0;
    return u * (window.innerWidth * 0.52 + 48);
  });
  const heroColOutOpacity = useTransform(heroColExitU, (u) => 1 - u);
  /** 모바일·태블릿에서 가로 translate 시 화면 밖으로 밀려 잘림 → lg 이상에서만 패럴랙스 */
  const heroParallaxLg = useIsLgUp();

  const { user, isLoading: isAuthLoading } = useAuth();
  const openRegisterModal = useLoginModalStore((s) => s.openRegister);
  const userId = user?.id;
  const { data: musicResult, isLoading, isError, error, refetch: refetchMusicList } = useMusicList({ limit: 500 });
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
    const raw = (user.firstName?.trim() || user.username?.trim() || "") as string;
    const name = greetingDisplayName(raw);
    if (hour < 12) {
      return name
        ? t("home.greetingMorningNamed", { name, defaultValue: `안녕하세요, ${name}님. 좋은 아침이에요.` })
        : t("home.greetingMorning", { defaultValue: "좋은 아침이에요" });
    }
    if (hour < 18) {
      return name
        ? t("home.greetingAfternoonNamed", { name, defaultValue: `안녕하세요, ${name}님. 좋은 오후예요.` })
        : t("home.greetingAfternoon", { defaultValue: "좋은 오후예요" });
    }
    return name
      ? t("home.greetingEveningNamed", { name, defaultValue: `안녕하세요, ${name}님. 좋은 저녁이에요.` })
      : t("home.greetingEvening", { defaultValue: "좋은 저녁이에요" });
  }, [user, t]);

  /** 홈 좋아요: 좋아요 순서 유지, 목록에 있는 트랙만 (곡 수 제한 없음 — 페이지당 10곡) */
  const allLikedTracksForHome = useMemo(() => {
    if (!musicList?.length || !myLikeIds.length) return [] as Music[];
    const map = new Map(musicList.map((m) => [m.id, m]));
    const out: Music[] = [];
    for (const id of myLikeIds) {
      const m = map.get(id);
      if (m) out.push(m);
    }
    return out;
  }, [musicList, myLikeIds]);

  const [likedHomePage, setLikedHomePage] = useState(0);
  const likedTotalPages = Math.max(1, Math.ceil(allLikedTracksForHome.length / LIKED_HOME_PAGE_SIZE));

  useEffect(() => {
    setLikedHomePage(0);
  }, [userId]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(allLikedTracksForHome.length / LIKED_HOME_PAGE_SIZE) - 1);
    setLikedHomePage((p) => Math.min(p, maxPage));
  }, [allLikedTracksForHome.length]);

  const likedPageTracks = useMemo(() => {
    const start = likedHomePage * LIKED_HOME_PAGE_SIZE;
    return allLikedTracksForHome.slice(start, start + LIKED_HOME_PAGE_SIZE);
  }, [allLikedTracksForHome, likedHomePage]);

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
    ownerDisplayName?: string;
    homeTickerText?: string | null;
  }>>({
    queryKey: ["/api/radio/channels/live"],
    queryFn: async () => {
      const res = await fetch("/api/radio/channels/live");
      if (!res.ok) return [];
      return res.json();
    },
  });

  /** 메인 진입 시 이미 라디오를 켜두지 않았다면, 라이브 채널 하나로 자동 재생 (GlobalRadioPlayer가 재생 처리) */
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user && isGuestPlaybackBlocked()) return;
    if (!liveChannels?.length) return;
    const st = useRadioPlayerStore.getState();
    if (st.slug) return;
    if (st.userStopped) return;
    const ps = usePlayerStore.getState();
    if (ps.activeMusicId != null || ps.activeExternalTrack != null) return;

    const envSlug = (import.meta.env.VITE_HOME_AUTO_RADIO_SLUG as string | undefined)?.trim().toLowerCase();
    const fromEnv = envSlug ? liveChannels.find((c) => (c.slug || "").trim().toLowerCase() === envSlug) : undefined;
    const pick = fromEnv ?? liveChannels[0];
    const slug = (pick.slug || "").trim().toLowerCase();
    if (!slug) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/radio/channels/${encodeURIComponent(slug)}`, { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as Record<string, unknown>;
        if (cancelled) return;
        if (data.status !== "live") return;
        const nowPlayingId = data.nowPlayingMusicId ?? null;
        const nowPlayingObjectPath = data.nowPlayingObjectPath ?? null;
        if (nowPlayingId == null && !nowPlayingObjectPath) return;
        const streamUrl =
          nowPlayingObjectPath != null
            ? String(nowPlayingObjectPath)
            : nowPlayingId != null
              ? `/api/music/${Number(nowPlayingId)}/stream`
              : null;
        if (!streamUrl) return;
        if (!user && isGuestPlaybackBlocked()) return;
        const latest = useRadioPlayerStore.getState();
        if (latest.slug || latest.userStopped) return;
        const pLatest = usePlayerStore.getState();
        if (pLatest.activeMusicId != null || pLatest.activeExternalTrack != null) return;
        const def = t("radio.defaultChannelName");
        const resolvedName = String(data.name ?? pick.name ?? def).trim() || def;
        const elapsed =
          typeof data.nowPlayingElapsedSeconds === "number" ? (data.nowPlayingElapsedSeconds as number) : null;
        latest.setStream(
          slug,
          resolvedName,
          streamUrl,
          radioSeekSecondsForHandoff(latest.streamUrl, streamUrl, elapsed),
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liveChannels, isAuthLoading, user?.id, t]);

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
        const custom = typeof ch.homeTickerText === "string" ? ch.homeTickerText.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim() : "";
        if (custom) return custom.slice(0, 200);
        const startAt = ch.scheduledStartAt ? new Date(ch.scheduledStartAt) : ch.updatedAt ? new Date(ch.updatedAt) : null;
        const endAt = ch.scheduledEndAt ? new Date(ch.scheduledEndAt) : null;
        const startStr = startAt
          ? startAt.toLocaleTimeString(timeLocale, { hour: "2-digit", minute: "2-digit", hour12: false })
          : "";
        const endStr = endAt ? endAt.toLocaleTimeString(timeLocale, { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
        const host = ch.ownerDisplayName?.trim() ? ` · ${ch.ownerDisplayName.trim()}` : "";
        if (startStr && endStr) {
          return (
            t("home.liveTickerScheduled", "{{name}} 채널 {{start}}~{{end}} {{live}}", {
              name: ch.name,
              start: startStr,
              end: endStr,
              live: liveWord,
            }) + host
          );
        }
        if (startStr) {
          return t("home.liveTickerFrom", "{{name}} 채널 {{start}}부터 {{live}}", { name: ch.name, start: startStr, live: liveWord }) + host;
        }
        return t("home.liveTickerNow", "{{name}} 채널 지금 {{live}}", { name: ch.name, live: liveWord }) + host;
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
  const [heroPersona, setHeroPersona] = useState<"creator" | "business">("creator");
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [learnMoreMode, setLearnMoreMode] = useState<HomeLearnMoreSheetMode>("creator");

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
      <section className="container px-4 pb-4 pt-6 md:pt-8" data-testid="section-weekly-artists">
        <div className="mb-4 md:mb-6">
          <h2 className="text-xl font-display font-bold md:text-3xl" data-testid="text-weekly-artist-section-title">
            {t("home.weeklyArtistLabel", "이번주 뮤직크리에이터")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground md:text-sm">
            {t("home.weeklyArtistDesc", "최근 7일 동안 가장 많이 재생된 뮤직크리에이터입니다.")}
          </p>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 scroll-smooth snap-x snap-mandatory md:mx-0 md:grid md:grid-cols-8 md:gap-4 md:overflow-visible md:px-0 md:snap-none">
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
                className="group flex min-w-[3.875rem] w-[19vw] max-w-[4.75rem] shrink-0 snap-start flex-col items-center rounded-lg border border-border/60 bg-card/30 p-1.5 text-center transition-colors hover:bg-muted/40 hover:border-primary/30 md:min-w-0 md:w-auto md:max-w-none md:shrink md:rounded-xl md:p-3"
                data-testid={`link-weekly-artist-${a.userId}`}
              >
                <Avatar className="mb-1.5 h-10 w-10 ring-2 ring-transparent group-hover:ring-primary/20 md:mb-2 md:h-14 md:w-14">
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
      <MayFamilyEventPopup />
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
      {(() => {
        const now = Date.now();
        const start = Date.parse("2026-04-30T15:00:00.000Z");
        const end = Date.parse("2026-05-31T15:00:00.000Z");
        if (now < start || now >= end) return null;
        return (
          <div
            className="border-b border-violet-500/35 bg-gradient-to-r from-violet-950/95 via-fuchsia-950/90 to-violet-950/95 text-violet-50"
            data-testid="home-may-2026-event-banner"
          >
            <div className="container flex flex-wrap items-center justify-between gap-3 py-2.5 px-4">
              <p className="text-sm font-medium leading-snug min-w-0">
                2026년 5월 신규가입 이벤트 — AI 음악 생성 지원금·사이트 공개 안내
              </p>
              <Link href="/events/may-2026">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0 rounded-full bg-white/95 text-violet-950 hover:bg-white"
                  data-testid="link-may-2026-event-detail"
                >
                  자세히 알아보기
                </Button>
              </Link>
            </div>
          </div>
        );
      })()}
      <section
        ref={heroSectionRef}
        className="relative flex min-h-[min(88vh,820px)] flex-col justify-start overflow-x-hidden overflow-y-hidden border-t border-white/10 pt-16 pb-8 md:min-h-[min(90vh,880px)] md:pt-20 md:pb-10"
        aria-label={t("home.heroSectionAria", "베니사운드 소개")}
        data-testid="section-home-hero"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#07050d] via-[#100818] to-[#050c14]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-95"
          style={{
            background:
              "radial-gradient(ellipse 85% 55% at 50% -15%, rgba(139,92,246,0.32), transparent 55%), radial-gradient(ellipse 50% 45% at 95% 40%, rgba(34,211,238,0.14), transparent 50%), radial-gradient(ellipse 40% 35% at 5% 75%, rgba(244,114,182,0.1), transparent 45%)",
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background opacity-[0.4]" />

        <div className="container relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-5">
          {/* 헤더와 분리된 히어로 문구 — 스크롤 시 축소·상향 이동 */}
          <motion.div
            className="mb-5 w-full origin-top will-change-transform md:mb-10"
            style={{ scale: taglineScale, y: taglineY, opacity: taglineOpacity }}
            data-testid="home-tagline-below-nav"
          >
            <div className="max-md:text-balance text-center text-lg font-bold leading-snug tracking-tight text-white/90 max-md:px-0.5 sm:text-2xl sm:leading-tight sm:font-extrabold md:text-4xl md:leading-[1.12] lg:text-4xl xl:text-5xl">
              <div className="md:hidden">
                <Trans
                  i18nKey="home.heroTaglineBelowNavMobile"
                  components={heroTaglineTransComponents}
                  defaults="<row1><coffee>커피 한 잔 값</coffee>으로 <composer>작곡가로서</composer></row1><row2>내 음악 출시로 <royalty>평생 저작권 수익</royalty>을 만들어 보시겠어요?</row2>"
                />
              </div>
              <div className="hidden md:block">
                <Trans
                  i18nKey="home.heroTaglineBelowNav"
                  components={heroTaglineTransComponents}
                  defaults="<row1><coffee>커피 한 잔 값</coffee>으로 작사, <composer>작곡가로서의 재능</composer>과</row1><row2>내가 만든 앨범 출시로 <royalty>평생 저작권 수익</royalty>을 만들어 보시겠어요?</row2>"
                />
              </div>
            </div>
          </motion.div>
          <div className="grid min-w-0 max-w-full items-center gap-6 md:gap-10 lg:grid-cols-2 lg:gap-14">
            <motion.div
              className="order-2 min-w-0 w-full max-w-full will-change-[transform,opacity] lg:order-1"
              style={
                heroParallaxLg
                  ? { x: heroColLeftX, opacity: heroColOutOpacity }
                  : { x: 0, opacity: heroColOutOpacity }
              }
            >
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
              >
              <div className="mx-auto w-full min-w-0 max-w-md lg:mx-0">
                <HomeHeroLiveWaveform />
                <div className="rounded-2xl border border-white/12 bg-black/35 p-4 shadow-2xl shadow-purple-950/40 backdrop-blur-md">
                {liveTickerText ? (
                  <div className="mb-3 h-9 overflow-hidden rounded-lg bg-black/40">
                    <div className="animate-radio-ticker inline-flex whitespace-nowrap text-xs font-medium text-amber-200/95 md:text-sm">
                      <span className="inline-block pr-[2em]">{liveTickerText}</span>
                      <span className="inline-block pr-[2em]">{liveTickerText}</span>
                    </div>
                  </div>
                ) : (
                  <p className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-xs text-white/65 md:text-sm">
                    {t("home.heroProofNoLive", "지금 송출 중인 채널이 없을 수 있어요. 방송국에서 직접 켜 볼 수 있어요.")}
                  </p>
                )}
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {liveChannels?.length ? (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/90 text-[10px] font-bold text-white shadow-lg shadow-red-500/25">
                        {t("home.heroProofLiveBadge", "LIVE")}
                      </span>
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-[10px] font-bold uppercase tracking-wide text-white/85">
                        {t("home.heroProofRadioBadge", "FM")}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-white/55">
                        {t("home.heroProofRadioLabel", "베니방송국")}
                      </p>
                      <Link
                        href={liveChannels?.[0]?.slug ? `/radio/${liveChannels[0].slug}` : "/radio/channels"}
                        className="block truncate text-sm font-semibold text-white hover:text-amber-200/95"
                        data-testid="link-hero-live-channel"
                      >
                        {liveChannels?.[0]?.name
                          ? t("home.heroProofTuneIn", "{{name}} 듣기", { name: liveChannels[0].name })
                          : t("home.heroProofBrowseChannels", "채널 목록 보기")}
                      </Link>
                      {liveChannels?.[0]?.ownerDisplayName?.trim() ? (
                        <p className="truncate text-[11px] text-white/50" data-testid="text-hero-live-channel-host">
                          {t("home.heroProofChannelHost", "방장 {{name}}", { name: liveChannels[0].ownerDisplayName.trim() })}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Link href="/radio/channels">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0 rounded-full border-0 bg-white/15 text-white hover:bg-white/25"
                      data-testid="button-hero-all-channels"
                    >
                      {t("home.heroCtaRadioBrowse", "채널")}
                      <Play className="ml-1 h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </Link>
                </div>
                {Array.isArray(weeklyTop) && weeklyTop[0] ? (
                  <Link
                    href={`/music/${weeklyTop[0].id}`}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10"
                    data-testid="link-hero-top-track"
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white/10">
                      {weeklyTop[0].imageFilename ? (
                        <img
                          src={resolveStorageUrl(String(weeklyTop[0].imageFilename))}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-white/40">
                          <Play className="h-6 w-6" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-white/55">
                        {t("home.heroProofTrending", "이번 주 인기")}
                      </p>
                      <p className="truncate font-semibold text-white">{String(weeklyTop[0].title ?? "")}</p>
                      <p className="truncate text-xs text-white/65">{String(weeklyTop[0].artist ?? "")}</p>
                    </div>
                  </Link>
                ) : null}
                </div>
              </div>
              </motion.div>
            </motion.div>

            <motion.div
              className="order-1 flex min-w-0 w-full max-w-full flex-col items-center will-change-[transform,opacity] lg:order-2 lg:items-stretch"
              style={
                heroParallaxLg
                  ? { x: heroColRightX, opacity: heroColOutOpacity }
                  : { x: 0, opacity: heroColOutOpacity }
              }
            >
              <div
                className="mb-4 flex w-full max-w-full min-w-0 justify-center sm:mb-6 lg:justify-start"
                role="tablist"
                aria-label={t("home.heroPersonaLabel", "누구를 위한 소개인가요")}
              >
                <div className="inline-flex max-w-[min(100%,calc(100vw-2rem))] shrink-0 rounded-full border border-white/15 bg-black/25 p-0.5 backdrop-blur-sm sm:max-w-full sm:p-1">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={heroPersona === "creator"}
                    onClick={() => setHeroPersona("creator")}
                    className={cn(
                      "min-h-[2.5rem] rounded-full px-3 py-2 text-[11px] font-semibold leading-tight transition-colors sm:px-4 sm:text-xs md:text-sm",
                      heroPersona === "creator"
                        ? "bg-white text-purple-950 shadow-sm"
                        : "text-white/75 hover:text-white",
                    )}
                    data-testid="button-hero-persona-creator"
                  >
                    {t("home.heroPersonaCreator", "개인 · 크리에이터")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={heroPersona === "business"}
                    onClick={() => setHeroPersona("business")}
                    className={cn(
                      "inline-flex min-h-[2.5rem] items-center gap-1 rounded-full px-3 py-2 text-[11px] font-semibold leading-tight transition-colors sm:gap-1.5 sm:px-4 sm:text-xs md:text-sm",
                      heroPersona === "business"
                        ? "bg-white text-purple-950 shadow-sm"
                        : "text-white/75 hover:text-white",
                    )}
                    data-testid="button-hero-persona-business"
                  >
                    <Building2 className="h-3.5 w-3.5 opacity-90 sm:h-4 sm:w-4" aria-hidden />
                    {t("home.heroPersonaBusiness", "매장 · 비즈니스")}
                  </button>
                </div>
              </div>

              <motion.h1
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-1.5 text-center text-2xl font-display font-bold tracking-tight text-white drop-shadow-sm sm:mb-2 sm:text-3xl md:text-4xl lg:text-left lg:text-5xl"
                data-testid="text-hero-title"
              >
                <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-300 bg-clip-text text-transparent">
                  Veny
                </span>
                <span className="bg-gradient-to-r from-amber-200 via-orange-300 to-rose-300 bg-clip-text text-transparent">
                  Sound
                </span>
              </motion.h1>

              <motion.p
                key={heroPersona}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 }}
                className="mx-auto mb-4 w-full max-w-full min-w-0 [overflow-wrap:anywhere] text-balance break-words px-1 text-center text-xs leading-relaxed text-white/72 sm:text-sm md:mb-5 md:px-0 md:text-base lg:mx-0 lg:text-left"
                data-testid="text-hero-brand-korean"
              >
                {heroPersona === "creator"
                  ? t("home.heroBrandLineCreator", "전세계에 내 음원을 출시해 보세요")
                  : t("home.heroBrandLine")}
              </motion.p>

              <AnimatePresence mode="wait">
                {heroPersona === "creator" ? (
                  <motion.div
                    key="creator"
                    role="tabpanel"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="relative mx-auto mb-5 max-w-2xl text-center sm:mb-6 lg:mx-0 lg:max-w-none lg:border-l-2 lg:border-amber-400/45 lg:pl-5 lg:text-left">
                      <h2
                        className="mb-2.5 text-balance text-xl font-display font-bold leading-snug tracking-tight text-white sm:mb-3 sm:text-2xl sm:leading-[1.2] md:text-[2.1rem] md:leading-tight lg:text-4xl"
                        data-testid="text-hero-subtitle"
                      >
                        {t("home.heroHeadlineCreator", "오늘 작곡하고, 내일 가수가 되세요.")}
                      </h2>
                      <p
                        className="whitespace-pre-line text-pretty break-keep text-sm leading-relaxed text-white/75 sm:text-base sm:leading-relaxed md:text-lg lg:leading-snug"
                        data-testid="text-hero-share-now"
                      >
                        {t(
                          "home.heroLeadCreator",
                          "3분 만에 AI 음악 생성부터 전 세계 음원 사이트\n(유튜브 뮤직, 스포티파이)에 발매까지 한 번에!",
                        )}
                      </p>
                    </div>
                    {homeGreeting && (
                      <p
                        className="mb-3 text-center text-sm text-white/80 md:mb-5 md:text-base md:font-medium md:text-amber-200/95 lg:text-left"
                        data-testid="text-hero-greeting"
                      >
                        {homeGreeting}
                      </p>
                    )}
                    <div className="mx-auto flex w-full min-w-0 max-w-sm flex-col gap-2.5 lg:mx-0 lg:max-w-none lg:flex-row lg:flex-nowrap lg:items-center lg:justify-start lg:gap-2 xl:gap-3">
                      <Link href="/music" className="block w-full min-w-0 shrink-0 lg:w-auto lg:shrink-0">
                        <Button
                          size="lg"
                          className="h-11 w-full rounded-full bg-primary px-6 text-sm text-white shadow-lg shadow-primary/30 sm:h-12 sm:px-8 sm:text-base md:px-10 lg:w-auto lg:shrink-0 lg:whitespace-nowrap"
                          data-testid="button-start-listening"
                        >
                          {t("home.listenMusic")}
                        </Button>
                      </Link>
                      <div className="grid min-w-0 grid-cols-2 gap-2.5 lg:contents">
                        {!user ? (
                          <Link href={REGISTER_PATH} className="min-w-0 lg:w-auto lg:shrink-0">
                            <Button
                              size="lg"
                              variant="outline"
                              className="h-auto min-h-11 w-full whitespace-normal rounded-full border-white/30 bg-white/10 px-3 py-2.5 text-center text-xs leading-snug text-white backdrop-blur-sm hover:bg-white/15 hover:text-white sm:min-h-12 sm:px-4 sm:text-sm lg:w-auto lg:shrink-0 lg:whitespace-nowrap lg:px-5 xl:px-8"
                              data-testid="button-hero-signup"
                            >
                              {t("home.heroSignUpCta", "무료 가입")}
                            </Button>
                          </Link>
                        ) : (
                          <Link href="/suno-guide" className="min-w-0 lg:w-auto lg:shrink-0">
                            <Button
                              size="lg"
                              variant="outline"
                              className="flex h-auto min-h-11 w-full items-center justify-center gap-1.5 whitespace-normal rounded-full border border-white/35 bg-[#161018] px-2 py-2.5 text-center text-[11px] font-semibold leading-snug text-white hover:bg-[#1f1a24] hover:text-white sm:min-h-12 sm:gap-2 sm:px-3 sm:text-xs md:px-8 md:text-sm lg:w-auto lg:shrink-0 lg:whitespace-nowrap lg:px-3 lg:text-xs xl:px-6 xl:text-sm"
                              data-testid="button-hero-music-making-guide"
                            >
                              <span className="relative flex shrink-0 items-center">
                                <Wand2 className="h-4 w-4 -rotate-45 sm:h-5 sm:w-5" aria-hidden />
                                <Sparkles className="absolute -right-1 -top-0.5 h-3 w-3 text-white/95 sm:-right-1.5 sm:-top-1 sm:h-3.5 sm:w-3.5" aria-hidden />
                              </span>
                              <span className="text-center">{t("home.musicMakingGuide", "음악 만들기 가이드")}</span>
                            </Button>
                          </Link>
                        )}
                        <Button
                          type="button"
                          size="lg"
                          variant="outline"
                          className="h-auto min-h-11 w-full whitespace-normal rounded-full border-white/30 bg-white/10 px-2 py-2.5 text-center text-xs leading-snug text-white backdrop-blur-sm hover:bg-white/15 hover:text-white sm:min-h-12 sm:px-3 sm:text-sm lg:w-auto lg:shrink-0 lg:whitespace-nowrap lg:px-4 xl:px-8"
                          data-testid="button-hero-learn-more"
                          onClick={() => {
                            setLearnMoreMode("creator");
                            setLearnMoreOpen(true);
                          }}
                        >
                          {t("home.heroCtaLearnMore", "자세히 알아보기")}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="business"
                    role="tabpanel"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    <h2
                      className="mb-2 text-center text-xl font-bold text-white/95 sm:text-2xl lg:text-left lg:text-3xl"
                      data-testid="text-hero-subtitle-business"
                    >
                      {t("home.heroHeadlineBusiness", "브랜드와 매장을 위한 음악·방송")}
                    </h2>
                    <p className="mb-4 whitespace-pre-line text-balance break-words text-center text-xs leading-relaxed text-white/72 sm:text-sm lg:text-left">
                      {t(
                        "home.heroLeadBusiness",
                        "누구나 나만의 음악을 만들어 우리 스토어 채널을 만들고,\n광고비 없이 중간 광고를 넣어 소비자의 스토어 방문을 유도할 수 있습니다.",
                      )}
                    </p>
                    <ul className="mb-5 space-y-2 text-sm text-white/78 sm:mb-6 lg:text-base">
                      <li className="flex items-start justify-center gap-2 text-left lg:justify-start">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400/90" aria-hidden />
                        <span className="max-w-[min(100%,18rem)] sm:max-w-[20rem] lg:max-w-none">
                          {t("home.heroBizBullet1", "저작권 걱정 없는 100% 독점 브랜드 음원")}
                        </span>
                      </li>
                      <li className="flex items-start justify-center gap-2 text-left lg:justify-start">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400/90" aria-hidden />
                        <span className="max-w-[min(100%,18rem)] sm:max-w-[20rem] lg:max-w-none">
                          {t("home.heroBizBullet2", "클릭 한 번으로 생성되는 우리 가게 전용 방송국")}
                        </span>
                      </li>
                    </ul>
                    <div className="mx-auto flex w-full min-w-0 max-w-sm flex-col gap-2.5 lg:mx-0 lg:max-w-none lg:flex-row lg:flex-nowrap lg:items-center lg:justify-start lg:gap-2 xl:gap-3">
                      <Button
                        type="button"
                        size="lg"
                        className="h-11 w-full min-w-0 shrink-0 rounded-full bg-primary px-6 text-sm text-white shadow-lg shadow-primary/30 sm:h-12 sm:px-8 sm:text-base md:px-10 lg:w-auto lg:shrink-0 lg:whitespace-nowrap"
                        data-testid="button-hero-business-pricing"
                        onClick={() => openRegisterModal()}
                      >
                        {t("home.heroCtaPricing", "무료 시작하기")}
                      </Button>
                      <div className="grid min-w-0 grid-cols-2 gap-2.5 lg:contents">
                        <Link href="/global-distribution-guide" className="min-w-0 lg:w-auto lg:shrink-0">
                          <Button
                            size="lg"
                            variant="outline"
                            className="h-auto min-h-11 w-full whitespace-normal rounded-full border-cyan-400/40 bg-cyan-950/35 px-2 py-2.5 text-center text-[11px] font-medium leading-snug text-cyan-100 hover:bg-cyan-900/45 hover:text-cyan-50 sm:min-h-12 sm:px-3 sm:text-xs md:px-6 md:text-sm lg:w-auto lg:shrink-0 lg:whitespace-nowrap lg:px-3 xl:px-6"
                            data-testid="button-hero-business-distribution"
                          >
                            {t("home.heroCtaDistributionShort", "글로벌 발매 가이드")}
                          </Button>
                        </Link>
                        <Button
                          type="button"
                          size="lg"
                          variant="outline"
                          className="h-auto min-h-11 w-full whitespace-normal rounded-full border-white/30 bg-white/10 px-2 py-2.5 text-center text-xs leading-snug text-white backdrop-blur-sm hover:bg-white/15 hover:text-white sm:min-h-12 sm:px-3 sm:text-sm lg:w-auto lg:shrink-0 lg:whitespace-nowrap lg:px-4 xl:px-8"
                          data-testid="button-hero-learn-more-business"
                          onClick={() => {
                            setLearnMoreMode("business");
                            setLearnMoreOpen(true);
                          }}
                        >
                          {t("home.heroCtaLearnMore", "자세히 알아보기")}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </section>

      {/* 빠른 입구: 방송·업로드·가이드·AI (히어로 CTA 부담 분산) */}
      <section className="container relative z-10 mt-10 px-4 pb-6 md:mt-14" data-testid="section-quick-tiles">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          {t("home.quickTilesLabel", "바로 가기")}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <Link
            href="/radio/channels"
            className="flex flex-col gap-0.5 rounded-lg border-2 border-border/90 bg-card/50 p-2 shadow-sm ring-2 ring-border/55 transition-colors hover:bg-muted/50 hover:border-primary/55 hover:ring-primary/35 md:gap-1 md:rounded-xl md:p-3"
            data-testid="quick-tile-radio"
          >
            <Radio className="h-4 w-4 shrink-0 text-purple-400 md:h-5 md:w-5" />
            <span className="text-xs font-semibold leading-tight md:text-sm">{t("home.quickTileRadio", "베니방송국")}</span>
            <span className="line-clamp-2 text-[10px] leading-snug text-muted-foreground md:text-[11px]">{t("home.quickTileRadioDesc", "회원이면 누구든 나의 방송국을 만들 수 있습니다.")}</span>
          </Link>
          <Link
            href="/upload"
            className="flex flex-col gap-0.5 rounded-lg border-2 border-border/90 bg-card/50 p-2 shadow-sm ring-2 ring-border/55 transition-colors hover:bg-muted/50 hover:border-primary/55 hover:ring-primary/35 md:gap-1 md:rounded-xl md:p-3"
            data-testid="quick-tile-upload"
          >
            <Upload className="h-4 w-4 shrink-0 text-emerald-400 md:h-5 md:w-5" />
            <span className="text-xs font-semibold leading-tight md:text-sm">{t("home.uploadTrack", "음원업로드")}</span>
            <span className="line-clamp-2 text-[10px] leading-snug text-muted-foreground md:text-[11px]">{t("home.quickTileUploadDesc", "나만의 음악을 만들고 업로드하여 수익화 해보세요")}</span>
          </Link>
          <Link
            href="/create-music"
            className="group relative flex flex-col gap-0.5 rounded-lg border-2 border-pink-400/70 bg-gradient-to-br from-pink-500/25 via-fuchsia-500/15 to-purple-600/18 p-2 shadow-md shadow-pink-500/20 ring-2 ring-pink-400/45 transition-all hover:border-pink-300/85 hover:from-pink-500/32 hover:via-fuchsia-500/22 hover:shadow-lg hover:shadow-fuchsia-500/25 hover:ring-pink-300/55 md:gap-1 md:rounded-xl md:p-3"
            data-testid="quick-tile-ai"
          >
            <span className="absolute right-1 top-1 rounded-full bg-pink-500/90 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white shadow-sm md:right-1.5 md:top-1.5 md:text-[9px]">
              {t("home.quickTileAiBadge", "AI")}
            </span>
            <Wand2 className="h-4 w-4 shrink-0 text-pink-300 drop-shadow-[0_0_8px_rgba(244,114,182,0.45)] group-hover:text-pink-200 md:h-5 md:w-5" />
            <span className="pr-5 text-xs font-semibold leading-tight text-foreground md:pr-6 md:text-sm">{t("home.quickTileAi", "AI로 음악만들고 악보까지 한방에 생성")}</span>
            <span className="line-clamp-2 text-[10px] leading-snug text-muted-foreground group-hover:text-foreground/90 md:text-[11px]">{t("home.quickTileAiDesc", "간단한 설명으로 나만의 곡을 만들고, Premium이면 참고용 악보 PDF까지 받아 보세요")}</span>
          </Link>
          <Link
            href="/guide"
            className="flex flex-col gap-0.5 rounded-lg border-2 border-border/90 bg-card/50 p-2 shadow-sm ring-2 ring-border/55 transition-colors hover:bg-muted/50 hover:border-primary/55 hover:ring-primary/35 md:gap-1 md:rounded-xl md:p-3"
            data-testid="quick-tile-guide"
          >
            <HelpCircle className="h-4 w-4 shrink-0 text-amber-400 md:h-5 md:w-5" />
            <span className="text-xs font-semibold leading-tight md:text-sm">{t("home.newHere")}</span>
            <span className="line-clamp-2 text-[10px] leading-snug text-muted-foreground md:text-[11px]">{t("home.quickTileGuideDesc", "베니사운드의 모든 것을 알아보세요.")}</span>
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
                <p className="mb-0.5 text-xl font-bold text-emerald-300 drop-shadow-md animate-blink md:text-2xl lg:text-3xl">
                  {t("home.radioBannerCampaign", "나도 DJ해볼까?")}
                </p>
                <h3 className="truncate text-lg font-bold text-white md:text-xl">
                  {t("home.radioBannerTitle", "베니방송국")}
                </h3>
                <p className="truncate text-sm text-white/90 md:text-base">
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
        <section className="container px-4 pb-4 pt-8 md:pt-10" data-testid="section-curated-playlists">
          <div className="mb-3 md:mb-4">
            <h2 className="text-xl font-display font-bold md:text-3xl" data-testid="text-curated-section-title">
              {t("home.curatedSectionTitle", "테마 플레이리스트")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm">
              {t("home.curatedSectionDesc", "에디터가 고른 플레이리스트를 만나 보세요.")}
            </p>
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 scroll-smooth snap-x snap-mandatory md:mx-0 md:gap-4 md:px-0">
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
                    className="w-[28vw] min-w-[6.5rem] max-w-[7.5rem] shrink-0 snap-start rounded-lg border border-border/60 bg-card/30 overflow-hidden transition-colors hover:border-primary/40 group md:w-auto md:min-w-[9.5rem] md:max-w-[10rem] md:rounded-xl"
                    data-testid={`link-curated-${pl.slug}`}
                  >
                    <div className="aspect-square relative overflow-hidden">
                      <img src={cover} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    </div>
                    <div className="p-1.5 md:p-2.5">
                      <p className="line-clamp-2 text-[11px] font-semibold leading-tight md:text-sm">{pl.name}</p>
                      {pl.description ? (
                        <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground md:mt-1 md:text-xs">{pl.description}</p>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
          </div>
        </section>
      )}

      {Array.isArray(weeklyTop) && weeklyTop.length > 0 && (
        <section className="container px-4 pb-4 pt-12 md:pt-16">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4 md:mb-6">
            <div>
              <h2 className="text-xl font-display font-bold md:text-3xl" data-testid="text-weekly-top-section">
                {t('home.weeklyTop', '이번 주 많이 들은 곡')}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground md:text-sm">
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

      {user && allLikedTracksForHome.length > 0 && (
        <section className="container px-4 py-8 pb-2 md:py-10" data-testid="section-liked-tracks">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4 md:mb-6">
            <div>
              <h2 className="text-xl font-display font-bold md:text-3xl" data-testid="text-liked-section-title">
                {t("home.likedSectionTitle", "좋아요한 곡")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground md:text-sm">
                {t("home.likedSectionDesc", "내가 하트 누른 트랙입니다.")}
              </p>
            </div>
          </div>
          <div className="relative w-full">
            <div className="flex w-full flex-col gap-2 pb-1" data-testid="liked-tracks-compact-list">
              {likedPageTracks.map((music) => (
                <div key={music.id} className="w-full min-w-0" data-testid={`liked-track-row-${music.id}`}>
                  <MusicCard music={music} variant="homeLikedRow" />
                </div>
              ))}
            </div>
            {likedTotalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4" data-testid="liked-tracks-pagination">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-full shrink-0"
                  disabled={likedHomePage <= 0}
                  onClick={() => setLikedHomePage((p) => Math.max(0, p - 1))}
                  aria-label={t("home.likedPagePrev", "이전 페이지")}
                  data-testid="button-liked-page-prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground tabular-nums min-w-[3.5rem] text-center">
                  {t("home.likedPageIndicator", {
                    current: likedHomePage + 1,
                    total: likedTotalPages,
                    defaultValue: "{{current}} / {{total}}",
                  })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-full shrink-0"
                  disabled={likedHomePage >= likedTotalPages - 1}
                  onClick={() => setLikedHomePage((p) => Math.min(likedTotalPages - 1, p + 1))}
                  aria-label={t("home.likedPageNext", "다음 페이지")}
                  data-testid="button-liked-page-next"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </section>
      )}

      {!newReleasesLoading && homeNewReleases.length > 0 && (
        <section className="container px-4 py-8 pb-2 md:py-10" data-testid="section-new-releases">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4 md:mb-6">
            <div>
              <h2 className="text-xl font-display font-bold md:text-3xl" data-testid="text-new-releases-title">
                {t("home.newReleasesTitle", "신곡 · 공식 발매")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground md:text-sm">
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

      <section className="container px-4 py-8 md:py-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 md:mb-8">
          <div>
            <h2 className="text-xl font-display font-bold md:text-3xl" data-testid="text-recent-section">
              {t("home.recentUploadsByUploadTitle", "최근 업로드")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm">
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
        ) : isError ? (
          <div className="text-center py-20 space-y-4 px-4" data-testid="text-music-list-error">
            <p className="text-destructive font-medium">
              {t("home.musicListLoadError", "음악 목록을 불러오지 못했습니다. 네트워크 또는 서버(API) 연결을 확인해 주세요.")}
            </p>
            <p className="text-xs text-muted-foreground break-all max-w-lg mx-auto">
              {error instanceof Error ? error.message : String(error)}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetchMusicList()}>
              {t("home.retryLoadMusic", "다시 시도")}
            </Button>
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
      <HomeLearnMoreSheet open={learnMoreOpen} onOpenChange={setLearnMoreOpen} mode={learnMoreMode} />
      <SiteHelpChatFab />
      <Footer />
    </div>
  );
}
