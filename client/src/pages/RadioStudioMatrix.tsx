import { useEffect, useRef } from "react";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { LOGIN_PATH } from "@/lib/site-paths";

/** 채널 d — 네비 없는 송출 전용 셸(비주얼만), 색은 사이트 기본 톤(인디고·슬레이트) */
const STUDIO_SLUG = "d";

/** 원래 Matrix 느낌의 낙하 문자 — 색만 보라·라벤더·화이트 (초록 제거) */
function StudioRainBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const chars =
      "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789ﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝVENY";
    let w = 0;
    let h = 0;
    let cols = 0;
    const drops: number[] = [];

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      const fontSize = 14;
      cols = Math.ceil(w / fontSize);
      drops.length = 0;
      for (let i = 0; i < cols; i++) drops[i] = Math.random() * -50;
    };

    resize();
    window.addEventListener("resize", resize);

    const fontSize = 14;
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      ctx.fillStyle = "rgba(15, 23, 42, 0.06)";
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${fontSize}px ui-monospace, monospace`;

      for (let i = 0; i < cols; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)]!;
        const x = i * fontSize;
        const y = drops[i]! * fontSize;
        const flicker = (frame + i) % 7 === 0 ? "#f1f5f9" : "#a5b4fc";
        ctx.fillStyle = flicker;
        ctx.fillText(text, x, y);
        if (y > h && Math.random() > 0.975) drops[i] = 0;
        drops[i]! += 1;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 opacity-[0.22]"
      aria-hidden
    />
  );
}

export default function RadioStudioMatrix() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const slug = STUDIO_SLUG;

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      const next = `/radio/${encodeURIComponent(slug)}/studio`;
      setLocation(`${LOGIN_PATH}?next=${encodeURIComponent(next)}`);
    }
  }, [slug, authLoading, isAuthenticated, setLocation]);

  if (authLoading || !isAuthenticated) {
    return (
      <PageTransition className="h-[100dvh] min-h-0 overflow-hidden">
        <div
          className="relative h-full min-h-0 overflow-hidden bg-background font-mono"
          data-veny-studio="matrix"
        >
          <StudioRainBackdrop />
          <div
            className="pointer-events-none fixed inset-0 z-[1] opacity-[0.06]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(148,163,184,0.2) 2px, rgba(148,163,184,0.2) 4px)",
            }}
            aria-hidden
          />
          <div className="relative z-10 flex h-full min-h-0 items-center justify-center px-4">
            <p className="text-sm tracking-wide text-muted-foreground">
              {authLoading
                ? t("common.loading", "불러오는 중…")
                : t("radio.studioLoginRequired", "송출실은 로그인 후 이용할 수 있습니다.")}
            </p>
          </div>
        </div>
      </PageTransition>
    );
  }

  const studioUrl = `/radio-audio-test.html?slug=${encodeURIComponent(slug)}&embed=1&wide=1`;

  return (
    <PageTransition className="h-[100dvh] min-h-0 overflow-hidden">
      <div
        className="relative flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background font-mono"
        data-veny-studio="matrix"
      >
        <StudioRainBackdrop />
        <div
          className="pointer-events-none fixed inset-0 z-[1] opacity-[0.05]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(148,163,184,0.18) 2px, rgba(148,163,184,0.18) 4px)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none fixed inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(2,6,23,0.88)_100%)]"
          aria-hidden
        />

        {/*
          상단 “이미지”는 iframe 안 studio-hero 한 곳만 사용.
          여기서는 별도 헤더 블록을 두지 않아 빈 검은 띠가 생기지 않게 함.
          타이틀·뒤로가기만 히어로 위에 오버랩.
        */}
        <div className="relative z-10 min-h-0 flex-1">
          <iframe
            src={studioUrl}
            title="Radio Studio"
            className="h-full min-h-0 w-full border-0"
            style={{
              background: "radial-gradient(circle at top, #1d2333 0, #020617 55%)",
            }}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
            <div
              className="absolute inset-x-0 top-0 h-[clamp(128px,22vh,240px)] bg-gradient-to-b from-black/70 via-black/35 to-transparent max-lg:h-[clamp(112px,19vh,200px)]"
              aria-hidden
            />
            <div className="relative px-4 pb-2 pt-2 sm:px-5 sm:pb-2 sm:pt-2.5">
              <div className="pointer-events-auto absolute right-3 top-2 z-10 sm:right-4 sm:top-2.5">
                <Link href={`/radio/${encodeURIComponent(slug)}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-border/80 bg-background/55 text-muted-foreground shadow-sm backdrop-blur-md hover:bg-background/75"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    {t("radio.backToChannel", "방송 채널로 돌아가기")}
                  </Button>
                </Link>
              </div>
              <div className="max-w-xl pr-36 pt-0.5 sm:pr-44">
                <h1 className="min-w-0 text-sm font-semibold uppercase tracking-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)] sm:text-base">
                  VENYSOUND BROADCAST STUDIO
                </h1>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
