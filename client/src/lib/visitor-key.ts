/** App.tsx 방문 분석과 동일 키 — localStorage 우선, 없으면 sessionStorage */
export const VISITOR_KEY_STORAGE = "vkey";

export function readVisitorKey(): string | null {
  try {
    const fromLocal = localStorage.getItem(VISITOR_KEY_STORAGE);
    if (fromLocal && fromLocal.trim()) return fromLocal.trim();
  } catch {
    /* private mode */
  }
  try {
    const fromSession = sessionStorage.getItem(VISITOR_KEY_STORAGE);
    if (fromSession && fromSession.trim()) return fromSession.trim();
  } catch {
    /* ignore */
  }
  return null;
}

export function writeVisitorKey(v: string) {
  try {
    localStorage.setItem(VISITOR_KEY_STORAGE, v);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(VISITOR_KEY_STORAGE, v);
  } catch {
    /* ignore */
  }
}
