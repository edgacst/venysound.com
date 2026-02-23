import { Navigation } from "@/components/Navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { ArrowLeft, MessageSquare, Loader2, Send, Trash2, Reply, CornerDownRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from 'react-i18next';

export default function PostDetail() {
  const { t, i18n } = useTranslation();
  const [, params] = useRoute("/community/:id");
  const postId = params?.id;
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: number; userName: string } | null>(null);
  const [replyText, setReplyText] = useState("");

  const dateLocale = i18n.language === 'ko' ? ko : undefined;

  const { data: post, isLoading: loadingPost } = useQuery<any>({
    queryKey: ["/api/posts", postId],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${postId}`, { credentials: "include" });
      if (!res.ok) throw new Error(t('postDetail.loadError', '게시글을 불러올 수 없습니다'));
      return res.json();
    },
    enabled: !!postId,
  });

  const { data: comments, isLoading: loadingComments } = useQuery<any[]>({
    queryKey: ["/api/posts", postId, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${postId}/comments`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!postId,
  });

  const createCommentMutation = useMutation({
    mutationFn: async ({ content, parentId }: { content: string; parentId?: number }) => {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content, parentId: parentId || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || t('postDetail.commentFailed', '댓글 작성 실패'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
      setCommentText("");
      setReplyTo(null);
      setReplyText("");
      toast({ title: t('postDetail.commentCreated', '댓글이 작성되었습니다') });
    },
    onError: (error: Error) => {
      toast({ title: t('postDetail.commentFailed', '댓글 작성 실패'), description: error.message, variant: "destructive" });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      await apiRequest("DELETE", `/api/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
      toast({ title: t('postDetail.commentDeleted', '댓글이 삭제되었습니다') });
    },
    onError: () => {
      toast({ title: t('postDetail.commentDeleteFailed', '댓글 삭제 실패'), variant: "destructive" });
    },
  });

  const handleSubmitComment = () => {
    if (!commentText.trim()) {
      toast({ title: t('postDetail.enterContent', '내용을 입력해주세요'), variant: "destructive" });
      return;
    }
    createCommentMutation.mutate({ content: commentText.trim() });
  };

  const handleSubmitReply = () => {
    if (!replyText.trim() || !replyTo) return;
    createCommentMutation.mutate({ content: replyText.trim(), parentId: replyTo.id });
  };

  const topLevelComments = comments?.filter((c: any) => !c.parentId) || [];
  const getReplies = (parentId: number) => comments?.filter((c: any) => c.parentId === parentId) || [];

  if (loadingPost) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container max-w-3xl px-4 py-8 text-center">
          <p className="text-muted-foreground py-20" data-testid="text-post-not-found">{t('postDetail.notFound', '게시글을 찾을 수 없습니다.')}</p>
          <Link href="/community">
            <Button variant="outline" data-testid="button-back-to-community">
              <ArrowLeft size={16} className="mr-2" /> {t('postDetail.backToCommunity', '커뮤니티로 돌아가기')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const renderComment = (comment: any, isReply = false) => {
    const replies = getReplies(comment.id);
    const isOwner = user?.id === comment.userId;

    return (
      <div key={comment.id}>
        <Card className={`p-4 border-white/5 bg-card/50 ${isReply ? "ml-8 mt-2" : ""}`} data-testid={`card-comment-${comment.id}`}>
          <div className="flex gap-3">
            <Avatar className="w-8 h-8 shrink-0">
              <AvatarImage src={comment.user?.profileImageUrl || undefined} />
              <AvatarFallback className="text-xs">{comment.user?.firstName?.[0] || "U"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {isReply && <CornerDownRight size={12} className="text-muted-foreground" />}
                <span className="text-sm font-medium">{comment.user?.firstName || t('postDetail.anonymous', '익명')}</span>
                <span className="text-xs text-muted-foreground">
                  {comment.createdAt ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: dateLocale }) : ""}
                </span>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid={`text-comment-content-${comment.id}`}>
                {comment.content}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {user && !isReply && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-muted-foreground"
                    onClick={() => {
                      setReplyTo({ id: comment.id, userName: comment.user?.firstName || t('postDetail.anonymous', '익명') });
                      setReplyText("");
                    }}
                    data-testid={`button-reply-${comment.id}`}
                  >
                    <Reply size={12} />
                    {t('postDetail.reply', '답글')}
                  </Button>
                )}
                {isOwner && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-red-400"
                    onClick={() => deleteCommentMutation.mutate(comment.id)}
                    disabled={deleteCommentMutation.isPending}
                    data-testid={`button-delete-comment-${comment.id}`}
                  >
                    <Trash2 size={12} />
                    {t('postDetail.delete', '삭제')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>

        {replyTo?.id === comment.id && user && (
          <Card className="ml-8 mt-2 p-3 border-white/5 bg-card/50" data-testid={`card-reply-form-${comment.id}`}>
            <div className="flex gap-2">
              <Avatar className="w-7 h-7 shrink-0">
                <AvatarImage src={user.profileImageUrl || undefined} />
                <AvatarFallback className="text-xs">{user.firstName?.[0] || "U"}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <p className="text-xs text-muted-foreground">
                  <span className="text-primary">{replyTo!.userName}</span>{t('postDetail.replyTo', '님에게 답글')}
                </p>
                <Textarea
                  placeholder={t('postDetail.replyPlaceholder', '답글을 입력하세요...')}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={2}
                  className="bg-secondary/30 border-white/5 text-sm"
                  data-testid={`input-reply-${comment.id}`}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReplyTo(null)}
                    data-testid={`button-cancel-reply-${comment.id}`}
                  >
                    {t('postDetail.cancel', '취소')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSubmitReply}
                    disabled={createCommentMutation.isPending || !replyText.trim()}
                    data-testid={`button-submit-reply-${comment.id}`}
                  >
                    {createCommentMutation.isPending ? (
                      <Loader2 className="animate-spin mr-1" size={12} />
                    ) : (
                      <Send size={12} className="mr-1" />
                    )}
                    {t('postDetail.writeReply', '답글 작성')}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {replies.map((reply: any) => renderComment(reply, true))}
      </div>
    );
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex flex-col pb-24">
        <Navigation />

        <div className="container max-w-3xl px-4 py-8">
        <Link href="/community">
          <Button variant="ghost" size="sm" className="mb-4 gap-2" data-testid="button-back">
            <ArrowLeft size={16} /> {t('postDetail.backToList', '목록으로')}
          </Button>
        </Link>

        <Card className="p-6 border-white/5 bg-card/50" data-testid="card-post-detail">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Avatar>
              <AvatarImage src={post.user?.profileImageUrl || undefined} />
              <AvatarFallback>{post.user?.firstName?.[0] || "U"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {post.category && (
                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">{post.category}</span>
                )}
                <span className="text-sm font-medium">{post.user?.firstName || t('postDetail.anonymous', '익명')}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: dateLocale }) : ""}
              </p>
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-4" data-testid="text-post-title">{post.title}</h1>
          <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed" data-testid="text-post-content">{post.content}</p>
        </Card>

        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" data-testid="text-comments-header">
            <MessageSquare size={18} /> {t('postDetail.comments', '댓글')} {comments?.length ? `(${comments.length})` : ""}
          </h2>

          {user && (
            <Card className="p-4 mb-6 border-white/5 bg-card/50" data-testid="card-comment-form">
              <div className="flex gap-3">
                <Avatar className="shrink-0">
                  <AvatarImage src={user.profileImageUrl || undefined} />
                  <AvatarFallback>{user.firstName?.[0] || "U"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-3">
                  <Textarea
                    placeholder={t('postDetail.commentPlaceholder', '댓글을 입력하세요...')}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    rows={3}
                    className="bg-secondary/30 border-white/5"
                    data-testid="input-comment"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleSubmitComment}
                      disabled={createCommentMutation.isPending || !commentText.trim()}
                      data-testid="button-submit-comment"
                    >
                      {createCommentMutation.isPending ? (
                        <Loader2 className="animate-spin mr-1.5" size={14} />
                      ) : (
                        <Send size={14} className="mr-1.5" />
                      )}
                      {t('postDetail.writeComment', '댓글 작성')}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {!user && (
            <Card className="p-4 mb-6 border-white/5 bg-card/50 text-center">
              <p className="text-muted-foreground text-sm mb-3">{t('postDetail.loginToComment', '댓글을 작성하려면 로그인이 필요합니다.')}</p>
              <Link href="/login">
                <Button size="sm" data-testid="button-login-to-comment">{t('postDetail.login', '로그인')}</Button>
              </Link>
            </Card>
          )}

          {loadingComments ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-primary" size={20} />
            </div>
          ) : topLevelComments.length > 0 ? (
            <div className="space-y-3">
              {topLevelComments.map((comment: any) => renderComment(comment))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-comments">
              <MessageSquare className="mx-auto mb-2 opacity-50" size={32} />
              <p className="text-sm">{t('postDetail.noComments', '아직 댓글이 없습니다. 첫 댓글을 남겨보세요!')}</p>
            </div>
          )}
        </div>
      </div>
      </div>
    </PageTransition>
  );
}
