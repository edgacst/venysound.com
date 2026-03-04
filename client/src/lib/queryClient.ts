import { QueryClient, QueryFunction } from "@tanstack/react-query";

export function redirectToLogin() {
  if (typeof window === "undefined") return;
  const current = window.location.pathname + window.location.search + window.location.hash;
  const loginPath = "/login";
  if (window.location.pathname.startsWith(loginPath)) return;
  const nextParam = encodeURIComponent(current || "/");
  window.location.href = `${loginPath}?next=${nextParam}`;
}

async function getErrorMessage(res: Response): Promise<string> {
  try {
    const contentType = res.headers.get("Content-Type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json().catch(() => null);
      if (data && typeof data === "object") {
        const anyData = data as any;
        if (typeof anyData.message === "string" && anyData.message.trim().length > 0) {
          return anyData.message.trim();
        }
        if (typeof anyData.error === "string" && anyData.error.trim().length > 0) {
          return anyData.error.trim();
        }
      }
    }
  } catch {
    // fall through to text
  }
  const text = (await res.text().catch(() => ""))?.trim();
  if (text) return text;
  if (res.statusText) return res.statusText;
  return `HTTP ${res.status}`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const msg = await getErrorMessage(res);
    if (res.status === 401) {
      const isKorean = typeof navigator !== "undefined" && /^ko\b/i.test(navigator.language || "");
      if (isKorean) {
        throw new Error("로그인이 필요한 서비스입니다.");
      }
      // Fallback: use server message or generic English
      throw new Error(msg || "Login is required to use this service.");
    }
    throw new Error(msg);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { timeoutMs?: number },
): Promise<Response> {
  const ctrl = options?.timeoutMs ? new AbortController() : undefined;
  const timeoutId = ctrl
    ? setTimeout(() => ctrl.abort(), options.timeoutMs)
    : undefined;
  try {
    const res = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
      signal: ctrl?.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);
    await throwIfResNotOk(res);
    return res;
  } catch (e: any) {
    if (timeoutId) clearTimeout(timeoutId);
    if (e?.name === "AbortError") {
      throw new Error("요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
    }
    throw e;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
