import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

const AUTH_ME_KEY = ["/api/auth/me"] as const;

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
    queryKey: AUTH_ME_KEY,
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("auth failed");
      return res.json();
    },
    retry: false,
    /** 전역 staleTime:Infinity 이면 첫 방문 null 이 영구 캐시되어 로그인 성공 후에도 비로그인처럼 보일 수 있음 */
    staleTime: 0,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: true,
  });
  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    logout: () => {
      void queryClient.invalidateQueries({ queryKey: AUTH_ME_KEY });
      window.location.href = "/api/logout";
    },
  };
}

/** 로그인·가입 성공 직후 세션 쿠키 반영 → /api/auth/me 캐시 갱신 */
export async function refreshAuthSession(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: AUTH_ME_KEY });
  await queryClient.refetchQueries({ queryKey: AUTH_ME_KEY });
}
