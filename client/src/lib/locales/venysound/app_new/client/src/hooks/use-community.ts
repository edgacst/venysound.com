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
