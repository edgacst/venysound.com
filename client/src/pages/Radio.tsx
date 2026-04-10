import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { Radio as RadioIcon, Mic2, PlusCircle, Megaphone, ChevronRight, Pause, Play, Trash2, Users, Settings } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { LOGIN_PATH } from "@/lib/site-paths";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { resolveStorageUrl } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

type SiteAnnouncement = {
  id: number;
  content: string;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

const ANNOUNCEMENTS_SHOW = 5;

/** content에서 제목과 본문 분리 (# 제목\n본문, 첫 줄=제목 등 패턴 지원) */
function parseAnnouncementContent(content: string): { title: string; body: string } {
  const trimmed = content.trim();
  if (!trimmed) return { title: "", body: "" };
  const firstLineEnd = trimmed.indexOf("\n");
  if (firstLineEnd !== -1) {
    const firstLine = trimmed.slice(0, firstLineEnd).replace(/^#\s*/, "").trim();
    const rest = trimmed.slice(firstLineEnd + 1).trim();
    return { title: firstLine || rest.slice(0, 40) || trimmed.slice(0, 40), body: rest };
  }
  // 줄바꿈 없을 때: ". " 또는 "。" 로 첫 문장 구분, 없으면 ~50자(공백 경계)
  const sentenceMatch = trimmed.match(/[.。]\s+/);
  if (sentenceMatch && sentenceMatch.index != null && sentenceMatch.index > 5) {
    const idx = sentenceMatch.index;
    const skip = sentenceMatch[0].length;
    return {
      title: trimmed.slice(0, idx + 1).replace(/^#\s*/, "").trim(),
      body: trimmed.slice(idx + skip).trim(),
    };
  }
  const maxTitle = 50;
  if (trimmed.length <= maxTitle) return { title: trimmed.replace(/^#\s*/, ""), body: "" };
  const lastSpace = trimmed.lastIndexOf(" ", maxTitle);
  const split = lastSpace > 10 ? lastSpace : maxTitle;
  return {
    title: trimmed.slice(0, split).replace(/^#\s*/, "").trim(),
    body: trimmed.slice(split).trim(),
  };
}

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
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [announcementExpandedId, setAnnouncementExpandedId] = useState<number | null>(null);

  const { data: myChannel } = useQuery<{ id: number; name: string; slug: string; status: string } | null>({
    queryKey: ["/api/radio/channels/me"],
    queryFn: async () => {
      const res = await fetch("/api/radio/channels/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to load channel");
      return res.json();
    },
    enabled: !!user,
  });

  const updateChannelStatus = useMutation({
    mutationFn: async ({ slug, status }: { slug: string; status: string }) => {
      const res = await fetch(`/api/radio/channels/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to update");
      }
      return res.json();
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/radio/channels/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/radio/channels/live"] });
      if (status === "paused") toast({ title: t("radio.channelPaused") });
      else if (status === "live") toast({ title: t("radio.channelResumed") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteChannel = useMutation({
    mutationFn: async (slug: string) => {
      const res = await fetch(`/api/radio/channels/${encodeURIComponent(slug)}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to delete");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/radio/channels/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/radio/channels/live"] });
      toast({ title: t("radio.channelDeleted") });
      setLocation("/radio");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
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
      <div
        className="min-h-screen flex flex-col"
        style={{
          background: "radial-gradient(circle at top, #1d2333 0, #020617 55%)",
        }}
      >
        <Navigation />

        <div className="flex-1 flex flex-col">
          <div className="container max-w-6xl px-3 md:px-6 py-8 md:py-12 flex flex-col gap-6 pb-12">
          {/* Hero */}
          <header className="text-center mb-2 md:mb-4">
            <div className="inline-flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-primary/10 text-primary mb-4 shadow-sm">
              <RadioIcon size={28} className="md:w-8 md:h-8" />
            </div>
            <h1 className="text-2xl md:text-4xl font-display font-bold mb-2 tracking-tight" data-testid="text-radio-title">
              {t("radio.title", "베니방송국")}
            </h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-lg mx-auto leading-relaxed">
              {t("radio.subtitle", "업로드한 음원으로 바로 송출하는, 진짜 실시간 DJ 방송. 채팅·신청곡으로 청취자와 소통하세요.")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
              <Button asChild size="default" className="gap-2">
                <Link href="/radio/channels">
                  <Users size={18} />
                  {t("radio.browseChannels", "채널 목록에서 청취하기")}
                </Link>
              </Button>
            </div>
          </header>

          {/* 상단 3열: 차별화 포인트 / 방송 공지 / 내 방송 채널 만들기 */}
          <div className="grid gap-4 lg:gap-6 md:grid-cols-2 xl:grid-cols-3">
            <Card className="overflow-hidden border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.96)] shadow-[0_22px_60px_rgba(15,23,42,0.65)]">
              <CardContent className="p-5 md:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 text-primary">
                    <RadioIcon size={18} />
                  </span>
                  <h2 className="text-base md:text-lg font-semibold">
                    {t("radio.differentTitle", "Veny만의 실시간 DJ")}
                  </h2>
                </div>
                <p className="text-xs md:text-sm text-muted-foreground mb-4">
                  {t("radio.differentSubtitle", "단순 재생이 아닌, 차별화된 라이브 방송을 경험하세요.")}
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">·</span>
                    <span>{t("radio.different1", "업로드한 곡으로 바로 송출 — 사이트 음원을 큐에 넣고 즉시 라이브 송출")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">·</span>
                    <span>{t("radio.different2", "실시간 채팅·신청곡 — 청취자와 대화하고, 신청곡을 받아 바로 틀어줄 수 있어요")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">·</span>
                    <span>{t("radio.different3", "브라우저만 있으면 DJ — 별도 프로그램 없이 웹에서 송출·청취 모두 가능")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">·</span>
                    <span>{t("radio.different4", "무료로 시작 — 채널 개설부터 방송까지 비용 없이 시작")}</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.96)] shadow-[0_22px_60px_rgba(15,23,42,0.65)]">
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-primary shrink-0" />
                  <h2 className="text-sm font-semibold">
                    {t("radio.noticesTitle", "방송 관련 공지")}
                  </h2>
                </div>
                <div className="max-h-[40vh] overflow-y-auto">
                  {noticesOnRadio.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                      {t("radio.noNotices", "등록된 공지가 없습니다.")}
                    </p>
                  ) : (
                    <ul className="divide-y divide-white/10">
                      {noticesOnRadio.map((a) => {
                        const isExpanded = announcementExpandedId === a.id;
                        const { title, body } = parseAnnouncementContent(a.content);
                        return (
                          <li key={a.id}>
                            <button
                              type="button"
                              className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors"
                              onClick={() => setAnnouncementExpandedId(isExpanded ? null : a.id)}
                            >
                              <span className="text-xs text-muted-foreground mr-2">
                                {formatNoticeDate(a.createdAt)}
                              </span>
                              <div className="text-sm text-foreground">
                                <span className="font-medium">{title || excerpt(a.content)}</span>
                                {isExpanded && body ? (
                                  <p className="mt-1.5 text-muted-foreground font-normal whitespace-pre-wrap">
                                    {body}
                                  </p>
                                ) : null}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                {siteNotices.length > 0 && (
                  <div className="px-4 py-2 border-t border-white/10">
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

            <Card className="overflow-hidden border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.96)] shadow-[0_22px_60px_rgba(15,23,42,0.65)]">
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
                    <div className="flex flex-col items-center gap-3 w-full">
                      <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {myChannel.status === "live" && t("radio.statusLive")}
                          {myChannel.status === "paused" && t("radio.statusPaused")}
                          {myChannel.status === "draft" && t("radio.statusDraft")}
                          {myChannel.status === "ended" && t("radio.statusEnded")}
                          {!["live", "paused", "draft", "ended"].includes(myChannel.status) && myChannel.status}
                        </span>
                        {myChannel.status !== "paused" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                            disabled={updateChannelStatus.isPending}
                            onClick={() => updateChannelStatus.mutate({ slug: myChannel.slug, status: "paused" })}
                          >
                            <Pause size={14} />
                            {t("radio.channelPause")}
                          </Button>
                        )}
                        {myChannel.status === "paused" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 border-primary/50"
                            disabled={updateChannelStatus.isPending}
                            onClick={() => updateChannelStatus.mutate({ slug: myChannel.slug, status: "live" })}
                          >
                            <Play size={14} />
                            {t("radio.channelResume")}
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1 border-destructive/50 text-destructive hover:bg-destructive/10">
                              <Trash2 size={14} />
                              {t("radio.channelDelete")}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("radio.channelDelete")}</AlertDialogTitle>
                              <AlertDialogDescription>{t("radio.deleteChannelConfirm")}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("profile.cancel", "취소")}</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deleteChannel.mutate(myChannel.slug)}
                              >
                                {deleteChannel.isPending ? "..." : t("radio.channelDelete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                      <Button asChild variant="outline" className="gap-2 w-full" size="default">
                        <Link href={`/radio/${myChannel.slug}`}>
                          <Mic2 size={16} />
                          {t("radio.goToMyChannel", "내 채널 들어가기")}
                        </Link>
                      </Button>
                      <Button asChild variant="secondary" className="gap-2 w-full" size="default">
                        <Link href={`/radio/${encodeURIComponent(myChannel.slug)}?edit=1`}>
                          <Settings size={16} />
                          {t("radio.editChannelInfo", "채널 정보 수정")}
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
                    <Link href={LOGIN_PATH}>
                      {t("radio.loginToCreate", "로그인 후 만들기")}
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-2">
            {/* 방송 관련 규정 */}
            <aside>
              <Card className="border-[rgba(148,163,184,0.3)] bg-[rgba(15,23,42,0.96)] shadow-[0_22px_60px_rgba(15,23,42,0.65)]">
                <CardContent className="p-4 space-y-2">
                  <h3 className="text-sm font-semibold">
                    {t("radio.rulesTitle", "방송 관련 규정")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t("radio.rulesIntro", "모든 DJ와 청취자는 아래 규정을 지켜 주세요.")}
                  </p>
                  <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
                    <li>{t("radio.rulesItem1", "저작권 등 타인의 권리를 침해하는 음원·콘텐츠를 송출할 수 없습니다.")}</li>
                    <li>{t("radio.rulesItem2", "욕설, 혐오, 차별, 음란, 불법 정보 등 커뮤니티 가이드라인을 위반하는 방송은 제한될 수 있습니다.")}</li>
                    <li>{t("radio.rulesItem3", "상업 광고·홍보 방송은 사전 협의 없이 진행할 수 없습니다.")}</li>
                    <li>{t("radio.rulesItem4", "운영 정책 위반 시 방송 중단, 채널 제한, 계정 제재가 이루어질 수 있습니다.")}</li>
                  </ul>
                  <p className="text-[11px] text-muted-foreground/80">
                    {t("radio.rulesMorePrefix", "자세한 내용은 향후 공지되는 ")}
                    <Link href="/legal" className="underline underline-offset-2 hover:text-foreground">
                      {t("login.terms", "이용약관")}
                    </Link>
                    {t("radio.rulesMoreSuffix", "·가이드라인을 참고해 주세요.")}
                  </p>
                </CardContent>
              </Card>
            </aside>
          </div>
          </div>

          <Footer />
        </div>
      </div>
    </PageTransition>
  );
}
