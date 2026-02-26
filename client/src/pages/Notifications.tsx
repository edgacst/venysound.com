import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useNotifications, useMarkNotificationRead } from "@/hooks/use-user-profile";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, CheckCheck, Loader2, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from 'react-i18next';

function getNotificationMessage(notif: any, t: (key: string, opts?: any) => string): string {
  const payload = notif.payload as Record<string, unknown> | null | undefined;
  const type = notif.type as string;
  if (!payload || !type) return notif.message || "";

  const params: Record<string, string | number> = { ...payload } as Record<string, string | number>;
  if (type === "badge" && payload.badgeKey) {
    params.badgeName = t(`donationBadge.${payload.badgeKey}`, String(payload.badgeKey));
  }
  if (payload.amount !== undefined) {
    params.amount = Number(payload.amount).toLocaleString();
  }
  if (payload.price !== undefined) {
    params.price = Number(payload.price).toLocaleString();
  }
  if (type === "tip" && payload.tipMessage) {
    return t("notification.tipWithMessage", params);
  }
  const key = `notification.${type}`;
  const translated = t(key, params);
  return translated !== key ? translated : notif.message || "";
}

export default function Notifications() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: notifications, isLoading } = useNotifications();
  const { mutate: markRead } = useMarkNotificationRead();

  const markAllRead = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const deleteNotification = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/notifications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="container px-4 py-20 text-center text-muted-foreground">
          {t('notificationsPage.loginRequired', '로그인이 필요합니다.')}
        </div>
        <Footer />
      </div>
    );
  }

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="container max-w-2xl px-4 py-8">
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Bell className="text-primary" size={24} />
            <h1 className="text-2xl font-display font-bold" data-testid="text-notifications-title">{t('notificationsPage.title', '알림')}</h1>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs" data-testid="badge-unread-count">{unreadCount}</Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-white/10"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck size={14} />
              {t('notificationsPage.markAllRead', '모두 읽음')}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-4" data-testid="text-notifications-limit-notice">
          {t('notificationsPage.limitNotice', '알림 목록은 최근 20개까지 표시됩니다.')}
        </p>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-primary" size={40} />
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground bg-secondary/30 rounded-lg" data-testid="text-no-notifications">
            {t('notificationsPage.empty', '알림이 없습니다.')}
          </div>
        ) : (
          <div className="space-y-1">
            {notifications.map((notif: any) => (
              <Card
                key={notif.id}
                className={`px-3 py-2 cursor-pointer transition-colors ${notif.isRead ? 'opacity-60' : 'border-primary/20'}`}
                onClick={() => {
                  if (!notif.isRead) markRead(notif.id);
                  if (notif.url) setLocation(notif.url);
                }}
                data-testid={`notification-${notif.id}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${notif.isRead ? 'bg-muted' : 'bg-primary'}`} />
                  <p className="flex-1 min-w-0 text-xs truncate" data-testid={`text-notification-message-${notif.id}`}>
                    {getNotificationMessage(notif, t)}
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                    {notif.createdAt
                      ? new Intl.DateTimeFormat(i18n.language === "ko" ? "ko-KR" : i18n.language === "ja" ? "ja-JP" : i18n.language === "zh" ? "zh-CN" : "en-US", {
                          timeZone: "Asia/Seoul",
                          dateStyle: "medium",
                          timeStyle: "medium",
                          hour12: i18n.language === "ko",
                        }).format(new Date(notif.createdAt))
                      : ""}
                  </span>
                  {!notif.isRead && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={(e) => { e.stopPropagation(); markRead(notif.id); }}
                      data-testid={`button-mark-read-${notif.id}`}
                    >
                      <Check size={12} />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); deleteNotification.mutate(notif.id); }}
                    disabled={deleteNotification.isPending}
                    data-testid={`button-delete-notification-${notif.id}`}
                    title={t('notificationsPage.delete', '삭제')}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Footer />
      </div>
    </PageTransition>
  );
}
