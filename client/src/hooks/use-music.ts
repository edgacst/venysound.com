import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { CreateMusicRequest, Music } from "@shared/schema";

export function useMusicList(params?: {
  search?: string;
  genre?: string;
  tag?: string;
  page?: number;
  limit?: number;
  enabled?: boolean;
}) {
  const queryString = new URLSearchParams();
  if (params?.search) queryString.append("search", params.search);
  if (params?.genre && params.genre !== "All" && params.genre !== "전체") queryString.append("genre", params.genre);
  if (params?.tag) queryString.append("tag", params.tag);
  if (params?.page) queryString.append("page", String(params.page));
  if (params?.limit) queryString.append("limit", String(params.limit));

  return useQuery<{ data: Music[]; total: number }>({
    queryKey: [api.music.list.path, params],
    queryFn: async () => {
      const url = `${api.music.list.path}?${queryString.toString()}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch music");
      return res.json();
    },
    enabled: params?.enabled !== false,
  });
}

export function useMusic(id: number) {
  return useQuery({
    queryKey: [api.music.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.music.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch music details");
      return api.music.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useMyLikes() {
  return useQuery<number[]>({
    queryKey: ["/api/music/my-likes"],
    queryFn: async () => {
      const res = await fetch("/api/music/my-likes", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

export function useCreateMusic() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateMusicRequest) => {
      const res = await fetch(api.music.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to upload music");
      }
      return api.music.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.music.list.path] });
      toast({ title: "성공", description: "음원이 성공적으로 업로드되었습니다!" });
    },
    onError: (error: Error) => {
      toast({ title: "업로드 제한", description: error.message || "업로드에 실패했습니다", variant: "destructive" });
    },
  });
}

export function useUpdateMusic() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Music> }) => {
      const res = await fetch(`/api/music/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "수정 실패");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.music.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.music.get.path, variables.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/music/international-releases"] });
      toast({ title: "음원이 수정되었습니다" });
    },
    onError: (error: Error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteMusic() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/music/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "삭제 실패");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.music.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/music/my-likes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
      toast({ title: "음원이 삭제되었습니다" });
    },
    onError: (error: Error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });
}

export function useLikeCounts() {
  return useQuery<Record<number, number>>({
    queryKey: ["/api/music/like-counts"],
    queryFn: async () => {
      const res = await fetch("/api/music/like-counts", { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
  });
}

export function usePlayCounts() {
  return useQuery<Record<number, number>>({
    queryKey: ["/api/music/play-counts"],
    queryFn: async () => {
      const res = await fetch("/api/music/play-counts", { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
  });
}

export function useLikeMusic() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.music.like.path, { id });
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to like music");
      return api.music.like.responses[200].parse(await res.json());
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.music.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.music.get.path, variables] });
      queryClient.invalidateQueries({ queryKey: ["/api/music/my-likes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/music/like-counts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
      toast({ 
        title: data.liked ? "좋아요" : "좋아요 취소", 
        description: data.liked ? "좋아요 목록에 추가되었습니다" : "좋아요 목록에서 제거되었습니다" 
      });
    },
  });
}
