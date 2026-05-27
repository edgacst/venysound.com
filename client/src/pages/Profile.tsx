import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useUserProfile, useFollowUser } from "@/hooks/use-user-profile";
import { useRoute, Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MusicCard } from "@/components/MusicCard";
import { DonationBadge } from "@/components/DonationBadge";
import { useTranslation } from 'react-i18next';
import { 
  Loader2, UserPlus, UserCheck, Upload as UploadIcon, Heart, 
  MessageSquare, ListMusic, Music, Users, Bell, BellOff, 
  Plus, Trash2, X, Flag, Clock, Search, CheckCircle, XCircle, Crown,
  Wallet, Gift, Download, TrendingUp, Banknote, ArrowDownToLine, Coins, Pencil
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePlaylists, useCreatePlaylist, usePlaylist } from "@/hooks/use-playlists";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef } from "react";
import { usePlayerStore } from "@/components/AudioPlayer";
import { PageTransition } from "@/components/PageTransition";
import profileMusicBg from "@/assets/images/profile-music-bg.png";
import { redirectToLogin } from "@/lib/auth-utils";

function StatItem({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`inline-flex flex-row items-center gap-1.5 px-3 py-2 rounded-lg transition-colors ${onClick ? "hover-elevate cursor-pointer" : ""}`}
      data-testid={`stat-${label}`}
    >
      <span className="text-lg sm:text-xl font-bold text-foreground tabular-nums">{value}</span>
      <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">{label}</span>
    </button>
  );
}

function FollowListDialog({ title, users: userList, open, onOpenChange }: { 
  title: string; 
  users: any[]; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto space-y-3">
          {userList.length === 0 && (
            <p className="text-center text-muted-foreground py-8">{t('profile.noneYet', '아직 없습니다')}</p>
          )}
          {userList.map((u: any) => (
            <Link key={u.id} href={`/profile/${u.id}`}>
              <div className="flex items-center gap-3 p-2 rounded-lg hover-elevate cursor-pointer flex-wrap" data-testid={`user-item-${u.id}`}>
                <Avatar className="w-10 h-10">
                  <AvatarImage src={u.profileImageUrl} />
                  <AvatarFallback>{u.firstName?.[0] || "U"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{u.firstName || t('profile.user', '사용자')}{u.lastName ? ` ${u.lastName}` : ""}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlaylistSection({ profilePlaylists, isOwnProfile, userId }: { profilePlaylists: any[]; isOwnProfile: boolean; userId: string }) {
  const { t } = useTranslation();
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const { mutate: createPlaylist, isPending: isCreating } = useCreatePlaylist();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { playMusic, setPlaylist } = usePlayerStore();
  const { user } = useAuth();

  const { data: playlistDetail } = usePlaylist(selectedPlaylistId || 0);

  const deletePlaylist = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/playlists/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(t('profile.deleteFailed', '삭제 실패'));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile", userId] });
      queryClient.invalidateQueries({ queryKey: [api.playlists.list.path] });
      toast({ title: t('profile.deleteComplete', '삭제 완료'), description: t('profile.playlistDeleted', '플레이리스트가 삭제되었습니다') });
      setSelectedPlaylistId(null);
    }
  });

  const removeMusicFromPlaylist = useMutation({
    mutationFn: async ({ playlistId, musicId }: { playlistId: number; musicId: number }) => {
      const res = await fetch(`/api/playlists/${playlistId}/music/${musicId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(t('profile.removeFailed', '제거 실패'));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.playlists.get.path, selectedPlaylistId] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile", userId] });
      toast({ title: t('profile.removeComplete', '제거 완료'), description: t('profile.musicRemovedFromPlaylist', '곡이 플레이리스트에서 제거되었습니다') });
    }
  });

  const handleCreatePlaylist = () => {
    if (!newPlaylistName.trim()) return;
    createPlaylist({ name: newPlaylistName.trim() }, {
      onSuccess: () => {
        setNewPlaylistName("");
        setCreateDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/users/profile", userId] });
      }
    });
  };

  const handlePlayAll = (musics: any[]) => {
    if (musics.length === 0) return;
    if (!user) {
      redirectToLogin((opts) => toast(opts as any));
      return;
    }
    const ids = musics.map((m: any) => m.id);
    setPlaylist(ids);
    playMusic(ids[0]);
  };

  if (selectedPlaylistId && playlistDetail) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => setSelectedPlaylistId(null)} data-testid="button-back-playlists">
            <X size={18} />
          </Button>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold truncate" data-testid="text-playlist-name">{playlistDetail.name}</h3>
            <p className="text-sm text-muted-foreground">{playlistDetail.musics?.length || 0}{t('profile.songsUnit', '곡')}</p>
          </div>
          {playlistDetail.musics?.length > 0 && (
            <Button onClick={() => handlePlayAll(playlistDetail.musics)} className="gap-2" data-testid="button-play-all-playlist">
              <Music size={16} /> {t('profile.playAll', '전체 재생')}
            </Button>
          )}
          {isOwnProfile && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon" data-testid="button-delete-playlist">
                  <Trash2 size={16} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('profile.deletePlaylist', '플레이리스트 삭제')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    "{playlistDetail.name}" {t('profile.deletePlaylistConfirm', '플레이리스트를 삭제하시겠습니까? 삭제된 플레이리스트는 복구할 수 없습니다.')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete-playlist">{t('profile.cancel', '취소')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deletePlaylist.mutate(selectedPlaylistId!)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid="button-confirm-delete-playlist"
                  >
                    {t('profile.delete', '삭제')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {(!playlistDetail.musics || playlistDetail.musics.length === 0) ? (
          <div className="text-center py-16 text-muted-foreground">
            <ListMusic className="mx-auto mb-3 opacity-50" size={48} />
            <p>{t('profile.emptyPlaylist', '이 플레이리스트에 곡이 없습니다')}</p>
          </div>
        ) : (
          <div className="music-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {playlistDetail.musics.map((m: any) => (
              <div key={m.id} className="relative group">
                <MusicCard music={m} />
                {isOwnProfile && (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    onClick={(e) => { e.stopPropagation(); removeMusicFromPlaylist.mutate({ playlistId: selectedPlaylistId, musicId: m.id }); }}
                    data-testid={`button-remove-from-playlist-${m.id}`}
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {isOwnProfile && (
        <div className="mb-6">
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-create-playlist">
                <Plus size={16} /> {t('profile.newPlaylist', '새 플레이리스트')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('profile.createNewPlaylist', '새 플레이리스트 만들기')}</DialogTitle>
              </DialogHeader>
              <Input
                placeholder={t('profile.playlistNamePlaceholder', '플레이리스트 이름')}
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreatePlaylist()}
                data-testid="input-playlist-name"
              />
              <DialogFooter>
                <Button onClick={handleCreatePlaylist} disabled={isCreating || !newPlaylistName.trim()} data-testid="button-confirm-create-playlist">
                  {isCreating ? <Loader2 className="animate-spin" size={16} /> : t('profile.create', '만들기')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {profilePlaylists.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ListMusic className="mx-auto mb-3 opacity-50" size={48} />
          <p>{t('profile.noPlaylists', '아직 플레이리스트가 없습니다')}</p>
          {isOwnProfile && <p className="text-sm mt-2">{t('profile.createPlaylistPrompt', '새 플레이리스트를 만들어보세요')}</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {profilePlaylists.map((pl: any) => (
            <Card
              key={pl.id}
              className="p-4 cursor-pointer hover-elevate transition-all"
              onClick={() => setSelectedPlaylistId(pl.id)}
              data-testid={`card-playlist-${pl.id}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center shrink-0">
                  <ListMusic className="text-primary" size={24} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold truncate">{pl.name}</h4>
                  <p className="text-xs text-muted-foreground">
                    {new Date(pl.createdAt).toLocaleDateString("ko-KR")}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PostsSection({ userPosts }: { userPosts: any[] }) {
  const { t } = useTranslation();
  if (userPosts.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <MessageSquare className="mx-auto mb-3 opacity-50" size={48} />
        <p>{t('profile.noPosts', '아직 작성한 게시글이 없습니다')}</p>
        <div className="mt-4">
          <Link href="/community">
            <Button variant="outline" className="border-white/10" data-testid="button-go-community">{t('profile.goToCommunity', '커뮤니티 바로가기')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {userPosts.map((post: any) => (
        <Link key={post.id} href={`/community`}>
          <Card className="p-4 hover-elevate cursor-pointer" data-testid={`card-post-${post.id}`}>
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {post.category && <Badge variant="secondary" className="text-xs">{post.category}</Badge>}
                  <h4 className="font-semibold truncate">{post.title}</h4>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{post.content}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(post.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function NotificationsSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: myProfile } = useUserProfile(user?.id ?? "");
  const updateNotifyPrefs = useMutation({
    mutationFn: async (prefs: { notifyNewMusicEmail?: boolean; notifyNewMusicPush?: boolean; notifyActivityEmail?: boolean }) => {
      const res = await fetch(`/api/users/${user!.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile", user?.id] });
      toast({ title: t("profile.saved", "저장됨"), description: t("profile.notificationPrefsSaved", "알림 설정이 저장되었습니다") });
    },
    onError: () => toast({ title: t("profile.failed", "실패"), variant: "destructive" }),
  });
  const subscribePush = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/push-vapid-public", { credentials: "include" });
      const { publicKey } = await res.json();
      if (!publicKey) throw new Error("Push not configured");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const toBase64Url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const payload = { endpoint: sub.endpoint, keys: { p256dh: toBase64Url(sub.getKey("p256dh")!), auth: toBase64Url(sub.getKey("auth")!) } };
      const saveRes = await fetch("/api/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!saveRes.ok) throw new Error("Subscribe failed");
    },
    onSuccess: () => toast({ title: t("profile.pushEnabled", "푸시 알림이 켜졌습니다") }),
    onError: (e) => toast({ title: t("profile.pushEnableFailed", "푸시 켜기 실패"), description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });
  const { data: notifications, isLoading } = useQuery({
    queryKey: [api.notifications.list.path],
    queryFn: async () => {
      const res = await fetch(api.notifications.list.path, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notifications/read-all", { method: "PATCH", credentials: "include" });
      if (!res.ok) throw new Error(t('profile.failed', '실패'));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.notifications.list.path] });
      toast({ title: t('profile.complete', '완료'), description: t('profile.allNotificationsRead', '모든 알림을 읽음 처리했습니다') });
    }
  });

  const markOneRead = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" });
      if (!res.ok) throw new Error(t('profile.failed', '실패'));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.notifications.list.path] });
    }
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={24} /></div>;
  }

  const unreadCount = notifications?.filter((n: any) => !n.isRead).length || 0;
  const profileUser = (myProfile as any)?.user;
  const notifyEmail = profileUser?.notifyNewMusicEmail !== false;
  const notifyPush = profileUser?.notifyNewMusicPush !== false;
  const notifyActivity = profileUser?.notifyActivityEmail !== false;

  return (
    <div>
      {user?.id && (
        <Card className="p-4 mb-6">
          <h3 className="font-medium text-sm mb-3">{t("profile.newMusicNotificationSettings", "신곡 알림 설정")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("profile.newMusicNotificationDesc", "많이 들은 스타일의 신곡이 올라오면 알려드립니다.")}</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="notify-email" className="text-sm">{t("profile.notifyNewMusicEmail", "이메일로 신곡 알림 받기")}</Label>
              <Switch
                id="notify-email"
                checked={notifyEmail}
                onCheckedChange={(checked) => updateNotifyPrefs.mutate({ notifyNewMusicEmail: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notify-push" className="text-sm">{t("profile.notifyNewMusicPush", "푸시로 신곡 알림 받기")}</Label>
              <Switch
                id="notify-push"
                checked={notifyPush}
                onCheckedChange={(checked) => updateNotifyPrefs.mutate({ notifyNewMusicPush: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notify-activity-email" className="text-sm">{t("profile.notifyActivityEmail", "활동 알림 이메일")}</Label>
              <Switch
                id="notify-activity-email"
                checked={notifyActivity}
                onCheckedChange={(checked) => updateNotifyPrefs.mutate({ notifyActivityEmail: checked })}
              />
            </div>
            <p className="text-xs text-muted-foreground -mt-2">{t("profile.notifyActivityEmailDesc", "댓글·팔로우·쪽지·좋아요 등이 있을 때 이메일로 알림 (SMTP 설정 시)")}</p>
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={subscribePush.isPending || !("PushManager" in window) || !("serviceWorker" in navigator)}
                onClick={() => subscribePush.mutate()}
              >
                {subscribePush.isPending ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                {t("profile.enablePushNotifications", "푸시 알림 켜기")}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">{t("profile.enablePushHint", "브라우저에서 푸시 권한을 허용하면 이 기기로 알림을 받을 수 있습니다.")}</p>
            </div>
          </div>
        </Card>
      )}
      <p className="text-xs text-muted-foreground mb-3" data-testid="text-notifications-limit-notice">
        {t('profile.notificationsLimitNotice', '알림목록은 20개까지만 보여집니다.')}
      </p>
      {unreadCount > 0 && (
        <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm text-muted-foreground">{t('profile.unreadNotifications', '읽지 않은 알림')} {unreadCount}{t('profile.countUnit', '개')}</span>
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} className="border-white/10 gap-2" data-testid="button-mark-all-read">
            <BellOff size={14} /> {t('profile.markAllRead', '모두 읽음')}
          </Button>
        </div>
      )}

      {(!notifications || notifications.length === 0) ? (
        <div className="text-center py-16 text-muted-foreground">
          <Bell className="mx-auto mb-3 opacity-50" size={48} />
          <p>{t('profile.noNotifications', '알림이 없습니다')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif: any) => (
            <Card
              key={notif.id}
              className={`p-4 transition-all ${!notif.isRead ? 'border-primary/30 bg-primary/5' : ''}`}
              data-testid={`card-notification-${notif.id}`}
            >
              <div className="flex items-start gap-3 flex-wrap">
                <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${!notif.isRead ? 'bg-primary' : 'bg-transparent'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm" data-testid={`text-notification-message-${notif.id}`}>{notif.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(notif.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {!notif.isRead && (
                  <Button variant="ghost" size="sm" onClick={() => markOneRead.mutate(notif.id)} data-testid={`button-read-${notif.id}`}>
                    {t('profile.read', '읽음')}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const reportReasonLabels: Record<string, string> = {
  unauthorized_use: "무단 사용",
  plagiarism: "표절",
  false_attribution: "허위 아티스트 표기",
  ai_without_credit: "AI 생성물 미표기",
  other: "기타",
};

function MyReportsSection() {
  const { t } = useTranslation();
  const { data: reports, isLoading } = useQuery<any[]>({
    queryKey: ["/api/copyright-reports/my"],
    queryFn: async () => {
      const res = await fetch("/api/copyright-reports/my", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={24} /></div>;
  }

  if (!reports || reports.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Flag className="mx-auto mb-3 opacity-50" size={48} />
        <p>{t('profile.noReports', '접수한 저작권 신고가 없습니다')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((report: any) => (
        <Card key={report.id} className="p-4" data-testid={`card-report-${report.id}`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-medium truncate">{report.musicTitle || t('profile.deletedMusic', '삭제된 음원')}</span>
                <Badge variant="secondary" className="text-xs">
                  {reportReasonLabels[report.reason] || report.reason}
                </Badge>
              </div>
              {report.originalArtist && (
                <p className="text-xs text-muted-foreground">{t('profile.originalArtist', '원작자')}: {report.originalArtist}</p>
              )}
              {report.details && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{report.details}</p>
              )}
              {report.adminNote && (
                <p className="text-xs text-blue-400 mt-1">{t('profile.adminNote', '관리자 메모')}: {report.adminNote}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {report.status === "pending" && (
                <Badge variant="secondary" className="gap-1">
                  <Clock size={10} /> {t('profile.pending', '대기중')}
                </Badge>
              )}
              {report.status === "reviewing" && (
                <Badge variant="default" className="bg-blue-600 gap-1 no-default-hover-elevate no-default-active-elevate">
                  <Search size={10} /> {t('profile.reviewing', '검토중')}
                </Badge>
              )}
              {report.status === "resolved" && (
                <Badge variant="default" className="bg-green-600 gap-1 no-default-hover-elevate no-default-active-elevate">
                  <CheckCircle size={10} /> {t('profile.resolved', '처리완료')}
                </Badge>
              )}
              {report.status === "rejected" && (
                <Badge variant="default" className="bg-gray-600 gap-1 no-default-hover-elevate no-default-active-elevate">
                  <XCircle size={10} /> {t('profile.rejected', '반려')}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {report.createdAt ? new Date(report.createdAt).toLocaleDateString("ko-KR") : ""}
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function EarningsSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");

  const { data: earnings, isLoading: isLoadingEarnings } = useQuery<{ totalTips: number; totalSales: number; balance: number }>({
    queryKey: ["/api/earnings"],
    queryFn: async () => {
      const res = await fetch("/api/earnings", { credentials: "include" });
      if (!res.ok) return { totalTips: 0, totalSales: 0, balance: 0 };
      return res.json();
    },
    // 다른 사용자가 후원한 뒤에도 이 페이지를 열어둔 상태에서 업데이트되도록 함
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const { data: tipsReceived, isLoading: isLoadingTips } = useQuery<any[]>({
    queryKey: ["/api/tips/received"],
    queryFn: async () => {
      const res = await fetch("/api/tips/received", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const { data: sales, isLoading: isLoadingSales } = useQuery<any[]>({
    queryKey: ["/api/earnings/sales"],
    queryFn: async () => {
      const res = await fetch("/api/earnings/sales", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: withdrawals, isLoading: isLoadingWithdrawals } = useQuery<any[]>({
    queryKey: ["/api/withdrawals"],
    queryFn: async () => {
      const res = await fetch("/api/withdrawals", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (data: { amount: number; bankName: string; accountNumber: string; accountHolder: string }) => {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || t('profile.withdrawFailed', '출금 요청 실패'));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('profile.withdrawComplete', '출금 요청 완료'), description: t('profile.withdrawPendingApproval', '관리자 승인 후 입금됩니다.') });
      queryClient.invalidateQueries({ queryKey: ["/api/withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/earnings"] });
      setWithdrawOpen(false);
      setWithdrawAmount("");
      setBankName("");
      setAccountNumber("");
      setAccountHolder("");
    },
    onError: (error: Error) => {
      toast({ title: t('profile.withdrawFailed', '출금 요청 실패'), description: error.message, variant: "destructive" });
    },
  });

  const handleWithdraw = () => {
    const amount = Number(withdrawAmount);
    if (!amount || amount < 1000) {
      toast({ title: t('profile.error', '오류'), description: t('profile.minWithdrawAmount', '최소 출금 금액은 1,000원입니다.'), variant: "destructive" });
      return;
    }
    if (!bankName || !accountNumber || !accountHolder) {
      toast({ title: t('profile.error', '오류'), description: t('profile.fillAllFields', '은행명, 계좌번호, 예금주를 모두 입력해주세요.'), variant: "destructive" });
      return;
    }
    withdrawMutation.mutate({ amount, bankName, accountNumber, accountHolder });
  };

  const baseAmount = Number(withdrawAmount || 0);
  const fee = Math.floor(baseAmount * 0.15);
  const vat = Math.floor(fee * 0.1);
  const totalDeduction = fee + vat;
  const netAmount = baseAmount - totalDeduction;

  const statusLabel = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="secondary"><Clock size={12} className="mr-1" />{t('profile.pending', '대기중')}</Badge>;
      case "approved": return <Badge className="bg-green-500/20 text-green-400"><CheckCircle size={12} className="mr-1" />{t('profile.approved', '승인')}</Badge>;
      case "rejected": return <Badge variant="destructive"><XCircle size={12} className="mr-1" />{t('profile.rejected2', '거부')}</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoadingEarnings) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={24} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <Wallet className="text-primary" size={20} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('profile.balance', '잔액')}</p>
              <p className="text-xl font-bold" data-testid="text-balance">{(earnings?.balance || 0).toLocaleString()}{t('common.won', '원')}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center shrink-0">
              <Gift className="text-yellow-500" size={20} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('profile.totalTipRevenue', '총 후원 수익')}</p>
              <p className="text-xl font-bold" data-testid="text-total-tips">{(earnings?.totalTips || 0).toLocaleString()}{t('common.won', '원')}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
              <TrendingUp className="text-green-500" size={20} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('profile.totalSalesRevenue', '총 판매 수익')}</p>
              <p className="text-xl font-bold" data-testid="text-total-sales">{(earnings?.totalSales || 0).toLocaleString()}{t('common.won', '원')}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Banknote size={18} className="text-primary" /> {t('profile.withdrawal', '출금')}
          </h3>
          <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-withdraw-open">
                <ArrowDownToLine size={14} className="mr-1.5" /> {t('profile.requestWithdrawal', '출금 요청')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('profile.requestWithdrawal', '출금 요청')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="text-sm text-muted-foreground">
                  {t('profile.currentBalance', '현재 잔액')}: <span className="font-bold text-foreground">{(earnings?.balance || 0).toLocaleString()}{t('common.won', '원')}</span>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('profile.withdrawAmount', '출금 금액 (원)')}</label>
                  <Input
                    type="number"
                    placeholder={t('profile.minAmount', '최소 1,000원')}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    data-testid="input-withdraw-amount"
                  />
                  {Number(withdrawAmount) > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground space-y-1">
                      <p>{t('profile.feeLabel', '수수료 (15%)')}: <span className="text-red-400">-{fee.toLocaleString()}{t('common.won', '원')}</span></p>
                      <p>{t('profile.vatLabel', '부가세 (10%)')}: <span className="text-red-400">-{vat.toLocaleString()}{t('common.won', '원')}</span></p>
                      <p>{t('profile.totalDeduction', '총 공제액')}: <span className="text-red-400">-{totalDeduction.toLocaleString()}{t('common.won', '원')}</span></p>
                      <p>{t('profile.netAmount', '실수령액')}: <span className="font-bold text-foreground">{netAmount.toLocaleString()}{t('common.won', '원')}</span></p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('profile.bankName', '은행명')}</label>
                  <Input
                    placeholder={t('profile.bankNamePlaceholder', '예: 국민은행')}
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    data-testid="input-bank-name"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('profile.accountNumber', '계좌번호')}</label>
                  <Input
                    placeholder={t('profile.accountNumberPlaceholder', '계좌번호 입력')}
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    data-testid="input-account-number"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('profile.accountHolder', '예금주')}</label>
                  <Input
                    placeholder={t('profile.accountHolderPlaceholder', '예금주명 입력')}
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    data-testid="input-account-holder"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setWithdrawOpen(false)}>{t('profile.cancel', '취소')}</Button>
                <Button onClick={handleWithdraw} disabled={withdrawMutation.isPending} data-testid="button-withdraw-submit">
                  {withdrawMutation.isPending ? <Loader2 className="animate-spin mr-1.5" size={14} /> : <ArrowDownToLine size={14} className="mr-1.5" />}
                  {t('profile.requestWithdrawal', '출금 요청')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoadingWithdrawals ? (
          <div className="flex justify-center py-4"><Loader2 className="animate-spin text-primary" size={20} /></div>
        ) : (!withdrawals || withdrawals.length === 0) ? (
          <div className="text-center py-6 text-muted-foreground">
            <Banknote className="mx-auto mb-2 opacity-50" size={28} />
            <p className="text-sm">{t('profile.noWithdrawals', '출금 내역이 없습니다')}</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {withdrawals.map((w: any) => (
              <div key={w.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30" data-testid={`withdrawal-${w.id}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {w.amount?.toLocaleString()}{t('common.won', '원')} <span className="text-muted-foreground text-xs">({t('profile.fee', '수수료')} {w.fee?.toLocaleString()}{t('common.won', '원')})</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {w.bankName} {w.accountNumber} · {w.createdAt ? new Date(w.createdAt).toLocaleDateString("ko-KR") : ""}
                  </p>
                  {w.adminNote && <p className="text-xs text-muted-foreground mt-1">{t('profile.adminNote', '관리자 메모')}: {w.adminNote}</p>}
                </div>
                <div className="shrink-0">{statusLabel(w.status)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Gift size={18} className="text-yellow-500" /> {t('profile.tipsReceived', '받은 후원')}
          </h3>
          {isLoadingTips ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={20} /></div>
          ) : (!tipsReceived || tipsReceived.length === 0) ? (
            <div className="text-center py-8 text-muted-foreground">
              <Gift className="mx-auto mb-2 opacity-50" size={32} />
              <p className="text-sm">{t('profile.noTipsReceived', '아직 받은 후원이 없습니다')}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {tipsReceived.map((tip: any) => (
                <Card key={tip.id} className="p-3" data-testid={`card-tip-${tip.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarImage src={tip.fromUser?.profileImageUrl} />
                        <AvatarFallback className="text-xs">{tip.fromUser?.firstName?.[0] || "U"}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{tip.fromUser?.firstName || t('profile.anonymous', '익명')}</p>
                        {tip.message && <p className="text-xs text-muted-foreground truncate">"{tip.message}"</p>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-yellow-500">+{tip.amount?.toLocaleString()}{t('common.won', '원')}</p>
                      <p className="text-xs text-muted-foreground">{tip.createdAt ? new Date(tip.createdAt).toLocaleDateString("ko-KR") : ""}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Download size={18} className="text-green-400" /> {t('profile.salesHistory', '판매 내역')}
          </h3>
          {isLoadingSales ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={20} /></div>
          ) : (!sales || sales.length === 0) ? (
            <div className="text-center py-8 text-muted-foreground">
              <Download className="mx-auto mb-2 opacity-50" size={32} />
              <p className="text-sm">{t('profile.noSales', '아직 판매 내역이 없습니다')}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {sales.map((sale: any) => (
                <Card key={sale.id} className="p-3" data-testid={`card-sale-${sale.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{sale.music?.title || t('profile.deletedMusic', '삭제된 음원')}</p>
                      <p className="text-xs text-muted-foreground truncate">{t('profile.buyer', '구매자')}: {sale.buyer?.firstName || t('profile.unknown', '알 수 없음')}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-green-400">+{sale.amount?.toLocaleString()}{t('common.won', '원')}</p>
                      <p className="text-xs text-muted-foreground">{sale.createdAt ? new Date(sale.createdAt).toLocaleDateString("ko-KR") : ""}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatStreamingTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export default function Profile() {
  const { t } = useTranslation();
  const [, params] = useRoute("/profile/:id");
  const userId = params?.id;
  const { data, isLoading } = useUserProfile(userId || "");
  const { user: currentUser } = useAuth();
  const { mutate: followUser } = useFollowUser();
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followingOpen, setFollowingOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editProfileImageUrl, setEditProfileImageUrl] = useState("");
  const [profileImageUploading, setProfileImageUploading] = useState(false);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { playMusic, setPlaylist } = usePlayerStore();
  const updateProfileMutation = useMutation({
    mutationFn: async (body: { firstName: string; lastName: string; profileImageUrl: string }) => {
      const res = await fetch(`/api/users/${userId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "프로필 수정 실패");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile", userId] });
      setProfileEditOpen(false);
      toast({ title: t("profile.editProfileSuccess", "프로필이 수정되었습니다") });
    },
    onError: (err: Error) => {
      toast({ title: t("profile.editProfileFailed", "프로필 수정 실패"), description: err.message, variant: "destructive" });
    },
  });

  const { data: streamingStats } = useQuery<{ 
    totalSeconds: number; 
    totalPlays: number;
    tracks: Array<{ musicId: number; title: string; artist: string; image: string; totalSeconds: number; playCount: number }>;
  }>({
    queryKey: ["/api/streaming-stats", userId],
    queryFn: async () => {
      const res = await fetch(`/api/streaming-stats/${userId}`, { credentials: "include" });
      if (!res.ok) return { totalSeconds: 0, totalPlays: 0, tracks: [] };
      return res.json();
    },
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  if (!data) return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <div className="text-center py-20 text-muted-foreground">{t('profile.notFound', '프로필을 찾을 수 없습니다.')}</div>
    </div>
  );

  const { user, uploadedMusic, likedMusic, followerCount, followingCount, playlists: userPlaylists, posts: userPosts, followers, following, isFollowing } = data;
  const isOwnProfile = !!currentUser && String(currentUser.id) === String(user.id);


  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
      
        <div className="relative">
        <div className="h-64 relative overflow-hidden">
          <img src={profileMusicBg} alt={t('profile.backgroundAlt', '프로필 배경')} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        </div>
        
        <div className="container px-4">
          <div className="relative -mt-20 mb-6 flex flex-col md:flex-row items-end gap-6">
            <Avatar className="w-32 h-32 border-4 border-background shadow-xl">
              <AvatarImage src={user.profileImageUrl} />
              <AvatarFallback className="text-4xl">{user.firstName?.[0] || "U"}</AvatarFallback>
            </Avatar>
            
            <div className="flex-1 pb-2">
              <h1 className="text-3xl font-display font-bold flex items-center gap-2 flex-wrap" data-testid="text-profile-name">
                {user.firstName || t('profile.user', '사용자')}{user.lastName ? ` ${user.lastName}` : ""}
                {((user as any).subscriptionTier === "pro" || (user as any).subscriptionTier === "premium") && (
                  <Badge variant="default" className={`no-default-hover-elevate no-default-active-elevate ${(user as any).subscriptionTier === "premium" ? "bg-yellow-600/20 text-yellow-400 border-yellow-500/30" : "bg-primary/20 text-primary border-primary/30"}`}>
                    {(user as any).subscriptionTier === "premium" ? <><Crown size={12} className="mr-1" /> Premium</> : <>Pro</>}
                  </Badge>
                )}
                {(user as any).donationBadge && (
                  <DonationBadge badge={(user as any).donationBadge} />
                )}
              </h1>
              <p className="text-muted-foreground">{user.email}</p>
            </div>

            <div className="pb-2 flex gap-3 flex-wrap">
              {!isOwnProfile && currentUser && (
                <>
                  <Button 
                    variant={isFollowing ? "secondary" : "default"}
                    className="gap-2" 
                    onClick={() => followUser(user.id)}
                    data-testid="button-follow"
                  >
                    {isFollowing ? <><UserCheck size={18} /> {t('profile.following', '팔로잉')}</> : <><UserPlus size={18} /> {t('profile.follow', '팔로우')}</>}
                  </Button>
                  <Link href={`/messages/${user.id}`}>
                    <Button variant="outline" className="gap-2 border-white/10" data-testid="button-send-dm">
                      <MessageSquare size={18} /> {t('profile.message', '메시지')}
                    </Button>
                  </Link>
                </>
              )}
              {isOwnProfile && (
                <>
                  <Button
                    variant="outline"
                    className="gap-2 border-white/10"
                    data-testid="button-edit-profile"
                    onClick={() => {
                      setEditFirstName(user.firstName || "");
                      setEditLastName(user.lastName || "");
                      setEditProfileImageUrl(user.profileImageUrl || "");
                      setProfileEditOpen(true);
                    }}
                  >
                    <Pencil size={18} /> {t('profile.editProfile', '프로필 수정')}
                  </Button>
                  <Link href="/upload">
                    <Button variant="outline" className="gap-2 border-white/10" data-testid="button-upload-music">
                      <UploadIcon size={18} /> {t('profile.uploadMusic', '음악 업로드')}
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>

          {isOwnProfile && (
            <Dialog open={profileEditOpen} onOpenChange={setProfileEditOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{t('profile.editProfile', '프로필 수정')}</DialogTitle>
                  <DialogDescription>{t('profile.editProfileDesc', '이름과 프로필 이미지를 수정할 수 있습니다.')}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">{t('profile.firstName', '이름')}</label>
                    <Input
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      placeholder={t('profile.firstNamePlaceholder', '이름')}
                      data-testid="input-edit-first-name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">{t('profile.lastName', '성')}</label>
                    <Input
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      placeholder={t('profile.lastNamePlaceholder', '성')}
                      data-testid="input-edit-last-name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">{t('profile.profileImage', '프로필 이미지')}</label>
                    <div className="flex items-center gap-4">
                      <Avatar className="h-16 w-16 shrink-0">
                        <AvatarImage src={editProfileImageUrl ? (editProfileImageUrl.startsWith("http") ? editProfileImageUrl : `${window.location.origin}${editProfileImageUrl}`) : undefined} />
                        <AvatarFallback>{editFirstName?.[0] || editLastName?.[0] || "?"}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-2 flex-1 min-w-0">
                        <input
                          ref={profileImageInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          data-testid="input-edit-profile-image"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setProfileImageUploading(true);
                            try {
                              const formData = new FormData();
                              formData.append("file", file);
                              const res = await fetch("/api/uploads/local", { method: "POST", body: formData, credentials: "include" });
                              if (!res.ok) {
                                const err = await res.json().catch(() => ({}));
                                throw new Error(err.error || "업로드 실패");
                              }
                              const data = await res.json();
                              if (data.objectPath) setEditProfileImageUrl(data.objectPath);
                            } catch (err) {
                              toast({ title: t("profile.profileImageUploadFailed", "이미지 업로드 실패"), description: err instanceof Error ? err.message : "", variant: "destructive" });
                            } finally {
                              setProfileImageUploading(false);
                              e.target.value = "";
                            }
                          }}
                        />
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={profileImageUploading}
                            onClick={() => profileImageInputRef.current?.click()}
                            data-testid="button-upload-profile-image"
                          >
                            {profileImageUploading ? <Loader2 size={14} className="animate-spin" /> : <UploadIcon size={14} />}
                            {profileImageUploading ? t('profile.uploading', '업로드 중...') : t('profile.selectImage', '이미지 선택')}
                          </Button>
                          {editProfileImageUrl && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground"
                              onClick={() => setEditProfileImageUrl("")}
                              data-testid="button-remove-profile-image"
                            >
                              {t('profile.removeImage', '이미지 제거')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setProfileEditOpen(false)}>{t('profile.cancel', '취소')}</Button>
                  <Button
                    data-testid="button-save-profile"
                    disabled={updateProfileMutation.isPending}
                    onClick={() => updateProfileMutation.mutate({
                      firstName: editFirstName.trim(),
                      lastName: editLastName.trim(),
                      profileImageUrl: editProfileImageUrl.trim(),
                    })}
                  >
                    {updateProfileMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                    {t('profile.save', '저장')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <FollowListDialog title={t('profile.followers', '팔로워')} users={followers || []} open={followersOpen} onOpenChange={setFollowersOpen} />
          <FollowListDialog title={t('profile.followingLabel', '팔로잉')} users={following || []} open={followingOpen} onOpenChange={setFollowingOpen} />

          <Tabs defaultValue="uploaded" className="w-full">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mb-6 w-full">
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1 shrink-0">
                <StatItem label={t('profile.uploads', '업로드')} value={uploadedMusic?.length || 0} />
                <StatItem label={t('profile.likes', '좋아요')} value={likedMusic?.length || 0} />
                <StatItem label={t('profile.followers', '팔로워')} value={followerCount || 0} onClick={() => setFollowersOpen(true)} />
                <StatItem label={t('profile.followingLabel', '팔로잉')} value={followingCount || 0} onClick={() => setFollowingOpen(true)} />
                <StatItem label={t('profile.posts', '게시글')} value={userPosts?.length || 0} />
              </div>
              <span className="hidden sm:inline-block h-6 w-px shrink-0 bg-border" aria-hidden />
              <TabsList className="bg-secondary/50 p-1 flex-wrap h-auto gap-1 flex-1 min-w-0 justify-start w-full sm:w-auto">
                <TabsTrigger value="uploaded" className="px-3 sm:px-4 gap-2 text-xs sm:text-sm" data-testid="tab-uploaded">
                  <UploadIcon size={14} />
                  {t('profile.myMusic', '내 음악')} ({uploadedMusic?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="playlists" className="px-3 sm:px-4 gap-2 text-xs sm:text-sm" data-testid="tab-playlists">
                  <ListMusic size={14} />
                  {t('profile.playlists', '플레이리스트')} ({userPlaylists?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="liked" className="px-3 sm:px-4 gap-2 text-xs sm:text-sm" data-testid="tab-liked">
                  <Heart size={14} />
                  {t('profile.likes', '좋아요')} ({likedMusic?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="posts" className="px-3 sm:px-4 gap-2 text-xs sm:text-sm" data-testid="tab-posts">
                  <MessageSquare size={14} />
                  {t('profile.posts', '게시글')} ({userPosts?.length || 0})
                </TabsTrigger>
                {isOwnProfile && (
                  <TabsTrigger value="notifications" className="px-3 sm:px-4 gap-2 text-xs sm:text-sm" data-testid="tab-notifications">
                    <Bell size={14} />
                    {t('profile.notifications', '알림')}
                  </TabsTrigger>
                )}
                {isOwnProfile && (
                  <TabsTrigger value="earnings" className="px-3 sm:px-4 gap-2 text-xs sm:text-sm" data-testid="tab-earnings">
                    <Wallet size={14} />
                    {t('profile.earnings', '수익')}
                  </TabsTrigger>
                )}
                {isOwnProfile && (
                  <TabsTrigger value="reports" className="px-3 sm:px-4 gap-2 text-xs sm:text-sm" data-testid="tab-reports">
                    <Flag size={14} />
                    {t('profile.myReports', '내 신고')}
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {(uploadedMusic?.length || 0) > 0 && (
              <div className="mb-8">
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center shrink-0">
                      <Clock className="text-primary" size={16} />
                    </div>
                    <h3 className="font-semibold text-sm">{t('profile.streamingStatus', '내 음원 스트리밍 현황')}</h3>
                  </div>
                  {(streamingStats?.tracks || []).length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                      {streamingStats!.tracks.map((track) => (
                        <div key={track.musicId} className="flex items-center gap-3 p-2 rounded-md bg-secondary/30" data-testid={`streaming-track-${track.musicId}`}>
                          <img
                            src={track.image || `https://picsum.photos/seed/${track.musicId}/40/40`}
                            alt={track.title}
                            className="w-9 h-9 rounded object-cover shrink-0"
                            data-testid={`img-track-${track.musicId}`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" data-testid={`text-track-title-${track.musicId}`}>{track.title}</p>
                            <p className="text-xs text-muted-foreground truncate" data-testid={`text-track-artist-${track.musicId}`}>{track.artist}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-mono font-medium" data-testid={`text-track-time-${track.musicId}`}>
                              {formatStreamingTime(track.totalSeconds)}
                            </p>
                            <p className="text-xs text-muted-foreground">{track.playCount}{t('profile.playsUnit', '회 재생')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div>
                      <p className="text-xs text-muted-foreground">{t('profile.totalStreamingTime', '총 스트리밍 시간')}</p>
                      <p className="text-lg font-bold font-mono" data-testid="text-streaming-time">
                        {formatStreamingTime(streamingStats?.totalSeconds || 0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{t('profile.totalPlayCount', '총 재생 횟수')}</p>
                      <p className="text-lg font-bold" data-testid="text-streaming-plays">
                        {(streamingStats?.totalPlays || 0).toLocaleString()}{t('profile.timesUnit', '회')}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            )}
            
            <TabsContent value="uploaded">
              {(uploadedMusic?.length ?? 0) > 0 && (
                <div className="mb-4">
                  <Button
                    variant="outline"
                    className="gap-2 border-white/10"
                    onClick={() => {
                      const ids = uploadedMusic!.map((m: any) => m.id);
                      setPlaylist(ids);
                      playMusic(ids[0]);
                    }}
                    data-testid="button-play-all-uploads"
                  >
                    <Music size={16} /> {t('profile.playAll', '전체 재생')}
                  </Button>
                </div>
              )}
              <div className="music-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {uploadedMusic?.map(music => (
                  <MusicCard key={music.id} music={music} />
                ))}
              </div>
              {(!uploadedMusic || uploadedMusic.length === 0) && (
                <div className="text-center py-20 text-muted-foreground" data-testid="text-no-uploads">
                  <Music className="mx-auto mb-3 opacity-50" size={48} />
                  <p>{t('profile.noUploads', '아직 업로드한 음악이 없습니다')}</p>
                  {isOwnProfile && (
                    <div className="mt-4">
                      <Link href="/upload">
                        <Button variant="outline" className="border-white/10" data-testid="button-go-upload">{t('profile.goUpload', '음악 업로드하기')}</Button>
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="playlists">
              <PlaylistSection profilePlaylists={userPlaylists || []} isOwnProfile={isOwnProfile} userId={userId || ""} />
            </TabsContent>
            
            <TabsContent value="liked">
              <div className="music-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {likedMusic?.map(music => (
                  <MusicCard key={music.id} music={music} />
                ))}
              </div>
              {(!likedMusic || likedMusic.length === 0) && (
                <div className="text-center py-20 text-muted-foreground" data-testid="text-no-likes">
                  <Heart className="mx-auto mb-3 opacity-50" size={48} />
                  <p>{t('profile.noLikes', '아직 좋아요한 음악이 없습니다')}</p>
                  <div className="mt-4">
                    <Link href="/music">
                      <Button variant="outline" className="border-white/10" data-testid="button-browse-music">{t('profile.browseMusic', '음악 둘러보기')}</Button>
                    </Link>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="posts">
              <PostsSection userPosts={userPosts || []} />
            </TabsContent>

            {isOwnProfile && (
              <TabsContent value="notifications">
                <NotificationsSection />
              </TabsContent>
            )}

            {isOwnProfile && (
              <TabsContent value="earnings">
                <EarningsSection />
              </TabsContent>
            )}

            {isOwnProfile && (
              <TabsContent value="reports">
                <MyReportsSection />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
      <Footer />
      </div>
    </PageTransition>
  );
}
