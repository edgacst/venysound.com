import { useQuery } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { PageTransition } from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn, resolveStorageUrl } from "@/lib/utils";
import { Radio as RadioIcon, Mic2, ChevronLeft, ChevronRight, Settings, UserCircle } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";

type RadioChannelSummary = {
  id: number;
  ownerId: string;
  name: string;
  slug: string;
  status: string;
  description: string | null;
  coverFilename: string | null;
  ownerUsername: string | null;
  ownerDisplayName?: string;
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
          <div className="container max-w-4xl px-4 py-6 mx-auto flex-1 flex flex-col gap-6 pb-24 lg:pb-12">
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
                <div className="flex flex-col gap-2.5" aria-busy>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex h-[4.75rem] w-full animate-pulse gap-3 overflow-hidden rounded-xl border border-white/5 bg-white/[0.04] p-2"
                    >
                      <div className="h-full w-28 shrink-0 rounded-lg bg-white/10 sm:w-32" />
                      <div className="flex flex-1 flex-col justify-center gap-2 py-0.5">
                        <div className="h-3.5 w-[42%] max-w-[12rem] rounded bg-white/10" />
                        <div className="h-2.5 w-[58%] max-w-[18rem] rounded bg-white/[0.07]" />
                      </div>
                    </div>
                  ))}
                </div>
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
                <ul className="flex flex-col gap-2.5">
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

                    const statusClass =
                      ch.status === "live"
                        ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-200"
                        : ch.status === "paused"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                          : ch.status === "ended"
                            ? "border-white/15 bg-white/5 text-muted-foreground"
                            : "border-white/15 bg-white/5 text-muted-foreground";

                    const descLine = ch.description?.trim() || null;
                    const hostName =
                      (ch.ownerDisplayName && ch.ownerDisplayName.trim()) ||
                      (ch.ownerUsername && ch.ownerUsername.trim()) ||
                      `${ch.ownerId.slice(0, 8)}…`;

                    return (
                      <li key={ch.id}>
                        <div
                          className={cn(
                            "group flex w-full cursor-pointer items-stretch overflow-hidden rounded-xl border border-white/10 bg-black/35 shadow-sm transition",
                            "hover:border-primary/35 hover:bg-black/50 hover:shadow-[0_8px_28px_rgba(0,0,0,0.45)]",
                            "focus-within:ring-2 focus-within:ring-primary/40",
                          )}
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
                          <div className="relative h-[4.75rem] w-28 shrink-0 sm:h-[5.25rem] sm:w-36">
                            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/55" />
                            {ch.status === "live" && (
                              <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 shadow-md ring-2 ring-black/40">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                              </span>
                            )}
                          </div>

                          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2 sm:px-4">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                              <h2 className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">
                                {ch.name}
                              </h2>
                              <span
                                className={cn(
                                  "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide sm:text-[11px]",
                                  statusClass,
                                )}
                              >
                                {statusLabel}
                              </span>
                            </div>
                            {descLine ? (
                              <p className="line-clamp-1 text-xs text-muted-foreground sm:text-[13px]">{descLine}</p>
                            ) : null}
                            <p className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground/90 sm:text-xs">
                              <UserCircle className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                              <span className="truncate">{t("radio.channelOwnerBy", { name: hostName })}</span>
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5 pr-2 sm:pr-3">
                            {isOwner && (
                              <>
                                <Button
                                  asChild
                                  size="icon"
                                  variant="secondary"
                                  className="h-8 w-8 rounded-full border border-white/10 bg-violet-600/90 text-white shadow-sm hover:bg-violet-600"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Link href={`/radio/${encodeURIComponent(ch.slug)}/studio`} aria-label={t("radio.openStudio")}>
                                    <Mic2 size={15} />
                                  </Link>
                                </Button>
                                <Button
                                  asChild
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 shrink-0 border-white/15 bg-black/30 text-muted-foreground hover:text-foreground"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Link
                                    href={`/radio/${encodeURIComponent(ch.slug)}?edit=1`}
                                    aria-label={t("radio.editChannelInfo", "채널 정보 수정")}
                                  >
                                    <Settings size={15} />
                                  </Link>
                                </Button>
                              </>
                            )}
                            <ChevronRight
                              className="h-5 w-5 text-muted-foreground/50 transition group-hover:text-primary group-hover:opacity-100 sm:opacity-70"
                              aria-hidden
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
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

