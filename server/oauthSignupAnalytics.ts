import type { Request } from "express";
import crypto from "node:crypto";
import { storage } from "./storage";

/** routes.ts 의 VISITOR_KEY_COOKIE 와 동일 — 가입 페이지에서 설정된 키로 퍼널 연결 */
const VISITOR_KEY_COOKIE = "vs_vkey";
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw || typeof raw !== "string") return null;
  const parts = raw.split(";").map((s) => s.trim());
  const prefix = `${name}=`;
  for (const p of parts) {
    if (p.startsWith(prefix)) {
      try {
        return decodeURIComponent(p.slice(prefix.length));
      } catch {
        return p.slice(prefix.length);
      }
    }
  }
  return null;
}

function visitorKeyFromRequest(req: Request): string {
  const raw = readCookie(req, VISITOR_KEY_COOKIE);
  return raw && UUID_V4_RE.test(raw) ? raw : crypto.randomUUID();
}

/**
 * 신규 소셜 계정 생성 시 가입 퍼널 `signup_success` 기록.
 * (이메일 병합으로 기존 행만 갱신된 경우 `user.id !== oauthId` 이면 호출하지 말 것)
 */
export function recordSignupSuccessAfterNewOauth(req: Request, provider: string): void {
  const vk = visitorKeyFromRequest(req);
  void storage
    .recordConversionEvent(vk, "signup_success", { oauth_provider: provider })
    .catch((e) => console.error("[auth] signup_success conversion failed:", e));
}
