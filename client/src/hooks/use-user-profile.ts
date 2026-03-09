import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

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
  const { t } = useTranslation();

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
    onSuccess: (data, userId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "profile"] });
      toast({
        title: data.following ? t("toast.followed") : t("toast.unfollowed"),
        description: data.following ? t("toast.followedDesc") : t("toast.unfollowedDesc"),
      });
    },
    onError: () => {
      toast({ title: t("toast.error"), description: t("toast.followFailed"), variant: "destructive" });
    },
  });
}

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [api.notifications.list.path],
    queryFn: async () => {
      const res = await fetch(api.notifications.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return api.notifications.list.responses[200].parse(await res.json());
    },
    enabled: !!user?.id,
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
