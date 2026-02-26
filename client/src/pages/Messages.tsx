import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PageTransition } from "@/components/PageTransition";
import { MessageSquare, Send, ArrowLeft, Search, Loader2, Settings2, Ban, Flag, MoreVertical } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Link, useLocation, useParams } from "wouter";
import { useTranslation } from 'react-i18next';
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePlayerStore } from "@/components/AudioPlayer";

const PLAYER_BAR_HEIGHT_REM = 5;   // 플레이어 바 높이 (대략 80px)
const INPUT_BAR_HEIGHT_REM = 3.5;  // 입력창 높이

export default function Messages() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const activeMusicId = usePlayerStore((s) => s.activeMusicId);
  const playerVisible = activeMusicId !== null;
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const params = useParams<{ userId?: string }>();
  const [selectedConvoId, setSelectedConvoId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [initialConvoCreated, setInitialConvoCreated] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportTargetUserId, setReportTargetUserId] = useState<string | null>(null);
  const [reportTargetConvoId, setReportTargetConvoId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const dateLocale = i18n.language === 'ko' ? ko : undefined;

  const { data: messageSettings, refetch: refetchMessageSettings } = useQuery<{ allowDirectMessages: boolean }>({
    queryKey: ["/api/users/me/message-settings"],
    enabled: !!user,
  });

  const updateMessageSettings = useMutation({
    mutationFn: async (allowDirectMessages: boolean) => {
      await apiRequest("PATCH", "/api/users/me/message-settings", { allowDirectMessages });
    },
    onSuccess: (_, allowDirectMessages) => {
      queryClient.setQueryData(["/api/users/me/message-settings"], { allowDirectMessages });
      toast({ title: t('messages.settingsSaved', '설정이 저장되었습니다') });
    },
  });

  const { data: conversations = [], isLoading: convosLoading } = useQuery<any[]>({
    queryKey: ["/api/conversations"],
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<any[]>({
    queryKey: ["/api/conversations", selectedConvoId, "messages"],
    queryFn: async () => {
      if (!selectedConvoId) return [];
      const res = await fetch(`/api/conversations/${selectedConvoId}/messages`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!selectedConvoId && !!user,
    refetchInterval: 5000,
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedConvoId) throw new Error(t('messages.noConversationSelected', '대화가 선택되지 않았습니다'));
      const res = await apiRequest("POST", `/api/conversations/${selectedConvoId}/messages`, { content });
      return res.json();
    },
    onSuccess: (data: any) => {
      setMessageText("");
      const cid = selectedConvoId;
      if (cid && data?.id != null && user) {
        const newMsg = {
          id: data.id,
          conversation_id: data.conversation_id ?? data.conversationId,
          sender_id: data.sender_id ?? data.senderId ?? user.id,
          content: data.content ?? "",
          created_at: data.created_at ?? data.createdAt,
          sender_first_name: (user as any).firstName ?? (user as any).first_name ?? "",
          sender_last_name: (user as any).lastName ?? (user as any).last_name ?? "",
          sender_image: (user as any).profileImageUrl ?? (user as any).profile_image_url ?? null,
        };
        queryClient.setQueryData(
          ["/api/conversations", cid, "messages"],
          (old: any[] | undefined) => [...(old ?? []), newMsg]
        );
      }
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConvoId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
      queryClient.refetchQueries({ queryKey: ["/api/conversations", selectedConvoId, "messages"] });
    },
    onError: (err: any) => {
      let desc = err?.message || t('messages.sendFailed', '메시지 전송에 실패했습니다');
      try {
        const match = typeof desc === "string" && desc.match(/^\d+:\s*(\{.+\})$/);
        if (match) {
          const obj = JSON.parse(match[1]);
          if (obj.message) desc = obj.message;
        }
      } catch {}
      toast({ title: t('messages.sendFailed', '전송 실패'), description: desc, variant: "destructive" });
    },
  });

  const blockUser = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("POST", `/api/block/${userId}`);
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setSelectedConvoId(null);
      toast({ title: t('messages.userBlocked', '사용자를 차단했습니다') });
    },
    onError: (err: any) => {
      toast({ title: t('messages.blockFailed', '차단 실패'), description: err?.message, variant: "destructive" });
    },
  });

  const reportUser = useMutation({
    mutationFn: async ({ reportedUserId, reason, conversationId }: { reportedUserId: string; reason: string; conversationId?: number }) => {
      await apiRequest("POST", "/api/report-user", { reportedUserId, reason, conversationId });
    },
    onSuccess: () => {
      setReportOpen(false);
      setReportReason("");
      setReportTargetUserId(null);
      setReportTargetConvoId(null);
      toast({ title: t('messages.reportSubmitted', '신고가 접수되었습니다') });
    },
    onError: (err: any) => {
      toast({ title: t('messages.reportFailed', '신고 실패'), description: err?.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!user || !params.userId || initialConvoCreated || params.userId === user.id) return;
    const existingConvo = conversations.find((c: any) => c.other_user_id === params.userId);
    if (existingConvo) {
      setSelectedConvoId(existingConvo.id);
      setInitialConvoCreated(true);
      return;
    }
    if (!convosLoading) {
      apiRequest("POST", "/api/conversations", { otherUserId: params.userId })
        .then(r => {
          if (r.status === 403) return r.json().then((d: any) => { throw new Error(d.message || "메시지를 보낼 수 없습니다"); });
          return r.json();
        })
        .then(conv => {
          setInitialConvoCreated(true);
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          setSelectedConvoId(conv.id);
        })
        .catch((err) => {
          toast({ title: t('messages.cannotStartConversation', '대화를 시작할 수 없습니다'), description: err?.message || "", variant: "destructive" });
        });
    }
  }, [user, params.userId, conversations, convosLoading, initialConvoCreated, toast, t]);

  useEffect(() => {
    if (!user) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", userId: user.id }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "new_message" && data.conversationId != null) {
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
          const cid = data.conversationId;
          const payload = data.message;
          if (payload && typeof cid === "number") {
            const newMsg = {
              id: payload.id,
              conversation_id: cid,
              sender_id: payload.sender_id ?? payload.senderId,
              content: payload.content ?? "",
              created_at: payload.created_at ?? payload.createdAt,
              sender_first_name: payload.sender_first_name ?? "",
              sender_last_name: payload.sender_last_name ?? "",
              sender_image: payload.sender_image ?? null,
            };
            queryClient.setQueryData(
              ["/api/conversations", cid, "messages"],
              (old: any[] | undefined) => {
                const list = old ?? [];
                if (list.some((m: any) => String(m.id) === String(newMsg.id))) return list;
                return [...list, newMsg];
              }
            );
          }
          queryClient.invalidateQueries({ queryKey: ["/api/conversations", cid, "messages"] });
          queryClient.refetchQueries({ queryKey: ["/api/conversations", cid, "messages"] });
        }
      } catch {}
    };

    return () => {
      ws.close();
    };
  }, [user, selectedConvoId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!messageText.trim() || !selectedConvoId) return;
    sendMessage.mutate(messageText.trim());
  }, [messageText, selectedConvoId, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const selectedConvo = conversations.find((c: any) => c.id === selectedConvoId);
  // 첫 대화 생성 직후에는 conversations 목록이 아직 갱신되지 않아 selectedConvo가 없을 수 있음 → selectedConvoId만 있으면 채팅+입력 표시
  const otherUserId = selectedConvo?.other_user_id ?? params.userId ?? null;

  const filteredConvos = conversations.filter((c: any) => {
    if (!searchQuery) return true;
    const name = `${c.other_first_name || ""} ${c.other_last_name || ""}`.toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <PageTransition>
          <div className="max-w-4xl mx-auto px-4 py-16 text-center">
            <MessageSquare className="mx-auto mb-4 text-muted-foreground" size={48} />
            <h2 className="text-xl font-bold mb-2" data-testid="text-login-required">{t('messages.loginRequired', '로그인이 필요합니다')}</h2>
            <p className="text-muted-foreground mb-4">{t('messages.loginRequiredDesc', '메시지를 보내려면 먼저 로그인해주세요.')}</p>
            <Link href="/login">
              <Button data-testid="button-login">{t('messages.login', '로그인')}</Button>
            </Link>
          </div>
        </PageTransition>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <PageTransition>
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold mb-4" data-testid="text-messages-title">{t('messages.title', '메시지')}</h1>

          <Card className="flex flex-col md:flex-row overflow-hidden min-h-0 h-[calc(100vh-11rem)]">
            <div className={`w-full md:w-80 border-r border-border flex flex-col min-h-0 ${selectedConvoId ? "hidden md:flex" : "flex"}`}>
              <div className="p-3 border-b border-border space-y-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Settings2 size={14} /> {t('messages.receiveNewMessages', '새 메시지 받기')}
                  </span>
                  <Switch
                    checked={messageSettings?.allowDirectMessages ?? true}
                    onCheckedChange={(checked) => updateMessageSettings.mutate(checked)}
                    disabled={updateMessageSettings.isPending}
                    data-testid="switch-allow-messages"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">{t('messages.receiveNewMessagesHint', '끄면 모르는 사람이 대화를 걸 수 없습니다')}</p>
                <p className="text-[10px] text-muted-foreground">{t('messages.blockReportHint', '차단·신고: 대화를 연 뒤 상단 ⋮ 메뉴')}</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                  <Input
                    placeholder={t('messages.searchConversations', '대화 검색...')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-conversations"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {convosLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="animate-spin text-muted-foreground" size={24} />
                  </div>
                ) : filteredConvos.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-conversations">
                    <MessageSquare className="mx-auto mb-2" size={32} />
                    <p>{t('messages.noConversations', '대화가 없습니다')}</p>
                    <p className="text-xs mt-1">{t('messages.noConversationsHint', '다른 사용자의 프로필에서 메시지를 보내보세요')}</p>
                  </div>
                ) : (
                  filteredConvos.map((convo: any) => (
                    <div
                      key={convo.id}
                      className={`flex items-center gap-3 p-3 cursor-pointer hover-elevate ${selectedConvoId === convo.id ? "bg-accent/50" : ""}`}
                      onClick={() => setSelectedConvoId(convo.id)}
                      data-testid={`conversation-item-${convo.id}`}
                    >
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarImage src={convo.other_profile_image} />
                        <AvatarFallback>{(convo.other_first_name || "?")[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium text-sm truncate" data-testid={`text-convo-name-${convo.id}`}>
                            {convo.other_first_name} {convo.other_last_name}
                          </span>
                          {convo.last_msg_time && (
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {formatDistanceToNow(new Date(convo.last_msg_time), { addSuffix: true, locale: dateLocale })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs text-muted-foreground truncate">
                            {convo.last_message || t('messages.newConversation', '새 대화')}
                          </p>
                          {convo.unread_count > 0 && (
                            <Badge variant="default" className="text-xs min-w-5 h-5 flex items-center justify-center" data-testid={`badge-unread-${convo.id}`}>
                              {convo.unread_count}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${!selectedConvoId ? "hidden md:flex" : "flex"}`}>
              {selectedConvoId ? (
                <div className="flex flex-col min-h-0 h-full">
                  <div className="flex items-center gap-2 p-3 border-b border-border shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="md:hidden shrink-0"
                      onClick={() => setSelectedConvoId(null)}
                      data-testid="button-back-to-list"
                    >
                      <ArrowLeft size={20} />
                    </Button>
                    {otherUserId ? (
                      <>
                        <Link href={`/profile/${otherUserId}`}>
                          <Avatar className="h-9 w-9 cursor-pointer shrink-0">
                            <AvatarImage src={selectedConvo?.other_profile_image} />
                            <AvatarFallback>{(selectedConvo?.other_first_name ?? "?")[0]}</AvatarFallback>
                          </Avatar>
                        </Link>
                        <Link href={`/profile/${otherUserId}`} className="flex-1 min-w-0">
                          <span className="font-medium cursor-pointer truncate block" data-testid="text-chat-partner-name">
                            {selectedConvo ? `${selectedConvo.other_first_name ?? ""} ${selectedConvo.other_last_name ?? ""}`.trim() : t('messages.loadingConversation', '대화 로딩 중...')}
                          </span>
                        </Link>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="shrink-0" data-testid="button-chat-menu">
                              <MoreVertical size={18} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                if (confirm(t('messages.confirmBlock', '이 사용자를 차단하시겠습니까? 차단하면 대화가 목록에서 사라집니다.'))) {
                                  blockUser.mutate(otherUserId);
                                }
                              }}
                              data-testid="button-block-user"
                            >
                              <Ban size={14} className="mr-2" /> {t('messages.block', '차단')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setReportTargetUserId(otherUserId);
                                setReportTargetConvoId(selectedConvoId);
                                setReportOpen(true);
                              }}
                              data-testid="button-report-user"
                            >
                              <Flag size={14} className="mr-2" /> {t('messages.report', '신고')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    ) : (
                      <span className="flex-1 font-medium truncate text-muted-foreground" data-testid="text-chat-partner-name">
                        {t('messages.loadingConversation', '대화 로딩 중...')}
                      </span>
                    )}
                  </div>

                  <div
                    className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3"
                    style={{
                      paddingBottom: playerVisible
                        ? `${INPUT_BAR_HEIGHT_REM + PLAYER_BAR_HEIGHT_REM}rem`
                        : `${INPUT_BAR_HEIGHT_REM}rem`,
                    }}
                  >
                    {messagesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="animate-spin text-muted-foreground" size={24} />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-messages">
                        <p>{t('messages.noMessages', '아직 메시지가 없습니다')}</p>
                        <p className="text-xs mt-1">{t('messages.noMessagesHint', '첫 메시지를 보내보세요')}</p>
                      </div>
                    ) : (
                      messages.map((msg: any) => {
                        const senderId = String(msg.sender_id ?? msg.senderId ?? "");
                        const isMine = user?.id ? senderId === String(user.id) : false;
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                            data-testid={`message-${msg.id}`}
                          >
                            <div className={`flex items-end gap-2 max-w-[75%] ${isMine ? "flex-row-reverse" : ""}`}>
                              {!isMine && (
                                <Avatar className="h-7 w-7 flex-shrink-0">
                                  <AvatarImage src={msg.sender_image} />
                                  <AvatarFallback>{(msg.sender_first_name || "?")[0]}</AvatarFallback>
                                </Avatar>
                              )}
                              <div>
                                <div
                                  className={`rounded-2xl px-4 py-2 text-sm ${
                                    isMine
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted"
                                  }`}
                                >
                                  {(msg.content ?? msg.body ?? "").trim() || t('messages.emptyMessage', '(메시지 없음)')}
                                </div>
                                <p className={`text-[10px] text-muted-foreground mt-1 ${isMine ? "text-right" : "text-left"}`}>
                                  {(msg.created_at ?? msg.createdAt) && formatDistanceToNow(new Date(msg.created_at ?? msg.createdAt), { addSuffix: true, locale: dateLocale })}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* 입력창: 화면 하단 고정, 플레이어 바가 있으면 그 위에 배치 (z-40 < 플레이어 z-50) */}
                  <div
                    className="fixed left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur"
                    style={{
                      bottom: playerVisible ? `${PLAYER_BAR_HEIGHT_REM}rem` : 0,
                      paddingTop: "0.75rem",
                      paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
                      paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
                      paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
                    }}
                  >
                    <div className="max-w-6xl mx-auto px-2 sm:px-4 flex items-center gap-2">
                      <Input
                        placeholder={t('messages.inputPlaceholder', '메시지를 입력하세요...')}
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={sendMessage.isPending}
                        data-testid="input-message"
                        className="flex-1 min-w-0 h-10 sm:h-11 text-base"
                      />
                      <Button
                        size="icon"
                        className="h-10 w-10 sm:h-11 sm:w-11 shrink-0"
                        onClick={handleSend}
                        disabled={!messageText.trim() || sendMessage.isPending}
                        data-testid="button-send-message"
                      >
                        {sendMessage.isPending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground" data-testid="text-select-conversation">
                  <div className="text-center">
                    <MessageSquare className="mx-auto mb-3" size={40} />
                    <p className="text-sm">{t('messages.selectConversation', '대화를 선택하세요')}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Dialog open={reportOpen} onOpenChange={setReportOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('messages.reportUser', '사용자 신고')}</DialogTitle>
                <DialogDescription>{t('messages.reportUserDesc', '신고 사유를 입력해 주세요. 검토 후 조치하겠습니다.')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label>{t('messages.reportReason', '사유')}</Label>
                <Textarea
                  placeholder={t('messages.reportReasonPlaceholder', '스팸, 욕설, 괴롭힘 등')}
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  rows={3}
                  data-testid="input-report-reason"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReportOpen(false)}>{t('common.cancel', '취소')}</Button>
                <Button
                  onClick={() => reportTargetUserId && reportReason.trim() && reportUser.mutate({ reportedUserId: reportTargetUserId, reason: reportReason.trim(), conversationId: reportTargetConvoId ?? undefined })}
                  disabled={!reportReason.trim() || reportUser.isPending}
                  data-testid="button-submit-report"
                >
                  {reportUser.isPending ? <Loader2 className="animate-spin size-4" /> : t('messages.submitReport', '신고하기')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </PageTransition>
    </div>
  );
}
