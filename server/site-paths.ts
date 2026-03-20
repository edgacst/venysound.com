/** SPA 경로용 (.env). API 경로(/api/…)는 변경하지 않음. */

function normalizePath(raw: string | undefined, fallback: string): string {
  const base = (raw?.trim() || fallback).trim() || fallback;
  let p = base.startsWith("/") ? base : `/${base}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

export function getLoginPagePath(): string {
  return normalizePath(process.env.LOGIN_PAGE_PATH, "/login");
}

export function getRegisterPagePath(): string {
  return normalizePath(process.env.REGISTER_PAGE_PATH, "/register");
}

export function getAdminPagePath(): string {
  return normalizePath(process.env.ADMIN_PAGE_PATH, "/admin");
}
