import { useQuery } from "@tanstack/react-query";

export type User = {
  id: string;
  username?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  role?: string | null;
  subscriptionTier?: string | null;
  subscriptionPlan?: string | null;
  subscriptionExpiresAt?: string | null;
  // 세션 호환성
  claims?: {
    sub: string;
    email: string | null;
    first_name: string;
    last_name: string;
    profile_image_url: string;
  };
};

export function useAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("auth failed");
      return res.json();
    },
    retry: false,
  });
  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    logout: () => { window.location.href = "/api/logout"; },
  };
}
