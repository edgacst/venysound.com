import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/use-auth";
import { LOGIN_PATH } from "@/lib/site-paths";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BarChart3, Clock, Users, Music, TrendingUp, Megaphone, Trash2, Plus, Loader2, Gift, DollarSign } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { resolveStorageUrl } from "@/lib/utils";
import { useTranslation } from 'react-i18next';

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const [pathname, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [annoTitle, setAnnoTitle] = useState("");
  const [annoContent, setAnnoContent] = useState("");
  const [distributionMusicId, setDistributionMusicId] = useState("");
  const [distributionTitle, setDistributionTitle] = useState("");
  const [distributionArtist, setDistributionArtist] = useState("");
  const [distributionReleaseDate, setDistributionReleaseDate] = useState("");
  const [distributionRightsConfirmed, setDistributionRightsConfirmed] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/my-music-stats"],
    enabled: !!user,
  });

  useEffect(() => {
    const HASH = "#global-distribution-management";
    const targetId = "global-distribution-management";

    const scrollIfHashMatches = (): boolean => {
      if (typeof window === "undefined") return true;
      if (window.location.hash !== HASH) return true;
      const el = document.getElementById(targetId);
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    };

    let cancelled = false;
    const timeoutIds: number[] = [];

    const scheduleAttempts = () => {
      if (statsLoading) return;
      const delays = [0, 80, 200, 450, 800, 1400];
      delays.forEach((ms) => {
        const id = window.setTimeout(() => {
          if (cancelled) return;
          scrollIfHashMatches();
        }, ms);
        timeoutIds.push(id);
      });
    };

    scheduleAttempts();

    const onHashChange = () => {
      const delays = [0, 100, 250, 500];
      delays.forEach((ms) => {
        const id = window.setTimeout(() => {
          if (cancelled) return;
          scrollIfHashMatches();
        }, ms);
        timeoutIds.push(id);
      });
    };
    window.addEventListener("hashchange", onHashChange);

    return () => {
      cancelled = true;
      for (const id of timeoutIds) clearTimeout(id);
      timeoutIds.length = 0;
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [statsLoading, pathname]);

  const { data: myAnnouncements } = useQuery<any[]>({
    queryKey: ["/api/announcements/my"],
    enabled: !!user,
  });

  const { data: earnings } = useQuery<{ totalTips: number; totalSales: number; balance: number; credits: number }>({
    queryKey: ["/api/earnings"],
    enabled: !!user,
  });

  const { data: tipsReceived } = useQuery<any[]>({
    queryKey: ["/api/tips/received"],
    enabled: !!user,
  });

  const { data: streamingStats } = useQuery<{
    totalSeconds: number;
    totalPlays: number;
    tracks: Array<{ musicId: number; title: string; artist: string; image: string; totalSeconds: number; playCount: number }>;
  }>({
    queryKey: ["/api/streaming-stats", user?.id],
    queryFn: async () => {
      if (!user?.id) return { totalSeconds: 0, totalPlays: 0, tracks: [] };
      const res = await fetch(`/api/streaming-stats/${user.id}`, { credentials: "include" });
      if (!res.ok) return { totalSeconds: 0, totalPlays: 0, tracks: [] };
      return res.json();
    },
    enabled: !!user?.id,
  });

  const { data: myMusicSimple } = useQuery<Array<{ id: number; title: string; artist: string }>>({
    queryKey: ["/api/distribution/music/my"],
    enabled: !!user,
  });

  const { data: myDistributionReleases } = useQuery<Array<{
    id: number;
    musicId: number;
    releaseTitle: string;
    artistName: string;
    status: string;
    rightsConfirmed: boolean;
    submittedAt: string | null;
    approvedAt: string | null;
    rejectionReason: string | null;
    createdAt: string;
  }>>({
    queryKey: ["/api/distribution/releases/my"],
    enabled: !!user,
  });

  const { data: distributionBalance } = useQuery<{ totalEarned: number; totalPaid: number; available: number }>({
    queryKey: ["/api/distribution/balance"],
    enabled: !!user,
  });

  const createAnnouncement = useMutation({
    mutationFn: async (data: { title: string; content: string }) => {
      const res = await apiRequest("POST", "/api/announcements", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('dashboard.announcementCreated', '공지 등록 완료'), description: t('dashboard.announcementCreatedDesc', '팔로워들에게 알림이 전송되었습니다.') });
      qc.invalidateQueries({ queryKey: ["/api/announcements/my"] });
      setAnnouncementOpen(false);
      setAnnoTitle("");
      setAnnoContent("");
    },
    onError: () => {
      toast({ title: t('dashboard.announcementFailed', '공지 등록 실패'), variant: "destructive" });
    },
  });

  const deleteAnnouncement = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/announcements/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/announcements/my"] });
      toast({ title: t('dashboard.announcementDeleted', '공지가 삭제되었습니다') });
    },
  });

  const createDistributionRelease = useMutation({
    mutationFn: async () => {
      const musicId = Number(distributionMusicId);
      const payload = {
        musicId,
        releaseTitle: distributionTitle.trim(),
        artistName: distributionArtist.trim(),
        rightsConfirmed: distributionRightsConfirmed,
        releaseDate: distributionReleaseDate ? new Date(`${distributionReleaseDate}T00:00:00+09:00`).toISOString() : undefined,
      };
      const res = await apiRequest("POST", "/api/distribution/releases", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "유통 초안이 생성되었습니다." });
      qc.invalidateQueries({ queryKey: ["/api/distribution/releases/my"] });
      setDistributionMusicId("");
      setDistributionTitle("");
      setDistributionArtist("");
      setDistributionReleaseDate("");
      setDistributionRightsConfirmed(false);
    },
    onError: (e: any) => {
      toast({ title: e?.message || "유통 초안 생성에 실패했습니다.", variant: "destructive" });
    },
  });

  const submitDistributionRelease = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/distribution/releases/${id}/submit`);
    },
    onSuccess: () => {
      toast({ title: "유통 신청이 제출되었습니다." });
      qc.invalidateQueries({ queryKey: ["/api/distribution/releases/my"] });
    },
    onError: (e: any) => {
      toast({ title: e?.message || "유통 신청 제출에 실패했습니다.", variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      </div>
    );
  }

  if (!user) {
    navigate(LOGIN_PATH);
    return null;
  }

  const totals = stats?.totals || { total_plays: 0, total_duration: 0, unique_listeners: 0 };
  const dailyData = (stats?.dailyPlays || []).map((d: any) => ({
    date: new Date(d.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }),
    plays: Number(d.plays),
    duration: Number(d.duration),
  }));
  const hourlyData = Array.from({ length: 24 }, (_, i) => {
    const found = (stats?.hourlyPlays || []).find((h: any) => Number(h.hour) === i);
    return { hour: `${i}시`, plays: found ? Number(found.plays) : 0 };
  });
  const topTracks = stats?.topTracks || [];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">{t('dashboard.title', '아티스트 대시보드')}</h1>
            <p className="text-muted-foreground text-sm mt-1">{t('dashboard.subtitle', '내 음원의 재생 통계와 팬 관리')}</p>
          </div>
          <Button className="gap-2" onClick={() => setAnnouncementOpen(true)} data-testid="button-new-announcement">
            <Megaphone size={16} />
            {t('dashboard.sendAnnouncement', '팬에게 공지 보내기')}
          </Button>
        </div>

        {statsLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Music size={20} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('dashboard.registeredTracks', '등록 음원')}</p>
                    <p className="text-xl font-bold" data-testid="text-stat-music-count">{stats?.musicCount || 0}{t('dashboard.trackUnit', '곡')}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <TrendingUp size={20} className="text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('dashboard.totalPlays', '총 재생 수')}</p>
                    <p className="text-xl font-bold" data-testid="text-stat-total-plays">{Number(totals.total_plays).toLocaleString()}{t('dashboard.playUnit', '회')}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Clock size={20} className="text-green-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('dashboard.totalPlayTime', '총 재생 시간')}</p>
                    <p className="text-xl font-bold" data-testid="text-stat-total-duration">{formatDuration(Number(totals.total_duration))}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <Users size={20} className="text-orange-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('dashboard.uniqueListeners', '고유 리스너')}</p>
                    <p className="text-xl font-bold" data-testid="text-stat-unique-listeners">{Number(totals.unique_listeners).toLocaleString()}{t('dashboard.personUnit', '명')}</p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <Card className="p-5">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <BarChart3 size={18} className="text-primary" />
                  {t('dashboard.last30DaysPlays', '최근 30일 재생 추이')}
                </h3>
                {dailyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={dailyData}>
                      <defs>
                        <linearGradient id="playGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                        itemStyle={{ color: "hsl(var(--primary))" }}
                      />
                      <Area type="monotone" dataKey="plays" name={t('dashboard.playCount', '재생 수')} stroke="hsl(var(--primary))" fill="url(#playGradient)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                    {t('dashboard.noPlayData', '아직 재생 데이터가 없습니다')}
                  </div>
                )}
              </Card>

              <Card className="p-5">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Clock size={18} className="text-blue-500" />
                  {t('dashboard.hourlyPopularity', '시간대별 인기도')}
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={hourlyData}>
                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval={2} />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                      itemStyle={{ color: "hsl(var(--primary))" }}
                    />
                    <Bar dataKey="plays" name={t('dashboard.playCount', '재생 수')} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {topTracks.length > 0 && (
              <Card className="p-5 mb-8">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp size={18} className="text-green-500" />
                  {t('dashboard.topTracks', '인기 음원 TOP 10')}
                </h3>
                <div className="space-y-2">
                  {topTracks.map((track: any, i: number) => {
                    const imgUrl = track.imageFilename?.startsWith("http")
                      ? track.imageFilename
                      : track.imageFilename
                        ? resolveStorageUrl(track.imageFilename)
                        : "https://picsum.photos/40/40";
                    return (
                      <div key={track.id} className="flex items-center gap-3 p-2 rounded-lg hover-elevate" data-testid={`track-stat-${track.id}`}>
                        <span className="text-lg font-bold text-muted-foreground w-8 text-right">{i + 1}</span>
                        <img src={imgUrl} alt="" className="w-10 h-10 rounded object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{track.title}</p>
                          <p className="text-xs text-muted-foreground">{track.artist}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{Number(track.plays).toLocaleString()}{t('dashboard.playUnit', '회')}</p>
                          <p className="text-xs text-muted-foreground">{formatDuration(Number(track.duration))}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <Card className="p-5">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Gift size={18} className="text-yellow-500" />
                  {t('dashboard.tipsSummary', '후원 내역 요약')}
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                    <span className="text-sm text-muted-foreground">{t('dashboard.totalTipsReceived', '총 받은 후원')}</span>
                    <span className="text-xl font-bold text-yellow-500" data-testid="text-total-tips">
                      {(earnings?.totalTips ?? 0).toLocaleString()}{t('dashboard.won', '원')}
                    </span>
                  </div>
                  {earnings && (earnings.totalSales ?? 0) > 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                      <span className="text-sm text-muted-foreground">{t('dashboard.totalSales', '총 판매 수익')}</span>
                      <span className="text-xl font-bold text-green-500">
                        {(earnings.totalSales ?? 0).toLocaleString()}{t('dashboard.won', '원')}
                      </span>
                    </div>
                  )}
                  {Array.isArray(tipsReceived) && tipsReceived.length > 0 ? (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">{t('dashboard.recentTips', '최근 후원')}</p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {tipsReceived.slice(0, 10).map((item: any) => {
                          const tip = item.tip ?? item;
                          const fromUser = item.fromUser;
                          return (
                            <div key={tip.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                              <span className="truncate text-muted-foreground">
                                {fromUser?.firstName ?? fromUser?.email ?? t('dashboard.anonymous', '익명')}
                              </span>
                              <span className="font-medium shrink-0 ml-2">{Number(tip.amount).toLocaleString()}{t('dashboard.won', '원')}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">{t('dashboard.noTipsYet', '아직 받은 후원이 없습니다')}</p>
                  )}
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <DollarSign size={18} className="text-green-500" />
                  {t('dashboard.trackRevenuePlays', '음원별 수익·재생')}
                </h3>
                {streamingStats?.tracks || (Array.isArray(tipsReceived) && tipsReceived.length > 0) ? (
                  (() => {
                    const tipsByMusicId: Record<number, number> = {};
                    let artistTipAmount = 0;
                    if (Array.isArray(tipsReceived)) {
                      for (const item of tipsReceived) {
                        const tip = item.tip ?? item;
                        const mid = tip.musicId ?? tip.music_id;
                        const amt = Number(tip.amount ?? 0);
                        if (mid != null) {
                          tipsByMusicId[mid] = (tipsByMusicId[mid] ?? 0) + amt;
                        } else {
                          artistTipAmount += amt;
                        }
                      }
                    }
                    const trackRows = (streamingStats?.tracks ?? [])
                      .map((t) => ({ ...t, tipAmount: tipsByMusicId[t.musicId] ?? 0 }))
                      .filter((t) => t.playCount > 0 || t.tipAmount > 0)
                      .sort((a, b) => b.playCount - a.playCount)
                      .slice(0, 15);
                    const artistRow = artistTipAmount > 0 ? [{ musicId: 0, title: t('dashboard.artist', '아티스트'), artist: '', totalSeconds: 0, playCount: 0, tipAmount: artistTipAmount }] : [];
                    const rows = [...trackRows, ...artistRow];
                    return (
                      <div className="space-y-1 max-h-80 overflow-y-auto">
                        <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border font-medium text-xs text-muted-foreground">
                          <div className="flex-1 min-w-0">{t('dashboard.trackTitle', '곡명')}</div>
                          <span className="shrink-0 w-12 text-right">{t('dashboard.playsShort', '재생')}</span>
                          <span className="shrink-0 w-14 text-right">{t('dashboard.timeShort', '시간')}</span>
                          <span className="shrink-0 w-16 text-right">{t('dashboard.tips', '후원')}</span>
                        </div>
                        {rows.map((track) => (
                          <div key={track.musicId} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50 last:border-0 text-xs">
                            <div className="flex-1 min-w-0 truncate">
                              {track.artist ? (
                                <span className="truncate block" title={`${track.title} · ${track.artist}`}>{track.title} · {track.artist}</span>
                              ) : (
                                <span className="font-medium truncate block">{track.title}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-muted-foreground tabular-nums w-12 text-right">{Number(track.playCount).toLocaleString()}{t('dashboard.playUnit', '회')}</span>
                              <span className="text-muted-foreground tabular-nums w-14 text-right">{formatDuration(Number(track.totalSeconds))}</span>
                              <span className="font-medium text-yellow-500 tabular-nums w-16 text-right">
                                {track.tipAmount > 0 ? `${Number(track.tipAmount).toLocaleString()}${t("common.won", "원")}` : "-"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">{t('dashboard.noTrackStatsYet', '아직 재생·후원 데이터가 없습니다')}</p>
                )}
              </Card>
            </div>

            <Card id="global-distribution-management" className="p-5 mb-8 scroll-mt-24">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <DollarSign size={18} className="text-primary" />
                {t("dashboard.distributionGlobalSectionTitle")}
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-3">
                  <Label>{t("dashboard.distributionPickMusic")}</Label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={distributionMusicId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDistributionMusicId(next);
                      const picked = (myMusicSimple ?? []).find((m) => String(m.id) === next);
                      if (picked) {
                        setDistributionTitle(picked.title);
                        setDistributionArtist(picked.artist);
                      }
                    }}
                  >
                    <option value="">{t("dashboard.distributionPickMusicPlaceholder")}</option>
                    {(myMusicSimple ?? []).map((m) => (
                      <option key={m.id} value={String(m.id)}>{m.title} · {m.artist}</option>
                    ))}
                  </select>
                  <div>
                    <Label>{t("dashboard.distributionReleaseTitleLabel")}</Label>
                    <Input value={distributionTitle} onChange={(e) => setDistributionTitle(e.target.value)} placeholder={t("dashboard.distributionReleaseTitlePlaceholder")} />
                  </div>
                  <div>
                    <Label>{t("dashboard.distributionArtistLabel")}</Label>
                    <Input value={distributionArtist} onChange={(e) => setDistributionArtist(e.target.value)} placeholder={t("dashboard.distributionArtistPlaceholder")} />
                  </div>
                  <div>
                    <Label>{t("dashboard.distributionReleaseDateLabel")}</Label>
                    <Input type="date" value={distributionReleaseDate} onChange={(e) => setDistributionReleaseDate(e.target.value)} />
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 shrink-0"
                      checked={distributionRightsConfirmed}
                      onChange={(e) => setDistributionRightsConfirmed(e.target.checked)}
                    />
                    <span className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>{t("dashboard.distributionRightsAgreement")}</span>
                      <Link href="/legal#distribution-delegation" className="text-primary underline hover:opacity-80 whitespace-nowrap shrink-0">
                        {t("dashboard.distributionRightsLearnMore")} →
                      </Link>
                    </span>
                  </label>
                  <Button
                    className="w-full"
                    disabled={
                      createDistributionRelease.isPending ||
                      !distributionMusicId ||
                      !distributionTitle.trim() ||
                      !distributionArtist.trim() ||
                      !distributionRightsConfirmed
                    }
                    onClick={() => createDistributionRelease.mutate()}
                  >
                    {createDistributionRelease.isPending ? t("dashboard.distributionCreating") : t("dashboard.distributionCreateDraft")}
                  </Button>
                </div>
                <div className="lg:col-span-2 space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-md border p-3">
                      <p className="text-muted-foreground text-xs">{t("dashboard.distributionTotalEarnedLabel")}</p>
                      <p className="font-semibold">{(distributionBalance?.totalEarned ?? 0).toLocaleString()}{t("dashboard.won")}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-muted-foreground text-xs">{t("dashboard.distributionTotalPaidLabel")}</p>
                      <p className="font-semibold">{(distributionBalance?.totalPaid ?? 0).toLocaleString()}{t("dashboard.won")}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-muted-foreground text-xs">{t("dashboard.distributionAvailableLabel")}</p>
                      <p className="font-semibold text-primary">{(distributionBalance?.available ?? 0).toLocaleString()}{t("dashboard.won")}</p>
                    </div>
                  </div>
                  <div className="rounded-md border max-h-[min(60vh,28rem)] overflow-auto overscroll-contain">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-[1] border-b border-border bg-muted/95 backdrop-blur-sm">
                        <tr>
                          <th className="text-left p-2">{t("dashboard.distributionTableRelease")}</th>
                          <th className="text-left p-2">{t("dashboard.distributionTableStatus")}</th>
                          <th className="text-left p-2">{t("dashboard.distributionTableReason")}</th>
                          <th className="text-right p-2">{t("dashboard.distributionTableAction")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(myDistributionReleases ?? []).length > 0 ? (
                          (myDistributionReleases ?? []).map((r) => (
                            <tr key={r.id} className="border-t border-border/50">
                              <td className="p-2">
                                <div className="font-medium">{r.releaseTitle}</div>
                                <div className="text-xs text-muted-foreground">{r.artistName}</div>
                              </td>
                              <td className="p-2">
                                {r.status === "approved" ? (
                                  <span className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-1 text-xs font-medium text-green-700 dark:text-green-400">
                                    {t("dashboard.distributionStatusApproved")}
                                  </span>
                                ) : (
                                  r.status
                                )}
                              </td>
                              <td className="p-2 text-xs text-muted-foreground">
                                {r.status === "rejected" ? (r.rejectionReason || "-") : "-"}
                              </td>
                              <td className="p-2 text-right">
                                {(r.status === "draft" || r.status === "rejected") ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={submitDistributionRelease.isPending}
                                    onClick={() => submitDistributionRelease.mutate(r.id)}
                                  >
                                    {t("dashboard.distributionSubmit")}
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="p-6 text-center text-muted-foreground">{t("dashboard.distributionNoDrafts")}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Card>
          </>
        )}

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Megaphone size={18} className="text-orange-500" />
              {t('dashboard.myAnnouncements', '내 공지사항')}
            </h3>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setAnnouncementOpen(true)} data-testid="button-new-announcement-2">
              <Plus size={14} />
              {t('dashboard.newAnnouncement', '새 공지')}
            </Button>
          </div>
          {(myAnnouncements && myAnnouncements.length > 0) ? (
            <div className="space-y-3">
              {myAnnouncements.map((a: any) => (
                <div key={a.id} className="border border-border rounded-lg p-4" data-testid={`announcement-${a.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm">{a.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.content}</p>
                      <p className="text-xs text-muted-foreground/60 mt-2">
                        {new Date(a.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteAnnouncement.mutate(a.id)}
                      data-testid={`button-delete-announcement-${a.id}`}
                    >
                      <Trash2 size={14} className="text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">{t('dashboard.noAnnouncements', '등록된 공지가 없습니다. 팬들에게 소식을 전해보세요!')}</p>
          )}
        </Card>
      </div>

      <Dialog open={announcementOpen} onOpenChange={setAnnouncementOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dashboard.sendAnnouncementTitle', '팬에게 공지 보내기')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="anno-title">{t('dashboard.announcementTitleLabel', '제목')}</Label>
              <Input
                id="anno-title"
                value={annoTitle}
                onChange={(e) => setAnnoTitle(e.target.value)}
                placeholder={t('dashboard.announcementTitlePlaceholder', '공지 제목을 입력하세요')}
                data-testid="input-announcement-title"
              />
            </div>
            <div>
              <Label htmlFor="anno-content">{t('dashboard.announcementContentLabel', '내용')}</Label>
              <Textarea
                id="anno-content"
                value={annoContent}
                onChange={(e) => setAnnoContent(e.target.value)}
                placeholder={t('dashboard.announcementContentPlaceholder', '팔로워들에게 전달할 내용을 작성하세요')}
                className="min-h-[120px]"
                data-testid="input-announcement-content"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnnouncementOpen(false)}>{t('dashboard.cancelButton', '취소')}</Button>
            <Button
              onClick={() => createAnnouncement.mutate({ title: annoTitle, content: annoContent })}
              disabled={!annoTitle.trim() || !annoContent.trim() || createAnnouncement.isPending}
              data-testid="button-submit-announcement"
            >
              {createAnnouncement.isPending ? t('dashboard.sending', '전송 중...') : t('dashboard.sendAnnouncement2', '공지 전송')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
