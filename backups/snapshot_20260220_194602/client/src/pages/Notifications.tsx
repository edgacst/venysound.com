import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useNotifications, useMarkNotificationRead } from "@/hooks/use-user-profile";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, CheckCheck, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from 'react-i18next';

export default function Notifications() {
  const { t } = useTranslation();
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

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />
        <div className="container px-4 py-20 text-center text-muted-foreground">
          {t('notifications.loginRequired', '로그인이 필요합니다.')}
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
            <h1 className="text-2xl font-display font-bold" data-testid="text-notifications-title">{t('notifications.title', '알림')}</h1>
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
              {t('notifications.markAllRead', '모두 읽음')}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-4" data-testid="text-notifications-limit-notice">
          {t('notifications.limitNotice', '알림목록은 20개까지만 보여집니다.')}
        </p>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-primary" size={40} />
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground bg-secondary/30 rounded-lg" data-testid="text-no-notifications">
            {t('notifications.empty', '알림이 없습니다.')}
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notif: any) => (
              <Card
                key={notif.id}
                className={`p-4 cursor-pointer transition-colors ${notif.isRead ? 'opacity-60' : 'border-primary/20'}`}
                onClick={() => {
                  if (!notif.isRead) markRead(notif.id);
                  if (notif.url) setLocation(notif.url);
                }}
                data-testid={`notification-${notif.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${notif.isRead ? 'bg-muted' : 'bg-primary'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm" data-testid={`text-notification-message-${notif.id}`}>{notif.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {notif.createdAt ? new Date(notif.createdAt).toLocaleString("ko-KR") : ""}
                    </p>
                  </div>
                  {!notif.isRead && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); markRead(notif.id); }}
                      data-testid={`button-mark-read-${notif.id}`}
                    >
                      <Check size={14} />
                    </Button>
                  )}
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
