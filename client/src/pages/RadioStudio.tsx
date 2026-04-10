import { useEffect } from "react";
import { PageTransition } from "@/components/PageTransition";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Settings } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { LOGIN_PATH } from "@/lib/site-paths";
import RadioStudioMatrix from "@/pages/RadioStudioMatrix";

export default function RadioStudio() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  // wouter useRoute 와 무관하게 주소창 기준으로만 슬러그 확정 (Matrix 분기 누락 방지)
  const slug = (() => {
    try {
      const p = window.location.pathname.replace(/\/+$/, "");
      const m = p.match(/^\/radio\/([^/]+)\/studio$/);
      return m ? decodeURIComponent(m[1]).replace(/^\uFEFF/, "").trim() : "";
    } catch {
      return "";
    }
  })();
  useEffect(() => {
    if (!slug || authLoading) return;
    if (slug.toLowerCase() === "d") return;
    if (!isAuthenticated) {
      const next = `/radio/${encodeURIComponent(slug.trim().toLowerCase())}/studio`;
      setLocation(`${LOGIN_PATH}?next=${encodeURIComponent(next)}`);
    }
  }, [slug, authLoading, isAuthenticated, setLocation]);

  if (!slug) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-background flex flex-col">
          <Navigation />
          <div className="container px-4 py-10 text-center">
            <p className="text-muted-foreground">{t("radio.channelNotFound", "채널을 찾을 수 없습니다.")}</p>
            <Link href="/radio">
              <Button variant="outline" className="mt-4">
                {t("radio.backToRadio", "방송국으로")}
              </Button>
            </Link>
          </div>
        </div>
      </PageTransition>
    );
  }

  if (slug.toLowerCase() === "d") {
    return <RadioStudioMatrix />;
  }

  if (authLoading || !isAuthenticated) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-background flex flex-col">
          <Navigation />
          <div className="container px-4 py-10 text-center text-muted-foreground">
            {authLoading ? t("common.loading", "불러오는 중…") : t("radio.studioLoginRequired", "송출실은 로그인 후 이용할 수 있습니다.")}
          </div>
        </div>
      </PageTransition>
    );
  }

  const studioUrl = `/radio-audio-test.html?slug=${encodeURIComponent(
    slug.trim().toLowerCase(),
  )}&embed=1`;

  return (
    <PageTransition>
      <div className="min-h-screen flex flex-col bg-background">
        <Navigation />
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-4 pt-3 pb-2">
            <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-start gap-2 pl-2">
              <Link href={`/radio/${encodeURIComponent(slug)}`} className="inline-block">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  <ArrowLeft size={16} />
                  {t("radio.backToChannel", "방송 채널로 돌아가기")}
                </Button>
              </Link>
              <Link href={`/radio/${encodeURIComponent(slug)}?edit=1`} className="inline-block">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  <Settings size={16} />
                  {t("radio.editChannelInfo", "채널 정보 수정")}
                </Button>
              </Link>
            </div>
          </div>
          <iframe
            src={studioUrl}
            title="Radio Studio"
            className="min-h-0 w-full flex-1 border-0"
            style={{
              background: "radial-gradient(circle at top, #1d2333 0, #020617 55%)",
            }}
          />
        </div>
      </div>
    </PageTransition>
  );
}

