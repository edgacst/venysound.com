import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BarChart3, Clock, Users, Music, TrendingUp, Megaphone, Trash2, Plus, Loader2 } from "lucide-react";
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
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [annoTitle, setAnnoTitle] = useState("");
  const [annoContent, setAnnoContent] = useState("");

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/my-music-stats"],
    enabled: !!user,
  });

  const { data: myAnnouncements } = useQuery<any[]>({
    queryKey: ["/api/announcements/my"],
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
    navigate("/login");
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
