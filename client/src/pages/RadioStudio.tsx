import { useEffect } from "react";
import { PageTransition } from "@/components/PageTransition";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link, useRoute, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { LOGIN_PATH } from "@/lib/site-paths";

export default function RadioStudio() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, params] = useRoute("/radio/:slug/studio");
  // useRoute 가 일시적으로 params 를 반환 못할 때(새로고침 직후 등) pathname 에서 직접 추출
  const slug = params?.slug ?? (() => {
    try {
      const m = window.location.pathname.match(/^\/radio\/([^/]+)\/studio/);
      return m ? decodeURIComponent(m[1]) : "";
    } catch { return ""; }
  })();

  useEffect(() => {
    if (!slug || authLoading) return;
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
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-3 pb-2">
            <div className="max-w-6xl mx-auto flex justify-start pl-2">
              <Link href={`/radio/${encodeURIComponent(slug)}`} className="inline-block">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  <ArrowLeft size={16} />
                  {t("radio.backToChannel", "방송 채널로 돌아가기")}
                </Button>
              </Link>
            </div>
          </div>
          <iframe
            src={studioUrl}
            title="Radio Studio"
            className="w-full border-0"
            style={{
              flex: 1,
              height: "calc(100vh - 64px - 40px)", // 헤더(~64px) + 위 여백(~40px) 정도를 제외하고 나머지 전체
              background: "radial-gradient(circle at top, #1d2333 0, #020617 55%)",
            }}
          />
        </div>
      </div>
    </PageTransition>
  );
}

