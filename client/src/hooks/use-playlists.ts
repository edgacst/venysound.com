import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { CreatePlaylistRequest } from "@shared/schema";

export function usePlaylists() {
  return useQuery({
    queryKey: [api.playlists.list.path],
    queryFn: async () => {
      const res = await fetch(api.playlists.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch playlists");
      return api.playlists.list.responses[200].parse(await res.json());
    },
  });
}

export function usePlaylist(id: number) {
  return useQuery({
    queryKey: [api.playlists.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.playlists.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch playlist details");
      return api.playlists.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreatePlaylist() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreatePlaylistRequest) => {
      const res = await fetch(api.playlists.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create playlist");
      return api.playlists.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.playlists.list.path] });
      toast({ title: "성공", description: "플레이리스트가 생성되었습니다!" });
    },
    onError: (error) => {
      toast({ title: "오류", description: "플레이리스트 생성에 실패했습니다", variant: "destructive" });
    },
  });
}

export function useAddToPlaylist() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ playlistId, musicId }: { playlistId: number; musicId: number }) => {
      const url = buildUrl(api.playlists.addMusic.path, { id: playlistId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ musicId }),
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof (body as { message?: unknown }).message === "string" ? (body as { message: string }).message : null;
        throw new Error(msg || "플레이리스트에 추가하지 못했습니다");
      }
      return api.playlists.addMusic.responses[200].parse(body);
    },
    onSuccess: (_data, { playlistId }) => {
      void queryClient.invalidateQueries({ queryKey: [api.playlists.list.path] });
      void queryClient.invalidateQueries({ queryKey: [api.playlists.get.path, playlistId] });
      toast({ title: "추가 완료", description: "곡이 플레이리스트에 추가되었습니다" });
    },
    onError: (error: Error) => {
      toast({ title: "오류", description: error.message || "플레이리스트에 추가하지 못했습니다", variant: "destructive" });
    },
  });
}
