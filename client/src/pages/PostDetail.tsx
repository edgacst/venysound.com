import { Navigation } from "@/components/Navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { ArrowLeft, MessageSquare, Loader2, Send, Trash2, Reply, CornerDownRight, Pencil, X, ImagePlus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { PageTransition } from "@/components/PageTransition";
import { useTranslation } from 'react-i18next';
import { useUpdatePost, useDeletePost } from "@/hooks/use-community";
import { resolveStorageUrl } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLoginModalStore } from "@/stores/login-modal";

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
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editPostOpen, setEditPostOpen] = useState(false);
  const [editPostTitle, setEditPostTitle] = useState("");
  const [editPostContent, setEditPostContent] = useState("");
  const [editPostCategory, setEditPostCategory] = useState("");
  const [editPostAttachment, setEditPostAttachment] = useState<string | null>(null);
  const [editImageUploading, setEditImageUploading] = useState(false);
  const [, setLocation] = useLocation();

  const dateLocale = i18n.language === 'ko' ? ko : undefined;
  const categories = ["자유", "음악추천", "질문", "정보", "후기", "콜라보"];
  const IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp";

  const { data: post, isLoading: loadingPost } = useQuery<any>({
    queryKey: ["/api/posts", postId],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${postId}`, { credentials: "include" });
      if (!res.ok) throw new Error(t('postDetail.loadError', '게시글을 불러올 수 없습니다'));
      return res.json();
    },
    enabled: !!postId,
  });

  const updatePostMutation = useUpdatePost(Number(postId));
  const deletePostMutation = useDeletePost();

  const postAuthorId = post?.userId ?? post?.user?.id ?? "";
  const isPostOwner = Boolean(user?.id && postAuthorId && String(user.id) === String(postAuthorId));

  const openEditPost = () => {
    if (!post) return;
    setEditPostTitle(post.title);
    setEditPostContent(post.content ?? "");
    setEditPostCategory(post.category ?? "자유");
    setEditPostAttachment(post.attachment ?? null);
    setEditPostOpen(true);
  };

  const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setEditImageUploading(true);
    try {
      const urlRes = await fetch("/api/uploads/request-url", { method: "POST", credentials: "include" });
      const { uploadEndpoint } = await urlRes.json();
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch(uploadEndpoint || "/api/uploads/local", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { objectPath } = await uploadRes.json();
      setEditPostAttachment(objectPath);
    } finally {
      setEditImageUploading(false);
      e.target.value = "";
    }
  };

  const submitEditPost = () => {
    if (!editPostTitle.trim() || !editPostContent.trim()) {
      toast({ title: t('postDetail.enterTitleAndContent', '제목과 내용을 입력해주세요'), variant: "destructive" });
      return;
    }
    updatePostMutation.mutate(
      { title: editPostTitle.trim(), content: editPostContent.trim(), category: editPostCategory || null, attachment: editPostAttachment || null },
      { onSuccess: () => setEditPostOpen(false) }
    );
  };

  const handleDeletePost = () => {
    if (!window.confirm(t('postDetail.confirmDelete', '게시글을 삭제할까요?'))) return;
    deletePostMutation.mutate(Number(postId), {
      onSuccess: () => setLocation("/community"),
    });
  };

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

  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: number; content: string }) => {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t('postDetail.commentUpdateFailed', '댓글 수정 실패'));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
      setEditingCommentId(null);
      setEditContent("");
      toast({ title: t('postDetail.commentUpdated', '댓글이 수정되었습니다') });
    },
    onError: (error: Error) => {
      toast({ title: t('postDetail.commentUpdateFailed', '댓글 수정 실패'), description: error.message, variant: "destructive" });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      await apiRequest("DELETE", `/api/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", postId, "comments"] });
      setEditingCommentId(null);
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
    const commentAuthorId = comment.userId ?? comment.user_id ?? comment.user?.id ?? "";
    const currentUserId = user?.id ?? (user as any)?.claims?.sub ?? "";
    const isOwner = Boolean(currentUserId && commentAuthorId && String(currentUserId) === String(commentAuthorId));

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
              {editingCommentId === comment.id ? (
                <div className="space-y-2 mt-1">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="bg-secondary/30 border-white/5 text-sm min-h-[60px]"
                    data-testid={`textarea-edit-comment-${comment.id}`}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!editContent.trim()) return;
                        updateCommentMutation.mutate({ commentId: comment.id, content: editContent.trim() });
                      }}
                      disabled={updateCommentMutation.isPending || !editContent.trim()}
                      data-testid={`button-save-edit-comment-${comment.id}`}
                    >
                      {updateCommentMutation.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                      {t('postDetail.save', '저장')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setEditingCommentId(null); setEditContent(""); }}
                      data-testid={`button-cancel-edit-comment-${comment.id}`}
                    >
                      <X size={12} className="mr-1" />
                      {t('postDetail.cancel', '취소')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
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
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-muted-foreground"
                          onClick={() => {
                            setEditingCommentId(comment.id);
                            setEditContent(comment.content || "");
                          }}
                          data-testid={`button-edit-comment-${comment.id}`}
                        >
                          <Pencil size={12} />
                          {t('postDetail.edit', '수정')}
                        </Button>
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
                      </>
                    )}
                  </div>
                </>
              )}
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
            <div className="min-w-0 flex-1">
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
            {isPostOwner && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={openEditPost} data-testid="button-edit-post">
                  <Pencil size={14} /> {t('postDetail.edit', '수정')}
                </Button>
                <Button variant="ghost" size="sm" className="h-8 gap-1 text-red-400" onClick={handleDeletePost} disabled={deletePostMutation.isPending} data-testid="button-delete-post">
                  <Trash2 size={14} /> {t('postDetail.delete', '삭제')}
                </Button>
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold mb-4" data-testid="text-post-title">{post.title}</h1>
          <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed" data-testid="text-post-content">{post.content}</p>
          {post.attachment && (
            <div className="mt-4 rounded-lg overflow-hidden border border-white/10 bg-secondary/30 max-w-full">
              <img
                src={post.attachment.startsWith("http") ? post.attachment : resolveStorageUrl(post.attachment)}
                alt=""
                className="w-full max-h-[400px] object-contain"
                data-testid="img-post-attachment"
              />
            </div>
          )}
        </Card>

        <Dialog open={editPostOpen} onOpenChange={setEditPostOpen}>
          <DialogContent className="bg-card border-white/10 max-w-lg">
            <DialogHeader>
              <DialogTitle>{t('postDetail.editPost', '게시글 수정')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t('community.postTitle', '제목')}</label>
                <Input value={editPostTitle} onChange={(e) => setEditPostTitle(e.target.value)} className="bg-secondary/30" data-testid="input-edit-post-title" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t('community.category', '카테고리')}</label>
                <Select value={editPostCategory} onValueChange={setEditPostCategory}>
                  <SelectTrigger className="bg-secondary/30" data-testid="select-edit-post-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{t(`community.categories.${cat}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t('community.content', '내용')}</label>
                <Textarea value={editPostContent} onChange={(e) => setEditPostContent(e.target.value)} rows={5} className="bg-secondary/30" data-testid="textarea-edit-post-content" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">{t('community.image', '이미지 첨부')}</label>
                {editPostAttachment ? (
                  <div className="relative inline-block max-w-full rounded-lg overflow-hidden border border-white/10 bg-secondary/30">
                    <img src={editPostAttachment.startsWith("http") ? editPostAttachment : resolveStorageUrl(editPostAttachment)} alt="" className="max-h-40 object-contain" />
                    <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-7 w-7" onClick={() => setEditPostAttachment(null)}>
                      <X size={14} />
                    </Button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-secondary/20 px-4 py-4 cursor-pointer hover:bg-secondary/30">
                    <input type="file" accept={IMAGE_ACCEPT} className="sr-only" disabled={editImageUploading} onChange={handleEditImageUpload} />
                    {editImageUploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                    <span className="text-sm text-muted-foreground">{editImageUploading ? t('community.uploading', '업로드 중...') : t('community.addImage', '이미지 선택')}</span>
                  </label>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={submitEditPost} disabled={updatePostMutation.isPending || !editPostTitle.trim() || !editPostContent.trim()} className="flex-1" data-testid="button-save-edit-post">
                  {updatePostMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                  {t('postDetail.save', '저장')}
                </Button>
                <Button variant="outline" onClick={() => setEditPostOpen(false)} data-testid="button-cancel-edit-post">{t('postDetail.cancel', '취소')}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
              <Button size="sm" onClick={() => useLoginModalStore.getState().open()} data-testid="button-login-to-comment">{t('postDetail.login', '로그인')}</Button>
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
