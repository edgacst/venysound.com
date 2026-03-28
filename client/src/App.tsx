import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useRadioPlayerStore } from "@/stores/radio-player";
import { Router, Switch, Route, useLocation, Redirect } from "wouter";
import { LOGIN_PATH, REGISTER_PATH, ADMIN_PATH } from "@/lib/site-paths";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalAudioPlayer } from "@/components/AudioPlayer";
import { GlobalRadioPlayer } from "@/components/GlobalRadioPlayer";
import { ScrollToTop } from "@/components/ScrollToTop";
import { RouteSmoothScroll } from "@/components/RouteSmoothScroll";
import { LoginModal } from "@/components/LoginModal";
import { RadioBackNavigationRecovery } from "@/components/RadioBackNavigationRecovery";
import { WsProvider } from "@/contexts/WsContext";
import { RadioWaveformProvider } from "@/contexts/RadioWaveformContext";

const VISITOR_KEY = "vkey";
const VISIT_HEARTBEAT_MS = 15_000;

function readVisitorKey(): string | null {
  try {
    const fromLocal = localStorage.getItem(VISITOR_KEY);
    if (fromLocal && fromLocal.trim()) return fromLocal.trim();
  } catch {
    /* private mode / 스토리지 거부 */
  }
  try {
    const fromSession = sessionStorage.getItem(VISITOR_KEY);
    if (fromSession && fromSession.trim()) return fromSession.trim();
  } catch {
    /* ignore */
  }
  return null;
}

function writeVisitorKey(v: string) {
  try {
    localStorage.setItem(VISITOR_KEY, v);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(VISITOR_KEY, v);
  } catch {
    /* ignore */
  }
}

function WsProviderWithAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <WsProvider userId={user?.id ?? undefined}>{children}</WsProvider>;
}

const DEFAULT_TITLE = "VenySound - 음악공유, 음원업로드, 음원공유사이트";

/** 라우트별 document.title 설정 (SEO·탭 제목·공유 시 제목) */
function PageTitle() {
  const [pathname] = useLocation();
  const { t, i18n } = useTranslation();
  useEffect(() => {
    const path = (pathname || "/").replace(/^\//, "") || "home";
    const pa = pathname || "/";
    if (pa === "/notices") {
      document.title = t("noticesPage.documentTitle");
      return;
    }
    if (pa === LOGIN_PATH) {
      document.title = "로그인 | VenySound";
      return;
    }
    if (pa === REGISTER_PATH) {
      document.title = "회원가입 | VenySound";
      return;
    }
    const titles: Record<string, string> = {
      "": DEFAULT_TITLE,
      home: DEFAULT_TITLE,
      music: "음원 목록 | VenySound - 음악공유, 음원공유사이트",
      explore: "음원 목록 | VenySound - 음악공유, 음원공유사이트",
      popular: "인기 음원 TOP 20 | VenySound",
      upload: "음원 업로드 | VenySound - 음원업로드",
      "bulk-upload": "대량 업로드 | VenySound - 음원업로드",
      radio: "실시간 DJ 방송 · 베니방송국 | VenySound",
      "radio/create": "방송 채널 만들기 | VenySound",
      guide: "스타트 가이드 | VenySound",
      pricing: "요금제 | VenySound",
      about: "소개 | VenySound",
      legal: "이용약관 | VenySound",
      privacy: "개인정보처리방침 | VenySound",
      faq: "자주 묻는 질문 | VenySound",
      notices: t("noticesPage.documentTitle"),
      community: "커뮤니티 | VenySound",
      credits: "크레딧 | VenySound",
      "create-music": "AI 음악 생성 | VenySound",
      "suno-guide": "음악 만들기 가이드 | VenySound",
      "global-distribution-guide": "글로벌 음원출시로 수익방법 | VenySound",
    };
    let title = DEFAULT_TITLE;
    if (path.startsWith("music/")) title = "음원 상세 | VenySound";
    else if (path.startsWith("radio/") && path !== "radio/create") title = "방송 청취 | VenySound";
    else if (path.startsWith("curated/")) title = "테마 플레이리스트 | VenySound";
    else if (path.startsWith("profile/")) title = "프로필 | VenySound";
    else if (path.startsWith("community/")) title = "게시글 | VenySound";
    else title = titles[path] ?? DEFAULT_TITLE;
    document.title = title;
  }, [pathname, t, i18n.language]);
  return null;
}

/** 방문/페이지뷰 기록 (일일·누적 방문자, 페이지뷰·디바이스·유입 경로 집계용) */
function AnalyticsVisit() {
  const [pathname] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const pathnameRef = useRef(pathname || "/");
  pathnameRef.current = pathname || "/";

  const applyVisitorKey = (data: unknown) => {
    if (!data || typeof data !== "object" || !("visitorKey" in data)) return;
    const vk = (data as { visitorKey?: string }).visitorKey;
    if (typeof vk === "string" && vk.trim()) writeVisitorKey(vk.trim());
  };

  const buildVisitParams = () => {
    const path = pathnameRef.current || "/";
    const visitorKey = readVisitorKey();
    let utmSource: string | undefined;
    try {
      utmSource = new URLSearchParams(window.location.search).get("utm_source") || undefined;
    } catch {
      utmSource = undefined;
    }
    return { path, visitorKey, utmSource };
  };

  const sendVisitViaGet = (opts: { keepalive?: boolean }) => {
    const { path, visitorKey, utmSource } = buildVisitParams();
    const q = new URLSearchParams();
    q.set("path", path);
    if (visitorKey) q.set("visitorKey", visitorKey);
    if (utmSource) q.set("utmSource", utmSource);
    q.set("_", String(Date.now()));
    return fetch(`/api/analytics/visit?${q.toString()}`, {
      method: "GET",
      credentials: "include",
      keepalive: !!opts.keepalive,
    })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(applyVisitorKey)
      .catch(() => {});
  };

  const sendVisit = () => {
    const { path, visitorKey, utmSource } = buildVisitParams();
    const body = JSON.stringify({
      path,
      visitorKey: visitorKey || undefined,
      utmSource,
    });

    const tryPost = (attempt: number) => {
      fetch("/api/analytics/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body,
      })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
        .then(applyVisitorKey)
        .catch(() => {
          if (attempt < 2) {
            window.setTimeout(() => tryPost(attempt + 1), 350 * (attempt + 1));
            return;
          }
          void sendVisitViaGet({ keepalive: false });
        });
    };

    tryPost(0);
  };

  const sendVisitBeacon = () => {
    if (typeof navigator === "undefined") return;
    const { path, visitorKey, utmSource } = buildVisitParams();
    const body = JSON.stringify({
      path,
      visitorKey: visitorKey || undefined,
      utmSource,
    });
    try {
      fetch("/api/analytics/visit", {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body,
      })
        .then((r) => {
          if (r.ok) return r.json().then(applyVisitorKey);
          return sendVisitViaGet({ keepalive: true });
        })
        .catch(() => void sendVisitViaGet({ keepalive: true }));
    } catch {
      void sendVisitViaGet({ keepalive: true });
    }
  };

  const sendVisitRef = useRef(sendVisit);
  const sendVisitBeaconRef = useRef(sendVisitBeacon);
  sendVisitRef.current = sendVisit;
  sendVisitBeaconRef.current = sendVisitBeacon;

  /** /api/auth/me 이후·경로·로그인 전환 시 1회 (서버 vs_vkey 쿠키로 동일 방문자 유지) */
  useEffect(() => {
    if (authLoading) return undefined;
    sendVisit();
  }, [pathname, user?.id, authLoading]);

  /** 페이지 이동마다 인터벌을 갈아엎지 않음 → 15초 하트비트가 실제로 누적됨 */
  useEffect(() => {
    if (authLoading) return undefined;

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      sendVisitRef.current();
    }, VISIT_HEARTBEAT_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") sendVisitBeaconRef.current();
      else if (document.visibilityState === "visible") sendVisitRef.current();
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) sendVisitRef.current();
    };

    const onFocus = () => {
      if (document.visibilityState === "visible") sendVisitRef.current();
    };

    const runBeacon = () => sendVisitBeaconRef.current();

    window.addEventListener("beforeunload", runBeacon);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("pagehide", runBeacon);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("beforeunload", runBeacon);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("pagehide", runBeacon);
    };
  }, [authLoading]);
  return null;
}
import Home from "@/pages/Home";
import Explore from "@/pages/Explore";
import Popular from "@/pages/Popular";
import Community from "@/pages/Community";
import Upload from "@/pages/Upload";
import BulkUpload from "@/pages/BulkUpload";
import Profile from "@/pages/Profile";
import About from "@/pages/About";
import Legal from "@/pages/Legal";
import FAQ from "@/pages/FAQ";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Admin from "@/pages/Admin";
import Pricing from "@/pages/Pricing";
import Credits from "@/pages/Credits";
import MyLibrary from "@/pages/MyLibrary";
import PostDetail from "@/pages/PostDetail";
import ValueDetail from "@/pages/ValueDetail";
import Notifications from "@/pages/Notifications";
import Guide from "@/pages/Guide";
import FileGuide from "@/pages/FileGuide";
import MusicDetail from "@/pages/MusicDetail";
import Dashboard from "@/pages/Dashboard";
import Messages from "@/pages/Messages";
import SunoGuide from "@/pages/SunoGuide";
import CreateMusic from "@/pages/CreateMusic";
import Privacy from "@/pages/Privacy";
import RefundPolicy from "@/pages/RefundPolicy";
import NotFound from "@/pages/not-found";
import Notices from "@/pages/Notices";
import CuratedPlaylist from "@/pages/CuratedPlaylist";
import Radio from "@/pages/Radio";
import RadioCreate from "@/pages/RadioCreate";
import RadioChannel from "@/pages/RadioChannel";
import RadioStudio from "@/pages/RadioStudio";
import RadioChannels from "@/pages/RadioChannels";
import GlobalDistributionGuide from "@/pages/GlobalDistributionGuide";

function Routes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/radio/create" component={RadioCreate} />
      <Route path="/radio/channels" component={RadioChannels} />
      <Route path="/radio/:slug/studio" component={RadioStudio} />
      <Route path="/radio/:slug" component={RadioChannel} />
      <Route path="/radio" component={Radio} />
      <Route path="/music/:id" component={MusicDetail} />
      <Route path="/music" component={Explore} />
      <Route path="/curated/:slug" component={CuratedPlaylist} />
      <Route path="/explore" component={Explore} />
      <Route path="/popular" component={Popular} />
      <Route path="/community" component={Community} />
      <Route path="/community/:id" component={PostDetail} />
      <Route path="/upload" component={Upload} />
      <Route path="/bulk-upload" component={BulkUpload} />
      <Route path="/profile/:id" component={Profile} />
      <Route path="/about" component={About} />
      <Route path="/about/values/:slug" component={ValueDetail} />
      <Route path="/legal" component={Legal} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/refund-policy" component={RefundPolicy} />
      <Route path="/faq" component={FAQ} />
      <Route path={LOGIN_PATH} component={Login} />
      <Route path={REGISTER_PATH} component={Register} />
      <Route path={ADMIN_PATH} component={Admin} />
      {LOGIN_PATH !== "/login" && (
        <Route path="/login">
          <Redirect to={LOGIN_PATH} />
        </Route>
      )}
      {REGISTER_PATH !== "/register" && (
        <Route path="/register">
          <Redirect to={REGISTER_PATH} />
        </Route>
      )}
      {ADMIN_PATH !== "/admin" && (
        <Route path="/admin">
          <Redirect to={ADMIN_PATH} />
        </Route>
      )}
      <Route path="/pricing" component={Pricing} />
      <Route path="/credits" component={Credits} />
      <Route path="/my-library" component={MyLibrary} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/guide" component={Guide} />
      <Route path="/file-guide" component={FileGuide} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/messages" component={Messages} />
      <Route path="/messages/:userId" component={Messages} />
      <Route path="/suno-guide" component={SunoGuide} />
      <Route path="/global-distribution-guide" component={GlobalDistributionGuide} />
      <Route path="/create-music" component={CreateMusic} />
      <Route path="/notices" component={Notices} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const radioWaveformRef = useRef<Uint8Array | null>(null);
  const radioSlug = useRadioPlayerStore((s) => s.slug);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.querySelector(".app-root") as HTMLElement | null;
    if (!root) return;

    const getAngle = (): number | null => {
      try {
        const orientation: any = (window.screen as any)?.orientation;
        const angle = typeof orientation?.angle === "number" ? orientation.angle : null;
        return angle;
      } catch {
        return null;
      }
    };

    const sync = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // 세로로 들고 있는 동안(뷰포트 높이 ≥ 너비)에는 180° 보정 금지 — angle 오동작으로 화면이 돌아가 보이는 경우 방지
      if (vh >= vw) {
        root.classList.remove("app-flipped");
        return;
      }
      const angle = getAngle();
      root.classList.toggle("app-flipped", angle === 180);
    };

    sync();
    window.addEventListener("orientationchange", sync);
    window.addEventListener("resize", sync);

    const orientation: any = (window.screen as any)?.orientation;
    orientation?.addEventListener?.("change", sync);

    return () => {
      window.removeEventListener("orientationchange", sync);
      window.removeEventListener("resize", sync);
      orientation?.removeEventListener?.("change", sync);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <RadioBackNavigationRecovery />
        <div className="app-root">
          <div
            id="app-main-scroll"
            className={`app-main scroll-mt-24${radioSlug ? " pb-14" : ""}`}
          >
            <TooltipProvider>
              <WsProviderWithAuth>
                <RadioWaveformProvider waveformBufferRef={radioWaveformRef}>
                  <PageTitle />
                  <AnalyticsVisit />
                  <RouteSmoothScroll />
                  <Routes />
                  <GlobalAudioPlayer />
                  <GlobalRadioPlayer waveformBufferRef={radioWaveformRef} />
                  <ScrollToTop />
                  <LoginModal />
                  <Toaster />
                </RadioWaveformProvider>
              </WsProviderWithAuth>
            </TooltipProvider>
          </div>
        </div>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
