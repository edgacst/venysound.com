import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Radio as RadioIcon, Mic2, PlusCircle, Headphones, Megaphone, ChevronRight } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { resolveStorageUrl } from "@/lib/utils";

type LiveChannel = {
  id: number;
  ownerId: string;
  name: string;
  slug: string;
  description: string | null;
  coverFilename: string | null;
};

type SiteAnnouncement = {
  id: number;
  content: string;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

const ANNOUNCEMENTS_SHOW = 5;

function excerpt(text: string, maxLen = 60) {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length <= maxLen ? one : one.slice(0, maxLen) + "…";
}

function formatNoticeDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400 * 1000) return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(d);
  if (diff < 86400 * 7 * 1000) return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
}

export default function Radio() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [announcementExpandedId, setAnnouncementExpandedId] = useState<number | null>(null);

  const { data: myChannel } = useQuery<{ id: number; name: string; slug: string; status: string } | null>({
    queryKey: ["/api/radio/channels/me"],
    enabled: !!user,
  });
  const { data: liveChannels = [] } = useQuery<LiveChannel[]>({
    queryKey: ["/api/radio/channels/live"],
    queryFn: async () => {
      const res = await fetch("/api/radio/channels/live");
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const { data: siteNotices = [] } = useQuery<SiteAnnouncement[]>({
    queryKey: ["/api/announcements/site"],
    queryFn: async () => {
      const res = await fetch("/api/announcements/site");
      if (!res.ok) return [];
      return res.json();
    },
  });
  const noticesOnRadio = siteNotices.slice(0, ANNOUNCEMENTS_SHOW);

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />

        <div className="container max-w-4xl px-4 py-8 md:py-12">
          {/* Hero */}
          <header className="text-center mb-10 md:mb-12">
            <div className="inline-flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-primary/10 text-primary mb-4 shadow-sm">
              <RadioIcon size={28} className="md:w-8 md:h-8" />
            </div>
            <h1 className="text-2xl md:text-4xl font-display font-bold mb-2 tracking-tight" data-testid="text-radio-title">
              {t("radio.title", "베니방송국")}
            </h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-lg mx-auto leading-relaxed">
              {t("radio.subtitle", "나만의 방송 채널을 만들고, 음원을 송출하며 지인들과 실시간으로 소통하세요.")}
            </p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* 지금 라이브 + CTA (왼쪽, 1열) */}
            <div className="lg:col-span-1 order-1 space-y-6">
              <section>
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <span className="inline-flex w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  {t("radio.liveNow", "지금 라이브")}
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  {t("radio.liveNowHint", "방송 시작한 채널만 표시됩니다. 새 채널은 DJ가 「방송 시작」을 누른 뒤 보입니다.")}
                </p>
                {liveChannels.length === 0 ? (
                  <Card className="border-border/60 bg-card/40 overflow-hidden">
                    <CardContent className="py-10 text-center">
                      <Headphones className="mx-auto text-muted-foreground/70 mb-3" size={36} />
                      <p className="text-muted-foreground text-sm mb-1">
                        {t("radio.noLiveChannels", "현재 라이브 방송 중인 채널이 없습니다.")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("radio.beFirst", "첫 방송을 시작해 보세요!")}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-3 grid-cols-1">
                    {liveChannels.map((ch) => (
                      <Link key={ch.id} href={`/radio/${ch.slug}`}>
                        <Card className="border-border/60 bg-card/40 overflow-hidden hover:bg-card/70 hover:border-primary/20 transition-all duration-200">
                          <CardContent className="p-0 flex">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 bg-muted/40 flex items-center justify-center">
                              {ch.coverFilename ? (
                                <img
                                  src={resolveStorageUrl(ch.coverFilename)}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <RadioIcon size={26} className="text-muted-foreground" />
                              )}
                            </div>
                            <div className="p-3 flex-1 min-w-0 flex flex-col justify-center">
                              <p className="font-medium text-sm truncate">{ch.name}</p>
                              {ch.description && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">{ch.description}</p>
                              )}
                              <span className="inline-flex items-center gap-1 mt-1.5 text-xs text-red-400 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                LIVE
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {/* 내 채널 CTA */}
              <Card className="border-primary/20 bg-primary/5 overflow-hidden">
                <CardContent className="p-5 flex flex-col items-center gap-4 text-center">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Mic2 className="text-primary" size={24} />
                  </div>
                  <div className="w-full">
                    <h3 className="font-semibold text-base mb-0.5">
                      {t("radio.createYourChannel", "내 방송 채널 만들기")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t("radio.createChannelDesc", "사이트 음원 또는 로컬 음악을 송출하고, 청취자와 채팅·신청곡을 즐기세요.")}
                    </p>
                  </div>
                  {user ? (
                    myChannel ? (
                      <div className="flex flex-col items-center gap-2 w-full">
                        <Button asChild variant="outline" className="gap-2 w-full" size="default">
                          <Link href={`/radio/${myChannel.slug}`}>
                            <Mic2 size={16} />
                            {t("radio.goToMyChannel", "내 채널 들어가기")}
                          </Link>
                        </Button>
                        <span className="text-xs text-muted-foreground">/radio/{myChannel.slug}</span>
                      </div>
                    ) : (
                      <Button asChild className="gap-2 w-full" size="default">
                        <Link href="/radio/create">
                          <PlusCircle size={16} />
                          {t("radio.createChannel", "채널 만들기")}
                        </Link>
                      </Button>
                    )
                  ) : (
                    <Button asChild variant="outline" className="gap-2 w-full" size="default">
                      <Link href="/login">
                        {t("radio.loginToCreate", "로그인 후 만들기")}
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 방송 관련 공지 (오른쪽, 2열 넓게) */}
            <aside className="lg:col-span-2 order-2">
              <Card className="border-border/60 bg-card/40 overflow-hidden h-full">
                <CardContent className="p-0">
                  <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-primary shrink-0" />
                    <h2 className="text-sm font-semibold">
                      {t("radio.noticesTitle", "방송 관련 공지")}
                    </h2>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto">
                    {noticesOnRadio.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                        {t("radio.noNotices", "등록된 공지가 없습니다.")}
                      </p>
                    ) : (
                      <ul className="divide-y divide-border/40">
                        {noticesOnRadio.map((a) => {
                          const isExpanded = announcementExpandedId === a.id;
                          return (
                            <li key={a.id}>
                              <button
                                type="button"
                                className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
                                onClick={() => setAnnouncementExpandedId(isExpanded ? null : a.id)}
                              >
                                <span className="text-xs text-muted-foreground mr-2">
                                  {formatNoticeDate(a.createdAt)}
                                </span>
                                <span className="text-sm text-foreground">
                                  {isExpanded ? a.content : excerpt(a.content)}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  {siteNotices.length > 0 && (
                    <div className="px-4 py-2 border-t border-border/50">
                      <Link href="/notices">
                        <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground hover:text-foreground">
                          {t("radio.viewAllNotices", "전체 공지 보기")}
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>

        <Footer />
      </div>
    </PageTransition>
  );
}
