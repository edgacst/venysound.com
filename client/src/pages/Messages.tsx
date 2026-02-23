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
import { MessageSquare, Send, ArrowLeft, Search, Loader2 } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Link, useLocation, useParams } from "wouter";
import { useTranslation } from 'react-i18next';

export default function Messages() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ userId?: string }>();
  const [selectedConvoId, setSelectedConvoId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [initialConvoCreated, setInitialConvoCreated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const dateLocale = i18n.language === 'ko' ? ko : undefined;

  const { data: conversations = [], isLoading: convosLoading } = useQuery<any[]>({
    queryKey: ["/api/conversations"],
    enabled: !!user,
    refetchInterval: 10000,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<any[]>({
    queryKey: ["/api/conversations", selectedConvoId, "messages"],
    queryFn: async () => {
      if (!selectedConvoId) return [];
      const res = await fetch(`/api/conversations/${selectedConvoId}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!selectedConvoId && !!user,
    refetchInterval: 5000,
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/conversations/${selectedConvoId}/messages`, { content });
      return res.json();
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConvoId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
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
        .then(r => r.json())
        .then(conv => {
          setInitialConvoCreated(true);
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          setSelectedConvoId(conv.id);
        })
        .catch(() => {});
    }
  }, [user, params.userId, conversations, convosLoading, initialConvoCreated]);

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
        if (data.type === "new_message") {
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
          if (data.conversationId === selectedConvoId) {
            queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConvoId, "messages"] });
          }
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

          <Card className="flex overflow-hidden" style={{ height: "calc(100vh - 200px)", minHeight: "500px" }}>
            <div className={`w-full md:w-80 border-r border-border flex flex-col ${selectedConvoId ? "hidden md:flex" : "flex"}`}>
              <div className="p-3 border-b border-border">
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

            <div className={`flex-1 flex flex-col ${!selectedConvoId ? "hidden md:flex" : "flex"}`}>
              {selectedConvoId && selectedConvo ? (
                <>
                  <div className="flex items-center gap-3 p-3 border-b border-border">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="md:hidden"
                      onClick={() => setSelectedConvoId(null)}
                      data-testid="button-back-to-list"
                    >
                      <ArrowLeft size={20} />
                    </Button>
                    <Link href={`/profile/${selectedConvo.other_user_id}`}>
                      <Avatar className="h-9 w-9 cursor-pointer">
                        <AvatarImage src={selectedConvo.other_profile_image} />
                        <AvatarFallback>{(selectedConvo.other_first_name || "?")[0]}</AvatarFallback>
                      </Avatar>
                    </Link>
                    <Link href={`/profile/${selectedConvo.other_user_id}`}>
                      <span className="font-medium cursor-pointer" data-testid="text-chat-partner-name">
                        {selectedConvo.other_first_name} {selectedConvo.other_last_name}
                      </span>
                    </Link>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                                  {msg.content}
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

                  <div className="p-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder={t('messages.inputPlaceholder', '메시지를 입력하세요...')}
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={sendMessage.isPending}
                        data-testid="input-message"
                      />
                      <Button
                        size="icon"
                        onClick={handleSend}
                        disabled={!messageText.trim() || sendMessage.isPending}
                        data-testid="button-send-message"
                      >
                        {sendMessage.isPending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                      </Button>
                    </div>
                  </div>
                </>
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
        </div>
      </PageTransition>
    </div>
  );
}
