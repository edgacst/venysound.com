import { useQuery } from "@tanstack/react-query";

export type User = {
  id: string;
  email?: string | null;
  first_name?: string;
  last_name?: string;
  profile_image_url?: string;
  username?: string;
};

/** 서버 세션 형식(claims)을 클라이언트 User 형식으로 변환 */
function normalizeSessionUser(raw: any): User | null {
  if (!raw) return null;
  const claims = raw.claims ?? {};
  const id = raw.id ?? claims.sub;
  if (id == null) return null;
  return {
    id: String(id),
    email: claims.email ?? raw.email ?? null,
    first_name: claims.first_name ?? raw.first_name,
    last_name: claims.last_name ?? raw.last_name,
    profile_image_url: claims.profile_image_url ?? raw.profile_image_url,
    username: raw.username,
  };
}

export function useAuth() {
  const { data: raw, isLoading } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("auth failed");
      return res.json();
    },
    retry: false,
  });

  const user = normalizeSessionUser(raw);

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    logout: () => { window.location.href = "/api/logout"; },
  };
}
