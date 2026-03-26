import { useEffect, useRef } from "react";
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
  useEffect(() => {
    const path = (pathname || "/").replace(/^\//, "") || "home";
    const pa = pathname || "/";
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
      notices: "공지사항 | VenySound",
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
  }, [pathname]);
  return null;
}

/** 방문/페이지뷰 기록 (일일·누적 방문자, 페이지뷰·디바이스·유입 경로 집계용) */
function AnalyticsVisit() {
  const [pathname] = useLocation();
  const { user } = useAuth();
  const pathnameRef = useRef(pathname || "/");
  pathnameRef.current = pathname || "/";

  useEffect(() => {
    const sendVisit = () => {
      const path = pathnameRef.current || "/";
      const visitorKey = readVisitorKey();
      let utmSource: string | undefined;
      try {
        utmSource = new URLSearchParams(window.location.search).get("utm_source") || undefined;
      } catch {
        utmSource = undefined;
      }
      fetch("/api/analytics/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          path,
          visitorKey,
          utmSource,
        }),
      })
        .then((r) => r.ok && r.json())
        .then((data) => {
          if (data?.visitorKey && typeof data.visitorKey === "string") {
            writeVisitorKey(data.visitorKey);
          }
        })
        .catch(() => {});
    };

    sendVisit();
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      sendVisit();
    }, VISIT_HEARTBEAT_MS);

    /**
     * 탭 종료·백그라운드 전환 시 전송. sendBeacon 은 모바일 Safari 등에서 세션 쿠키가 안 붙어
     * 관리자 방문 로그가 전부 비로그인으로 찍히는 경우가 있음 → keepalive fetch + credentials 로 통일.
     */
    const sendVisitBeacon = () => {
      if (typeof navigator === "undefined") return;
      const path = pathnameRef.current || "/";
      const visitorKey = readVisitorKey();
      let utmSource: string | undefined;
      try {
        utmSource = new URLSearchParams(window.location.search).get("utm_source") || undefined;
      } catch {
        utmSource = undefined;
      }
      const body = JSON.stringify({
        path,
        visitorKey: visitorKey || undefined,
        utmSource,
      });
      try {
        const p = fetch("/api/analytics/visit", {
          method: "POST",
          credentials: "include",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body,
        });
        void p.catch(() => {});
      } catch {
        if (typeof navigator.sendBeacon === "function") {
          const params = new URLSearchParams();
          params.set("path", path);
          if (visitorKey) params.set("visitorKey", visitorKey);
          if (utmSource) params.set("utmSource", utmSource);
          navigator.sendBeacon("/api/analytics/visit", params);
        } else {
          sendVisit();
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") sendVisitBeacon();
      else if (document.visibilityState === "visible") sendVisit();
    };

    window.addEventListener("beforeunload", sendVisitBeacon);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("pagehide", sendVisitBeacon);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("beforeunload", sendVisitBeacon);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("pagehide", sendVisitBeacon);
    };
  }, [pathname, user?.id]);
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
      const angle = getAngle();
      // Some mobile browsers flip the UI by 180deg in landscape.
      root.classList.toggle("app-flipped", angle === 180);
    };

    sync();
    window.addEventListener("orientationchange", sync);

    const orientation: any = (window.screen as any)?.orientation;
    orientation?.addEventListener?.("change", sync);

    return () => {
      window.removeEventListener("orientationchange", sync);
      orientation?.removeEventListener?.("change", sync);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
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
