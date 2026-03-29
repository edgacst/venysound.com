import { useQuery } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Radio as RadioIcon, Mic2, Users, ChevronLeft } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import { resolveStorageUrl } from "@/lib/utils";

type RadioChannelSummary = {
  id: number;
  ownerId: string;
  name: string;
  slug: string;
  status: string;
  description: string | null;
  coverFilename: string | null;
  ownerUsername: string | null;
  updatedAt: string | null;
};

export default function RadioChannels() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: channels = [], isLoading } = useQuery<RadioChannelSummary[]>({
    queryKey: ["/api/radio/channels"],
    queryFn: async () => {
      const res = await fetch("/api/radio/channels");
      if (!res.ok) return [];
      const data = await res.json().catch(() => null);
      return Array.isArray(data) ? data : [];
    },
  });

  const myUserId = user?.id;

  return (
    <PageTransition>
      <div
        className="min-h-screen flex flex-col"
        style={{
          background: "radial-gradient(circle at top, #1d2333 0, #020617 55%)",
        }}
      >
        <Navigation />

        <div className="flex-1 flex flex-col min-h-0">
          <div className="container max-w-6xl px-4 py-6 mx-auto flex-1 flex flex-col gap-6 pb-24 lg:pb-12">
            <header className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground" asChild>
                  <Link href="/radio" aria-label={t("radio.backToRadioHome", "방송국 홈")}>
                    <ChevronLeft className="h-5 w-5" />
                  </Link>
                </Button>
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary shrink-0">
                  <RadioIcon size={20} />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-bold">
                    {t("radio.channelsListTitle", "방송 채널 목록")}
                  </h1>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    {t(
                      "radio.channelsListSubtitle",
                      "생성된 방송 채널을 한눈에 보고, 듣고 싶은 채널로 들어가세요.",
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/radio/create">
                    {t("radio.createChannel", "내 채널 만들기")}
                  </Link>
                </Button>
              </div>
            </header>

            <section className="flex-1 min-h-0">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">{t("radio.loadingChannels", "채널 목록을 불러오는 중입니다…")}</p>
              ) : channels.length === 0 ? (
                <Card className="border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.96)]">
                  <CardContent className="py-10 text-center space-y-2">
                    <RadioIcon className="mx-auto text-muted-foreground" size={32} />
                    <p className="text-sm text-muted-foreground">
                      {t("radio.noChannelsYet", "아직 생성된 방송 채널이 없습니다.")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("radio.noChannelsYetHint", "방송국 홈에서 새로운 채널을 만들어 보세요.")}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
                  {channels.map((ch) => {
                    const isOwner = myUserId && ch.ownerId === myUserId;
                    const statusLabel =
                      ch.status === "live"
                        ? t("radio.statusLive", "라이브 중")
                        : ch.status === "paused"
                          ? t("radio.statusPaused", "일시정지")
                          : ch.status === "ended"
                            ? t("radio.statusEnded", "방송 종료")
                            : ch.status === "draft"
                              ? t("radio.statusDraft", "준비중")
                              : ch.status;

                    const coverUrl = ch.coverFilename
                      ? resolveStorageUrl(ch.coverFilename)
                      : "/dj-studio-banner.jpg";

                    return (
                      <div
                        key={ch.id}
                        className="cursor-pointer"
                        role="button"
                        tabIndex={0}
                        onClick={() => setLocation(`/radio/${ch.slug}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setLocation(`/radio/${ch.slug}`);
                          }
                        }}
                      >
                        <Card className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-[0_16px_40px_rgba(0,0,0,0.8)]">
                            <div className="relative w-full aspect-video">
                            {/* 배경 이미지 (커버 없으면 기본 이미지) */}
                            <img
                              src={coverUrl}
                              alt={ch.name}
                              className="w-full h-full object-cover"
                            />

                              {/* 상단 왼쪽: 방송 중일 때만 빨간 동그라미 */}
                              {ch.status === "live" && (
                                <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                                  <span className="w-4 h-4 rounded-full bg-red-500 animate-pulse" />
                                </div>
                              )}

                              {/* 하단: 채널명(가운데) + 스튜디오 버튼 (이미지 위) */}
                              <div className="absolute inset-x-1.5 bottom-1.5 space-y-1.5">
                                <div className="px-1.5 py-1 rounded-md bg-black/65 backdrop-blur-sm">
                                  <p className="text-[11px] font-semibold text-white truncate text-center">
                                    {ch.name}
                                  </p>
                                </div>
                                {isOwner && (
                                <div className="flex justify-center">
                                    <Button
                                      asChild
                                      size="icon"
                                      className="h-7 w-7 rounded-full bg-violet-500 text-white hover:bg-violet-500/90"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Link href={`/radio/${encodeURIComponent(ch.slug)}/studio`}>
                                        <Mic2 size={14} />
                                      </Link>
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {myUserId && (
              <section className="mt-4">
                <p className="text-xs text-muted-foreground">
                  {t(
                    "radio.manageChannelHint",
                    "채널 상태 변경이나 삭제는 방송국 홈의 \"내 방송 채널 만들기\" 카드에서 관리할 수 있습니다.",
                  )}
                </p>
                <Link href="/radio">
                  <Button variant="link" size="sm" className="h-auto p-0 mt-1 text-muted-foreground hover:text-foreground">
                    {t("radio.goToRadio", "방송국 가기")}
                  </Button>
                </Link>
              </section>
            )}
          </div>

          {/* 이 페이지에서는 푸터를 숨김 (채널 그리드만 표시) */}
        </div>
      </div>
    </PageTransition>
  );
}

