import { redirectToLogin } from "@/lib/queryClient";

const STORAGE_KEY = "venysound_guest_one_play_consumed_v1";

let authLoggedIn = false;
let authLoading = true;

/** App에서 /api/auth/me 결과에 맞춰 호출 — 로그인 시 차단 해제 */
export function syncGuestListenAuthState(opts: { loggedIn: boolean; authLoading: boolean }) {
  authLoggedIn = opts.loggedIn;
  authLoading = opts.authLoading;
}

function readConsumed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** 비로그인 1곡(온디맨드 또는 라디오) 청취 완료 후 호출 */
export function markGuestListenQuotaConsumed(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private mode 등 */
  }
}

/**
 * 비로그인이 이미 1곡을 들은 뒤면 true.
 * authLoading 동안에는 잘못된 리다이렉트를 피하기 위해 막지 않음(짧은 창 허용).
 */
export function isGuestPlaybackBlocked(): boolean {
  if (authLoading) return false;
  if (authLoggedIn) return false;
  return readConsumed();
}

/** 새 재생을 시작하려 할 때: 한도 초과면 로그인으로 보내고 true */
export function blockGuestPlaybackIfNeeded(): boolean {
  if (!isGuestPlaybackBlocked()) return false;
  redirectToLogin();
  return true;
}
