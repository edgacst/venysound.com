import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { CreatePostRequest, CreatePostCommentRequest } from "@shared/schema";

export function usePosts(params?: { search?: string; category?: string }) {
  const queryString = new URLSearchParams();
  if (params?.search) queryString.append("search", params.search);
  if (params?.category && params.category !== "All" && params.category !== "전체") queryString.append("category", params.category);

  return useQuery({
    queryKey: [api.posts.list.path, params],
    queryFn: async () => {
      const url = `${api.posts.list.path}?${queryString.toString()}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch posts");
      return api.posts.list.responses[200].parse(await res.json());
    },
  });
}

export function usePost(id: number) {
  return useQuery({
    queryKey: [api.posts.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.posts.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch post");
      return api.posts.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreatePostRequest) => {
      const res = await fetch(api.posts.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create post");
      return api.posts.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.posts.list.path] });
      toast({ title: "성공", description: "게시글이 작성되었습니다!" });
    },
  });
}

export function useUpdatePost(id: number) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { title?: string; content?: string; category?: string | null; attachment?: string | null }) => {
      const res = await fetch(`/api/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update post");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.posts.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts", id] });
      queryClient.invalidateQueries({ queryKey: [api.posts.get.path, id] });
      toast({ title: "성공", description: "게시글이 수정되었습니다!" });
    },
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (postId: number) => {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to delete post");
      }
      return res.json();
    },
    onSuccess: (_, postId) => {
      // 리스트 캐시에서 바로 제거해 UI를 즉시 반영
      queryClient.setQueriesData<any[]>({ queryKey: [api.posts.list.path] }, (old) => {
        if (!old) return old;
        return old.filter((p) => p.id !== postId);
      });
      // 혹시 모를 다른 뷰를 위해 무효화도 함께 수행
      queryClient.invalidateQueries({ queryKey: [api.posts.list.path] });
      queryClient.removeQueries({ queryKey: ["/api/posts", postId] });
      queryClient.removeQueries({ queryKey: [api.posts.get.path, postId] });
      toast({ title: "성공", description: "게시글이 삭제되었습니다!" });
    },
  });
}

export function useComments(postId: number) {
  return useQuery({
    queryKey: [api.posts.getComments.path, postId],
    queryFn: async () => {
      const url = buildUrl(api.posts.getComments.path, { id: postId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch comments");
      return api.posts.getComments.responses[200].parse(await res.json());
    },
    enabled: !!postId,
  });
}

export function useCreateComment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ postId, data }: { postId: number; data: CreatePostCommentRequest }) => {
      const url = buildUrl(api.posts.createComment.path, { id: postId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to post comment");
      return api.posts.createComment.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.posts.getComments.path, variables.postId] });
      toast({ title: "성공", description: "댓글이 등록되었습니다" });
    },
  });
}
