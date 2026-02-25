import { useEffect, useRef } from "react";
import { Router, Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalAudioPlayer } from "@/components/AudioPlayer";
import { LoginModal } from "@/components/LoginModal";

const VISITOR_KEY = "vkey";

/** 앱 전역에서 /ws 연결 1개 유지 → 접속자 수 집계에 포함 */
function VisitorCountSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);
  return null;
}

/** 방문/페이지뷰 기록 (일일·누적 방문자, 페이지뷰·디바이스·유입 경로 집계용) */
function AnalyticsVisit() {
  const [pathname] = useLocation();
  useEffect(() => {
    const path = pathname || "/";
    let visitorKey: string | null = null;
    try {
      visitorKey = localStorage.getItem(VISITOR_KEY);
    } catch {}
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const utmSource = params?.get("utm_source") || undefined;
    fetch("/api/analytics/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ path, visitorKey, utmSource }),
    })
      .then((r) => r.ok && r.json())
      .then((data) => {
        if (data?.visitorKey) {
          try {
            localStorage.setItem(VISITOR_KEY, data.visitorKey);
          } catch {}
        }
      })
      .catch(() => {});
  }, [pathname]);
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
import Privacy from "@/pages/Privacy";
import NotFound from "@/pages/not-found";
import Notices from "@/pages/Notices";

function Routes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/music/:id" component={MusicDetail} />
      <Route path="/music" component={Explore} />
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
      <Route path="/faq" component={FAQ} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/admin" component={Admin} />
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
      <Route path="/notices" component={Notices} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <TooltipProvider>
          <VisitorCountSocket />
          <AnalyticsVisit />
          <Routes />
          <GlobalAudioPlayer />
          <LoginModal />
          <Toaster />
        </TooltipProvider>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
