/**
 * 공개 음원·커뮤니티 등 URL은 그대로 두고, 로그인/가입/관리 SPA 경로만 조정.
 * 프로덕션에서 바꿀 때는 서버 .env의 LOGIN_PAGE_PATH 등과 반드시 동일한 값으로 Vite 변수 설정.
 */
function normalizePath(value: string | undefined, fallback: string): string {
  const base = (value?.trim() || fallback).trim() || fallback;
  let p = base.startsWith("/") ? base : `/${base}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

export const LOGIN_PATH = normalizePath(import.meta.env.VITE_LOGIN_PAGE_PATH as string | undefined, "/login");
export const REGISTER_PATH = normalizePath(import.meta.env.VITE_REGISTER_PAGE_PATH as string | undefined, "/register");
export const ADMIN_PATH = normalizePath(import.meta.env.VITE_ADMIN_PAGE_PATH as string | undefined, "/admin");
