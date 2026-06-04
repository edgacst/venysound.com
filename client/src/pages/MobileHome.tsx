import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  ChevronDown,
  Coins,
  Crown,
  Disc3,
  Download,
  Home,
  Loader2,
  MessageSquare,
  Play,
  Radio,
  Search,
  Sparkles,
  TrendingUp,
  Upload,
  Youtube,
} from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/use-auth";
import { useMusicList } from "@/hooks/use-music";
import { usePlayerStore } from "@/components/AudioPlayer";
import { resolveStorageUrl } from "@/lib/utils";
import { useLoginModalStore } from "@/stores/login-modal";
import type { Music as MusicType } from "@shared/schema";

const L = {
  aiCreate: "\u0041\u0049 \uc0dd\uc131",
  broadcast: "\ubc29\uc1a1",
  continueLogin: "\ub85c\uadf8\uc778\ud558\uba74 \ubcf4\uad00\ud568\uacfc \uc9c0\uac11\uc744 \ubc14\ub85c \uc774\uc5b4\uc11c \ubcfc \uc218 \uc788\uc5b4\uc694.",
  dashboard: "\ub300\uc2dc\ubcf4\ub4dc",
  dashboardValue: "\ub0b4 \ud65c\ub3d9 \ubcf4\uae30",
  emptyMusic: "\uc74c\uc6d0\uc774 \uc544\uc9c1 \uc5c6\uc2b5\ub2c8\ub2e4.",
  expand: "\ud3bc\uce58\uae30",
  exploreMood: "\ubb34\ub4dc\ub85c \ucc3e\uae30",
  exploreMoodDesc: "\uc9c0\uae08 \ub4e3\uace0 \uc2f6\uc740 \ubd84\uc704\uae30\ub97c \ubc14\ub85c \uace0\ub974\uc138\uc694.",
  fastStart: "\ubc14\ub85c \uc2dc\uc791",
  featuredFlow: "\uc624\ub298\uc758 \ud50c\ub85c\uc6b0",
  featuredFlowDesc: "\ub4e3\uae30, \ub9cc\ub4e4\uae30, \ubc29\uc1a1\uae4c\uc9c0 \ud55c \ud654\uba74\uc5d0\uc11c \uc774\uc5b4\uc9d1\ub2c8\ub2e4.",
  latest: "\ubc29\uae08 \uc62c\ub77c\uc628 \uc74c\uc545",
  liveNow: "\uc9c0\uae08 \ubc29\uc1a1 \uc911",
  login: "\ub85c\uadf8\uc778",
  message: "\uba54\uc2dc\uc9c0",
  messageEmpty: "\ubc1b\uc740 \uba54\uc2dc\uc9c0",
  messageNew: "\uac1c \uc0c8 \uba54\uc2dc\uc9c0",
  more: "\ub354\ubcf4\uae30",
  myLibrary: "\ub0b4 \ubcf4\uad00\ud568",
  myLibraryValue: "\uad6c\ub9e4/\uc800\uc7a5 \uc74c\uc545",
  nameSuffix: "\ub2d8",
  pick: "\uc624\ub298\uc758 \ud53d",
  play: "\uc7ac\uc0dd",
  playing: "\uc7ac\uc0dd \uc911",
  premium: "\ud504\ub9ac\ubbf8\uc5c4",
  quickChart: "\ubbf8\ub2c8 \ucc28\ud2b8",
  recommended: "\ucd94\ucc9c \ud50c\ub808\uc774\ub9ac\uc2a4\ud2b8",
  searchMusic: "\uc74c\uc6d0 \ud0d0\uc0c9",
  start: "\u0056\u0065\u006e\u0079\u0053\u006f\u0075\u006e\u0064 \uc2dc\uc791\ud558\uae30",
  upload: "\uc5c5\ub85c\ub4dc",
  wallet: "\uc9c0\uac11",
  welcome: "\uc5b4\uc11c\uc624\uc138\uc694",
  won: "\uc6d0",
  weeklyTop: "\uc774\ubc88 \uc8fc \uc778\uae30\uace1",
  playlistStudio: "\ud50c.\uc2a4\ud29c\ub514\uc624",
} as const;

const MOBILE_COPY = {
  ko: L,
  en: {
    aiCreate: "AI Create",
    broadcast: "Radio",
    continueLogin: "Log in to continue to your library and wallet.",
    dashboard: "Dashboard",
    dashboardValue: "View activity",
    emptyMusic: "No music yet.",
    expand: "Open",
    exploreMood: "Find by mood",
    exploreMoodDesc: "Choose the mood you want to hear now.",
    fastStart: "Quick Start",
    featuredFlow: "Today's Flow",
    featuredFlowDesc: "Listen, create, and broadcast from one mobile screen.",
    latest: "Recently Uploaded",
    liveNow: "Live now",
    login: "Log In",
    message: "Messages",
    messageEmpty: "Inbox",
    messageNew: " new",
    more: "More",
    myLibrary: "My Library",
    myLibraryValue: "Saved music",
    nameSuffix: "",
    pick: "Today's Pick",
    play: "Play",
    playing: "Playing",
    premium: "Premium",
    quickChart: "Mini Chart",
    recommended: "Recommended Playlists",
    searchMusic: "Explore",
    start: "Start VenySound",
    upload: "Upload",
    wallet: "Wallet",
    welcome: "Welcome",
    won: " KRW",
    weeklyTop: "Weekly Top",
    playlistStudio: "PL Studio",
  },
  ja: {
    aiCreate: "AI生成",
    broadcast: "ラジオ",
    continueLogin: "ログインするとライブラリとウォレットを続けて確認できます。",
    dashboard: "ダッシュボード",
    dashboardValue: "活動を見る",
    emptyMusic: "音源はまだありません。",
    expand: "開く",
    exploreMood: "ムードで探す",
    exploreMoodDesc: "今聴きたい雰囲気を選んでください。",
    fastStart: "すぐ始める",
    featuredFlow: "今日のフロー",
    featuredFlowDesc: "聴く、作る、配信まで一画面でつながります。",
    latest: "新着音楽",
    liveNow: "配信中",
    login: "ログイン",
    message: "メッセージ",
    messageEmpty: "受信メッセージ",
    messageNew: "件の新着",
    more: "もっと見る",
    myLibrary: "マイライブラリ",
    myLibraryValue: "保存した音楽",
    nameSuffix: "さん",
    pick: "今日のピック",
    play: "再生",
    playing: "再生中",
    premium: "プレミアム",
    quickChart: "ミニチャート",
    recommended: "おすすめプレイリスト",
    searchMusic: "音楽を探す",
    start: "VenySoundを始める",
    upload: "アップロード",
    wallet: "ウォレット",
    welcome: "ようこそ",
    won: "ウォン",
    weeklyTop: "今週の人気曲",
    playlistStudio: "PLスタジオ",
  },
  zh: {
    aiCreate: "AI 生成",
    broadcast: "电台",
    continueLogin: "登录后可继续查看资料库和钱包。",
    dashboard: "仪表盘",
    dashboardValue: "查看活动",
    emptyMusic: "还没有音乐。",
    expand: "展开",
    exploreMood: "按氛围查找",
    exploreMoodDesc: "选择现在想听的氛围。",
    fastStart: "快速开始",
    featuredFlow: "今日流程",
    featuredFlowDesc: "听歌、创作、广播都在一个画面中完成。",
    latest: "最新上传",
    liveNow: "正在直播",
    login: "登录",
    message: "消息",
    messageEmpty: "收件箱",
    messageNew: " 条新消息",
    more: "更多",
    myLibrary: "我的资料库",
    myLibraryValue: "已保存音乐",
    nameSuffix: "",
    pick: "今日推荐",
    play: "播放",
    playing: "播放中",
    premium: "高级",
    quickChart: "迷你榜单",
    recommended: "推荐播放列表",
    searchMusic: "探索音乐",
    start: "开始使用 VenySound",
    upload: "上传",
    wallet: "钱包",
    welcome: "欢迎",
    won: "韩元",
    weeklyTop: "本周热门",
    playlistStudio: "播放列表工作室",
  },
} as const;

function getMobileCopy(language?: string) {
  const base = String(language || "ko").split(/[-_]/)[0] as keyof typeof MOBILE_COPY;
  return MOBILE_COPY[base] ?? MOBILE_COPY.ko;
}

function coverFor(music?: Pick<MusicType, "imageFilename"> | null) {
  if (music?.imageFilename) return resolveStorageUrl(music.imageFilename);
  return "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&h=600&fit=crop";
}

function MobileTrackCard({ music, rank }: { music: MusicType; rank?: number }) {
  const { i18n } = useTranslation();
  const copy = getMobileCopy(i18n.language);
  const { playMusic, activeMusicId, pauseRequested, togglePause } = usePlayerStore();
  const isActive = activeMusicId === music.id;
  const isPlaying = isActive && !pauseRequested;

  return (
    <div className="w-[38vw] min-w-[8.75rem] max-w-[10rem] shrink-0 snap-start">
      <Link href={`/music/${music.id}`} className="block">
        <div className={`relative aspect-square overflow-hidden rounded-2xl bg-slate-100 shadow-[0_16px_36px_-24px_rgba(15,23,42,0.55)] ring-2 ${
          isPlaying ? "ring-teal-300" : isActive ? "ring-violet-300" : "ring-transparent"
        } ${isPlaying ? "playing-card-soft-pulse" : ""}`}>
          <img src={coverFor(music)} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          {rank ? (
            <div className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">
              #{rank}
            </div>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isActive) {
                togglePause();
                return;
              }
              playMusic(music.id);
            }}
            className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-lg"
            aria-label={isPlaying ? copy.playing : copy.play}
          >
            {isPlaying ? <Disc3 className="h-4 w-4 animate-spin" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
          </button>
        </div>
        <p className="mt-2 line-clamp-1 text-sm font-semibold text-slate-950">{music.title}</p>
        <p className="line-clamp-1 text-xs text-slate-500">{music.artist}</p>
      </Link>
    </div>
  );
}

function SectionHeader({ title, href }: { title: string; href?: string }) {
  const { i18n } = useTranslation();
  const copy = getMobileCopy(i18n.language);
  return (
    <div className="mb-3 flex items-center justify-between px-4">
      <h2 className="text-lg font-bold tracking-normal text-white">{title}</h2>
      {href ? (
        <Link href={href} className="text-xs font-semibold text-white/75">
          {copy.more}
        </Link>
      ) : null}
    </div>
  );
}

function MobileActionLink({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: typeof Home;
  label: string;
  value?: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/8 p-3 text-white backdrop-blur-xl"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/12">
        <Icon className="h-4 w-4 text-fuchsia-200" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-white">{label}</p>
        {value ? <p className="mt-0.5 truncate text-[11px] font-semibold text-white/55">{value}</p> : null}
      </div>
    </Link>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Home;
  label: string;
}) {
  return (
    <Link href={href} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-3 text-white/82 transition-colors hover:text-white">
      <Icon className="h-5 w-5" />
      <span className="max-w-full truncate text-[11px] font-bold">{label}</span>
    </Link>
  );
}

function FlowCard({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: typeof Home;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="rounded-[22px] border border-white/10 bg-white/10 p-3 text-white shadow-[0_18px_54px_-42px_rgba(0,0,0,0.9)] backdrop-blur-xl">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/14">
        <Icon className="h-5 w-5 text-fuchsia-100" />
      </div>
      <p className="text-sm font-black leading-tight">{title}</p>
      <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-snug text-white/58">{desc}</p>
    </Link>
  );
}

export default function MobileHome() {
  const { i18n } = useTranslation();
  const copy = getMobileCopy(i18n.language);
  const { user } = useAuth();
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const openLogin = useLoginModalStore((s) => s.open);
  const { playMusic, activeMusicId, pauseRequested, togglePause } = usePlayerStore();
  const { data: musicResult, isLoading } = useMusicList({ limit: 30 });
  const tracks = musicResult?.data ?? [];
  const heroTrack = tracks[0];
  const recentTracks = tracks.slice(0, 10);
  const displayName = user?.firstName?.trim() || user?.username?.trim() || "MY";

  const { data: weeklyTop = [] } = useQuery<MusicType[]>({
    queryKey: ["/api/music/top-weekly", 10],
    queryFn: async () => {
      const res = await fetch("/api/music/top-weekly?limit=10");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: liveChannels = [] } = useQuery<Array<{ id: number; name: string; slug: string; homeTickerText?: string | null }>>({
    queryKey: ["/api/radio/channels/live"],
    queryFn: async () => {
      const res = await fetch("/api/radio/channels/live");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: curatedPlaylists = [] } = useQuery<
    Array<{ id: number; name: string; description: string | null; slug: string; coverImageFilename: string | null }>
  >({
    queryKey: ["/api/curated-playlists"],
    queryFn: async () => {
      const res = await fetch("/api/curated-playlists");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: creditsData } = useQuery<{ credits: number; balanceWon?: number }>({
    queryKey: ["/api/credits"],
    enabled: !!user,
  });

  const { data: unreadMsgData } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    enabled: !!user,
    refetchInterval: 15000,
  });

  const balanceWon = creditsData?.balanceWon ?? creditsData?.credits ?? 0;
  const unreadMessageCount = unreadMsgData?.count ?? 0;
  const moodChips = [
    { label: i18n.t("mobileHome.moodDrive", { defaultValue: i18n.language.startsWith("en") ? "Drive" : i18n.language.startsWith("ja") ? "ドライブ" : i18n.language.startsWith("zh") ? "兜风" : "드라이브" }), href: "/music?q=drive" },
    { label: i18n.t("mobileHome.moodEmotional", { defaultValue: i18n.language.startsWith("en") ? "Emotional" : i18n.language.startsWith("ja") ? "感性" : i18n.language.startsWith("zh") ? "感性" : "감성" }), href: "/music?q=emotional" },
    { label: i18n.t("mobileHome.moodUpbeat", { defaultValue: i18n.language.startsWith("en") ? "Upbeat" : i18n.language.startsWith("ja") ? "楽しい" : i18n.language.startsWith("zh") ? "欢快" : "신나는" }), href: "/music?q=upbeat" },
    { label: i18n.t("mobileHome.moodNight", { defaultValue: i18n.language.startsWith("en") ? "Night" : i18n.language.startsWith("ja") ? "夜" : i18n.language.startsWith("zh") ? "夜晚" : "밤" }), href: "/music?q=night" },
    { label: i18n.t("mobileHome.moodPiano", { defaultValue: i18n.language.startsWith("en") ? "Piano" : i18n.language.startsWith("ja") ? "ピアノ" : i18n.language.startsWith("zh") ? "钢琴" : "피아노" }), href: "/music?q=piano" },
    { label: copy.broadcast, href: "/radio/channels" },
  ] as const;

  return (
    <div className="min-h-screen bg-transparent pb-36 text-white" data-testid="mobile-home-redesign">
      <Navigation />

      <main className="space-y-6 pt-4">
        <section className="px-4">
          {user ? (
            <div className="rounded-[24px] border border-white/10 bg-white/12 px-4 py-3 shadow-[0_18px_48px_-34px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 text-xs font-bold text-cyan-200">{copy.welcome}</span>
                  <h1 className="truncate text-base font-black text-white">
                    {displayName}
                    {copy.nameSuffix}
                  </h1>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickMenuOpen((open) => !open)}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-black/45 px-3 py-2 text-xs font-black text-white"
                  aria-expanded={quickMenuOpen}
                >
                  {copy.expand}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${quickMenuOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
              <AnimatePresence initial={false}>
                {quickMenuOpen ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-2 gap-2 pt-3">
                      <MobileActionLink href="/my-library" icon={Download} label={copy.myLibrary} value={copy.myLibraryValue} />
                      <MobileActionLink
                        href="/messages"
                        icon={MessageSquare}
                        label={copy.message}
                        value={unreadMessageCount > 0 ? `${unreadMessageCount}${copy.messageNew}` : copy.messageEmpty}
                      />
                      <MobileActionLink href="/dashboard" icon={BarChart3} label={copy.dashboard} value={copy.dashboardValue} />
                      <MobileActionLink href="/credits" icon={Coins} label={copy.wallet} value={`${balanceWon.toLocaleString()}${copy.won}`} />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : (
            <div className="rounded-[24px] border border-white/10 bg-white/12 p-4 shadow-[0_18px_48px_-34px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
              <p className="text-xs font-bold text-cyan-200">{copy.start}</p>
              <h1 className="mt-1 text-lg font-black leading-tight text-white">{copy.continueLogin}</h1>
              <button onClick={openLogin} className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-black text-violet-950">
                {copy.login}
              </button>
            </div>
          )}
        </section>

        <section className="px-4">
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/10 text-white shadow-[0_26px_70px_-40px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-fuchsia-300/35 to-transparent" />
            <div className="relative p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="rounded-full bg-black/65 px-3 py-1 text-[11px] font-bold text-white">{copy.pick}</span>
                <Sparkles className="h-5 w-5 text-white/70" />
              </div>
              {isLoading ? (
                <div className="flex h-72 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : heroTrack ? (
                <>
                  <div className="overflow-hidden rounded-3xl">
                    <img src={coverFor(heroTrack)} alt="" className="aspect-[1.08/1] w-full object-cover" />
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-4">
                    <div className="min-w-0">
                      <h1 className="line-clamp-2 text-2xl font-black leading-tight">{heroTrack.title}</h1>
                      <p className="mt-1 line-clamp-1 text-sm font-semibold text-white/55">{heroTrack.artist}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (activeMusicId === heroTrack.id) {
                          togglePause();
                          return;
                        }
                        playMusic(heroTrack.id);
                      }}
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-violet-950"
                      aria-label={copy.play}
                    >
                      {activeMusicId === heroTrack.id && !pauseRequested ? (
                        <Disc3 className="h-6 w-6 animate-spin" />
                      ) : (
                        <Play className="ml-1 h-6 w-6 fill-current" />
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex h-72 items-center justify-center text-sm font-semibold text-white/55">{copy.emptyMusic}</div>
              )}
            </div>
          </div>
        </section>

        <section className="px-4">
          <div className="flex items-center gap-1 rounded-[24px] border border-white/10 bg-black/22 px-2 shadow-[0_18px_54px_-38px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
            <QuickAction href="/playlist-studio" icon={Youtube} label={copy.playlistStudio} />
            <QuickAction href="/upload" icon={Upload} label={copy.upload} />
            <QuickAction href="/radio/channels" icon={Radio} label={copy.broadcast} />
            <QuickAction href="/pricing" icon={Crown} label={copy.premium} />
          </div>
        </section>

        <section className="px-4">
          <div className="rounded-[28px] border border-white/10 bg-black/24 p-4 shadow-[0_22px_68px_-46px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-fuchsia-200">{copy.featuredFlow}</p>
                <h2 className="mt-0.5 text-xl font-black leading-tight text-white">{copy.fastStart}</h2>
              </div>
              <Sparkles className="h-5 w-5 shrink-0 text-white/70" />
            </div>
            <p className="mb-4 text-xs font-semibold leading-relaxed text-white/60">{copy.featuredFlowDesc}</p>
            <div className="grid grid-cols-3 gap-2">
              <FlowCard href="/music" icon={Search} title={copy.searchMusic} desc={copy.recommended} />
              <FlowCard href="/popular" icon={TrendingUp} title={copy.quickChart} desc={copy.weeklyTop} />
              <FlowCard href="/playlist-studio" icon={Youtube} title={copy.playlistStudio} desc={copy.recommended} />
            </div>
          </div>
        </section>

        {weeklyTop.length > 0 ? (
          <section className="px-4">
            <div className="rounded-[28px] border border-white/10 bg-white/10 p-4 shadow-[0_22px_68px_-46px_rgba(0,0,0,0.95)] backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-cyan-200">{copy.quickChart}</p>
                  <h2 className="text-lg font-black text-white">{copy.weeklyTop}</h2>
                </div>
                <Link href="/popular" className="text-xs font-bold text-white/72">
                  {copy.more}
                </Link>
              </div>
              <div className="space-y-2">
                {weeklyTop.slice(0, 3).map((music, index) => (
                  <div key={music.id} className="flex items-center gap-3 rounded-2xl bg-black/22 p-2">
                    <span className="w-5 text-center text-xs font-black text-white/55">{index + 1}</span>
                    <img src={coverFor(music)} alt="" className="h-12 w-12 rounded-xl object-cover" />
                    <Link href={`/music/${music.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-white">{music.title}</p>
                      <p className="truncate text-xs font-semibold text-white/52">{music.artist}</p>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        if (activeMusicId === music.id) {
                          togglePause();
                          return;
                        }
                        playMusic(music.id);
                      }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-violet-950"
                      aria-label={copy.play}
                    >
                      {activeMusicId === music.id && !pauseRequested ? (
                        <Disc3 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="ml-0.5 h-4 w-4 fill-current" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="px-4">
          <div className="rounded-[28px] border border-white/10 bg-white/8 p-4 backdrop-blur-xl">
            <div className="mb-3">
              <p className="text-[11px] font-bold text-fuchsia-200">{copy.exploreMood}</p>
              <h2 className="text-lg font-black text-white">{copy.exploreMoodDesc}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {moodChips.map((chip) => (
                <Link
                  key={chip.label}
                  href={chip.href}
                  className="rounded-full border border-white/12 bg-white/10 px-3 py-2 text-xs font-bold text-white/82"
                >
                  {chip.label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {liveChannels.length > 0 ? (
          <section className="px-4">
            <Link
              href={`/radio/${encodeURIComponent(liveChannels[0].slug)}`}
              className="flex items-center gap-3 rounded-[24px] border border-white/10 bg-black/30 p-3 text-white shadow-[0_18px_48px_-32px_rgba(0,0,0,0.8)] backdrop-blur-xl"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-fuchsia-400/18">
                <Radio className="h-5 w-5 text-fuchsia-100" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-fuchsia-200">LIVE RADIO</p>
                <h2 className="truncate text-base font-black">{liveChannels[0].name}</h2>
                <p className="mt-0.5 truncate text-xs text-white/55">{liveChannels[0].homeTickerText || copy.liveNow}</p>
              </div>
            </Link>
          </section>
        ) : null}

        {curatedPlaylists.length > 0 ? (
          <section>
            <SectionHeader title={copy.recommended} href="/music" />
            <div className="flex snap-x gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
              {curatedPlaylists.slice(0, 8).map((playlist) => (
                <Link
                  key={playlist.id}
                  href={`/curated/${encodeURIComponent(playlist.slug)}`}
                  className="w-[48vw] min-w-[11rem] shrink-0 snap-start overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_16px_36px_-28px_rgba(15,23,42,0.55)]"
                >
                  <div className="aspect-square bg-slate-100">
                    {playlist.coverImageFilename ? (
                      <img src={resolveStorageUrl(playlist.coverImageFilename)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Sparkles className="h-8 w-8 text-slate-400" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-1 text-sm font-black">{playlist.name}</p>
                    {playlist.description ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{playlist.description}</p> : null}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {recentTracks.length > 0 ? (
          <section>
            <SectionHeader title={copy.latest} href="/music" />
            <div className="space-y-2 px-4">
              {recentTracks.slice(0, 8).map((music) => (
                <div
                  key={music.id}
                  className={`rounded-2xl border bg-white p-2 shadow-[0_12px_32px_-26px_rgba(15,23,42,0.55)] ${
                    activeMusicId === music.id
                      ? pauseRequested
                        ? "border-violet-400"
                        : "playing-card-soft-pulse border-teal-400"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <img src={coverFor(music)} alt="" className="h-[52px] w-[52px] rounded-xl object-cover" />
                    <Link href={`/music/${music.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-black leading-tight text-slate-950">{music.title}</p>
                      <p className="mt-0.5 truncate text-[11px] font-semibold leading-tight text-slate-500">{music.artist}</p>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        if (activeMusicId === music.id) {
                          togglePause();
                          return;
                        }
                        playMusic(music.id);
                      }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white"
                      aria-label={copy.play}
                    >
                      {activeMusicId === music.id && !pauseRequested ? (
                        <Disc3 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
