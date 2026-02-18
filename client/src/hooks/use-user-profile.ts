import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useUserProfile(id: string) {
  return useQuery({
    queryKey: ["/api/users/profile", id],
    queryFn: async () => {
      const url = buildUrl(api.users.getProfile.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch profile");
      return api.users.getProfile.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useFollowUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const url = buildUrl(api.users.follow.path, { id });
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to follow user");
      return api.users.follow.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
      toast({ 
        title: data.following ? "팔로우" : "언팔로우", 
        description: data.following ? "팔로우하기 시작했습니다" : "팔로우를 취소했습니다" 
      });
    },
    onError: (error) => {
      toast({ title: "오류", description: "팔로우 처리에 실패했습니다", variant: "destructive" });
    },
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: [api.notifications.list.path],
    queryFn: async () => {
      const res = await fetch(api.notifications.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return api.notifications.list.responses[200].parse(await res.json());
    },
    refetchInterval: 30000, // Poll every 30s
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.notifications.markRead.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to mark notification");
      return api.notifications.markRead.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.notifications.list.path] });
    },
  });
}
