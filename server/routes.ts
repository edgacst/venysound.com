import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { existsSync, createReadStream, mkdirSync, statSync, readdirSync, lstatSync, createWriteStream, writeFileSync } from "fs";
import archiver from "archiver";
import { storage } from "./storage";
import { translateAnnouncementContent } from "./translate";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./auth";
import { registerObjectStorageRoutes, ObjectStorageService, ObjectNotFoundError } from "./localObjectStorage";
import { generateImageBuffer } from "./imageClient";
import { alignLyricsToAudio } from "./lyricsAlign";
import { sendNewMusicNotificationEmail, sendSocialActivityEmail, isEmailConfigured, type ActivityEmailKind } from "./email";
import { verifyCreditRefundProof } from "./sensitiveActionProof";
import { sendPushNotification } from "./push";
import { WebSocketServer, WebSocket } from "ws";
import { subscriptionPlans, payments, aiMusicUsage, aiMusicGenerationLogs } from "../shared/models/auth";
import { db } from "./db";
import {
  users,
  streamingLogs,
  music,
  announcements,
  follows,
  notifications,
  insertAnnouncementSchema,
  musicStories as musicStoriesTable,
  postComments,
  creditTransactions,
  creditRefundRequests,
  creditRefundEvents,
} from "../shared/schema";
import { eq, sql, inArray, and, desc, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import geoip from "geoip-lite";
import { getLoginPagePath, getRegisterPagePath, getAdminPagePath } from "./site-paths";
import { creditsFromTotalVatInclusiveWon } from "@shared/credits-pricing";
import {
  normalizeSubscriptionPlanPrices,
  subscriptionTotalVatInclusiveWon,
  SUBSCRIPTION_PLAN_FALLBACK,
  isPaidSubscriptionTierId,
  type PaidSubscriptionTierId,
} from "@shared/subscription-plan-pricing";

/** starter/basic/pro/premium 중 하나이고 구독 기간이 유효하면 true */
function isActivePaidSubscription(
  user: { subscriptionTier?: string | null; subscriptionExpiresAt?: Date | null } | undefined,
  now: Date,
): boolean {
  if (!user) return false;
  const t = user.subscriptionTier ?? "free";
  if (!isPaidSubscriptionTierId(t)) return false;
  return !user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > now;
}

/** 경로 파라미터를 양의 정수 id로 파싱 (NaN·0·음수·비정수면 null) */
function parsePositiveIntParam(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) return null;
  return n;
}

// 후원 뱃지 레벨 계산 (누적 후원 크레딧 기준)
function calculateDonationBadge(totalSent: number): string | null {
  if (totalSent >= 200000) return "sponsor";
  if (totalSent >= 50000) return "supporter";
  if (totalSent >= 10000) return "sprout";
  if (totalSent >= 100) return "seed";
  return null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // local-uploads 폴더 자동 생성
  const uploadsDir = path.resolve(process.cwd(), "local-uploads", "uploads");
  mkdirSync(uploadsDir, { recursive: true });

  // Play Store TWA: Digital Asset Links (설정 시에만 응답, 미설정 시 404로 연동 없음)
  app.get("/.well-known/assetlinks.json", (_req, res) => {
    const packageName = process.env.TWA_PACKAGE_NAME;
    const sha256 = process.env.TWA_SHA256_FINGERPRINT;
    if (!packageName || !sha256) {
      res.status(404).end();
      return;
    }
    res.type("application/json").send(
      JSON.stringify([
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: packageName,
            sha256_cert_fingerprints: sha256.split(",").map((s) => s.trim()),
          },
        },
      ])
    );
  });

  /** 메시지/대화 시간을 항상 UTC ISO 문자열(Z)로 반환 (타임존 9시간 오차 방지)
   *  - DB에 예상치 못한 값이 들어있을 때 서버가 500 나지 않도록, 파싱 실패 시 빈 문자열 반환
   */
  function toUTCISO(val: unknown): string {
    if (val == null) return "";
    try {
      if (val instanceof Date) return val.toISOString();
      if (typeof val === "string") {
        if (!val.trim()) return "";
        if (val.includes("Z") || val.endsWith("Z")) return val;
        const d = new Date(val.replace(" ", "T") + "Z");
        return isNaN(d.getTime()) ? "" : d.toISOString();
      }
      const d = new Date(val as string | number);
      return isNaN(d.getTime()) ? "" : d.toISOString();
    } catch {
      return "";
    }
  }

  /** SMTP·notify_activity_email 허용 시 댓글/팔로/좋아요/쪽지 메일 (비동기, 응답 지연 없음) */
  function queueActivityEmail(
    recipientUserId: string,
    kind: ActivityEmailKind,
    params: {
      actorName: string;
      musicTitle?: string;
      postTitle?: string;
      snippet?: string;
      actionPath: string;
    },
  ): void {
    if (!isEmailConfigured()) return;
    void (async () => {
      try {
        const u = await storage.getUserById(recipientUserId);
        if (!u?.email) return;
        if ((u as { notifyActivityEmail?: boolean }).notifyActivityEmail === false) return;
        const recipientName = (u.firstName as string) || (typeof u.email === "string" ? u.email.split("@")[0] : "") || "회원";
        await sendSocialActivityEmail(u.email, kind, {
          recipientName,
          actorName: params.actorName,
          musicTitle: params.musicTitle,
          postTitle: params.postTitle,
          snippet: params.snippet,
          actionPath: params.actionPath,
        });
      } catch (e) {
        console.error("[activity-email]", e);
      }
    })();
  }

  /** 구독 만료 시 DB를 free로 갱신하고, 해당 유저가 현재 유료(유료 플랜 또는 admin)인지 반환 */
  async function ensureExpiredSubscriptionDowngrade(userId: string): Promise<{ isPremium: boolean }> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return { isPremium: false };
    if (user.role === "admin") return { isPremium: true };
    const now = new Date();
    const isPaid = isActivePaidSubscription(user, now);
    if (
      isPaidSubscriptionTierId(user.subscriptionTier ?? "") &&
      user.subscriptionExpiresAt &&
      new Date(user.subscriptionExpiresAt) <= now
    ) {
      await db.update(users).set({ subscriptionTier: "free", subscriptionPlan: null, subscriptionExpiresAt: null }).where(eq(users.id, userId));
      return { isPremium: false };
    }
    return { isPremium: isPaid };
  }

  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);
  registerObjectStorageRoutes(app);

  // DJ 송출실 HTML: 비로그인 직링크(/radio-audio-test.html?slug=…) 차단 — 세션 없으면 로그인으로
  const radioAudioTestHtmlPaths = [
    path.resolve(process.cwd(), "dist/public/radio-audio-test.html"),
    path.resolve(process.cwd(), "client/public/radio-audio-test.html"),
  ];
  function resolveRadioAudioTestHtmlPath(): string | null {
    for (const p of radioAudioTestHtmlPaths) {
      if (existsSync(p)) return p;
    }
    return null;
  }
  app.get("/radio-audio-test.html", (req, res) => {
    const r = req as Request & { isAuthenticated(): boolean; user?: { claims?: { sub?: string } } };
    if (!r.isAuthenticated?.() || !r.user?.claims?.sub) {
      const loginPath = getLoginPagePath();
      const full = (req.originalUrl || "/radio-audio-test.html").split("#")[0];
      return res.redirect(302, `${loginPath}?next=${encodeURIComponent(full)}`);
    }
    const htmlPath = resolveRadioAudioTestHtmlPath();
    if (!htmlPath) {
      return res.status(404).type("text/plain").send("radio-audio-test.html not found");
    }
    res.setHeader("Cache-Control", "no-store");
    return res.sendFile(htmlPath);
  });

  // WebSocket for visitor count + DM (noServer so /_vite_hmr can be handled by Vite)
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = request.url?.split("?")[0] || "";
    if (pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
    }
    // else: let other listeners (e.g. Vite HMR) handle /_vite_hmr; do not respond so they can
  });
  let visitorCount = 0;
  const userSockets = new Map<string, Set<WebSocket>>();
  const radioChannelRooms = new Map<string, Set<WebSocket>>();
  const wsRadioSlugs = new WeakMap<WebSocket, Set<string>>();
  const wsToUserId = new Map<WebSocket, string>();
  const lastJoinBroadcastAt = new Map<string, number>();
  const JOIN_BROADCAST_COOLDOWN_MS = 60000;
  const radioLocalTitles = new Map<string, string | null>();
  // 새로고침 감지용: 퇴장 알림을 8초 지연 후 발송. 그 사이 재접속하면 취소
  const pendingLeaveTimers = new Map<string, ReturnType<typeof setTimeout>>(); // `${slug}:${userId}`

  function broadcastToRadioChannel(slug: string, data: object) {
    const room = radioChannelRooms.get(slug);
    if (!room) return;
    const message = JSON.stringify(data);
    room.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  }

  // 채팅/입퇴장 알림은 익명(미인증 소켓)에게 절대 노출하지 않기 위한 필터 브로드캐스트
  function broadcastToRadioChannelAuthenticated(slug: string, data: object) {
    const room = radioChannelRooms.get(slug);
    if (!room) return;
    const message = JSON.stringify(data);
    room.forEach((client) => {
      if (client.readyState !== WebSocket.OPEN) return;
      if (!wsToUserId.get(client)) return; // 인증된 소켓만 전송
      client.send(message);
    });
  }

  function broadcastRadioListeners(slug: string) {
    const room = radioChannelRooms.get(slug);
    const count = room ? room.size : 0;
    broadcastToRadioChannel(slug, { type: "radio_listeners", slug, count });
  }

  wss.on("connection", (ws) => {
    visitorCount++;
    broadcastVisitorCount();
    let wsUserId: string | null = null;
    wsRadioSlugs.set(ws, new Set());

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "auth" && msg.userId) {
          wsUserId = msg.userId;
          wsToUserId.set(ws, wsUserId);
          if (!userSockets.has(wsUserId!)) {
            userSockets.set(wsUserId!, new Set());
          }
          userSockets.get(wsUserId!)!.add(ws);
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: "auth_ack" }));
        }
        if (msg.type === "radio_join" && typeof msg.slug === "string" && msg.slug) {
          const slug = String(msg.slug).trim().toLowerCase();
          if (!radioChannelRooms.has(slug)) radioChannelRooms.set(slug, new Set());
          const room = radioChannelRooms.get(slug)!;
          const wasAlreadyInRoom = room.has(ws);
          room.add(ws);
          wsRadioSlugs.get(ws)!.add(slug);
          broadcastRadioListeners(slug);
          if (!wasAlreadyInRoom && wsUserId) {
            const leaveKey = `${slug}:${wsUserId}`;
            // 새로고침 감지: 퇴장 대기 타이머가 있으면 취소 (= 재접속이므로 퇴장/입장 알림 모두 생략)
            // 쿨다운은 건드리지 않음 → 반복 재접속해도 입장 알림 중복 방지
            const pendingTimer = pendingLeaveTimers.get(leaveKey);
            if (pendingTimer) {
              clearTimeout(pendingTimer);
              pendingLeaveTimers.delete(leaveKey);
              /* 새로고침으로 재접속 → 알림 없이 조용히 복귀 */
            } else {
              const sameUserAlreadyInRoom = Array.from(room).some((s) => s !== ws && wsToUserId.get(s) === wsUserId);
              if (sameUserAlreadyInRoom) {
                /* 다른 탭으로 이미 입장 중 → 알림 생략 */
              } else {
                const joinKey = leaveKey;
                const now = Date.now();
                const lastAt = lastJoinBroadcastAt.get(joinKey);
                if (lastAt != null && now - lastAt < JOIN_BROADCAST_COOLDOWN_MS) {
                  /* 60초 쿨다운 */
                } else {
                  try {
                    lastJoinBroadcastAt.set(joinKey, now);
                    const explicitDisplayName =
                      typeof msg.displayName === "string" && msg.displayName.trim()
                        ? msg.displayName.trim()
                        : null;
                    let username: string | undefined;
                    if (explicitDisplayName) {
                      username = explicitDisplayName;
                    } else {
                      const user = await storage.getUserById(wsUserId);
                      const preferred =
                        (user?.firstName && String(user.firstName).trim()) ||
                        (user?.username && String(user.username).trim()) ||
                        null;
                      username = (preferred as string | null) ?? undefined;
                    }
                    broadcastToRadioChannelAuthenticated(slug, {
                      type: "radio_user_joined",
                      userId: wsUserId,
                      username,
                    });
                  } catch (e) {
                    console.warn("[ws] radio_user_joined broadcast failed", e);
                  }
                }
              }
            }
          }
        }
        if (msg.type === "radio_leave" && typeof msg.slug === "string" && msg.slug) {
          const slug = String(msg.slug).trim().toLowerCase();
          if (wsUserId) {
            // 명시적 퇴장: 대기 중인 타이머 취소 후 즉시 퇴장 알림
            const leaveKey = `${slug}:${wsUserId}`;
            const pending = pendingLeaveTimers.get(leaveKey);
            if (pending) { clearTimeout(pending); pendingLeaveTimers.delete(leaveKey); }
            lastJoinBroadcastAt.delete(leaveKey);
            try {
              const user = await storage.getUserById(wsUserId);
              const preferred =
                (user?.firstName && String(user.firstName).trim()) ||
                (user?.username && String(user.username).trim()) ||
                null;
              const username = (preferred as string | null) ?? undefined;
              broadcastToRadioChannelAuthenticated(slug, {
                type: "radio_user_left",
                userId: wsUserId,
                username,
              });
            } catch (e) {
              console.warn("[ws] radio_user_left broadcast failed", e);
            }
          }
          const room = radioChannelRooms.get(slug);
          if (room) {
            room.delete(ws);
            if (room.size === 0) radioChannelRooms.delete(slug);
          }
          wsRadioSlugs.get(ws)?.delete(slug);
          broadcastRadioListeners(slug);
        }
        if (msg.type === "radio_chat" && typeof msg.slug === "string" && typeof msg.content === "string" && msg.slug && String(msg.content).trim()) {
          if (!wsUserId) {
            console.warn("[ws] radio_chat ignored: not authenticated");
            return;
          }
          const slug = String(msg.slug).trim().toLowerCase();
          const channel = await storage.getRadioChannelBySlug(slug);
          if (!channel) {
            console.warn("[ws] radio_chat ignored: channel not found", slug);
            return;
          }
          const content = String(msg.content).trim().slice(0, 500);
          try {
            const row = await storage.createRadioChatMessage(channel.id, wsUserId, content);
            const user = await storage.getUserById(wsUserId);
            const username = (user?.username ?? user?.firstName ?? null) as string | null;
            broadcastToRadioChannelAuthenticated(slug, { type: "radio_chat", message: { id: row.id, userId: wsUserId, username, content: row.content, createdAt: (row.createdAt as Date).toISOString() } });
          } catch (e) {
            console.error("[ws] radio_chat create/broadcast failed", e);
          }
        }
      } catch (e) {
        console.error("[ws] message handler error", e);
      }
    });

    ws.on("close", () => {
      visitorCount--;
      broadcastVisitorCount();
      const uid = wsUserId;
      const slugs = wsRadioSlugs.get(ws);
      if (uid && slugs && slugs.size > 0) {
        // 퇴장 알림 8초 지연: 새로고침이면 재접속 시 타이머 취소 → 알림 없이 조용히 복귀
        // 주의: 쿨다운(lastJoinBroadcastAt)은 여기서 건드리지 않음 → 실제 퇴장(타이머 만료) 시에만 초기화
        slugs.forEach((slug) => {
          const leaveKey = `${slug}:${uid}`;
          if (pendingLeaveTimers.has(leaveKey)) return; // 이미 대기 중
          const timer = setTimeout(async () => {
            pendingLeaveTimers.delete(leaveKey);
            // 같은 유저가 이미 다른 연결로 방에 있으면 퇴장 알림 생략
            const room = radioChannelRooms.get(slug);
            if (room && Array.from(room).some((s) => wsToUserId.get(s) === uid)) return;
            // 실제 퇴장 확정 → 쿨다운 초기화 (다음 입장 시 알림 발송)
            lastJoinBroadcastAt.delete(leaveKey);
            try {
              const user = await storage.getUserById(uid);
              const username = ((user?.username ?? user?.firstName ?? null) as string | null) ?? undefined;
              broadcastToRadioChannelAuthenticated(slug, { type: "radio_user_left", userId: uid, username });
            } catch (e) {
              console.warn("[ws] radio_user_left on close broadcast failed", e);
            }
          }, 8000);
          pendingLeaveTimers.set(leaveKey, timer);
        });
      }
      if (slugs) {
        slugs.forEach((slug) => {
          const room = radioChannelRooms.get(slug);
          if (room) {
            room.delete(ws);
            if (room.size === 0) radioChannelRooms.delete(slug);
          }
          broadcastRadioListeners(slug);
        });
      }
      if (wsUserId && userSockets.has(wsUserId)) {
        userSockets.get(wsUserId)!.delete(ws);
        if (userSockets.get(wsUserId)!.size === 0) {
          userSockets.delete(wsUserId);
        }
      }
      wsToUserId.delete(ws);
    });
  });

  function broadcastVisitorCount() {
    const message = JSON.stringify({ type: "visitor_count", count: visitorCount });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  function sendToUser(userId: string, data: any) {
    const sockets = userSockets.get(userId);
    if (sockets) {
      const message = JSON.stringify(data);
      sockets.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }
  }

  // 배포 시 헬스 체크용 (인증 없음)
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // 사이트맵 (SEO) — /api 경로로 두어 정적·캐시와 겹치지 않게 함
  app.get("/sitemap.xml", (_req, res) => res.redirect(301, "/api/sitemap.xml"));
  app.get("/api/sitemap.xml", async (_req, res) => {
    const base = (process.env.SITE_URL || "https://venysound.com").replace(/\/$/, "");
    const staticPaths = [
      "",
      "/music",
      "/popular",
      "/explore",
      "/community",
      "/about",
      "/pricing",
      "/credits",
      getLoginPagePath(),
      getRegisterPagePath(),
      "/faq",
      "/legal",
      "/privacy",
      "/guide",
      "/file-guide",
      "/suno-guide",
      "/create-music",
    ];
    const now = new Date().toISOString().slice(0, 10);
    let urls = staticPaths.map(
      (p) => `<url><loc>${base}${p || "/"}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>${p ? "0.8" : "1.0"}</priority></url>`
    );
    try {
      const { data: musicList } = await storage.getMusicList(undefined, undefined, undefined, 1, 10000);
      for (const m of musicList) {
        urls.push(`<url><loc>${base}/music/${m.id}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`);
      }
    } catch {
      // DB 오류 시 정적 페이지만 포함
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
    res.type("application/xml").send(xml);
  });

  // === AI Music: Suno API (sunoapi.org) 또는 AIMusicAPI 프록시 ===
  const SUNOAPI_BASE = "https://api.sunoapi.org";
  const rawSunoKey = (process.env.SUNOAPI_API_KEY ?? "").replace(/^\uFEFF/, "").replace(/\r\n?|\n/g, "").trim();
  const SUNOAPI_KEY = rawSunoKey || undefined;

  const AIMUSICAPI_BASE = "https://api.aimusicapi.ai";
  const rawKey = process.env.AIMUSICAPI_API_KEY ?? "";
  const AIMUSICAPI_KEY = rawKey
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?|\n/g, "")
    .trim() || undefined;

  const AI_MUSIC_PROVIDER = SUNOAPI_KEY ? "suno" : AIMUSICAPI_KEY ? "aimusicapi" : null;

  // Suno 콜백 결과 저장 (first: 30~40초, complete: 2~3분) — 폴링 시 즉시 반환해 체감 속도 개선
  const sunoCallbackResults = new Map<string, { state: "succeeded"; data: { clip_id?: string; audio_url?: string; image_url?: string; title?: string; tags?: string; prompt?: string; custom_mode?: boolean }[] }>();

  app.post("/api/ai-music/suno-callback", (req, res) => {
    res.status(200).json({ received: true });
    try {
      const body = req.body as { code?: number; data?: { callbackType?: string; task_id?: string; data?: unknown[] } };
      const cbType = body?.data?.callbackType;
      const taskId = body?.data?.task_id;
      const rawList = Array.isArray(body?.data?.data) ? body.data.data : [];
      if ((cbType === "first" || cbType === "complete") && taskId && rawList.length > 0) {
        const tracks = rawList.map((t: unknown) => {
          const r = t as Record<string, unknown>;
          return {
            clip_id: r.id as string | undefined,
            audio_url: (r.audio_url || r.stream_audio_url) as string | undefined,
            image_url: r.image_url as string | undefined,
            title: r.title as string | undefined,
            tags: r.tags as string | undefined,
            prompt: r.prompt as string | undefined,
            custom_mode: undefined as boolean | undefined,
          };
        });
        sunoCallbackResults.set(taskId, { state: "succeeded", data: tracks });
      }
    } catch (_) {}
  });

  // AI 음악 생성 커버/오디오 프록시: 자기 자신 URL이 넘어오면 내부 url 쿼리만 꺼내서 사용 (재귀 호출 시 쿠키 없어 401 나는 것 방지)
  const siteBase = (process.env.SITE_URL || "https://venysound.com").replace(/\/$/, "");
  function resolveProxyUrl(given: string, proxyPath: "/api/ai-music/cover-proxy" | "/api/ai-music/audio-proxy"): string {
    try {
      const u = new URL(given);
      const base = new URL(siteBase);
      if (u.origin === base.origin && u.pathname === proxyPath && typeof u.searchParams.get("url") === "string") {
        return u.searchParams.get("url")!;
      }
    } catch {}
    return given;
  }

  // AI 음악 생성 커버 이미지 프록시 (업로드 페이지에서 CORS 없이 커버 사용, 로그인 사용자만)
  const COVER_PROXY_MAX_BYTES = 5 * 1024 * 1024; // 5MB
  app.get("/api/ai-music/cover-proxy", isAuthenticated, async (req, res) => {
    let rawUrl = req.query.url as string;
    if (!rawUrl || typeof rawUrl !== "string") {
      return res.status(400).json({ message: "url이 필요합니다." });
    }
    rawUrl = resolveProxyUrl(rawUrl, "/api/ai-music/cover-proxy");
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ message: "잘못된 URL입니다." });
    }
    if (parsed.protocol !== "https:") {
      return res.status(400).json({ message: "https URL만 가능합니다." });
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const imgRes = await fetch(rawUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!imgRes.ok) {
        console.warn("[ai-music cover-proxy] 이미지 응답 실패:", imgRes.status, parsed.hostname, rawUrl.slice(0, 60));
        return res.status(502).json({ message: "이미지를 가져오지 못했습니다." });
      }
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const contentLength = imgRes.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > COVER_PROXY_MAX_BYTES) {
        return res.status(413).json({ message: "이미지 용량이 너무 큽니다." });
      }
      const buf = await imgRes.arrayBuffer();
      if (buf.byteLength > COVER_PROXY_MAX_BYTES) {
        return res.status(413).json({ message: "이미지 용량이 너무 큽니다." });
      }
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(Buffer.from(buf));
    } catch (e) {
      console.error("[ai-music cover-proxy]", (e as Error).message, parsed.hostname, rawUrl.slice(0, 60));
      res.status(502).json({ message: "이미지를 가져오지 못했습니다." });
    }
  });

  const AUDIO_PROXY_MAX_BYTES = 50 * 1024 * 1024; // 50MB
  app.get("/api/ai-music/audio-proxy", isAuthenticated, async (req, res) => {
    let rawUrl = req.query.url as string;
    if (!rawUrl || typeof rawUrl !== "string") {
      return res.status(400).json({ message: "url이 필요합니다." });
    }
    rawUrl = resolveProxyUrl(rawUrl, "/api/ai-music/audio-proxy");
    if (/\/None\.(mp3|wav|ogg)|undefined|null/i.test(rawUrl)) {
      return res.status(400).json({ message: "음원 주소가 올바르지 않습니다. 생성된 곡을 다운로드한 뒤 파일을 직접 선택해 주세요." });
    }
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ message: "잘못된 URL입니다." });
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return res.status(400).json({ message: "http(s) URL만 가능합니다." });
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const audioRes = await fetch(rawUrl, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "audio/*,*/*;q=0.8",
          Referer: parsed.origin + "/",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!audioRes.ok) {
        console.warn("[ai-music audio-proxy] 오디오 응답 실패:", audioRes.status, parsed.hostname, rawUrl.slice(0, 60));
        const expiredHint = audioRes.status === 403 || audioRes.status === 404
          ? " 음원 링크가 만료되었을 수 있습니다. 생성된 곡을 다운로드한 뒤 파일을 직접 선택해 주세요."
          : "";
        return res.status(502).json({ message: "음원을 가져오지 못했습니다." + expiredHint });
      }
      const contentType = audioRes.headers.get("content-type") || "audio/mpeg";
      const ct = contentType.split(";")[0].toLowerCase();
      if (ct && ct !== "application/octet-stream" && !ct.startsWith("audio/")) {
        console.warn("[ai-music audio-proxy] 오디오가 아님:", ct, rawUrl.slice(0, 60));
        return res.status(502).json({ message: "음원을 가져오지 못했습니다. 링크가 만료되었을 수 있습니다. 생성된 곡을 다운로드한 뒤 파일을 직접 선택해 주세요." });
      }
      const contentLength = audioRes.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > AUDIO_PROXY_MAX_BYTES) {
        return res.status(413).json({ message: "음원 용량이 너무 큽니다." });
      }
      const buf = await audioRes.arrayBuffer();
      if (buf.byteLength > AUDIO_PROXY_MAX_BYTES) {
        return res.status(413).json({ message: "음원 용량이 너무 큽니다." });
      }
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(Buffer.from(buf));
    } catch (e) {
      console.error("[ai-music audio-proxy]", (e as Error).message, parsed.hostname, rawUrl.slice(0, 60));
      res.status(502).json({ message: "음원을 가져오지 못했습니다." });
    }
  });

  // 로그인 없이 API 키 유효성만 확인 (디버깅용). SUNOAPI 우선, 없으면 AIMusicAPI.
  app.get("/api/ai-music/check-key", async (_req, res) => {
    if (SUNOAPI_KEY) {
      try {
        const apiRes = await fetch(`${SUNOAPI_BASE}/api/v1/generate/credit`, {
          headers: { Authorization: `Bearer ${SUNOAPI_KEY}` },
        });
        const data = await apiRes.json().catch(() => ({}));
        if (apiRes.ok && (data as { code?: number }).code === 200) {
          return res.json({ ok: true, provider: "suno", credits: (data as { data?: number }).data, keyLength: SUNOAPI_KEY.length });
        }
        return res.status(200).json({
          ok: false,
          provider: "suno",
          status: apiRes.status,
          message: (data as { msg?: string }).msg ?? "API 오류",
          keyLength: SUNOAPI_KEY.length,
        });
      } catch (e) {
        console.error("[ai-music check-key suno]", e);
        return res.status(500).json({ ok: false, provider: "suno", message: "연결 실패" });
      }
    }
    if (!AIMUSICAPI_KEY) {
      return res.status(503).json({ ok: false, message: "SUNOAPI_API_KEY 또는 AIMUSICAPI_API_KEY가 .env에 없습니다.", keyLength: 0 });
    }
    try {
      const apiRes = await fetch(`${AIMUSICAPI_BASE}/api/v1/get-credits`, {
        headers: { Authorization: `Bearer ${AIMUSICAPI_KEY}` },
      });
      const data = await apiRes.json().catch(() => ({}));
      if (apiRes.ok) {
        return res.json({ ok: true, provider: "aimusicapi", credits: data, keyLength: AIMUSICAPI_KEY.length });
      }
      return res.status(200).json({
        ok: false,
        provider: "aimusicapi",
        status: apiRes.status,
        message: (data as { error?: string }).error ?? (data as { message?: string }).message ?? "API 오류",
        keyLength: AIMUSICAPI_KEY.length,
      });
    } catch (e) {
      console.error("[ai-music check-key]", e);
      return res.status(500).json({ ok: false, message: "연결 실패" });
    }
  });

  const FREE_AI_MUSIC_LIMIT_PER_MONTH = 2;
  const STARTER_AI_MUSIC_CREDITS_PER_MONTH = 500;
  const BASIC_AI_MUSIC_CREDITS_PER_MONTH = 1000;
  const PRO_AI_MUSIC_CREDITS_PER_MONTH = 1500;
  const PREMIUM_AI_MUSIC_CREDITS_PER_MONTH = 2000;
  const AI_MUSIC_CREDITS_PER_TRACK = 20;

  function getAiMusicLimit(tier: string | null, role: string | null): number {
    if (role === "admin") return -1;
    if (tier === "premium") return PREMIUM_AI_MUSIC_CREDITS_PER_MONTH;
    if (tier === "pro") return PRO_AI_MUSIC_CREDITS_PER_MONTH;
    if (tier === "basic") return BASIC_AI_MUSIC_CREDITS_PER_MONTH;
    if (tier === "starter") return STARTER_AI_MUSIC_CREDITS_PER_MONTH;
    return FREE_AI_MUSIC_LIMIT_PER_MONTH;
  }

  async function insertAiMusicGenerationLog(params: {
    userId: string;
    user: (typeof users.$inferSelect) | undefined;
    taskId: string;
    provider: "suno" | "aimusicapi";
    body: {
      title?: string;
      tags?: string;
      prompt?: string;
      gpt_description_prompt?: string;
    };
  }): Promise<void> {
    try {
      const { userId, user, taskId, provider, body } = params;
      const tier = user?.subscriptionTier ?? "free";
      const nowLog = new Date();
      const subscriptionActive =
        isPaidSubscriptionTierId(tier) &&
        (user == null || !user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt) > nowLog);
      const billingKind =
        user?.role === "admin" ? "admin" : tier === "free" ? "free" : subscriptionActive ? "subscription" : "credits";
      const creditsCharged =
        billingKind === "admin" || billingKind === "free" ? 0 : AI_MUSIC_CREDITS_PER_TRACK;
      const promptText = (body.prompt ?? body.gpt_description_prompt ?? "").trim();
      const parts = [
        body.title?.trim() && `title: ${body.title.trim()}`,
        body.tags?.trim() && `tags: ${body.tags.trim()}`,
        promptText && `prompt: ${promptText.slice(0, 500)}`,
      ].filter(Boolean) as string[];
      const requestSummary = parts.length ? parts.join(" | ").slice(0, 2000) : null;
      await db.insert(aiMusicGenerationLogs).values({
        userId,
        billingKind,
        subscriptionTierAt: tier,
        provider,
        taskId,
        requestTitle: body.title?.trim().slice(0, 500) || null,
        requestSummary,
        creditsCharged,
        publishments: [],
      });
    } catch (e) {
      console.error("[ai-music generation log insert]", e);
    }
  }

  app.get("/api/ai-music/usage", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user?.claims?.sub as string;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const now = new Date();
      const isPaidTier = user?.role === "admin" || isActivePaidSubscription(user, now);
      const limit = getAiMusicLimit(user?.subscriptionTier ?? null, user?.role ?? null);
      const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [usage] = await db.select().from(aiMusicUsage).where(and(eq(aiMusicUsage.userId, userId), eq(aiMusicUsage.periodMonth, periodMonth)));
      const usedThisMonth = usage?.count ?? 0;
      const tier = user?.subscriptionTier ?? "free";
      const subActive = isActivePaidSubscription(user, now);
      /** 유효 유료 플랜: 지갑 미차감. 만료된 유료 플랜만 지갑 차감 경로와 동일하게 UI에 표시. */
      const deductsCreditsPerCreate =
        user?.role !== "admin" && isPaidSubscriptionTierId(tier) && !subActive;
      const walletCredits = user?.credits ?? 0;
      const quotaKind: "songs" | "subscription_credits" | "unlimited" =
        user?.role === "admin" ? "unlimited" : tier === "free" ? "songs" : "subscription_credits";
      return res.json({
        limit,
        usedThisMonth,
        isPaidTier,
        walletCredits,
        creditsBalance: walletCredits,
        quota: { kind: quotaKind, used: usedThisMonth, limit },
        creditsPerMusicCreate: AI_MUSIC_CREDITS_PER_TRACK,
        deductsCreditsPerCreate,
      });
    } catch (e) {
      console.error("[ai-music usage]", e);
      res.status(500).json({
        limit: FREE_AI_MUSIC_LIMIT_PER_MONTH,
        usedThisMonth: 0,
        isPaidTier: false,
        walletCredits: 0,
        creditsBalance: 0,
        quota: { kind: "songs" as const, used: 0, limit: FREE_AI_MUSIC_LIMIT_PER_MONTH },
        creditsPerMusicCreate: AI_MUSIC_CREDITS_PER_TRACK,
        deductsCreditsPerCreate: false,
      });
    }
  });

  app.get("/api/ai-music/check", isAuthenticated, async (_req, res) => {
    if (!AI_MUSIC_PROVIDER) {
      return res.status(503).json({ ok: false, message: "SUNOAPI_API_KEY 또는 AIMUSICAPI_API_KEY가 .env에 없습니다." });
    }
    if (SUNOAPI_KEY) {
      try {
        const apiRes = await fetch(`${SUNOAPI_BASE}/api/v1/generate/credit`, { headers: { Authorization: `Bearer ${SUNOAPI_KEY}` } });
        const data = await apiRes.json().catch(() => ({}));
        if (apiRes.ok && (data as { code?: number }).code === 200) {
          return res.json({ ok: true, provider: "suno", credits: (data as { data?: number }).data });
        }
        return res.status(200).json({ ok: false, status: apiRes.status, message: (data as { msg?: string }).msg ?? "API 오류" });
      } catch (e) {
        console.error("[ai-music check suno]", e);
        return res.status(500).json({ ok: false, message: "연결 실패" });
      }
    }
    try {
      const apiRes = await fetch(`${AIMUSICAPI_BASE}/api/v1/get-credits`, { headers: { Authorization: `Bearer ${AIMUSICAPI_KEY}` } });
      const data = await apiRes.json().catch(() => ({}));
      if (apiRes.ok) return res.json({ ok: true, provider: "aimusicapi", credits: data });
      return res.status(200).json({ ok: false, status: apiRes.status, message: (data as { error?: string }).error ?? (data as { message?: string }).message ?? "API 오류" });
    } catch (e) {
      console.error("[ai-music check]", e);
      return res.status(500).json({ ok: false, message: "연결 실패" });
    }
  });

  app.post("/api/ai-music/create", isAuthenticated, async (req, res) => {
    if (!AI_MUSIC_PROVIDER) {
      return res.status(503).json({ message: "AI 음악 생성 API가 설정되지 않았습니다. .env에 SUNOAPI_API_KEY 또는 AIMUSICAPI_API_KEY를 설정하세요." });
    }
    // @ts-ignore
    const userId = req.user?.claims?.sub as string;
    if (!userId || typeof userId !== "string") {
      return res.status(401).json({ message: "로그인이 필요합니다." });
    }
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const now = new Date();
    const isPaidTier = user?.role === "admin" || isActivePaidSubscription(user, now);
    const limit = getAiMusicLimit(user?.subscriptionTier ?? null, user?.role ?? null);
    const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [usage] = await db.select().from(aiMusicUsage).where(and(eq(aiMusicUsage.userId, userId), eq(aiMusicUsage.periodMonth, periodMonth)));
    const used = usage?.count ?? 0;
    const tierNow = user?.subscriptionTier ?? "free";
    /** Free: count = 곡 수. Pro/Premium 월 한도: count = 이번 달 사용한 AI 크레딧 합계(곡당 20). */
    const usageWouldExceed =
      limit >= 0 &&
      (tierNow === "free" ? used >= limit : used + AI_MUSIC_CREDITS_PER_TRACK > limit);
    if (usageWouldExceed) {
      return res.status(403).json({
        message: limit === FREE_AI_MUSIC_LIMIT_PER_MONTH
          ? `Free 플랜은 월 ${limit}곡까지 AI 음악 생성이 가능합니다. 유료 플랜으로 업그레이드하면 월 500~2,000 크레딧을 사용할 수 있습니다.`
          : `이번 달 AI 음악 생성 한도(${limit} 크레딧)를 모두 사용했습니다.`,
        code: "AI_MUSIC_LIMIT_REACHED",
        limit,
        usedThisMonth: used,
      });
    }

    const body = req.body as {
      custom_mode?: boolean;
      prompt?: string;
      gpt_description_prompt?: string;
      title?: string;
      tags?: string;
      mv?: string;
      vocal_gender?: "f" | "m";
      make_instrumental?: boolean;
    };
    const customMode = body.custom_mode ?? false;
    const makeInstrumental = body.make_instrumental === true;

    /** @returns 이번 요청에서 지갑(users.credits)에서 차감한 크레딧(없으면 0). 유효 Pro/Premium은 구독 월 한도만 소모하고 지갑은 건드리지 않음. */
    async function incrementAiMusicUsageAndDeductCredits(): Promise<number> {
      if (user?.role === "admin") return 0;
      // Free: 월 2곡까지만, 크레딧 차감 없이 카운트만
      if ((user?.subscriptionTier ?? "free") === "free") {
        await db.execute(sql`
          INSERT INTO ai_music_usage (user_id, period_month, count, updated_at)
          VALUES (${userId}, ${periodMonth}, 1, NOW())
          ON CONFLICT (user_id, period_month) DO UPDATE SET count = ai_music_usage.count + 1, updated_at = NOW()
        `);
        return 0;
      }
      // 유효 유료 플랜: 요금제에 포함된 월 AI 크레딧 한도만 사용 — 크레딧 충전 잔액과 무관
      if (isPaidTier) {
        await db.execute(sql`
          INSERT INTO ai_music_usage (user_id, period_month, count, updated_at)
          VALUES (${userId}, ${periodMonth}, ${AI_MUSIC_CREDITS_PER_TRACK}, NOW())
          ON CONFLICT (user_id, period_month) DO UPDATE SET count = ai_music_usage.count + ${AI_MUSIC_CREDITS_PER_TRACK}, updated_at = NOW()
        `);
        return 0;
      }
      // 등급은 pro/premium이나 구독 만료 등: 기존처럼 지갑 크레딧 차감 + 사용량(크레딧 단위) 반영
      await db.transaction(async (tx) => {
        const [u] = await tx.select().from(users).where(eq(users.id, userId));
        const currentCredits = u?.credits ?? 0;
        if (currentCredits < AI_MUSIC_CREDITS_PER_TRACK) {
          throw new Error("INSUFFICIENT_CREDITS");
        }
        await tx
          .update(users)
          .set({ credits: currentCredits - AI_MUSIC_CREDITS_PER_TRACK, updatedAt: new Date() })
          .where(eq(users.id, userId));
        await tx.insert(creditTransactions).values({
          userId,
          type: "ai_music_create",
          amount: -AI_MUSIC_CREDITS_PER_TRACK,
          description: "AI 음악 생성",
        });
        await tx.execute(sql`
          INSERT INTO ai_music_usage (user_id, period_month, count, updated_at)
          VALUES (${userId}, ${periodMonth}, ${AI_MUSIC_CREDITS_PER_TRACK}, NOW())
          ON CONFLICT (user_id, period_month) DO UPDATE SET count = ai_music_usage.count + ${AI_MUSIC_CREDITS_PER_TRACK}, updated_at = NOW()
        `);
      });
      return AI_MUSIC_CREDITS_PER_TRACK;
    }

    async function notifyCreditsDeductedForAiCreate(creditsCharged: number) {
      if (creditsCharged <= 0) return;
      try {
        await storage.createNotification({
          userId,
          type: "system",
          message: `AI 음악 생성 요청으로 ${creditsCharged} 크레딧이 차감되었습니다.`,
          payload: { creditsCharged, kind: "ai_music_create" },
          url: "/credits",
        });
      } catch (e) {
        console.error("[ai-music create] credit notification", e);
      }
    }

    if (SUNOAPI_KEY) {
      const siteBase = (process.env.SITE_URL || "https://venysound.com").replace(/\/$/, "");
      const callBackUrl = `${siteBase}/api/ai-music/suno-callback`;
      const model = (body.mv === "V5" || body.mv === "V4_5" || body.mv === "V4_5PLUS" || body.mv === "V4") ? body.mv : "V4_5ALL";
      const payload: Record<string, unknown> = {
        customMode,
        instrumental: makeInstrumental,
        model,
        callBackUrl,
      };
      if (customMode) {
        payload.style = (body.tags ?? "").trim() || "pop";
        payload.title = (body.title ?? "").trim() || "Untitled";
        if (!makeInstrumental) payload.prompt = (body.prompt ?? "").trim() || "";
      } else {
        const stylePart = (body.tags ?? "").trim();
        const descPart = (body.gpt_description_prompt ?? body.prompt ?? "").trim();
        const combined = stylePart ? `[스타일] ${stylePart}${descPart ? "\n\n" + descPart : ""}` : descPart;
        payload.prompt = combined.slice(0, 500);
      }
      if (body.vocal_gender) payload.vocalGender = body.vocal_gender;
      try {
        const apiRes = await fetch(`${SUNOAPI_BASE}/api/v1/generate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SUNOAPI_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await apiRes.json().catch(() => ({}));
        if (!apiRes.ok) {
          const msg = (data as { msg?: string }).msg ?? "API 요청 실패";
          return res.status(apiRes.status >= 400 && apiRes.status < 500 ? apiRes.status : 502).json({ message: String(msg) });
        }
        const sunoBizCode = (data as { code?: number }).code;
        if (typeof sunoBizCode === "number" && sunoBizCode !== 200) {
          const msg = (data as { msg?: string }).msg ?? "Suno API 오류";
          return res.status(502).json({ message: String(msg) });
        }
        const d = data as { data?: { taskId?: string; task_id?: string }; taskId?: string; task_id?: string };
        const taskId =
          (typeof d?.data?.taskId === "string" && d.data.taskId) ||
          (typeof d?.data?.task_id === "string" && d.data.task_id) ||
          (typeof d?.taskId === "string" && d.taskId) ||
          (typeof d?.task_id === "string" && d.task_id) ||
          "";
        if (!taskId) {
          console.warn("[ai-music create suno] 응답 구조:", JSON.stringify(data).slice(0, 300));
          return res.status(502).json({ message: "API 응답에 taskId가 없습니다." });
        }
        const creditsCharged = await incrementAiMusicUsageAndDeductCredits();
        await notifyCreditsDeductedForAiCreate(creditsCharged);
        await insertAiMusicGenerationLog({
          userId,
          user,
          taskId,
          provider: "suno",
          body: { title: body.title, tags: body.tags, prompt: body.prompt, gpt_description_prompt: body.gpt_description_prompt },
        });
        const [uAfterSuno] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userId));
        return res.json({
          task_id: taskId,
          provider: "suno",
          credits_charged: creditsCharged,
          credits_balance: uAfterSuno?.credits ?? 0,
        });
      } catch (e) {
        console.error("[ai-music create suno]", e);
        const errMsg = e instanceof Error ? e.message : String(e);
        if (errMsg === "INSUFFICIENT_CREDITS" || errMsg.includes("INSUFFICIENT_CREDITS")) {
          return res.status(402).json({ message: "크레딧이 부족합니다.", code: "INSUFFICIENT_CREDITS" });
        }
        const payload: { message: string; code: string; detail?: string } = {
          message: "음악 생성 요청 중 오류가 발생했습니다.",
          code: "AI_MUSIC_CREATE_ERROR",
        };
        if (process.env.NODE_ENV === "development") payload.detail = errMsg.slice(0, 500);
        return res.status(500).json(payload);
      }
    }

    try {
      const mv = body.mv || "sonic-v4-5";
      const payload: Record<string, unknown> = { task_type: "create_music", custom_mode: customMode, mv };
      if (customMode && body.prompt) payload.prompt = body.prompt;
      else if (!customMode) {
        const stylePart = (body.tags ?? "").trim();
        const descPart = (body.gpt_description_prompt ?? body.prompt ?? "").trim();
        payload.gpt_description_prompt = stylePart ? `[스타일] ${stylePart}${descPart ? "\n\n" + descPart : ""}` : descPart;
      }
      if (body.title) payload.title = body.title;
      if (body.tags) payload.tags = body.tags;
      if (body.vocal_gender) payload.vocal_gender = body.vocal_gender;
      if (makeInstrumental) payload.make_instrumental = true;

      const apiRes = await fetch(`${AIMUSICAPI_BASE}/api/v1/sonic/create`, {
        method: "POST",
        headers: { Authorization: `Bearer ${AIMUSICAPI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await apiRes.json().catch(() => ({}));
      if (!apiRes.ok) {
        const msg = (data as { error?: string; message?: string }).error ?? (data as { message?: string }).message ?? "API 요청 실패";
        const hint = apiRes.status === 401 ? " .env의 AIMUSICAPI_API_KEY를 확인하세요." : "";
        return res.status(apiRes.status >= 400 && apiRes.status < 500 ? apiRes.status : 502).json({ message: String(msg) + hint });
      }
      const d = data as { task_id?: string; taskId?: string; data?: { task_id?: string; taskId?: string } };
      const taskId =
        (typeof d?.task_id === "string" && d.task_id) ||
        (typeof d?.taskId === "string" && d.taskId) ||
        (typeof d?.data?.task_id === "string" && d.data.task_id) ||
        (typeof d?.data?.taskId === "string" && d.data.taskId) ||
        "";
      if (!taskId) {
        console.warn("[ai-music create aimusicapi] 응답 구조:", JSON.stringify(data).slice(0, 300));
        return res.status(502).json({ message: "API 응답에 task_id가 없습니다." });
      }
      const creditsCharged = await incrementAiMusicUsageAndDeductCredits();
      await notifyCreditsDeductedForAiCreate(creditsCharged);
      await insertAiMusicGenerationLog({
        userId,
        user,
        taskId,
        provider: "aimusicapi",
        body: { title: body.title, tags: body.tags, prompt: body.prompt, gpt_description_prompt: body.gpt_description_prompt },
      });
      const [uAfterAimusic] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userId));
      res.json({
        task_id: taskId,
        provider: "aimusicapi",
        credits_charged: creditsCharged,
        credits_balance: uAfterAimusic?.credits ?? 0,
      });
    } catch (e) {
      console.error("[ai-music create]", e);
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg === "INSUFFICIENT_CREDITS" || errMsg.includes("INSUFFICIENT_CREDITS")) {
        return res.status(402).json({ message: "크레딧이 부족합니다.", code: "INSUFFICIENT_CREDITS" });
      }
      const payload: { message: string; code: string; detail?: string } = {
        message: "음악 생성 요청 중 오류가 발생했습니다.",
        code: "AI_MUSIC_CREATE_ERROR",
      };
      if (process.env.NODE_ENV === "development") payload.detail = errMsg.slice(0, 500);
      res.status(500).json(payload);
    }
  });

  app.get("/api/ai-music/task/:taskId", isAuthenticated, async (req, res) => {
    if (!AI_MUSIC_PROVIDER) {
      return res.status(503).json({ message: "AI 음악 생성 API가 설정되지 않았습니다." });
    }
    const taskId = req.params.taskId;
    const provider = (req.query.provider as string) || AI_MUSIC_PROVIDER;
    if (!taskId) return res.status(400).json({ message: "task_id가 필요합니다." });

    if (provider === "suno" && SUNOAPI_KEY) {
      try {
        const cached = sunoCallbackResults.get(taskId);
        if (cached) {
          sunoCallbackResults.delete(taskId);
          return res.json(cached);
        }
        const apiRes = await fetch(`${SUNOAPI_BASE}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
          headers: { Authorization: `Bearer ${SUNOAPI_KEY}` },
        });
        const data = await apiRes.json().catch(() => ({}));
        if (!apiRes.ok) {
          return res.status(apiRes.status >= 400 && apiRes.status < 500 ? apiRes.status : 502).json({ message: (data as { msg?: string }).msg ?? "조회 실패" });
        }
        const d = (data as { data?: { status?: string; response?: { sunoData?: unknown[] }; errorMessage?: string; param?: string } }).data;
        const status = d?.status ?? "PENDING";
        if (status === "SUCCESS" && Array.isArray(d?.response?.sunoData)) {
          let customMode = false;
          try {
            if (typeof d?.param === "string") {
              const param = JSON.parse(d.param) as { customMode?: boolean };
              customMode = param.customMode === true;
            }
          } catch {}
          const list = (d.response.sunoData as { id?: string; audioUrl?: string; imageUrl?: string; title?: string; tags?: string; prompt?: string }[]).map((t) => ({
            clip_id: t.id,
            audio_url: t.audioUrl,
            image_url: t.imageUrl,
            title: t.title,
            tags: t.tags,
            prompt: t.prompt,
            custom_mode: customMode,
          }));
          return res.json({ state: "succeeded", data: list });
        }
        if (["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"].includes(status)) {
          return res.json({ state: "failed", message: d?.errorMessage ?? "생성에 실패했습니다.", data: null });
        }
        return res.json({ state: status === "TEXT_SUCCESS" || status === "FIRST_SUCCESS" ? "running" : "pending", data: null });
      } catch (e) {
        console.error("[ai-music task suno]", e);
        return res.status(500).json({ message: "작업 조회 중 오류가 발생했습니다." });
      }
    }

    try {
      const apiRes = await fetch(`${AIMUSICAPI_BASE}/api/v1/sonic/task/${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${AIMUSICAPI_KEY}` },
      });
      const data = await apiRes.json().catch(() => ({}));
      if (!apiRes.ok) {
        return res.status(apiRes.status >= 400 && apiRes.status < 500 ? apiRes.status : 502).json({ message: (data as { message?: string }).message ?? "조회 실패" });
      }
      const arr = (data as { data?: unknown[] }).data;
      const rawList = Array.isArray(arr) ? arr : [];
      const first = rawList[0] as { state?: string } | undefined;
      const state = first?.state ?? "pending";
      if (state === "succeeded") {
        const list = rawList.map((item: any) => {
          const t = item?.full ?? item?.extended ?? item;
          return {
            clip_id: t?.clip_id ?? t?.id,
            audio_url: t?.audio_url ?? t?.audioUrl,
            image_url: t?.image_url ?? t?.imageUrl,
            title: t?.title,
            tags: t?.tags,
            prompt: t?.prompt ?? t?.lyrics ?? t?.gpt_description_prompt,
            custom_mode: false,
          };
        });
        return res.json({ state: "succeeded", data: list });
      }
      if (state === "failed") return res.json({ state: "failed", message: (first as { error?: string }).error ?? "생성에 실패했습니다.", data: null });
      res.json({ state: state === "running" ? "running" : "pending", data: null });
    } catch (e) {
      console.error("[ai-music task]", e);
      res.status(500).json({ message: "작업 조회 중 오류가 발생했습니다." });
    }
  });

  // === AI 음악 사이트 공개 발행 ===
  app.post("/api/ai-music/publish", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user?.claims?.sub as string;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const now = new Date();
      const isPaidTier = user?.role === "admin" || isActivePaidSubscription(user, now);

      const { audioUrl, imageUrl, title, tags, genre, prompt, taskId: publishTaskId, clipId: publishClipId, generationProvider } = req.body as {
        audioUrl: string;
        imageUrl?: string;
        title?: string;
        tags?: string;
        genre?: string;
        prompt?: string;
        taskId?: string;
        clipId?: string;
        generationProvider?: string;
      };
      if (!audioUrl || typeof audioUrl !== "string") {
        return res.status(400).json({ message: "audioUrl이 필요합니다." });
      }

      // 무료 유저: AI 공개곡 1곡 제한
      if (!isPaidTier) {
        const existing = await db.execute(sql`SELECT COUNT(*) as cnt FROM music WHERE user_id = ${userId} AND is_ai = true`);
        const cnt = Number((existing.rows[0] as any)?.cnt ?? 0);
        if (cnt >= 1) {
          return res.status(403).json({
            message: "무료 플랜은 AI 생성곡을 1곡까지 공개할 수 있습니다. Pro로 업그레이드하면 무제한 공개가 가능합니다.",
            code: "AI_PUBLISH_LIMIT_REACHED",
          });
        }
      }

      // Suno 오디오 URL 유효성 검사 (만료된 링크 차단)
      if (/\/None\.(mp3|wav|ogg)|undefined|null/i.test(audioUrl)) {
        return res.status(400).json({ message: "음원 링크가 올바르지 않습니다." });
      }

      const localUploadsDir = path.resolve(process.cwd(), "local-uploads", "uploads");
      mkdirSync(localUploadsDir, { recursive: true });

      // 1) 오디오 다운로드 후 로컬 저장
      const audioId = crypto.randomUUID();
      const audioFilename = `${audioId}.mp3`;
      const audioLocalPath = path.join(localUploadsDir, audioFilename);

      let audioRes: Response;
      try {
        audioRes = await fetch(audioUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      } catch (e) {
        return res.status(502).json({ message: "음원 다운로드에 실패했습니다. 링크가 만료되었을 수 있습니다." });
      }
      if (!audioRes.ok) {
        return res.status(502).json({ message: `음원 다운로드 실패 (${audioRes.status}). 링크가 만료되었을 수 있습니다.` });
      }
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
      if (audioBuffer.length < 10000) {
        return res.status(502).json({ message: "음원 파일이 너무 작습니다. 링크가 만료되었을 수 있습니다." });
      }
      writeFileSync(audioLocalPath, audioBuffer);

      // 2) 커버 이미지 다운로드 (선택)
      let savedImagePath: string | null = null;
      if (imageUrl && typeof imageUrl === "string" && /^https?:\/\//i.test(imageUrl)) {
        try {
          const imgRes = await fetch(imageUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
          if (imgRes.ok) {
            const imgBuf = Buffer.from(await imgRes.arrayBuffer());
            if (imgBuf.length > 1000) { // 최소 크기 확인
              const imgId = crypto.randomUUID();
              const imgFilename = `${imgId}.jpg`;
              writeFileSync(path.join(localUploadsDir, imgFilename), imgBuf);
              // 프론트엔드가 /objects/uploads/ 경로로 접근해야 함
              savedImagePath = `/objects/uploads/${imgFilename}`;
            }
          }
        } catch {
          // 이미지 실패는 무시하고 계속
        }
      }

      // 3) 장르/태그 결정
      // Suno description 모드에서 tags 필드에 이미지 프롬프트 텍스트가 담길 수 있음
      // 짧고 album cover/cinematic 등 이미지 관련 단어 없으면 음악 스타일 태그로 사용
      const rawTags = (tags || "").trim();
      const isImagePrompt = rawTags.length > 60 || /album\s*cover|cinematic|photo|image|visual|artwork/i.test(rawTags);
      const cleanedTags = isImagePrompt ? "" : rawTags;
      const resolvedGenre = genre
        || (cleanedTags ? cleanedTags.split(/[,;\s]+/).map((t: string) => t.trim()).filter(Boolean)[0] : "")
        || "팝뮤직";
      const trackTitle = (title || "AI 생성 음악").trim();
      const artistName = user?.firstName || user?.email?.split("@")[0] || "AI Artist";

      // 4) DB에 음악 등록
      const resolvedAiProvider =
        generationProvider === "aimusicapi" || generationProvider === "suno" ? generationProvider : "suno";

      const newMusic = await storage.createMusic({
        title: trackTitle,
        artist: artistName,
        filename: audioFilename,
        imageFilename: savedImagePath,
        genre: resolvedGenre,
        tags: cleanedTags,
        lyrics: null,
        isAi: true,
        aiProvider: resolvedAiProvider,
        price: 0,
        isDownloadable: false, // 무료·유료 모두 AI 공개곡은 기본 다운로드 불가 (관리자가 수동 허용)
        userId,
      });

      const logTaskId = typeof publishTaskId === "string" ? publishTaskId.trim() : "";
      if (logTaskId) {
        try {
          const [logRow] = await db
            .select()
            .from(aiMusicGenerationLogs)
            .where(and(eq(aiMusicGenerationLogs.userId, userId), eq(aiMusicGenerationLogs.taskId, logTaskId)))
            .limit(1);
          if (logRow) {
            const clipStr = typeof publishClipId === "string" ? publishClipId.trim() : "";
            const entry = {
              musicId: newMusic.id,
              clipId: clipStr || null,
              deployment: "site",
              publishedAt: new Date().toISOString(),
            };
            const prev = Array.isArray(logRow.publishments) ? logRow.publishments : [];
            await db
              .update(aiMusicGenerationLogs)
              .set({ publishments: [...prev, entry] })
              .where(eq(aiMusicGenerationLogs.id, logRow.id));
          }
        } catch (logErr) {
          console.error("[ai-music publish generation log]", logErr);
        }
      }

      console.log(`[ai-music publish] userId=${userId} isPaid=${isPaidTier} musicId=${newMusic.id} title="${trackTitle}"`);
      res.status(201).json({ music: newMusic });
    } catch (e) {
      console.error("[ai-music publish]", e);
      res.status(500).json({ message: "공개 처리 중 오류가 발생했습니다." });
    }
  });

  // === Music Routes ===
  app.get(api.music.list.path, async (req, res) => {
    const { genre, search, tag, page, limit } = req.query as { genre?: string, search?: string, tag?: string, page?: string, limit?: string };
    const pageNum = Math.max(1, parseInt(page || "1", 10));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit || "30", 10)));
    const result = await storage.getMusicList(genre, search, tag, pageNum, limitNum);
    res.json(result);
  });

  app.get("/api/music/tags", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        WITH expanded AS (
          SELECT trim(unnest(string_to_array(music.tags, ','))) AS tag
          FROM music
          WHERE music.tags IS NOT NULL AND trim(music.tags) != ''
        )
        SELECT tag, count(*)::int AS cnt
        FROM expanded
        WHERE tag != ''
        GROUP BY tag
        ORDER BY cnt DESC
        LIMIT 30
      `);
      const tags = (result.rows as { tag: string; cnt: number }[]).map((r) => r.tag);
      res.json(tags);
    } catch (e) {
      console.error("[music/tags]", e);
      res.json([]);
    }
  });

  app.get("/api/music/genres", async (_req, res) => {
    try {
      const [distinctMusic, curatedList] = await Promise.all([
        db.execute(sql`SELECT DISTINCT genre FROM music WHERE genre IS NOT NULL AND trim(genre) != '' ORDER BY genre`),
        storage.getCuratedPlaylists(),
      ]);
      const fromMusic = (distinctMusic.rows as { genre: string }[]).map((r) => r.genre.trim());
      const fromCurated: string[] = [];
      for (const pl of curatedList) {
        if (pl.genreMain && pl.genreMain.trim()) fromCurated.push(pl.genreMain.trim());
        if (pl.genreSub && pl.genreSub.trim()) fromCurated.push(pl.genreSub.trim());
      }
      const combined = Array.from(new Set([...fromMusic, ...fromCurated])).filter(Boolean).sort((a, b) => a.localeCompare(b));
      res.json(combined);
    } catch (e) {
      console.error("[music/genres]", e);
      res.json([]);
    }
  });

  app.get("/api/music/my-likes", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    const likedMusic = await storage.getLikedMusic(userId);
    res.json(likedMusic.map(m => m.id));
  });

  app.get("/api/music/like-counts", async (_req, res) => {
    try {
      const counts = await storage.getMusicLikeCounts();
      res.json(counts);
    } catch (err) {
      res.status(500).json({ message: "좋아요 수를 불러올 수 없습니다" });
    }
  });

  app.get("/api/music/play-counts", async (_req, res) => {
    try {
      const counts = await storage.getMusicPlayCounts();
      res.json(counts);
    } catch (err) {
      res.status(500).json({ message: "재생 수를 불러올 수 없습니다" });
    }
  });

  app.get("/api/music/top-weekly", async (req, res) => {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
      const list = await storage.getWeeklyTopTracks(limit);
      res.json(list);
    } catch (e) {
      console.error("[music/top-weekly]", e);
      res.json([]);
    }
  });

  app.get("/api/music/recent", async (req, res) => {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 12));
      const days = Math.min(90, Math.max(1, parseInt(String(req.query.days), 10) || 7));
      const list = await storage.getRecentMusic(days, limit);
      res.json(list);
    } catch (e) {
      console.error("[music/recent]", e);
      res.json([]);
    }
  });

  app.get("/api/artists/top-weekly", async (req, res) => {
    try {
      const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit), 10) || 8));
      const artists = await storage.getWeeklyTopArtists(limit);
      res.json({ artists });
    } catch (e) {
      console.error("[artists/top-weekly]", e);
      res.json({ artists: [] });
    }
  });

  app.get("/api/music/popular", async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT 
          m.*,
          u.subscription_tier as uploader_subscription_tier,
          u.subscription_expires_at as uploader_subscription_expires_at,
          u.role as uploader_role,
          COALESCE(l.like_count, 0) as like_count,
          COALESCE(s.stream_seconds, 0) as stream_seconds,
          (COALESCE(l.like_count, 0) * 100 + COALESCE(s.stream_seconds, 0)) as popularity_score
        FROM music m
        LEFT JOIN users u ON u.id = m.user_id
        LEFT JOIN (
          SELECT music_id, COUNT(*) as like_count FROM likes GROUP BY music_id
        ) l ON l.music_id = m.id
        LEFT JOIN (
          SELECT music_id, SUM(duration_seconds) as stream_seconds FROM streaming_logs GROUP BY music_id
        ) s ON s.music_id = m.id
        ORDER BY popularity_score DESC
        LIMIT 20
      `);
      const now = new Date();
      const rows = (result.rows as any[]).map(r => {
        const tier = r.uploader_subscription_tier;
        const expiresAt = r.uploader_subscription_expires_at;
        const subscriptionPremium =
          isPaidSubscriptionTierId(tier) && (expiresAt == null || new Date(expiresAt) > now);
        const isPremium = r.uploader_role === "admin" || subscriptionPremium;
        return {
          id: Number(r.id),
          title: r.title,
          artist: r.artist,
          filename: r.filename,
          imageFilename: r.image_filename,
          genre: r.genre,
          tags: r.tags,
          isAi: r.is_ai,
          price: Number(r.price || 0),
          isDownloadable: r.is_downloadable,
          userId: r.user_id,
          createdAt: r.created_at,
          uploaderSubscriptionTier: isPremium ? (tier ?? "pro") : "free",
          likeCount: Number(r.like_count || 0),
          streamSeconds: Number(r.stream_seconds || 0),
        };
      });
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: "인기 음원을 불러올 수 없습니다" });
    }
  });

  app.get("/api/music/random-cover", isAuthenticated, async (req, res) => {
    try {
      const musicKeywords = [
        "music", "guitar", "piano", "concert", "headphones", "vinyl",
        "microphone", "studio", "drums", "saxophone", "violin", "dj",
        "synthesizer", "audio", "musician", "orchestra", "notes",
        "acoustic", "singing", "band", "record", "speakers"
      ];
      const keyword = musicKeywords[Math.floor(Math.random() * musicKeywords.length)];
      const random = Math.floor(Math.random() * 1000);
      const response = await fetch(
        `https://source.unsplash.com/600x600/?${keyword}&sig=${random}`,
        { redirect: "manual" }
      );
      const redirectUrl = response.headers.get("location");
      if (redirectUrl) {
        res.json({ imageUrl: redirectUrl });
      } else {
        const fallbackRes = await fetch("https://picsum.photos/600/600", { redirect: "manual" });
        const fallbackUrl = fallbackRes.headers.get("location");
        res.json({ imageUrl: fallbackUrl || `https://picsum.photos/seed/${random}/600/600` });
      }
    } catch (err) {
      console.error("Random cover fetch error:", err);
      const fallback = `https://picsum.photos/seed/${Date.now()}/600/600`;
      res.json({ imageUrl: fallback });
    }
  });

  /** 음원 스트리밍 (더 구체적인 경로이므로 api.music.get보다 먼저 등록) */
  app.get("/api/music/:id/stream", async (req, res) => {
    try {
      const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parsePositiveIntParam(raw);
      if (id == null) {
        return res.status(400).json({ error: "잘못된 음원 ID입니다" });
      }
      const music = await storage.getMusicById(id);
      if (!music) {
        return res.status(404).json({ error: "Music not found" });
      }
      const fn = music.filename || "";

      // ── 1) 외부 URL (https://...) → 직접 리다이렉트
      if (/^https?:\/\//i.test(fn)) {
        res.set("Cache-Control", "no-store");
        return res.redirect(302, fn);
      }

      // ── 2) fileId 추출: /objects/uploads/UUID 포함 모든 경로 처리
      let fileId = "";
      const objMatch = fn.match(/\/objects\/uploads\/(.+)$/);
      if (objMatch) {
        fileId = objMatch[1];
      } else if (fn.startsWith("uploads/")) {
        fileId = fn.replace(/^uploads\//, "");
      } else if (/^[a-f0-9-]{36}(\.[a-z]+)?$/i.test(fn.trim())) {
        fileId = fn.trim();
      } else if (fn.includes("/")) {
        fileId = fn.split("/").pop() || "";
      } else {
        fileId = fn;
      }
      fileId = fileId.replace(/^\//, "");
      if (!fileId) {
        res.set("Content-Type", "audio/mpeg");
        return res.status(404).end();
      }
      const baseId = fileId.replace(/\.(mp3|wav|ogg)$/i, "");
      const candidates = [
        path.join(uploadsDir, fileId),
        path.join(uploadsDir, `${baseId}.mp3`),
        path.join(uploadsDir, `${baseId}.wav`),
        path.join(uploadsDir, `${baseId}.ogg`),
      ];
      const localPath = candidates.find((p) => existsSync(p));
      if (!localPath) {
        // 로컬에 없으면 /objects/ 경로로 리다이렉트 (Replit object storage 폴백)
        if (fn.startsWith("/objects/") || fn.startsWith("objects/")) {
          const objPath = fn.startsWith("/") ? fn : `/${fn}`;
          res.set("Cache-Control", "no-store");
          return res.redirect(302, objPath);
        }
        res.set("Content-Type", "audio/mpeg");
        return res.status(404).end();
      }
      const ext = path.extname(localPath).toLowerCase();
      const mime: Record<string, string> = {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
      };
      const contentType = mime[ext] || "audio/mpeg";
      const stat = statSync(localPath);
      const fileSize = stat.size;
      const rangeHeader = req.headers.range;

      res.set("Accept-Ranges", "bytes");
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
      res.set("Last-Modified", stat.mtime.toUTCString());
      const etag = `W/\"${fileSize}-${Math.floor(stat.mtimeMs)}\"`;
      res.set("ETag", etag);
      // 일부 브라우저/프록시에서 다운로드로 처리되지 않도록 inline 힌트
      res.set("Content-Disposition", "inline");

      // 조건부 GET (range 없는 경우에만)
      if (!rangeHeader) {
        const ifNoneMatch = req.headers["if-none-match"];
        const ifModifiedSince = req.headers["if-modified-since"];
        if (ifNoneMatch && String(ifNoneMatch).trim() === etag) {
          return res.status(304).end();
        }
        if (ifModifiedSince) {
          const ims = new Date(String(ifModifiedSince)).getTime();
          if (!Number.isNaN(ims) && stat.mtime.getTime() <= ims) {
            return res.status(304).end();
          }
        }
      }

      if (rangeHeader) {
        const m = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader).trim());
        if (!m) {
          res.status(416);
          res.set("Content-Range", `bytes */${fileSize}`);
          return res.end();
        }
        const startStr = m[1];
        const endStr = m[2];
        let start: number | null = startStr ? parseInt(startStr, 10) : null;
        let end: number | null = endStr ? parseInt(endStr, 10) : null;
        if (start != null && Number.isNaN(start)) start = null;
        if (end != null && Number.isNaN(end)) end = null;

        // suffix-byte-range-spec: bytes=-500 (마지막 500바이트)
        if (start == null && end != null) {
          const suffixLen = Math.max(0, end);
          start = Math.max(0, fileSize - suffixLen);
          end = fileSize - 1;
        } else {
          if (start == null) start = 0;
          if (end == null || end >= fileSize) end = fileSize - 1;
        }
        if (start >= fileSize || start < 0 || end < 0 || start > end) {
          res.status(416);
          res.set("Content-Range", `bytes */${fileSize}`);
          return res.end();
        }
        const chunkSize = end - start + 1;
        res.status(206);
        res.set("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        res.set("Content-Length", String(chunkSize));
        const stream = createReadStream(localPath, { start, end });
        res.on("close", () => stream.destroy());
        stream.on("error", () => {
          if (!res.headersSent) res.status(500).end();
          else res.destroy();
        });
        stream.pipe(res);
      } else {
        res.set("Content-Length", String(fileSize));
        const stream = createReadStream(localPath);
        res.on("close", () => stream.destroy());
        stream.on("error", () => {
          if (!res.headersSent) res.status(500).end();
          else res.destroy();
        });
        stream.pipe(res);
      }
    } catch (e) {
      if (res.headersSent) return;
      console.error("[api/music/:id/stream]", e);
      res.status(500).json({ error: "음원 스트리밍 중 오류가 발생했습니다" });
    }
  });

  app.get(api.music.get.path, async (req, res) => {
    try {
      const id = parsePositiveIntParam(req.params.id);
      if (id == null) {
        return res.status(400).json({ message: "잘못된 음원 ID입니다" });
      }
      const music = await storage.getMusicById(id);
      if (!music) {
        return res.status(404).json({ message: "Music not found" });
      }
      const uploader = await storage.getUserById(music.userId);
      const now = new Date();
      const subscriptionPremium =
        isPaidSubscriptionTierId(uploader?.subscriptionTier ?? "") &&
        (uploader?.subscriptionExpiresAt == null || new Date(uploader.subscriptionExpiresAt) > now);
      const uploaderIsPremium = (uploader as any)?.role === "admin" || subscriptionPremium;
      res.json({
        ...music,
        uploaderSubscriptionTier: uploaderIsPremium ? (uploader?.subscriptionTier ?? "pro") : "free",
        uploaderDonationBadge: (uploader as any)?.donationBadge ?? null,
        uploader: uploader ? { id: uploader.id, firstName: uploader.firstName, lastName: uploader.lastName, profileImageUrl: uploader.profileImageUrl, email: uploader.email, subscriptionTier: uploader.subscriptionTier } : null,
      });
    } catch (e) {
      console.error("[api/music GET]", e);
      res.status(500).json({ message: "음원 정보를 불러올 수 없습니다" });
    }
  });

  app.get("/api/music/:id/similar", async (req, res) => {
    const id = parsePositiveIntParam(req.params.id);
    const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit), 10) || 8));
    try {
      if (id == null) return res.json([]);
      const base = await storage.getMusicById(id);
      if (!base) return res.json([]);
      const data = await storage.getSimilarMusic(id, limit);
      res.json(data);
    } catch (e) {
      console.error("[music/similar]", e);
      res.json([]);
    }
  });

  app.get("/api/curated-playlists", async (_req, res) => {
    try {
      const list = await storage.getCuratedPlaylists();
      res.json(list);
    } catch (e) {
      console.error("[curated-playlists]", e);
      res.json([]);
    }
  });

  app.get("/api/curated-playlists/:slug", async (req, res) => {
    const slug = req.params.slug;
    if (!slug) return res.status(404).json({ message: "Not found" });
    try {
      const playlist = await storage.getCuratedPlaylistBySlug(slug);
      if (!playlist) return res.status(404).json({ message: "Playlist not found" });
      res.json(playlist);
    } catch (e) {
      console.error("[curated-playlists/:slug]", e);
      res.status(500).json({ message: "Error loading playlist" });
    }
  });

  app.get("/api/music/missing-files", async (_req, res) => {
    try {
      const uploadsDir = path.resolve(process.cwd(), "local-uploads", "uploads");
      const extractFileId = (fn: string): string => {
        if (!fn) return "";
        const objMatch = fn.match(/\/objects\/uploads\/(.+)$/);
        if (objMatch) return objMatch[1];
        if (fn.startsWith("uploads/")) return fn.replace(/^uploads\//, "");
        if (/^[a-f0-9-]{36}(\.[a-z]+)?$/i.test(fn.trim())) return fn.trim();
        if (fn.includes("/")) return fn.split("/").pop() || "";
        return fn.replace(/^\//, "");
      };
      const all = await db.select({ id: music.id, title: music.title, artist: music.artist, filename: music.filename }).from(music);
      const missing = all.filter((m) => {
        const fileId = extractFileId(m.filename || "");
        if (!fileId) return true;
        const candidates = [
          path.join(uploadsDir, fileId),
          path.join(uploadsDir, `${fileId}.mp3`),
          path.join(uploadsDir, fileId.replace(/\.(mp3|wav|ogg)$/i, "")),
          path.join(uploadsDir, fileId.replace(/\.(mp3|wav|ogg)$/i, "") + ".mp3"),
        ];
        return !candidates.some((p) => existsSync(p));
      });
      res.json({
        total: all.length,
        missing: missing.length,
        list: missing.map((m) => {
          const fileId = extractFileId(m.filename || "");
          const hasExt = /\.(mp3|wav|ogg)$/i.test(fileId);
          return {
            id: m.id,
            title: m.title,
            artist: m.artist,
            fileId,
            saveAs: hasExt ? fileId : `${fileId.replace(/\.(mp3|wav|ogg)$/i, "")}.mp3`,
          };
        }),
      });
    } catch (err) {
      console.error("Missing files check:", err);
      res.status(500).json({ error: "조회 실패" });
    }
  });

  app.get("/api/upload-limit", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { isPremium } = await ensureExpiredSubscriptionDowngrade(userId);
      if (isPremium) {
        return res.json({ limited: false, current: 0, limit: -1 });
      }
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const result = await db.execute(sql`
        SELECT COUNT(*) as count FROM music 
        WHERE user_id = ${userId} AND created_at >= ${monthStart.toISOString()}
      `);
      const count = Number(result.rows[0]?.count || 0);
      res.json({ limited: count >= 10, current: count, limit: 10 });
    } catch (error) {
      res.json({ limited: false, current: 0, limit: 10 });
    }
  });

  app.post(api.music.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.music.create.input.parse(req.body);
      // @ts-ignore
      const userId = req.user.claims.sub;

      const { isPremium } = await ensureExpiredSubscriptionDowngrade(userId);
      if (!isPremium) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const uploadCount = await db.execute(sql`
          SELECT COUNT(*) as count FROM music 
          WHERE user_id = ${userId} AND created_at >= ${monthStart.toISOString()}
        `);
        const count = Number(uploadCount.rows[0]?.count || 0);
        if (count >= 10) {
          return res.status(403).json({ 
            message: "Free 플랜은 월 10곡까지 업로드할 수 있습니다. 프리미엄으로 업그레이드하면 무제한 업로드가 가능합니다.",
            code: "UPLOAD_LIMIT_REACHED",
            current: count,
            limit: 10
          });
        }
      }

      const imageFilename = input.imageFilename;
      // 수익 활동(가격/유료 다운로드)은 프리미엄 회원만 가능
      const isDownloadable = isPremium ? input.isDownloadable : false;
      const price = isPremium ? input.price : 0;

      const music = await storage.createMusic({ ...input, imageFilename, isDownloadable, price, userId });
      await storage.addCredits(userId, 20);
      await storage.createCreditTransaction({
        userId,
        type: "music_upload_bonus",
        amount: 20,
        description: "음원 등록 보너스",
        relatedId: music.id,
      });
      await storage.createNotification({
        userId,
        type: "system",
        message: "음원이 등록되었습니다. 20 크레딧이 지급되었습니다.",
        payload: { musicTitle: music.title, amount: 20 },
        url: "/credits",
      });
      // 비동기로 "좋아할 만한 신곡" 알림 (이메일 + 푸시 + 앱 내 알림)
      const baseUrl = (process.env.SITE_URL || "https://venysound.com").replace(/\/$/, "");
      const musicUrl = `${baseUrl}/music/${music.id}`;
      setImmediate(async () => {
        try {
          const recipients = await storage.getUsersToNotifyForNewMusic({
            id: music.id,
            title: music.title,
            artist: music.artist,
            genre: music.genre ?? undefined,
            userId,
          });
          for (const r of recipients) {
            const u = await storage.getUserById(r.userId);
            const displayName = u?.firstName || "회원";
            await storage.createNotification({
              userId: r.userId,
              type: "new_music_for_you",
              message: `${displayName}님이 좋아할 만한 음악이 신곡으로 등록되었습니다`,
              payload: { fromName: displayName, musicTitle: music.title, artist: music.artist, musicId: music.id },
              url: `/music/${music.id}`,
            });
            if (r.notifyNewMusicEmail && r.email) {
              await sendNewMusicNotificationEmail(r.email, {
                userName: displayName,
                musicTitle: music.title,
                artist: music.artist,
                musicUrl,
              });
            }
          }
          const pushUserIds = recipients.filter((r) => r.notifyNewMusicPush).map((r) => r.userId);
          if (pushUserIds.length > 0) {
            const subs = await storage.getPushSubscriptionsByUserIds(pushUserIds);
            for (const sub of subs) {
              const u = await storage.getUserById(sub.userId);
              const name = u?.firstName || "회원";
              await sendPushNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                {
                  title: "신곡 알림",
                  body: `${name}님이 좋아할 만한 음악이 등록되었어요: ${music.title} - ${music.artist}`,
                  url: musicUrl,
                }
              );
            }
          }
        } catch (e) {
          console.error("[new-music-notify]", e);
        }
      });
      res.status(201).json(music);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Music create error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/music/generate-cover", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { isPremium } = await ensureExpiredSubscriptionDowngrade(userId);
      if (!isPremium) {
        return res.status(403).json({ message: "프리미엄 구독이 필요한 기능입니다" });
      }

      const { title, artist, genre } = req.body;
      if (!title || !artist) {
        return res.status(400).json({ message: "제목과 아티스트 정보가 필요합니다" });
      }

      const sanitize = (input: string, maxLen = 100) =>
        input.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9\-.,!?&()]/g, "").slice(0, maxLen).trim();

      const safeTitle = sanitize(String(title));
      const safeArtist = sanitize(String(artist));
      const safeGenre = sanitize(String(genre || "music"), 50);

      const promptParts = [
        "Create an album cover art for a music track titled",
        JSON.stringify(safeTitle),
        "by",
        safeArtist + ".",
        "Genre:",
        safeGenre + ".",
        "Style: modern, abstract, artistic album artwork with vibrant colors. No text or words on the image.",
      ];
      const prompt = promptParts.join(" ");
      const imageBuffer = await generateImageBuffer(prompt, "1024x1024");
      const objectPath = saveBufferToLocalUploads(imageBuffer, ".png");
      res.json({ objectPath });
    } catch (err: any) {
      console.error("AI cover generation error:", err?.message || err);
      if (err?.status) console.error("AI API status:", err.status);
      res.status(500).json({ message: "AI 커버 생성에 실패했습니다. 다시 시도해주세요." });
    }
  });

  // Update music (owner only)
  app.patch("/api/music/:id", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const musicId = Number(req.params.id);
      const existing = await storage.getMusicById(musicId);
      if (!existing) return res.status(404).json({ message: "음원을 찾을 수 없습니다" });
      if (existing.userId !== userId) return res.status(403).json({ message: "본인의 음원만 수정할 수 있습니다" });

      const { title, artist, genre, tags, lyrics, isAi, imageFilename, price, isDownloadable } = req.body;
      if (title !== undefined && !title.trim()) return res.status(400).json({ message: "제목을 입력해주세요" });
      if (artist !== undefined && !artist.trim()) return res.status(400).json({ message: "아티스트를 입력해주세요" });

      const { isPremium } = await ensureExpiredSubscriptionDowngrade(userId);
      const updateData: any = {};
      if (title !== undefined) updateData.title = title.trim();
      if (artist !== undefined) updateData.artist = artist.trim();
      if (genre !== undefined) updateData.genre = genre;
      if (tags !== undefined) updateData.tags = tags;
      if (lyrics !== undefined) updateData.lyrics = lyrics;
      if (isAi !== undefined) updateData.isAi = isAi;
      if (imageFilename !== undefined) updateData.imageFilename = imageFilename;
      if (price !== undefined) updateData.price = isPremium ? (Number(price) || 0) : 0;
      if (isDownloadable !== undefined) updateData.isDownloadable = isPremium ? Boolean(isDownloadable) : false;
      const updated = await storage.updateMusic(musicId, updateData);
      res.json(updated);
    } catch (err) {
      console.error("Music update error:", err);
      res.status(500).json({ message: "음원 수정에 실패했습니다" });
    }
  });

  /** AI 가사 자동 정렬: 플레인 가사 + 음원 → Whisper로 LRC 생성 후 저장 */
  app.post("/api/music/:id/align-lyrics", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const musicId = Number(req.params.id);
      const existing = await storage.getMusicById(musicId);
      if (!existing) return res.status(404).json({ message: "음원을 찾을 수 없습니다" });
      if (existing.userId !== userId) return res.status(403).json({ message: "본인의 음원만 정렬할 수 있습니다" });

      const plainLyrics = (req.body.lyrics != null ? String(req.body.lyrics) : (existing.lyrics ?? "")).trim();
      if (!plainLyrics) return res.status(400).json({ message: "가사를 입력하거나, 먼저 음원에 가사를 저장해 주세요." });

      const fn = existing.filename || "";
      let fileId = "";
      const objMatch = fn.match(/\/objects\/uploads\/(.+)$/);
      if (objMatch) fileId = objMatch[1];
      else if (fn.startsWith("uploads/")) fileId = fn.replace(/^uploads\//, "");
      else if (/^[a-f0-9-]{36}(\.[a-z]+)?$/i.test(fn.trim())) fileId = fn.trim();
      else if (fn.includes("/")) fileId = fn.split("/").pop() || "";
      else fileId = fn;
      fileId = fileId.replace(/^\//, "");
      if (!fileId) return res.status(404).json({ message: "파일 경로를 찾을 수 없습니다" });

      const baseId = fileId.replace(/\.(mp3|wav|ogg)$/i, "");
      const candidates = [
        path.join(uploadsDir, fileId),
        path.join(uploadsDir, `${baseId}.mp3`),
        path.join(uploadsDir, `${baseId}.wav`),
        path.join(uploadsDir, `${baseId}.ogg`),
      ];
      const localPath = candidates.find((p) => existsSync(p));
      if (!localPath) return res.status(404).json({ message: "음원 파일을 찾을 수 없습니다" });

      const language = req.body.language ? String(req.body.language).slice(0, 10) : undefined;
      const lrc = await alignLyricsToAudio(localPath, plainLyrics, language);
      await storage.updateMusic(musicId, { lyrics: lrc });
      res.json({ lyrics: lrc });
    } catch (err: any) {
      if (err?.message?.includes("OPENAI_API_KEY")) {
        return res.status(503).json({ message: "AI 가사 정렬을 사용하려면 서버에 OPENAI_API_KEY를 설정해 주세요." });
      }
      console.error("align-lyrics error:", err);
      res.status(500).json({ message: err?.message || "가사 정렬에 실패했습니다" });
    }
  });

  // Delete music (owner or admin)
  app.delete("/api/music/:id", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const musicId = Number(req.params.id);
      const existing = await storage.getMusicById(musicId);
      if (!existing) return res.status(404).json({ message: "음원을 찾을 수 없습니다" });

      const role = await storage.getUserRole(userId);
      if (existing.userId !== userId && role !== "admin") {
        return res.status(403).json({ message: "삭제 권한이 없습니다" });
      }

      // 이벤트: 음원 등록 시 지급한 20 크레딧 회수
      const ownerId = existing.userId;
      await storage.addCredits(ownerId, -20);
      await storage.createCreditTransaction({
        userId: ownerId,
        type: "music_upload_bonus_reversal",
        amount: -20,
        description: "음원 삭제 시 등록 보너스 회수",
        relatedId: musicId,
      });
      await storage.createNotification({
        userId: ownerId,
        type: "system",
        message: `"${existing.title}" 음원이 삭제되어 등록 보너스 20 크레딧이 회수되었습니다.`,
        payload: { musicTitle: existing.title, amount: -20 },
        url: "/credits",
      });

      await storage.deleteMusic(musicId);
      res.json({ success: true });
    } catch (err) {
      console.error("Music delete error:", err);
      res.status(500).json({ message: "음원 삭제에 실패했습니다" });
    }
  });

  app.post(api.music.like.path, isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    const musicId = Number(req.params.id);
    const music = await storage.getMusicById(musicId);
    
    if (!music) return res.status(404).json({ message: "Music not found" });

    const liked = await storage.toggleLike(userId, musicId);
    
    if (liked && music.userId !== userId) {
        // @ts-ignore
      const likerName = req.user.claims.first_name || "사용자";
      await storage.createNotification({
        userId: music.userId,
        type: "like",
        message: `${likerName}님이 "${music.title}" 곡을 좋아합니다`,
        payload: { fromName: likerName, musicTitle: music.title },
        url: `/music/${musicId}`
      });
      queueActivityEmail(music.userId, "like", {
        actorName: likerName,
        musicTitle: music.title,
        actionPath: `/music/${musicId}`,
      });
    }

    res.json({ liked });
  });

  // === Review Routes ===
  app.get(api.reviews.list.path, async (req, res) => {
    const reviews = await storage.getReviewsByMusicId(Number(req.params.id));
    res.json(reviews);
  });

  app.post(api.reviews.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.reviews.create.input.parse(req.body);
      // @ts-ignore
      const userId = req.user.claims.sub;
      const review = await storage.createReview({
        ...input,
        userId,
        musicId: Number(req.params.id)
      });
      const musicItem = await storage.getMusicById(Number(req.params.id));
      if (musicItem && musicItem.userId !== userId) {
        const reviewerName = (req as any).user?.claims?.first_name || "사용자";
        await storage.createNotification({
          userId: musicItem.userId,
          type: "review",
          message: `${reviewerName}님이 "${musicItem.title}" 곡에 리뷰를 남겼습니다`,
          payload: { fromName: reviewerName, musicTitle: musicItem.title },
          url: `/music/${req.params.id}`,
        });
        queueActivityEmail(musicItem.userId, "review", {
          actorName: reviewerName,
          musicTitle: musicItem.title,
          snippet: input.content?.trim(),
          actionPath: `/music/${req.params.id}`,
        });
      }
      res.status(201).json(review);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  // === Music Story Routes (창작 히스토리) ===
  app.get(api.musicStories.list.path, async (req, res) => {
    const stories = await storage.getMusicStoriesByMusicId(Number(req.params.id));
    res.json(stories);
  });

  app.post(api.musicStories.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.musicStories.create.input.parse(req.body);
      // @ts-ignore
      const userId = req.user.claims.sub;
      const musicId = Number(req.params.id);
      const musicItem = await storage.getMusicById(musicId);
      if (!musicItem) return res.status(404).json({ message: "Music not found" });
      if (musicItem.userId !== userId) return res.status(403).json({ message: "Only the uploader can write a creative story" });
      const story = await storage.createMusicStory({ ...input, userId, musicId });
      res.status(201).json(story);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.patch(api.musicStories.update.path, isAuthenticated, async (req, res) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ message: "Content is required" });
      }
      // @ts-ignore
      const userId = req.user.claims.sub;
      const storyId = Number(req.params.id);
      const storyResult = await db.select().from(musicStoriesTable).where(eq(musicStoriesTable.id, storyId));
      if (!storyResult.length) return res.status(404).json({ message: "Story not found" });
      if (storyResult[0].userId !== userId) return res.status(403).json({ message: "Only the author can edit this story" });
      const updated = await storage.updateMusicStory(storyId, content.trim());
      if (!updated) return res.status(404).json({ message: "Story not found" });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.musicStories.delete.path, isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const storyId = Number(req.params.id);
      const storyResult = await db.select().from(musicStoriesTable).where(eq(musicStoriesTable.id, storyId));
      if (!storyResult.length) return res.status(404).json({ message: "Story not found" });
      if (storyResult[0].userId !== userId) return res.status(403).json({ message: "Only the author can delete this story" });
      await storage.deleteMusicStory(storyId);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ message: "Failed to delete story" });
    }
  });

  app.get(api.musicStories.getComments.path, async (req, res) => {
    const comments = await storage.getStoryComments(Number(req.params.id));
    res.json(comments);
  });

  app.post(api.musicStories.createComment.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.musicStories.createComment.input.parse(req.body);
      // @ts-ignore
      const userId = req.user.claims.sub;
      const storyId = Number(req.params.id);
      const [storyRow] = await db.select({ userId: musicStoriesTable.userId, musicId: musicStoriesTable.musicId }).from(musicStoriesTable).where(eq(musicStoriesTable.id, storyId));
      const comment = await storage.createStoryComment({ ...input, userId, storyId });
      if (storyRow && storyRow.userId !== userId) {
        const commenterName = (req as any).user?.claims?.first_name || "사용자";
        await storage.createNotification({
          userId: storyRow.userId,
          type: "story_comment",
          message: `${commenterName}님이 창작 히스토리에 댓글을 남겼습니다`,
          payload: { fromName: commenterName },
          url: storyRow.musicId ? `/music/${storyRow.musicId}` : "/explore",
        });
        queueActivityEmail(storyRow.userId, "story_comment", {
          actorName: commenterName,
          snippet: input.content?.trim(),
          actionPath: storyRow.musicId ? `/music/${storyRow.musicId}` : "/explore",
        });
      }
      res.status(201).json(comment);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  // === Playlist Routes ===
  app.get(api.playlists.list.path, isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    const playlists = await storage.getPlaylistsByUser(userId);
    res.json(playlists);
  });

  app.post(api.playlists.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.playlists.create.input.parse(req.body);
      // @ts-ignore
      const userId = req.user.claims.sub;
      const playlist = await storage.createPlaylist({ ...input, userId });
      res.status(201).json(playlist);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.post(api.playlists.addMusic.path, isAuthenticated, async (req, res) => {
    const playlistId = Number(req.params.id);
    const { musicId } = req.body;
    
    const playlist = await storage.getPlaylistById(playlistId);
    // @ts-ignore
    if (!playlist || playlist.userId !== req.user.claims.sub) {
      return res.status(404).json({ message: "Playlist not found or access denied" });
    }

    await storage.addMusicToPlaylist(playlistId, musicId);
    res.json({ success: true });
  });

  app.get(api.playlists.get.path, async (req, res) => {
    const playlist = await storage.getPlaylistById(Number(req.params.id));
    if (!playlist) return res.status(404).json({ message: "Playlist not found" });
    res.json(playlist);
  });

  // === Community/Post Routes ===
  app.get(api.posts.list.path, async (req, res) => {
    const { category, search } = req.query as { category?: string, search?: string };
    const posts = await storage.getPosts(category, search);
    res.json(posts);
  });

  app.get(api.posts.get.path, async (req, res) => {
    const post = await storage.getPostById(Number(req.params.id));
    if (!post) return res.status(404).json({ message: "Post not found" });
    const p = post as any;
    res.json({ ...p, userId: p.userId ?? p.user_id ?? p.user?.id ?? null });
  });

  /** 게시글 조회수 +1 (세션당 1회는 클라이언트 sessionStorage로 중복 방지) */
  app.post("/api/posts/:id/view", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
    const ok = await storage.incrementPostViewCount(id);
    if (!ok) return res.status(404).json({ message: "Post not found" });
    res.json({ ok: true });
  });

  app.post(api.posts.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.posts.create.input.parse(req.body);
      // @ts-ignore
      const userId = req.user.claims.sub;
      const post = await storage.createPost({ ...input, userId });
      res.status(201).json(post);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.patch("/api/posts/:id", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user?.claims?.sub != null ? String(req.user.claims.sub) : "";
    if (!userId) return res.status(401).json({ message: "인증 정보가 없습니다" });
    const postId = Number(req.params.id);
    const body = req.body || {};
    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    const content = typeof body.content === "string" ? body.content.trim() : undefined;
    const category = body.category !== undefined ? (body.category === null || body.category === "" ? null : String(body.category).trim()) : undefined;
    const attachment = body.attachment !== undefined ? (body.attachment === null || body.attachment === "" ? null : String(body.attachment).trim()) : undefined;
    const success = await storage.updatePost(postId, userId, { title, content, category, attachment });
    if (!success) return res.status(403).json({ message: "수정 권한이 없습니다" });
    const post = await storage.getPostById(postId);
    res.json(post);
  });

  app.delete("/api/posts/:id", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user?.claims?.sub != null ? String(req.user.claims.sub) : "";
    if (!userId) return res.status(401).json({ message: "인증 정보가 없습니다" });
    const postId = Number(req.params.id);
    const success = await storage.deletePost(postId, userId);
    if (!success) return res.status(403).json({ message: "삭제 권한이 없습니다" });
    res.json({ success: true });
  });

  app.get(api.posts.getComments.path, async (req, res) => {
    const comments = await storage.getPostComments(Number(req.params.id));
    res.json(comments.map((c: any) => ({
      ...c,
      userId: c.userId ?? (c as any).user_id ?? c.user?.id ?? null,
    })));
  });

  app.post(api.posts.createComment.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.posts.createComment.input.parse(req.body);
      // @ts-ignore
      const userId = req.user.claims.sub;
      const postId = Number(req.params.id);
      const post = await storage.getPostById(postId);
      const comment = await storage.createPostComment({
        ...input,
        userId,
        postId,
      });
      if (post && (post as any).userId !== userId) {
        const commenterName = (req as any).user?.claims?.first_name || "사용자";
        await storage.createNotification({
          userId: (post as any).userId,
          type: "post_comment",
          message: `${commenterName}님이 게시글에 댓글을 남겼습니다`,
          payload: { fromName: commenterName },
          url: `/posts/${postId}`,
        });
        queueActivityEmail((post as any).userId, "post_comment", {
          actorName: commenterName,
          postTitle: (post as any).title ?? "",
          snippet: input.content?.trim(),
          actionPath: `/posts/${postId}`,
        });
      }
      res.status(201).json(comment);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.patch("/api/comments/:commentId", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    const commentId = Number(req.params.commentId);
    const { content } = req.body;
    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ message: "내용을 입력해주세요" });
    }
    const success = await storage.updatePostComment(commentId, userId, content.trim());
    if (!success) {
      return res.status(403).json({ message: "수정 권한이 없습니다" });
    }
    res.json({ success: true });
  });

  app.delete("/api/comments/:commentId", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    const commentId = Number(req.params.commentId);
    const success = await storage.deletePostComment(commentId, userId);
    if (!success) {
      return res.status(403).json({ message: "삭제 권한이 없습니다" });
    }
    res.json({ success: true });
  });

  // === User Routes ===
  app.post(api.users.follow.path, isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const followerId = req.user?.claims?.sub;
      const followedId = req.params?.id as string;

      if (!followerId || !followedId) {
        return res.status(400).json({ message: "잘못된 요청입니다." });
      }
      if (followerId === followedId) {
        return res.status(400).json({ message: "자기 자신을 팔로우할 수 없습니다" });
      }

      const following = await storage.toggleFollow(followerId, followedId);

      if (following) {
        // @ts-ignore
        const followerName = req.user.claims.first_name || "사용자";
        await storage.createNotification({
          userId: followedId,
          type: "follow",
          message: `${followerName}님이 팔로우하기 시작했습니다`,
          payload: { fromName: followerName },
          url: `/profile/${followerId}`
        });
        queueActivityEmail(followedId, "follow", {
          actorName: followerName,
          actionPath: `/profile/${followerId}`,
        });
      }

      return res.json({ following });
    } catch (err) {
      console.error("[follow] Error:", err);
      return res.status(500).json({ message: err instanceof Error ? err.message : "팔로우 처리에 실패했습니다." });
    }
  });

  app.get(api.users.getProfile.path, async (req, res) => {
    const userId = req.params.id;
    if (!userId) {
      return res.status(404).json({ message: "프로필을 찾을 수 없습니다." });
    }
    // @ts-ignore
    const currentUserId = req.user?.claims?.sub;

    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "프로필을 찾을 수 없습니다." });
    }

    const [uploadedMusic, likedMusic, followerCount, followingCount, userPlaylists, userPosts, followers, following] = await Promise.all([
      storage.getMusicByUser(userId),
      storage.getLikedMusic(userId),
      storage.getFollowerCount(userId),
      storage.getFollowingCount(userId),
      storage.getPlaylistsByUser(userId),
      storage.getPostsByUser(userId),
      storage.getFollowers(userId),
      storage.getFollowing(userId),
    ]);

    let isFollowing = false;
    if (currentUserId && currentUserId !== userId) {
      isFollowing = await storage.isFollowing(currentUserId, userId);
    }

    res.json({
      user,
      uploadedMusic,
      likedMusic,
      followerCount,
      followingCount,
      playlists: userPlaylists,
      posts: userPosts,
      followers,
      following,
      isFollowing
    });
  });

  app.patch("/api/users/:id/profile", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const currentUserId = req.user.claims.sub;
      const targetId = req.params.id;
      if (currentUserId !== targetId) {
        return res.status(403).json({ message: "본인 프로필만 수정할 수 있습니다" });
      }
      const { firstName, lastName, profileImageUrl, username } = req.body;
      const updated = await storage.updateUserProfile(targetId, {
        ...(firstName !== undefined && { firstName: String(firstName) }),
        ...(lastName !== undefined && { lastName: String(lastName) }),
        ...(profileImageUrl !== undefined && { profileImageUrl: profileImageUrl ? String(profileImageUrl) : "" }),
        ...(username !== undefined && { username: username ? String(username) : "" }),
        ...(req.body.notifyNewMusicEmail !== undefined && { notifyNewMusicEmail: Boolean(req.body.notifyNewMusicEmail) }),
        ...(req.body.notifyNewMusicPush !== undefined && { notifyNewMusicPush: Boolean(req.body.notifyNewMusicPush) }),
        ...(req.body.notifyActivityEmail !== undefined && { notifyActivityEmail: Boolean(req.body.notifyActivityEmail) }),
      });
      if (!updated) return res.status(404).json({ message: "프로필을 찾을 수 없습니다" });
      res.json(updated);
    } catch (err) {
      console.error("Profile update error:", err);
      res.status(500).json({ message: "프로필 수정에 실패했습니다" });
    }
  });

  // Web Push: VAPID public key (for client to subscribe)
  app.get("/api/push-vapid-public", (_req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    res.json({ publicKey: key || null });
  });

  // Web Push: save subscription for "new music for you" push
  app.post("/api/push-subscribe", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "endpoint and keys.p256dh, keys.auth required" });
      }
      await storage.addPushSubscription(userId, {
        endpoint: String(endpoint),
        p256dh: String(keys.p256dh),
        auth: String(keys.auth),
      });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Push subscribe error:", err);
      res.status(500).json({ message: "푸시 구독 저장에 실패했습니다" });
    }
  });

  // Delete playlist
  app.delete("/api/playlists/:id", isAuthenticated, async (req, res) => {
    const playlistId = Number(req.params.id);
    const playlist = await storage.getPlaylistById(playlistId);
    // @ts-ignore
    if (!playlist || playlist.userId !== req.user.claims.sub) {
      return res.status(404).json({ message: "플레이리스트를 찾을 수 없습니다" });
    }
    await storage.deletePlaylist(playlistId);
    res.json({ success: true });
  });

  // Remove music from playlist
  app.delete("/api/playlists/:id/music/:musicId", isAuthenticated, async (req, res) => {
    const playlistId = Number(req.params.id);
    const musicId = Number(req.params.musicId);
    const playlist = await storage.getPlaylistById(playlistId);
    // @ts-ignore
    if (!playlist || playlist.userId !== req.user.claims.sub) {
      return res.status(404).json({ message: "플레이리스트를 찾을 수 없습니다" });
    }
    await storage.removeMusicFromPlaylist(playlistId, musicId);
    res.json({ success: true });
  });

  // Mark all notifications as read
  app.patch("/api/notifications/read-all", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    await storage.markAllNotificationsRead(userId);
    res.json({ success: true });
  });

  // === Notification Routes ===
  app.get(api.notifications.list.path, isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    const notifs = await storage.getNotifications(userId);
    const serialized = notifs.map((n: any) => ({
      ...n,
      createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
    }));
    res.json(serialized);
  });

  app.patch(api.notifications.markRead.path, isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    await storage.markNotificationRead(id);
    res.json({ success: true });
  });

  app.delete("/api/notifications/:id", isAuthenticated, async (req, res) => {
    const id = Number(req.params.id);
    // @ts-ignore
    const userId = req.user.claims.sub;
    const deleted = await storage.deleteNotification(id, userId);
    if (!deleted) return res.status(404).json({ message: "알림을 찾을 수 없습니다." });
    res.json({ success: true });
  });

  // === Analytics (public: 방문 기록) ===
  function getDeviceType(ua: string | undefined): string {
    if (!ua) return "unknown";
    const u = ua.toLowerCase();
    if (/mobile|android|iphone|ipod|webos|blackberry|iemobile/i.test(u) && !/ipad|tablet/i.test(u)) return "mobile";
    if (/ipad|tablet|playbook|silk/i.test(u)) return "tablet";
    return "desktop";
  }
  function refererDomain(referer: string | undefined): string | null {
    if (!referer) return null;
    try {
      const u = new URL(referer);
      return u.hostname || null;
    } catch {
      return null;
    }
  }
  app.post("/api/analytics/visit", async (req, res) => {
    const path = typeof req.body?.path === "string" ? req.body.path : "/";
    let visitorKey = typeof req.body?.visitorKey === "string" ? req.body.visitorKey : null;
    if (!visitorKey) visitorKey = crypto.randomUUID();
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
    const ipHash = ip ? crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16) : undefined;
    const deviceType = getDeviceType(req.headers["user-agent"]);
    const refererDomainVal = refererDomain(req.headers["referer"]);
    const utmSource = typeof req.body?.utmSource === "string" ? req.body.utmSource : (typeof req.query?.utm_source === "string" ? req.query.utm_source : undefined);
    let countryCode: string | undefined;
    let region: string | undefined;
    if (ip && !/^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^192\.168\.|^::1$|^fc00:/i.test(ip)) {
      try {
        const geo = geoip.lookup(ip);
        if (geo) {
          countryCode = geo.country ?? undefined;
          region = geo.region ?? undefined;
        }
      } catch (_) {}
    }
    try {
      await storage.recordVisit(visitorKey, path, { ipHash, deviceType, refererDomain: refererDomainVal ?? undefined, utmSource, countryCode, region });
    } catch (e) {
      console.error("[analytics/visit] recordVisit failed (table may be missing – run db:push):", e);
    }
    res.json({ ok: true, visitorKey });
  });

  // === Admin Middleware ===
  const isAdmin = async (req: any, res: any, next: any) => {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "로그인이 필요합니다" });
    }
    const role = await storage.getUserRole(req.user.claims.sub);
    if (role !== "admin") {
      return res.status(403).json({ message: "관리자 권한이 필요합니다" });
    }
    next();
  };

  // === Admin Routes ===
  app.get("/api/admin/visitor-count", isAuthenticated, isAdmin, (_req, res) => {
    res.json({ count: visitorCount });
  });

  app.get("/api/admin/current-visitors", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const minutes = Math.min(60, Math.max(1, parseInt(String(req.query?.minutes), 10) || 15));
      const count = await storage.getCurrentVisitorsCount(minutes);
      res.json({ count });
    } catch (e) {
      console.error("[admin/current-visitors]", e);
      res.json({ count: 0 });
    }
  });

  app.get("/api/admin/stats", isAuthenticated, isAdmin, async (req, res) => {
    const stats = await storage.getAdminStats();
    res.json(stats);
  });

  app.get("/api/admin/analytics", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const analytics = await storage.getAdminAnalytics();
      res.json(analytics);
    } catch (e) {
      console.error("[admin/analytics]", e);
      res.json({ dailyVisitors: 0, totalVisitors: 0, pageViewsToday: 0, pageViewsTotal: 0 });
    }
  });

  app.get("/api/admin/analytics/status", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const tableExists = await storage.checkAnalyticsTableExists();
      res.json({ tableExists });
    } catch (e) {
      console.error("[admin/analytics/status]", e);
      res.json({ tableExists: false });
    }
  });

  app.get("/api/admin/credits-charged", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const total = await storage.getTotalCreditsCharged();
      res.json({ totalCreditsCharged: total });
    } catch (e) {
      console.error("[admin/credits-charged]", e);
      res.json({ totalCreditsCharged: 0 });
    }
  });

  app.get("/api/admin/stats/regions", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const rows = await storage.getAdminStatsByRegion();
      res.json(rows);
    } catch (e) {
      console.error("[admin/stats/regions]", e);
      res.json([]);
    }
  });

  app.get("/api/admin/stats/devices", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const rows = await storage.getAdminStatsByDevice();
      res.json(rows);
    } catch (e) {
      console.error("[admin/stats/devices]", e);
      res.json([]);
    }
  });

  app.get("/api/admin/stats/sources", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const rows = await storage.getAdminStatsBySource();
      res.json(rows);
    } catch (e) {
      console.error("[admin/stats/sources]", e);
      res.json([]);
    }
  });

  app.get("/api/admin/analytics/trend", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const days = Math.min(90, Math.max(1, parseInt(String(req.query.days), 10) || 7));
      const rows = await storage.getAdminAnalyticsTrend(days);
      res.json(rows);
    } catch (e) {
      console.error("[admin/analytics/trend]", e);
      res.json([]);
    }
  });

  // 사이트 공지 팝업 (메인 접속 시 노출) — 공개 API. 쿼리 lang=en|ja|zh|ko 에 따라 번역된 내용 반환
  app.get("/api/announcement/active", async (req, res) => {
    try {
      const lang = (req.query.lang as string)?.toLowerCase()?.replace(/-.*$/, "").slice(0, 2) || undefined;
      const announcement = await storage.getActiveSiteAnnouncement(lang);
      if (!announcement) return res.json(null);
      res.json({
        id: announcement.id,
        content: announcement.content,
        imageUrl: announcement.imageUrl ?? null,
        textSize: announcement.textSize ?? "md",
        startsAt: announcement.startsAt.toISOString(),
        endsAt: announcement.endsAt.toISOString(),
      });
    } catch (e) {
      console.error("[announcement/active]", e);
      res.json(null);
    }
  });

  // 사이트 공지 리스트 (공개용) — 최신순 최대 50개
  app.get("/api/announcements/site", async (_req, res) => {
    try {
      const list = await storage.getSiteAnnouncements();
      res.json(
        list.map((a) => ({
          id: a.id,
          content: a.content,
          imageUrl: a.imageUrl ?? null,
          showAsPopup: (a as any).showAsPopup !== false,
          viewCount: (a as any).viewCount ?? 0,
          startsAt: a.startsAt.toISOString(),
          endsAt: a.endsAt.toISOString(),
          createdAt: a.createdAt.toISOString(),
        }))
      );
    } catch (e) {
      console.error("[announcements/site]", e);
      res.json([]);
    }
  });

  // 공지 조회 시 조회수 증가 (공개)
  app.post("/api/announcements/site/:id/view", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const viewCount = await storage.incrementSiteAnnouncementViewCount(id);
      res.json({ viewCount });
    } catch (e) {
      console.error("[announcements/site view]", e);
      res.status(500).json({ message: "Failed to record view" });
    }
  });

  // 동영상 가이드 (공개용)
  app.get("/api/guide-videos", async (_req, res) => {
    try {
      const list = await storage.getGuideVideos();
      res.json(
        list.map((v) => ({
          id: v.id,
          title: v.title,
          description: v.description,
          youtubeUrl: v.youtubeUrl,
          sortOrder: v.sortOrder,
          createdAt: v.createdAt.toISOString(),
          updatedAt: v.updatedAt.toISOString(),
        }))
      );
    } catch (e) {
      console.error("[guide-videos]", e);
      res.json([]);
    }
  });

  app.get("/api/admin/site-announcements", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const list = await storage.getSiteAnnouncements();
      res.json(list.map((a) => ({ ...a, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(), createdAt: a.createdAt.toISOString() })));
    } catch (e) {
      console.error("[admin/site-announcements]", e);
      res.json([]);
    }
  });

  app.post("/api/admin/site-announcements", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { content, imageUrl, textSize, showAsPopup, startsAt, endsAt } = req.body;
      if (!content || typeof content !== "string" || !startsAt || !endsAt) {
        return res.status(400).json({ message: "content, startsAt, endsAt가 필요합니다" });
      }
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        return res.status(400).json({ message: "시작·종료 일시가 유효하지 않습니다" });
      }
      const imageUrlVal = typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : null;
      const textSizeVal = typeof textSize === "string" && ["sm", "md", "lg"].includes(textSize) ? textSize : null;
      const saved = await storage.saveSiteAnnouncement({ content: content.trim(), imageUrl: imageUrlVal, textSize: textSizeVal, showAsPopup: showAsPopup !== false, startsAt: start, endsAt: end });
      // 언어별 자동 번역 후 DB 반영 (번역 실패 시에도 공지는 저장됨)
      try {
        const translations = await translateAnnouncementContent(content.trim());
        if (Object.keys(translations).length > 0) {
          await storage.updateSiteAnnouncementTranslations(saved.id, translations);
        }
      } catch (e) {
        console.warn("[site-announcements translate]", e);
      }
      res.json({ ...saved, startsAt: saved.startsAt.toISOString(), endsAt: saved.endsAt.toISOString() });
    } catch (e: any) {
      console.error("[admin/site-announcements POST]", e);
      const msg = e?.message || "";
      const hint = msg.includes("does not exist") || msg.includes("relation")
        ? " DB 테이블이 없습니다. 서버에서 npm run db:site-announcements 실행 후 다시 시도하세요."
        : "";
      res.status(500).json({ message: "저장에 실패했습니다." + hint });
    }
  });

  app.put("/api/admin/site-announcements/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "유효하지 않은 ID입니다" });
      const { content, imageUrl, textSize, showAsPopup, startsAt, endsAt } = req.body;
      if (!content || typeof content !== "string" || !startsAt || !endsAt) {
        return res.status(400).json({ message: "content, startsAt, endsAt가 필요합니다" });
      }
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        return res.status(400).json({ message: "시작·종료 일시가 유효하지 않습니다" });
      }
      const imageUrlVal = typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : null;
      const textSizeVal = typeof textSize === "string" && ["sm", "md", "lg"].includes(textSize) ? textSize : null;
      const saved = await storage.updateSiteAnnouncement(id, { content: content.trim(), imageUrl: imageUrlVal, textSize: textSizeVal, showAsPopup: showAsPopup !== false, startsAt: start, endsAt: end });
      try {
        const translations = await translateAnnouncementContent(content.trim());
        if (Object.keys(translations).length > 0) {
          await storage.updateSiteAnnouncementTranslations(id, translations);
        }
      } catch (e) {
        console.warn("[site-announcements translate]", e);
      }
      res.json({ ...saved, startsAt: saved.startsAt.toISOString(), endsAt: saved.endsAt.toISOString() });
    } catch (e: any) {
      console.error("[admin/site-announcements PUT]", e);
      res.status(500).json({ message: e?.message || "수정에 실패했습니다." });
    }
  });

  app.delete("/api/admin/site-announcements/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteSiteAnnouncement(Number(req.params.id));
      res.json({ success: true });
    } catch (e) {
      console.error("[admin/site-announcements DELETE]", e);
      res.status(500).json({ message: "삭제에 실패했습니다" });
    }
  });

  // 동영상 가이드 (관리자용 CRUD)
  app.get("/api/admin/guide-videos", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const list = await storage.getGuideVideos();
      res.json(
        list.map((v) => ({
          id: v.id,
          title: v.title,
          description: v.description,
          youtubeUrl: v.youtubeUrl,
          sortOrder: v.sortOrder,
          createdAt: v.createdAt.toISOString(),
          updatedAt: v.updatedAt.toISOString(),
        }))
      );
    } catch (e) {
      console.error("[admin/guide-videos]", e);
      res.json([]);
    }
  });

  app.post("/api/admin/guide-videos", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { title, description, youtubeUrl, sortOrder } = req.body || {};
      if (!title || typeof title !== "string" || !youtubeUrl || typeof youtubeUrl !== "string") {
        return res.status(400).json({ message: "title, youtubeUrl 이 필요합니다." });
      }
      await storage.createGuideVideo({
        title: title.trim(),
        description: typeof description === "string" ? description.trim() : undefined,
        youtubeUrl: youtubeUrl.trim(),
        sortOrder: typeof sortOrder === "number" ? sortOrder : null,
      });
      res.json({ success: true });
    } catch (e: any) {
      console.error("[admin/guide-videos POST]", e);
      const msg = e?.message || "";
      const hint = msg.includes("guide_videos") && msg.includes("does not exist")
        ? " DB 테이블이 없습니다. 서버에서 npm run db:guide-videos 실행 후 다시 시도하세요."
        : "";
      res.status(500).json({ message: "저장에 실패했습니다." + hint });
    }
  });

  app.put("/api/admin/guide-videos/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { title, description, youtubeUrl, sortOrder } = req.body || {};
      if (!title || typeof title !== "string" || !youtubeUrl || typeof youtubeUrl !== "string") {
        return res.status(400).json({ message: "title, youtubeUrl 이 필요합니다." });
      }
      await storage.updateGuideVideo(id, {
        title: title.trim(),
        description: typeof description === "string" ? description.trim() : undefined,
        youtubeUrl: youtubeUrl.trim(),
        sortOrder: typeof sortOrder === "number" ? sortOrder : null,
      });
      res.json({ success: true });
    } catch (e) {
      console.error("[admin/guide-videos PUT]", e);
      res.status(500).json({ message: "수정에 실패했습니다." });
    }
  });

  app.delete("/api/admin/guide-videos/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteGuideVideo(id);
      res.json({ success: true });
    } catch (e) {
      console.error("[admin/guide-videos DELETE]", e);
      res.status(500).json({ message: "삭제에 실패했습니다." });
    }
  });

  app.get("/api/admin/curated-playlists", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const list = await storage.getCuratedPlaylists();
      res.json(list);
    } catch (e) {
      console.error("[admin/curated-playlists]", e);
      res.json([]);
    }
  });

  app.post("/api/admin/curated-playlists", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { name, description, slug, coverImageFilename, genreMain, genreSub } = req.body || {};
      if (!name || typeof name !== "string" || !slug || typeof slug !== "string") {
        return res.status(400).json({ message: "name, slug 이 필요합니다." });
      }
      const { id } = await storage.createCuratedPlaylist({
        name: String(name).trim(),
        description: typeof description === "string" && description.trim() ? description.trim() : null,
        slug: String(slug).trim(),
        coverImageFilename: typeof coverImageFilename === "string" && coverImageFilename.trim() ? coverImageFilename.trim() : null,
        genreMain: typeof genreMain === "string" && genreMain.trim() ? genreMain.trim() : null,
        genreSub: typeof genreSub === "string" && genreSub.trim() ? genreSub.trim() : null,
      });
      res.json({ success: true, id });
    } catch (e: any) {
      console.error("[admin/curated-playlists POST]", e);
      res.status(500).json({ message: e?.message?.includes("unique") ? "이미 사용 중인 slug입니다." : "저장에 실패했습니다." });
    }
  });

  app.put("/api/admin/curated-playlists/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, description, slug, sortOrder, coverImageFilename, genreMain, genreSub } = req.body || {};
      await storage.updateCuratedPlaylist(id, {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(description !== undefined && { description: description === "" ? null : String(description) }),
        ...(slug !== undefined && { slug: String(slug).trim() }),
        ...(typeof sortOrder === "number" && { sortOrder }),
        ...(coverImageFilename !== undefined && {
          coverImageFilename: coverImageFilename === "" ? null : String(coverImageFilename),
        }),
        ...(genreMain !== undefined && { genreMain: genreMain === "" ? null : String(genreMain) }),
        ...(genreSub !== undefined && { genreSub: genreSub === "" ? null : String(genreSub) }),
      });
      res.json({ success: true });
    } catch (e) {
      console.error("[admin/curated-playlists PUT]", e);
      res.status(500).json({ message: "수정에 실패했습니다." });
    }
  });

  app.delete("/api/admin/curated-playlists/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteCuratedPlaylist(Number(req.params.id));
      res.json({ success: true });
    } catch (e) {
      console.error("[admin/curated-playlists DELETE]", e);
      res.status(500).json({ message: "삭제에 실패했습니다." });
    }
  });

  app.get("/api/admin/curated-playlists/:id/tracks", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const musicIds = await storage.getCuratedPlaylistTrackIds(id);
      res.json({ musicIds });
    } catch (e) {
      console.error("[admin/curated-playlists tracks GET]", e);
      res.status(500).json({ message: "트랙 목록을 불러올 수 없습니다." });
    }
  });

  app.put("/api/admin/curated-playlists/:id/tracks", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { musicIds } = req.body || {};
      const ids = Array.isArray(musicIds) ? musicIds.filter((x): x is number => typeof x === "number") : [];
      await storage.setCuratedPlaylistTracks(id, ids);
      res.json({ success: true });
    } catch (e: any) {
      console.error("[admin/curated-playlists tracks PUT]", e);
      res.status(500).json({ message: e?.message ?? "트랙 저장에 실패했습니다." });
    }
  });

  app.get("/api/admin/posts", isAuthenticated, isAdmin, async (req, res) => {
    const posts = await storage.getAllPostsAdmin();
    res.json(posts);
  });

  app.delete("/api/admin/posts/:id", isAuthenticated, isAdmin, async (req, res) => {
    await storage.deletePostAdmin(Number(req.params.id));
    res.json({ success: true });
  });

  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req, res) => {
    const search = req.query.search as string | undefined;
    const usersList = await storage.getAllUsers(search);
    res.json(usersList);
  });

  app.get("/api/admin/ai-music-generation-logs", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || "200"), 10)));
      const rows = await db
        .select({
          id: aiMusicGenerationLogs.id,
          userId: aiMusicGenerationLogs.userId,
          createdAt: aiMusicGenerationLogs.createdAt,
          billingKind: aiMusicGenerationLogs.billingKind,
          subscriptionTierAt: aiMusicGenerationLogs.subscriptionTierAt,
          provider: aiMusicGenerationLogs.provider,
          taskId: aiMusicGenerationLogs.taskId,
          requestTitle: aiMusicGenerationLogs.requestTitle,
          requestSummary: aiMusicGenerationLogs.requestSummary,
          creditsCharged: aiMusicGenerationLogs.creditsCharged,
          publishments: aiMusicGenerationLogs.publishments,
          userEmail: users.email,
          userFirstName: users.firstName,
        })
        .from(aiMusicGenerationLogs)
        .leftJoin(users, eq(aiMusicGenerationLogs.userId, users.id))
        .orderBy(desc(aiMusicGenerationLogs.createdAt))
        .limit(limit);
      res.json(rows);
    } catch (e) {
      console.error("[admin ai-music-generation-logs]", e);
      res.status(500).json({ message: "AI 음악 생성 로그를 불러올 수 없습니다." });
    }
  });

  app.delete("/api/admin/users/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const targetId = req.params.id as string;
      // @ts-ignore
      if (targetId === req.user.claims.sub) {
        return res.status(400).json({ message: "자기 자신은 삭제할 수 없습니다" });
      }
      await storage.deleteUser(targetId);
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[admin deleteUser]", err);
      return res.status(500).json({ message: err?.message || "회원 삭제에 실패했습니다." });
    }
  });

  app.patch("/api/admin/users/:id/role", isAuthenticated, isAdmin, async (req, res) => {
    const targetId = req.params.id as string;
    const { role } = req.body;
    if (!role || !["user", "admin"].includes(role)) {
      return res.status(400).json({ message: "유효하지 않은 역할입니다" });
    }
    // @ts-ignore
    if (targetId === req.user.claims.sub) {
      return res.status(400).json({ message: "자기 자신의 권한은 변경할 수 없습니다" });
    }
    await storage.updateUserRole(targetId, role);
    res.json({ success: true });
  });

  app.patch("/api/admin/users/:id/subscription", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const targetId = req.params.id as string;
      const { tier } = req.body;
      if (!tier || !["free", "starter", "basic", "pro", "premium"].includes(tier)) {
        return res.status(400).json({ message: "유효하지 않은 구독 플랜입니다" });
      }
      let expiresAt: Date | null = null;
      if (tier !== "free") {
        expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 99);
      }
      await storage.updateUserSubscription(targetId, tier, expiresAt);
      if (tier !== "free") {
        const label =
          tier === "premium"
            ? "프리미엄"
            : tier === "pro"
              ? "Pro"
              : tier === "basic"
                ? "Basic"
                : tier === "starter"
                  ? "Starter"
                  : tier;
        await storage.createNotification({
          userId: targetId,
          type: "system",
          message: `관리자에 의해 ${label} 회원으로 적용되었습니다.`,
          url: "/pricing",
        });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "구독 상태 변경에 실패했습니다" });
    }
  });

  app.get("/api/admin/check", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const role = await storage.getUserRole(req.user.claims.sub);
    res.json({ isAdmin: role === "admin" });
  });

  app.get("/api/admin/radio/channels", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const list = await storage.listAllRadioChannels();
      res.json(list);
    } catch (e) {
      console.error("[admin/radio/channels]", e);
      res.status(500).json({ message: "방송 채널 목록을 불러올 수 없습니다" });
    }
  });

  // === Copyright Report Routes ===
  app.post("/api/copyright-reports", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const reporterId = req.user.claims.sub;
      const { musicId, reason, originalArtist, originalTitle, details } = req.body;
      if (!musicId || !reason) {
        return res.status(400).json({ message: "음원 ID와 신고 사유는 필수입니다" });
      }
      const musicItem = await storage.getMusicById(Number(musicId));
      if (!musicItem) return res.status(404).json({ message: "음원을 찾을 수 없습니다" });

      const report = await storage.createCopyrightReport({
        musicId: Number(musicId),
        reporterId,
        reason,
        originalArtist: originalArtist || null,
        originalTitle: originalTitle || null,
        details: details || null,
      });

      await storage.createNotification({
        userId: musicItem.userId,
        type: "copyright",
        message: `"${musicItem.title}" 음원에 대한 저작권 신고가 접수되었습니다`,
        payload: { musicTitle: musicItem.title },
        url: `/music/${musicId}`,
      });

      res.status(201).json(report);
    } catch (err) {
      console.error("Copyright report error:", err);
      res.status(500).json({ message: "신고 접수에 실패했습니다" });
    }
  });

  app.get("/api/copyright-reports/my", isAuthenticated, async (req, res) => {
    // @ts-ignore
    const userId = req.user.claims.sub;
    const reports = await storage.getCopyrightReportsByUser(userId);
    res.json(reports);
  });

  app.get("/api/admin/copyright-reports", isAuthenticated, isAdmin, async (req, res) => {
    const status = req.query.status as string | undefined;
    const reports = await storage.getAllCopyrightReports(status);
    res.json(reports);
  });

  app.patch("/api/admin/copyright-reports/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { status, adminNote } = req.body;
      if (!status || !["pending", "reviewing", "resolved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "유효하지 않은 상태입니다" });
      }
      const updated = await storage.updateCopyrightReportStatus(Number(req.params.id), status, adminNote);
      if (!updated) return res.status(404).json({ message: "신고를 찾을 수 없습니다" });
      if (updated.reporterId) {
        const statusLabels: Record<string, string> = { pending: "검토 대기", reviewing: "검토 중", resolved: "처리 완료", rejected: "반려" };
        const musicItem = await storage.getMusicById(updated.musicId);
        await storage.createNotification({
          userId: updated.reporterId,
          type: "copyright",
          message: `"${musicItem?.title || "음원"}" 저작권 신고가 ${statusLabels[status] || status}(으)로 처리되었습니다.`,
          payload: { status, musicTitle: musicItem?.title },
          url: "/credits",
        });
      }
      res.json(updated);
    } catch (err) {
      console.error("Copyright report update error:", err);
      res.status(500).json({ message: "신고 처리에 실패했습니다" });
    }
  });

  app.get("/api/admin/user-reports", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const reports = await storage.getAllUserReports(status);
      const withUsers = await Promise.all(reports.map(async (r: any) => {
        const reporter = await storage.getUserById(r.reporterId);
        const reported = await storage.getUserById(r.reportedUserId);
        return { ...r, reporterName: reporter ? `${reporter.firstName || ""} ${reporter.lastName || ""}`.trim() || reporter.email : "-", reportedUserName: reported ? `${reported.firstName || ""} ${reported.lastName || ""}`.trim() || reported.email : "-" };
      }));
      res.json(withUsers);
    } catch (err) {
      res.status(500).json({ message: "회원 신고 목록 조회 실패" });
    }
  });

  app.patch("/api/admin/user-reports/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { status, adminNote } = req.body;
      if (!status || !["pending", "reviewed", "resolved"].includes(status)) {
        return res.status(400).json({ message: "유효하지 않은 상태입니다" });
      }
      const report = await storage.getUserReportById(Number(req.params.id));
      await storage.updateUserReportStatus(Number(req.params.id), status, adminNote);
      if (report && report.reporterId) {
        const statusLabels: Record<string, string> = { pending: "검토 대기", reviewed: "검토 완료", resolved: "처리 완료" };
        await storage.createNotification({
          userId: report.reporterId,
          type: "system",
          message: `회원 신고가 ${statusLabels[status] || status}(으)로 처리되었습니다.`,
          payload: { status, adminNote: adminNote || undefined },
          url: "/messages",
        });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "신고 처리에 실패했습니다" });
    }
  });

  // === TOSS PAYMENTS SUBSCRIPTION ROUTES ===

  app.get("/api/toss/plans", async (_req, res) => {
    try {
      const plans = await db.select().from(subscriptionPlans);
      res.json(plans);
    } catch (err) {
      console.error("Plans fetch error:", err);
      res.status(500).json({ message: "플랜 정보를 불러올 수 없습니다" });
    }
  });

  app.get("/api/toss/subscription", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return res.json({ subscription: null, tier: "free" });
      }

      const now = new Date();
      const isPaid =
        isPaidSubscriptionTierId(user.subscriptionTier ?? "") &&
        user.subscriptionExpiresAt &&
        new Date(user.subscriptionExpiresAt) > now;
      if (isPaid && user.subscriptionTier) {
        return res.json({
          tier: user.subscriptionTier,
          plan: user.subscriptionPlan,
          expiresAt: user.subscriptionExpiresAt,
          hasBillingKey: !!user.tossBillingKey,
        });
      }

      if (
        isPaidSubscriptionTierId(user.subscriptionTier ?? "") &&
        user.subscriptionExpiresAt &&
        new Date(user.subscriptionExpiresAt) <= now
      ) {
        await db.update(users).set({
          subscriptionTier: "free",
          subscriptionPlan: null,
          subscriptionExpiresAt: null,
        }).where(eq(users.id, userId));
      }

      res.json({ tier: "free", hasBillingKey: !!user.tossBillingKey });
    } catch (err) {
      console.error("Subscription check error:", err);
      res.status(500).json({ message: "구독 정보를 불러올 수 없습니다" });
    }
  });

  app.get("/api/toss/client-key", async (_req, res) => {
    const clientKey = process.env.TOSS_CLIENT_KEY;
    res.json({ clientKey: clientKey || null });
  });

  app.get("/api/toss/billing/success", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { authKey, customerKey } = req.query;

      if (!authKey || !customerKey) {
        return res.status(400).json({ message: "인증 정보가 필요합니다" });
      }

      const secretKey = process.env.TOSS_SECRET_KEY;
      if (!secretKey) {
        return res.status(500).json({ message: "결제 설정 오류" });
      }

      const encryptedKey = Buffer.from(secretKey + ':').toString('base64');

      const response = await fetch('https://api.tosspayments.com/v1/billing/authorizations/issue', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${encryptedKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          authKey: authKey as string,
          customerKey: customerKey as string,
        }),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        console.error("Billing key issue failed:", data);
        return res.status(400).json({ message: data.message || "빌링키 발급 실패" });
      }

      await db.update(users).set({
        tossBillingKey: data.billingKey,
        tossCustomerKey: customerKey as string,
      }).where(eq(users.id, userId));

      res.json({ success: true, billingKey: data.billingKey });
    } catch (err) {
      console.error("Billing auth error:", err);
      res.status(500).json({ message: "카드 등록에 실패했습니다" });
    }
  });

  app.post("/api/toss/subscribe", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { billingPeriod } = req.body;

      if (!billingPeriod || !['monthly', 'yearly'].includes(billingPeriod)) {
        return res.status(400).json({ message: "결제 주기를 선택해주세요" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
      if (!user.tossBillingKey) return res.status(400).json({ message: "카드를 먼저 등록해주세요" });

      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, 'pro'));
      if (!plan) return res.status(500).json({ message: "플랜 정보를 찾을 수 없습니다" });

      const n = normalizeSubscriptionPlanPrices("pro", plan.monthlyPrice, plan.yearlyPrice);
      const supply = billingPeriod === "monthly" ? n.monthly : n.yearly;
      const amount = subscriptionTotalVatInclusiveWon(supply);
      const orderName = billingPeriod === 'monthly' ? 'Veny Sound Pro 월간 구독' : 'Veny Sound Pro 연간 구독';
      const orderId = `SW_${userId.substring(0, 8)}_${Date.now()}`;

      const secretKey = process.env.TOSS_SECRET_KEY;
      if (!secretKey) return res.status(500).json({ message: "결제 설정 오류" });

      const encryptedKey = Buffer.from(secretKey + ':').toString('base64');

      const response = await fetch(`https://api.tosspayments.com/v1/billing/${user.tossBillingKey}`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${encryptedKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerKey: user.tossCustomerKey,
          amount,
          orderId,
          orderName,
          customerEmail: user.email || undefined,
          customerName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
        }),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        console.error("Billing payment failed:", data);
        return res.status(400).json({ message: data.message || "결제에 실패했습니다" });
      }

      const now = new Date();
      const expiresAt = new Date(now);
      if (billingPeriod === 'monthly') {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }

      await db.insert(payments).values({
        userId,
        orderId,
        paymentKey: data.paymentKey,
        amount,
        status: 'paid',
        plan: 'pro',
        billingPeriod,
      });

      await db.update(users).set({
        subscriptionTier: 'pro',
        subscriptionPlan: billingPeriod,
        subscriptionExpiresAt: expiresAt,
      }).where(eq(users.id, userId));

      await storage.createNotification({
        userId,
        type: "system",
        message: `Pro 구독이 완료되었습니다. (${billingPeriod === "monthly" ? "월간" : "연간"})`,
        payload: { plan: billingPeriod, amount },
        url: "/pricing",
      });

      res.json({
        success: true,
        tier: 'pro',
        plan: billingPeriod,
        expiresAt,
        amount,
      });
    } catch (err) {
      console.error("Subscribe error:", err);
      res.status(500).json({ message: "구독 처리에 실패했습니다" });
    }
  });

  app.post("/api/toss/cancel-subscription", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });

      await db.update(users).set({
        tossBillingKey: null,
        subscriptionPlan: null,
        subscriptionTier: "free",
        subscriptionExpiresAt: null,
      }).where(eq(users.id, userId));

      res.json({
        success: true,
        message: "구독이 해지되었습니다.",
      });
    } catch (err) {
      console.error("Cancel subscription error:", err);
      res.status(500).json({ message: "구독 해지에 실패했습니다" });
    }
  });

  app.get("/api/toss/payment-history", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const result = await db.select().from(payments).where(eq(payments.userId, userId));
      res.json(result);
    } catch (err) {
      console.error("Payment history error:", err);
      res.status(500).json({ message: "결제 내역을 불러올 수 없습니다" });
    }
  });

  // === 계좌이체 구독 (Bank Transfer Subscription) ===
  app.get("/api/subscription/bank-info", async (_req, res) => {
    const bankName = process.env.BANK_NAME || "입력된 은행명 없음";
    const bankAccount = process.env.BANK_ACCOUNT || "";
    const bankHolder = process.env.BANK_HOLDER || "";
    const planIds: PaidSubscriptionTierId[] = ["starter", "basic", "pro", "premium"];
    const plans = await db.select().from(subscriptionPlans).where(inArray(subscriptionPlans.id, planIds));
    const plansOut = planIds.map((id) => {
      const row = plans.find((p) => p.id === id);
      const n = normalizeSubscriptionPlanPrices(id, row?.monthlyPrice, row?.yearlyPrice);
      const defaultName = id === "starter" ? "Starter" : id === "basic" ? "Basic" : id === "pro" ? "Pro" : "Premium";
      return {
        id,
        name: row?.name ?? defaultName,
        monthlyPrice: n.monthly,
        yearlyPrice: n.yearly,
      };
    });
    const proN = normalizeSubscriptionPlanPrices(
      "pro",
      plans.find((p) => p.id === "pro")?.monthlyPrice,
      plans.find((p) => p.id === "pro")?.yearlyPrice,
    );
    res.json({
      bankName,
      bankAccount,
      bankHolder,
      plans: plansOut,
      amountMonthly: proN.monthly,
      amountYearly: proN.yearly,
    });
  });

  app.post("/api/subscription/request-bank", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { billingPeriod, planId } = req.body;
      if (!billingPeriod || !["monthly", "yearly"].includes(billingPeriod)) {
        return res.status(400).json({ message: "결제 주기를 선택해주세요" });
      }
      if (!planId || !isPaidSubscriptionTierId(String(planId))) {
        return res.status(400).json({ message: "유효하지 않은 플랜입니다" });
      }
      const plan = planId as PaidSubscriptionTierId;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });

      let amount: number;
      try {
        const [planRow] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, plan)).limit(1);
        const fb = SUBSCRIPTION_PLAN_FALLBACK[plan];
        if (!planRow) {
          const supply = billingPeriod === "monthly" ? fb.monthly : fb.yearly;
          amount = subscriptionTotalVatInclusiveWon(supply);
        } else {
          const n = normalizeSubscriptionPlanPrices(plan, planRow.monthlyPrice, planRow.yearlyPrice);
          const supply = billingPeriod === "monthly" ? n.monthly : n.yearly;
          amount = subscriptionTotalVatInclusiveWon(supply);
        }
      } catch {
        const fb = SUBSCRIPTION_PLAN_FALLBACK[plan];
        const supply = billingPeriod === "monthly" ? fb.monthly : fb.yearly;
        amount = subscriptionTotalVatInclusiveWon(supply);
      }
      const orderId = `BANK_${userId.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 20)}_${Date.now()}`;

      await db.insert(payments).values({
        userId,
        orderId,
        paymentKey: "bank_transfer",
        amount,
        status: "pending",
        plan,
        billingPeriod,
      });

      const bankName = process.env.BANK_NAME || "은행명";
      const bankAccount = process.env.BANK_ACCOUNT || "";
      const bankHolder = process.env.BANK_HOLDER || "";
      res.json({
        success: true,
        orderId,
        bankInfo: { bankName, bankAccount, bankHolder },
        amount,
        billingPeriod,
        planId: plan,
        message: `입금 신청이 등록되었습니다. ${amount.toLocaleString("ko-KR")}원을 아래 계좌로 입금해 주시면 확인 후 즉시 ${plan === "premium" ? "프리미엄" : plan === "pro" ? "Pro" : plan === "basic" ? "Basic" : plan === "starter" ? "Starter" : plan}이 적용됩니다.`,
      });
    } catch (err: any) {
      console.error("Request bank subscription error:", err);
      let message = err?.message || err?.code || "입금 신청에 실패했습니다";
      if (typeof message === "string" && (message.includes("payments") || message.includes("subscription_plans")) && message.toLowerCase().includes("relation")) {
        message = "결제 테이블이 없습니다. 로컬 개발 시 script/create-subscription-tables.sql 을 DB에 실행해주세요.";
      }
      res.status(500).json({ message: typeof message === "string" ? message : "입금 신청에 실패했습니다" });
    }
  });

  app.post("/api/admin/payments/:id/confirm-bank", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const paymentId = req.params.id as string;
      const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
      if (!payment) return res.status(404).json({ message: "결제 건을 찾을 수 없습니다" });
      if (payment.status !== "pending" || payment.paymentKey !== "bank_transfer") {
        return res.status(400).json({ message: "계좌이체 대기 건만 확인할 수 있습니다" });
      }

      await db.update(payments).set({ status: "paid" }).where(eq(payments.id, paymentId));

      if (payment.plan === "credit_charge") {
        const creditAmount = creditsFromTotalVatInclusiveWon(payment.amount);
        await storage.addCredits(payment.userId, creditAmount);
        await storage.createCreditTransaction({
          userId: payment.userId,
          type: "charge",
          amount: creditAmount,
          description: `${creditAmount.toLocaleString()} 크레딧 충전 (계좌이체, 총결제 ${payment.amount.toLocaleString()}원)`,
        });
        await storage.createNotification({
          userId: payment.userId,
          type: "system",
          message: `${creditAmount.toLocaleString()} 크레딧 충전이 완료되었습니다`,
          payload: { amount: creditAmount },
          url: "/credits",
        });
        return res.json({ success: true, credits: creditAmount });
      }

      const now = new Date();
      const expiresAt = new Date(now);
      if (payment.billingPeriod === "monthly") {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }
      const tier = isPaidSubscriptionTierId(payment.plan ?? "") ? (payment.plan as string) : "pro";
      await db.update(users).set({
        subscriptionTier: tier,
        subscriptionPlan: payment.billingPeriod,
        subscriptionExpiresAt: expiresAt,
      }).where(eq(users.id, payment.userId));

      res.json({ success: true, expiresAt, tier });
    } catch (err) {
      console.error("Confirm bank payment error:", err);
      res.status(500).json({ message: "입금 확인 처리에 실패했습니다" });
    }
  });

  app.delete("/api/admin/payments/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const paymentId = req.params.id as string;
      const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
      if (!payment) return res.status(404).json({ message: "결제 건을 찾을 수 없습니다" });
      if (payment.status !== "pending" || payment.paymentKey !== "bank_transfer") {
        return res.status(400).json({ message: "계좌이체 대기 건만 삭제할 수 있습니다" });
      }
      await db.execute(sql`DELETE FROM payments WHERE id = ${payment.id} AND status = 'pending' AND payment_key = 'bank_transfer'`);
      res.json({ success: true });
    } catch (err) {
      console.error("Delete pending bank payment error:", err);
      res.status(500).json({ message: "삭제에 실패했습니다" });
    }
  });

  app.get("/api/admin/pending-bank-payments", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const list = await db
        .select({
          id: payments.id,
          userId: payments.userId,
          orderId: payments.orderId,
          amount: payments.amount,
          plan: payments.plan,
          billingPeriod: payments.billingPeriod,
          createdAt: payments.createdAt,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(payments)
        .leftJoin(users, eq(payments.userId, users.id))
        .where(and(eq(payments.status, "pending"), eq(payments.paymentKey, "bank_transfer")))
        .orderBy(desc(payments.createdAt));
      res.json(list);
    } catch (err) {
      console.error("Pending bank payments error:", err);
      res.status(500).json({ message: "목록을 불러올 수 없습니다" });
    }
  });

  // === Credits (크레딧) Routes ===
  app.get("/api/credits", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const credits = await storage.getUserCredits(userId);
      res.json({ credits });
    } catch (err) {
      res.status(500).json({ message: "크레딧 정보를 불러올 수 없습니다" });
    }
  });

  app.get("/api/credits/transactions", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const transactions = await storage.getCreditTransactions(userId);
      const serialized = transactions.map((tx: any) => ({
        ...tx,
        createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : tx.createdAt,
      }));
      res.json(serialized);
    } catch (err) {
      res.status(500).json({ message: "거래 내역을 불러올 수 없습니다" });
    }
  });

  app.post("/api/credits/charge", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { amount, paymentKey, orderId } = req.body;

      if (!amount || amount < 1000) {
        return res.status(400).json({ message: "최소 충전 금액은 1,000원입니다" });
      }

      const tossSecretKey = process.env.TOSS_SECRET_KEY;
      if (tossSecretKey && paymentKey && orderId) {
        const confirmRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(tossSecretKey + ":").toString("base64")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ paymentKey, orderId, amount }),
        });

        if (!confirmRes.ok) {
          const errData = await confirmRes.json();
          return res.status(400).json({ message: errData.message || "결제 확인에 실패했습니다" });
        }
      }

      const creditsToAdd = creditsFromTotalVatInclusiveWon(Number(amount));
      if (creditsToAdd < 1) {
        return res.status(400).json({ message: "결제 금액으로 환산된 크레딧이 없습니다" });
      }

      await storage.addCredits(userId, creditsToAdd);
      await storage.createCreditTransaction({
        userId,
        type: "charge",
        amount: creditsToAdd,
        description: `${creditsToAdd.toLocaleString()} 크레딧 충전 (총결제 ${Number(amount).toLocaleString()}원)`,
      });

      const newCredits = await storage.getUserCredits(userId);
      res.json({ credits: newCredits, message: "크레딧이 충전되었습니다" });
    } catch (err) {
      console.error("Credit charge error:", err);
      res.status(500).json({ message: "크레딧 충전에 실패했습니다" });
    }
  });

  // 크레딧 계좌이체 충전 신청 (amount = 총결재금액 = 충전금+부가세10%)
  app.post("/api/credits/request-bank", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { amount } = req.body;
      if (!amount || amount < 1100) {
        return res.status(400).json({ message: "최소 충전 금액은 1,000원(총결재 1,100원)입니다" });
      }
      const orderId = `CREDIT_${userId.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 20)}_${Date.now()}`;
      await db.insert(payments).values({
        userId,
        orderId,
        paymentKey: "bank_transfer",
        amount,
        status: "pending",
        plan: "credit_charge",
        billingPeriod: null,
      });
      await storage.createNotification({
        userId,
        type: "system",
        message: `입금 신청이 접수되었습니다. 총 ${amount.toLocaleString()}원을 등록된 계좌로 입금해 주세요.`,
        payload: { amount },
        url: "/credits",
      });
      const adminRows = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      for (const admin of adminRows) {
        if (admin.id === userId) continue;
        await storage.createNotification({
          userId: admin.id,
          type: "system",
          message: `새 크레딧 입금 신청이 있습니다. (총 ${amount.toLocaleString()}원)`,
          payload: { amount },
          url: getAdminPagePath(),
        });
      }
      const bankName = process.env.BANK_NAME || "은행명";
      const bankAccount = process.env.BANK_ACCOUNT || "";
      const bankHolder = process.env.BANK_HOLDER || "";
      res.json({
        success: true,
        orderId,
        bankInfo: { bankName, bankAccount, bankHolder },
        amount,
        message: "입금 신청이 등록되었습니다. 아래 계좌로 입금해 주시면 확인 후 크레딧이 충전됩니다.",
      });
    } catch (err: any) {
      console.error("Credits request-bank error:", err);
      res.status(500).json({ message: err?.message || "입금 신청에 실패했습니다" });
    }
  });

  // 충전 크레딧 환불 신청 (정책 검토 후 관리자가 승인 시 잔액만 차감; 원화 환불은 운영에서 별도 처리)
  app.post("/api/credits/refund-request", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub as string;
      const proof = (req.body as { refundProofToken?: unknown }).refundProofToken;
      if (!verifyCreditRefundProof(proof, userId)) {
        return res.status(403).json({
          message: "이메일 인증이 필요합니다. 인증 코드를 요청한 뒤 확인해 주세요.",
        });
      }
      const creditsRaw = Number((req.body as { credits?: unknown }).credits);
      const reason = typeof (req.body as { reason?: unknown }).reason === "string" ? String((req.body as { reason: string }).reason).trim().slice(0, 2000) : "";
      if (!Number.isFinite(creditsRaw) || creditsRaw < 1 || !Number.isInteger(creditsRaw)) {
        return res.status(400).json({ message: "환불 요청 크레딧은 1 이상의 정수여야 합니다" });
      }
      const credits = Math.floor(creditsRaw);
      const balance = await storage.getUserCredits(userId);
      if (credits > balance) {
        return res.status(400).json({ message: "보유 크레딧보다 많은 금액은 신청할 수 없습니다" });
      }
      const [pending] = await db
        .select({ id: creditRefundRequests.id })
        .from(creditRefundRequests)
        .where(and(eq(creditRefundRequests.userId, userId), eq(creditRefundRequests.status, "pending")))
        .limit(1);
      if (pending) {
        return res.status(400).json({ message: "이미 처리 대기 중인 환불 신청이 있습니다" });
      }
      const [inserted] = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(creditRefundRequests)
          .values({ userId, creditsAmount: credits, reason: reason || null, status: "pending" })
          .returning();
        if (!row) throw new Error("INSERT_FAILED");
        await tx.insert(creditRefundEvents).values({
          refundRequestId: row.id,
          eventType: "request_created",
          actorUserId: userId,
          metadata: { credits, reason: reason || null },
          note: null,
        });
        return [row];
      });
      await storage.createNotification({
        userId,
        type: "system",
        message: `크레딧 환불 신청이 접수되었습니다. (${credits.toLocaleString()} 크레딧) 검토 후 안내드립니다.`,
        payload: { refundRequestId: inserted.id, credits },
        url: "/credits",
      });
      const adminRows = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      for (const admin of adminRows) {
        if (admin.id === userId) continue;
        await storage.createNotification({
          userId: admin.id,
          type: "system",
          message: `새 크레딧 환불 신청: ${credits.toLocaleString()} 크레딧`,
          payload: { refundRequestId: inserted.id, userId },
          url: getAdminPagePath(),
        });
      }
      res.json({ success: true, id: inserted.id, message: "환불 신청이 접수되었습니다" });
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("credit_refund_requests") && msg.toLowerCase().includes("relation")) {
        return res.status(500).json({
          message:
            "DB에 credit_refund_requests 테이블이 없습니다. 서버에서 npm run db:deploy 를 실행하거나, deploy/credit-refund-requests.sql(또는 script/migrations/011-credit-refund-requests.sql)을 DB에 적용해 주세요.",
        });
      }
      console.error("Credits refund-request error:", err);
      res.status(500).json({ message: "환불 신청에 실패했습니다" });
    }
  });

  app.get("/api/credits/refund-requests", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub as string;
      const rows = await db
        .select()
        .from(creditRefundRequests)
        .where(eq(creditRefundRequests.userId, userId))
        .orderBy(desc(creditRefundRequests.createdAt));
      const serialized = rows.map((r) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        processedAt: r.processedAt instanceof Date ? r.processedAt.toISOString() : r.processedAt,
        krwRefundCompletedAt:
          r.krwRefundCompletedAt instanceof Date ? r.krwRefundCompletedAt.toISOString() : r.krwRefundCompletedAt,
      }));
      res.json(serialized);
    } catch (err: any) {
      console.error("Credits refund-requests list error:", err);
      res.status(500).json({ message: "목록을 불러올 수 없습니다" });
    }
  });

  app.get("/api/admin/credit-refund-requests", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const statusFilter = typeof req.query.status === "string" ? req.query.status : "all";
      const refundProcessorUser = alias(users, "credit_refund_processor");
      const krwRecorderUser = alias(users, "credit_refund_krw_recorder");
      const selectCols = {
        id: creditRefundRequests.id,
        userId: creditRefundRequests.userId,
        creditsAmount: creditRefundRequests.creditsAmount,
        reason: creditRefundRequests.reason,
        status: creditRefundRequests.status,
        adminNote: creditRefundRequests.adminNote,
        createdAt: creditRefundRequests.createdAt,
        processedAt: creditRefundRequests.processedAt,
        processedByUserId: creditRefundRequests.processedByUserId,
        krwRefundAmountWon: creditRefundRequests.krwRefundAmountWon,
        krwRefundCompletedAt: creditRefundRequests.krwRefundCompletedAt,
        krwRefundNote: creditRefundRequests.krwRefundNote,
        krwRefundRecordedByUserId: creditRefundRequests.krwRefundRecordedByUserId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        processorEmail: refundProcessorUser.email,
        processorFirstName: refundProcessorUser.firstName,
        processorLastName: refundProcessorUser.lastName,
        krwRecorderEmail: krwRecorderUser.email,
        krwRecorderFirstName: krwRecorderUser.firstName,
        krwRecorderLastName: krwRecorderUser.lastName,
      };
      const fromJoin = () =>
        db
          .select(selectCols)
          .from(creditRefundRequests)
          .leftJoin(users, eq(creditRefundRequests.userId, users.id))
          .leftJoin(refundProcessorUser, eq(creditRefundRequests.processedByUserId, refundProcessorUser.id))
          .leftJoin(krwRecorderUser, eq(creditRefundRequests.krwRefundRecordedByUserId, krwRecorderUser.id));
      let rows;
      if (statusFilter === "pending") {
        rows = await fromJoin()
          .where(eq(creditRefundRequests.status, "pending"))
          .orderBy(desc(creditRefundRequests.createdAt));
      } else if (statusFilter === "approved" || statusFilter === "rejected") {
        rows = await fromJoin()
          .where(eq(creditRefundRequests.status, statusFilter))
          .orderBy(desc(creditRefundRequests.createdAt));
      } else {
        rows = await fromJoin().orderBy(desc(creditRefundRequests.createdAt));
      }
      res.json(
        rows.map((r) => ({
          ...r,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
          processedAt: r.processedAt instanceof Date ? r.processedAt.toISOString() : r.processedAt,
          krwRefundCompletedAt:
            r.krwRefundCompletedAt instanceof Date ? r.krwRefundCompletedAt.toISOString() : r.krwRefundCompletedAt,
        })),
      );
    } catch (err) {
      console.error("Admin credit-refund-requests error:", err);
      res.status(500).json({ message: "목록을 불러올 수 없습니다" });
    }
  });

  app.post("/api/admin/credit-refund-requests/:id/approve", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // @ts-ignore
      const adminId = req.user.claims.sub as string;
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ message: "잘못된 요청입니다" });
      }
      let approvedUserId = "";
      let approvedAmount = 0;
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(creditRefundRequests)
          .where(and(eq(creditRefundRequests.id, id), eq(creditRefundRequests.status, "pending")));
        if (!row) {
          throw new Error("NOT_PENDING");
        }
        const [u] = await tx.select({ credits: users.credits }).from(users).where(eq(users.id, row.userId));
        const bal = u?.credits ?? 0;
        if (bal < row.creditsAmount) {
          throw new Error("INSUFFICIENT_BALANCE");
        }
        approvedUserId = row.userId;
        approvedAmount = row.creditsAmount;
        await tx
          .update(users)
          .set({ credits: sql`COALESCE(${users.credits}, 0) - ${row.creditsAmount}`, updatedAt: new Date() })
          .where(eq(users.id, row.userId));
        const createdAtIso =
          row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? "");
        await tx.insert(creditTransactions).values({
          userId: row.userId,
          type: "refund",
          amount: -row.creditsAmount,
          description: `환불 승인 (신청 #${row.id}, 접수 ${createdAtIso}, ${row.creditsAmount} 크레딧 차감. 원화 환불 별도 입금)`,
        });
        await tx
          .update(creditRefundRequests)
          .set({ status: "approved", processedAt: new Date(), adminNote: null, processedByUserId: adminId })
          .where(eq(creditRefundRequests.id, id));
        await tx.insert(creditRefundEvents).values({
          refundRequestId: id,
          eventType: "admin_approved",
          actorUserId: adminId,
          metadata: { creditsAmount: row.creditsAmount, requestCreatedAt: createdAtIso },
          note: null,
        });
      });
      const newBal = await storage.getUserCredits(approvedUserId);
      await storage.createNotification({
        userId: approvedUserId,
        type: "system",
        message: `크레딧 환불이 승인되어 ${approvedAmount.toLocaleString()} 크레딧이 차감되었습니다. 현재 잔액 ${newBal.toLocaleString()} 크레딧. 원화 환불은 별도 안내에 따라 진행됩니다.`,
        payload: { refundRequestId: id, creditsDeducted: approvedAmount },
        url: "/credits",
      });
      res.json({ success: true, message: "승인되었습니다. 사용자 크레딧이 차감되었습니다." });
    } catch (err: any) {
      const m = err?.message || String(err);
      if (m === "NOT_PENDING") return res.status(400).json({ message: "대기 중인 신청이 아닙니다" });
      if (m === "INSUFFICIENT_BALANCE") return res.status(400).json({ message: "사용자 잔액이 부족합니다. 거절하거나 잔액을 확인하세요." });
      console.error("Approve credit refund error:", err);
      res.status(500).json({ message: "처리에 실패했습니다" });
    }
  });

  app.post("/api/admin/credit-refund-requests/:id/reject", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // @ts-ignore
      const adminId = req.user.claims.sub as string;
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ message: "잘못된 요청입니다" });
      }
      const note =
        typeof (req.body as { adminNote?: unknown })?.adminNote === "string"
          ? String((req.body as { adminNote: string }).adminNote).trim().slice(0, 2000)
          : "";
      const [updated] = await db.transaction(async (tx) => {
        const [u] = await tx
          .update(creditRefundRequests)
          .set({ status: "rejected", adminNote: note || null, processedAt: new Date(), processedByUserId: adminId })
          .where(and(eq(creditRefundRequests.id, id), eq(creditRefundRequests.status, "pending")))
          .returning();
        if (u) {
          await tx.insert(creditRefundEvents).values({
            refundRequestId: id,
            eventType: "admin_rejected",
            actorUserId: adminId,
            metadata: { adminNote: note || null },
            note: note || null,
          });
        }
        return [u];
      });
      if (!updated) {
        return res.status(400).json({ message: "대기 중인 신청이 아닙니다" });
      }
      await storage.createNotification({
        userId: updated.userId,
        type: "system",
        message: note
          ? `크레딧 환불 신청이 반려되었습니다. 사유: ${note.slice(0, 200)}`
          : "크레딧 환불 신청이 반려되었습니다.",
        payload: { refundRequestId: id },
        url: "/credits",
      });
      res.json({ success: true, message: "반려 처리되었습니다" });
    } catch (err) {
      console.error("Reject credit refund error:", err);
      res.status(500).json({ message: "처리에 실패했습니다" });
    }
  });

  app.post("/api/admin/credit-refund-requests/:id/krw-refund", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // @ts-ignore
      const adminId = req.user.claims.sub as string;
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ message: "잘못된 요청입니다" });
      }
      const amountRaw = Number((req.body as { amountWon?: unknown }).amountWon);
      const krwNote =
        typeof (req.body as { note?: unknown })?.note === "string"
          ? String((req.body as { note: string }).note).trim().slice(0, 2000)
          : "";
      if (!Number.isFinite(amountRaw) || amountRaw < 0 || !Number.isInteger(amountRaw)) {
        return res.status(400).json({ message: "원화 금액은 0 이상의 정수(원)여야 합니다" });
      }
      const amountWon = Math.floor(amountRaw);
      const [row] = await db.select().from(creditRefundRequests).where(eq(creditRefundRequests.id, id)).limit(1);
      if (!row) {
        return res.status(404).json({ message: "신청을 찾을 수 없습니다" });
      }
      if (row.status !== "approved") {
        return res.status(400).json({ message: "승인된 신청만 원화 환불을 기록할 수 있습니다" });
      }
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(creditRefundRequests)
          .set({
            krwRefundAmountWon: amountWon,
            krwRefundCompletedAt: now,
            krwRefundNote: krwNote || null,
            krwRefundRecordedByUserId: adminId,
          })
          .where(eq(creditRefundRequests.id, id));
        await tx.insert(creditRefundEvents).values({
          refundRequestId: id,
          eventType: "krw_refund_recorded",
          actorUserId: adminId,
          metadata: { amountWon },
          note: krwNote || null,
        });
      });
      await storage.createNotification({
        userId: row.userId,
        type: "system",
        message:
          amountWon > 0
            ? `크레딧 환불(신청 #${id}) 원화 ${amountWon.toLocaleString()}원 입금이 기록되었습니다.`
            : `크레딧 환불(신청 #${id}) 관련 원화 처리 메모가 등록되었습니다.`,
        payload: { refundRequestId: id, krwAmountWon: amountWon },
        url: "/credits",
      });
      res.json({ success: true, message: "원화 환불이 기록되었습니다" });
    } catch (err) {
      console.error("Krw refund record error:", err);
      res.status(500).json({ message: "기록에 실패했습니다" });
    }
  });

  app.get("/api/admin/credit-refund-requests/:id/events", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ message: "잘못된 요청입니다" });
      }
      const rows = await db
        .select()
        .from(creditRefundEvents)
        .where(eq(creditRefundEvents.refundRequestId, id))
        .orderBy(asc(creditRefundEvents.id));
      res.json(
        rows.map((e) => ({
          ...e,
          createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
        })),
      );
    } catch (err) {
      console.error("Refund events list error:", err);
      res.status(500).json({ message: "이력을 불러올 수 없습니다" });
    }
  });

  // === Radio (베니방송국) Routes ===
  // 1) 라이브 중인 채널만
  app.get("/api/radio/channels/live", async (_req, res) => {
    try {
      const list = await storage.listLiveRadioChannels();
      res.json(list);
    } catch (e) {
      console.error("[radio/channels/live]", e);
      res.status(500).json({ message: "라이브 채널 목록을 불러올 수 없습니다" });
    }
  });

  // 2) 생성된 모든 방송 채널 목록 (상태와 상관없이)
  app.get("/api/radio/channels", async (_req, res) => {
    try {
      const list = await storage.listAllRadioChannels();
      res.json(list);
    } catch (e) {
      console.error("[radio/channels GET]", e);
      res.status(500).json({ message: "방송 채널 목록을 불러올 수 없습니다" });
    }
  });

  app.get("/api/radio/channels/me", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const channel = await storage.getRadioChannelByOwnerId(userId);
      res.json(channel ?? null);
    } catch (e) {
      console.error("[radio/channels/me]", e);
      res.status(500).json({ message: "내 채널 정보를 불러올 수 없습니다" });
    }
  });

  app.get("/api/radio/channels/:slug/staff", async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const list = await storage.getRadioChannelStaff(channel.id);
      res.json(list);
    } catch (e) {
      console.error("[radio/channels/:slug/staff GET]", e);
      res.status(500).json({ message: "스텝 목록을 불러올 수 없습니다" });
    }
  });

  app.post("/api/radio/channels/:slug/staff", isAuthenticated, async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const userId = (req as any).user?.claims?.sub;
      if (channel.ownerId !== userId) return res.status(403).json({ message: "방장만 스텝을 추가할 수 있습니다." });
      const { username, userId: bodyUserId, role } = req.body || {};
      const targetUserId = typeof bodyUserId === "string" && bodyUserId ? bodyUserId : (username ? await storage.getUserIdByUsername(String(username)) : undefined);
      if (!targetUserId) return res.status(400).json({ message: "사용자를 찾을 수 없습니다. 로그인 아이디 또는 이메일을 확인해 주세요." });
      if (targetUserId === channel.ownerId) return res.status(400).json({ message: "방장은 스텝으로 추가할 수 없습니다." });
      const validRole = role === "sub_host" ? "sub_host" : role === "cj" ? "cj" : "staff";
      await storage.addRadioChannelStaff(channel.id, targetUserId, validRole);
      const list = await storage.getRadioChannelStaff(channel.id);
      res.json(list);
    } catch (e) {
      console.error("[radio/channels/:slug/staff POST]", e);
      res.status(500).json({ message: "스텝 추가에 실패했습니다." });
    }
  });

  app.delete("/api/radio/channels/:slug/staff/:userId", isAuthenticated, async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      const targetUserId = req.params.userId;
      if (!slug || !targetUserId) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const userId = (req as any).user?.claims?.sub;
      if (channel.ownerId !== userId) return res.status(403).json({ message: "방장만 스텝을 제거할 수 있습니다." });
      await storage.removeRadioChannelStaff(channel.id, targetUserId);
      const list = await storage.getRadioChannelStaff(channel.id);
      res.json(list);
    } catch (e) {
      console.error("[radio/channels/:slug/staff DELETE]", e);
      res.status(500).json({ message: "스텝 제거에 실패했습니다." });
    }
  });

  app.get("/api/radio/channels/:slug", async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const out: any = { ...channel, nowPlayingLocalTitle: radioLocalTitles.get(slug) ?? null };
      if (channel.nowPlayingStartedAt) {
        const started = (channel.nowPlayingStartedAt as Date).getTime();
        out.nowPlayingElapsedSeconds = Math.max(0, Math.floor((Date.now() - started) / 1000));
      } else {
        out.nowPlayingElapsedSeconds = null;
      }
      const owner = await storage.getUserById(channel.ownerId);
      out.ownerDisplayName = owner?.firstName || owner?.username || channel.ownerId?.slice(0, 8) || "DJ";
      if (req.isAuthenticated() && (req as any).user?.claims?.sub) {
        const uid = (req as any).user.claims.sub;
        const isOwner = channel.ownerId === uid;
        const isCurrentHost = (channel as any).currentHostId === uid;
        out.canManage = isOwner || isCurrentHost || (await storage.isRadioChannelStaff(channel.id, uid));
        out.canControlBroadcast = isOwner || isCurrentHost;
      } else {
        out.canManage = false;
        out.canControlBroadcast = false;
      }
      res.json(out);
    } catch (e) {
      console.error("[radio/channels/:slug]", e);
      res.status(500).json({ message: "채널 정보를 불러올 수 없습니다" });
    }
  });

  // 채널 연속 스트림: 한 URL로 현재 곡 + 다음 곡 이어서 재생 (DJ 모니터/리스너 한 번 play()로 연속 재생)
  app.get("/api/radio/channels/:slug/stream", async (req, res) => {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!slug) return res.status(404).end();
    // NOTE: /api/music/:id/stream 와 동일한 경로 규칙을 사용해야 한다.
    // 이전엔 ".."로 상위 폴더를 보고 있어 실제 파일이 있어도 못 찾아 504(프록시 타임아웃)를 유발할 수 있었다.
    const uploadsDirInner = path.resolve(process.cwd(), "local-uploads", "uploads");
    const getLocalPathForMusicId = async (
      musicId: number
    ): Promise<{ path: string; contentType: string } | { objectUrl: string } | null> => {
      const music = await storage.getMusicById(musicId);
      if (!music) return null;
      const fn = music.filename || "";
      let fileId = "";
      const objMatch = fn.match(/\/objects\/uploads\/(.+)$/);
      if (objMatch) fileId = objMatch[1];
      else if (fn.startsWith("uploads/")) fileId = fn.replace(/^uploads\//, "");
      else if (/^[a-f0-9-]{36}(\.[a-z]+)?$/i.test(fn.trim())) fileId = fn.trim();
      else if (fn.includes("/")) fileId = fn.split("/").pop() || "";
      else fileId = fn;
      fileId = fileId.replace(/^\//, "");
      if (!fileId) return null;
      const baseId = fileId.replace(/\.(mp3|wav|ogg)$/i, "");
      const candidates = [
        path.join(uploadsDirInner, fileId),
        path.join(uploadsDirInner, `${baseId}.mp3`),
        path.join(uploadsDirInner, `${baseId}.wav`),
        path.join(uploadsDirInner, `${baseId}.ogg`),
      ];
      const localPath = candidates.find((p) => existsSync(p));
      if (!localPath) {
        // 객체 스토리지에만 있는 음원인 경우: 연속 스트림으로 "이어붙이기"는 못하지만,
        // 적어도 504로 죽지 않게 해당 파일로 리다이렉트한다.
        if (typeof fn === "string" && fn.startsWith("/objects/")) {
          return { objectUrl: fn };
        }
        return null;
      }
      const ext = path.extname(localPath).toLowerCase();
      const mime: Record<string, string> = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg" };
      return { path: localPath, contentType: mime[ext] || "audio/mpeg" };
    };
    try {
      res.set("Cache-Control", "no-store");
      res.set("Content-Disposition", "inline");
      let lastStreamedId: number | null = null;
      const pump = async () => {
        while (!res.writableEnded) {
          const ch = await storage.getRadioChannelBySlug(slug);
          if (!ch || ch.status !== "live") break;
          const musicId = ch.nowPlayingMusicId ?? null;
          if (musicId == null) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          const info = await getLocalPathForMusicId(musicId);
          if (!info) {
            // 파일을 못 찾으면 무한 대기하지 말고 응답을 종료해 프록시 504를 피한다.
            // 클라이언트는 nowPlaying 변경 시 재요청(또는 재시도)한다.
            if (!res.headersSent) {
              res.status(404).end();
              return;
            }
            try { res.end(); } catch (_) {}
            return;
          }
          if ("objectUrl" in info) {
            if (!res.headersSent) {
              res.set("Cache-Control", "no-store");
              res.redirect(302, info.objectUrl);
              return;
            }
            try { res.end(); } catch (_) {}
            return;
          }
          if (lastStreamedId === musicId) {
            await new Promise((r) => setTimeout(r, 1000));
            lastStreamedId = null;
            continue;
          }
          lastStreamedId = musicId;
          if (!res.headersSent) {
            res.set("Content-Type", info.contentType);
            res.status(200);
          }
          await new Promise<void>((resolve, reject) => {
            const fileStream = createReadStream(info.path);
            fileStream.pipe(res, { end: false });
            fileStream.on("end", () => resolve());
            fileStream.on("error", (err) => {
              fileStream.destroy();
              reject(err);
            });
            res.on("close", () => {
              fileStream.destroy();
              resolve();
            });
          });
          if (res.writableEnded) break;
        }
        if (!res.writableEnded) res.end();
      };
      pump().catch((e) => {
        if (!res.writableEnded) {
          try { res.end(); } catch (_) {}
        }
        console.warn("[radio/channels/:slug/stream]", e);
      });
    } catch (e) {
      if (!res.headersSent) res.status(500).end();
      console.warn("[radio/channels/:slug/stream]", e);
    }
  });

  app.post("/api/radio/channels", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const existing = await storage.getRadioChannelByOwnerId(userId);
      if (existing) {
        return res.status(400).json({ message: "이미 채널이 있습니다. 한 계정당 하나의 채널만 만들 수 있습니다." });
      }
      const { name, slug, description, coverFilename } = req.body || {};
      if (!name || !slug || typeof name !== "string" || typeof slug !== "string") {
        return res.status(400).json({ message: "채널 이름과 슬러그를 입력하세요." });
      }
      const safeSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "channel";
      const { id } = await storage.createRadioChannel({
        ownerId: userId,
        name: name.trim(),
        slug: safeSlug,
        description: description?.trim() || null,
        coverFilename: coverFilename || null,
      });
      res.status(201).json({ id, slug: safeSlug });
    } catch (e) {
      console.error("[radio/channels create]", e);
      res.status(500).json({ message: "채널 생성에 실패했습니다" });
    }
  });

  // 개발용 단순 송출 테스트 엔드포인트 (radio-audio-test.html 전용)
  if (process.env.NODE_ENV === "development") {
    app.patch("/api/dev/radio/channels/:slug", async (req, res) => {
      try {
        const slug = String(req.params.slug || "").trim().toLowerCase();
        if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다." });
        const channel = await storage.getRadioChannelBySlug(slug);
        if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다." });
        const { status, nowPlayingMusicId, nowPlayingStartedAt } = req.body || {};
        const updates: any = {};
        if (status) updates.status = String(status);
        if (nowPlayingMusicId !== undefined) {
          const idNum = nowPlayingMusicId == null ? null : Number(nowPlayingMusicId);
          updates.nowPlayingMusicId = idNum;
          updates.nowPlayingStartedAt = idNum != null
            ? (nowPlayingStartedAt ? new Date(nowPlayingStartedAt) : new Date())
            : null;
        }
        await storage.updateRadioChannel(channel.id, updates);
        const updated = await storage.getRadioChannelBySlug(slug);
        return res.json(updated);
      } catch (e) {
        console.error("[dev/radio/channels patch]", e);
        return res.status(500).json({ message: "채널 업데이트 실패 (dev)" });
      }
    });
  }

  app.patch("/api/radio/channels/:slug", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub;
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다." });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다." });
      const role = await storage.getUserRole(userId);
      const isOwner = channel.ownerId === userId;
      const isCurrentHost = (channel as any).currentHostId === userId;
      const isAdminUser = role === "admin";
      const canManage = isOwner || isCurrentHost || isAdminUser;

      const { status, nowPlayingMusicId, nowPlayingStartedAt, nowPlayingObjectPath: bodyNowPlayingObjectPath, nowPlayingLocalTitle: bodyNowPlayingLocalTitle, afterTempNextSnapshotIndex: bodyAfterTempNextSnapshotIndex, currentHostId: bodyCurrentHostId, scheduledStartAt: bodyScheduledStartAt, scheduledEndAt: bodyScheduledEndAt, notice: bodyNotice, queueMusicIds: bodyQueueMusicIds, currentTrackDurationSeconds: bodyCurrentTrackDurationSeconds, queueDurationsSeconds: bodyQueueDurationsSeconds, advanceToNextTrack: bodyAdvanceToNextTrack, currentTrackId: bodyCurrentTrackId } = req.body || {};
      const updates: { status?: string; nowPlayingMusicId?: number | null; nowPlayingStartedAt?: Date | null; nowPlayingObjectPath?: string | null; nowPlayingTempDurationSeconds?: number | null; nowPlayingTempNextSnapshotIndex?: number | null; currentHostId?: string | null; scheduledStartAt?: Date | null; scheduledEndAt?: Date | null; notice?: string | null; playlistSnapshot?: { musicIds: number[]; durationsSeconds: number[]; currentIndex: number } | null } = {};

      if (bodyCurrentHostId !== undefined) {
        if (!isOwner) return res.status(403).json({ message: "채널 소유자만 인수인계할 수 있습니다." });
        const newHostId = bodyCurrentHostId === null || bodyCurrentHostId === "" ? null : String(bodyCurrentHostId);
        if (newHostId) {
          const isStaff = await storage.isRadioChannelStaff(channel.id, newHostId);
          if (newHostId !== channel.ownerId && !isStaff) return res.status(400).json({ message: "송출을 넘길 수 있는 사람은 방장 또는 스텝만 가능합니다." });
        }
        updates.currentHostId = newHostId;
      }

      if (!canManage && Object.keys(updates).length === 0) return res.status(403).json({ message: "채널 소유자 또는 현재 송출 호스트만 수정할 수 있습니다." });
      if (status !== undefined && String(status) === "ended" && !isOwner && !isCurrentHost && !isAdminUser) {
        return res.status(403).json({ message: "방송 종료는 방장 또는 현재 송출 호스트만 가능합니다." });
      }
      if (canManage) {
        // DJ 모니터 곡 끝 시 즉시 다음 곡으로 진행 (낙관적 락: currentTrackId 일치할 때만 진행)
        const snap = (channel as any).playlistSnapshot as { musicIds: number[]; durationsSeconds: number[]; currentIndex: number } | null;
        if (bodyAdvanceToNextTrack && snap && Array.isArray(snap.musicIds) && snap.musicIds.length > 0) {
          const ch = channel as any;
          const expectedTrackId = bodyCurrentTrackId != null ? Number(bodyCurrentTrackId) : null;
          if (expectedTrackId != null && !Number.isNaN(expectedTrackId)) {
            const serverTrackId = ch.nowPlayingMusicId ?? null;
            if (serverTrackId !== expectedTrackId) {
              const updated = await storage.getRadioChannelBySlug(slug);
              return res.status(409).json({ ...updated, _alreadyAdvanced: true });
            }
          }
          let nextId: number;
          let nextIndex: number;
          if (ch.nowPlayingObjectPath != null && ch.nowPlayingTempNextSnapshotIndex != null) {
            nextIndex = ch.nowPlayingTempNextSnapshotIndex;
            nextId = snap.musicIds[nextIndex];
          } else if (ch.nowPlayingMusicId != null) {
            const currentIdx = snap.musicIds.indexOf(ch.nowPlayingMusicId);
            const fromIndex = currentIdx >= 0 ? currentIdx : snap.currentIndex;
            nextIndex = (fromIndex + 1) % snap.musicIds.length;
            nextId = snap.musicIds[nextIndex];
          } else {
            nextIndex = 0;
            nextId = snap.musicIds[0];
          }
          await storage.updateRadioChannel(channel.id, {
            nowPlayingMusicId: nextId,
            nowPlayingStartedAt: new Date(),
            nowPlayingObjectPath: null,
            nowPlayingTempDurationSeconds: null,
            nowPlayingTempNextSnapshotIndex: null,
            playlistSnapshot: { musicIds: snap.musicIds, durationsSeconds: snap.durationsSeconds, currentIndex: nextIndex },
          });
          radioLocalTitles.delete(slug);
          const updated = await storage.getRadioChannelBySlug(slug);
          broadcastToRadioChannel(slug, {
            type: "radio_now_playing",
            slug,
            musicId: nextId,
            nowPlayingObjectPath: null,
            nowPlayingLocalTitle: null,
            startedAt: new Date().toISOString(),
            elapsedSeconds: 0,
          });
          return res.json(updated);
        }
        if (status !== undefined && ["draft", "live", "paused", "ended"].includes(String(status))) {
          updates.status = String(status);
          if (String(status) === "ended") {
            updates.currentHostId = null;
            updates.nowPlayingMusicId = null;
            updates.nowPlayingStartedAt = null;
            updates.nowPlayingObjectPath = null;
            radioLocalTitles.delete(slug);
            updates.nowPlayingTempDurationSeconds = null;
            updates.nowPlayingTempNextSnapshotIndex = null;
            updates.playlistSnapshot = null;
          }
        }
        if (nowPlayingMusicId !== undefined) {
          updates.nowPlayingMusicId = nowPlayingMusicId === null || nowPlayingMusicId === "" ? null : Number(nowPlayingMusicId);
          if (updates.nowPlayingMusicId != null) {
            updates.nowPlayingObjectPath = null;
            radioLocalTitles.delete(slug);
            updates.nowPlayingTempDurationSeconds = null;
            updates.nowPlayingTempNextSnapshotIndex = null;
          }
        }
        if (bodyNowPlayingObjectPath !== undefined) {
          updates.nowPlayingObjectPath = typeof bodyNowPlayingObjectPath === "string" && bodyNowPlayingObjectPath.trim() ? bodyNowPlayingObjectPath.trim() : null;
          if (updates.nowPlayingObjectPath) {
            updates.nowPlayingMusicId = null;
            updates.nowPlayingStartedAt = new Date();
            radioLocalTitles.set(slug, typeof bodyNowPlayingLocalTitle === "string" && bodyNowPlayingLocalTitle.trim() ? bodyNowPlayingLocalTitle.trim().slice(0, 200) : null);
            const dur = typeof bodyCurrentTrackDurationSeconds === "number" && bodyCurrentTrackDurationSeconds > 0 ? bodyCurrentTrackDurationSeconds : 240;
            updates.nowPlayingTempDurationSeconds = Math.ceil(dur);
            const nextIdx = typeof bodyAfterTempNextSnapshotIndex === "number" && Number.isInteger(bodyAfterTempNextSnapshotIndex) ? bodyAfterTempNextSnapshotIndex : 0;
            updates.nowPlayingTempNextSnapshotIndex = nextIdx;
          } else {
            radioLocalTitles.delete(slug);
            updates.nowPlayingTempDurationSeconds = null;
            updates.nowPlayingTempNextSnapshotIndex = null;
          }
        }
        if (nowPlayingStartedAt !== undefined) updates.nowPlayingStartedAt = nowPlayingStartedAt ? new Date(nowPlayingStartedAt) : null;
        if (updates.nowPlayingMusicId !== undefined && updates.nowPlayingStartedAt === undefined) updates.nowPlayingStartedAt = new Date();
        // 재생 큐 스냅샷: DJ가 보낸 큐+길이 저장 → 송출 브라우저를 닫아도 서버가 다음 곡 자동 진행
        const queueMusicIds = Array.isArray(bodyQueueMusicIds) ? bodyQueueMusicIds.filter((x: unknown) => typeof x === "number" && Number.isInteger(x)) as number[] : null;
        const queueDurationsSeconds = Array.isArray(bodyQueueDurationsSeconds) ? bodyQueueDurationsSeconds as number[] : null;
        const currentTrackDuration = typeof bodyCurrentTrackDurationSeconds === "number" && bodyCurrentTrackDurationSeconds > 0 ? bodyCurrentTrackDurationSeconds : null;
        if (queueMusicIds && queueMusicIds.length > 0 && updates.nowPlayingMusicId != null) {
          const currentIndex = queueMusicIds.indexOf(updates.nowPlayingMusicId);
          if (currentIndex >= 0) {
            const durationsSeconds = (queueDurationsSeconds && queueDurationsSeconds.length === queueMusicIds.length)
              ? queueDurationsSeconds.slice(0, queueMusicIds.length)
              : queueMusicIds.map(() => 240);
            const durationForCurrent = currentTrackDuration ?? durationsSeconds[currentIndex] ?? 240;
            if (currentTrackDuration != null && durationsSeconds[currentIndex] === 240) {
              durationsSeconds[currentIndex] = Math.ceil(durationForCurrent);
            } else if (currentTrackDuration != null) {
              durationsSeconds[currentIndex] = Math.ceil(durationForCurrent);
            }
            updates.playlistSnapshot = { musicIds: queueMusicIds, durationsSeconds, currentIndex };
          }
        } else if (currentTrackDuration != null && channel.playlistSnapshot && updates.nowPlayingMusicId === undefined) {
          const snap = channel.playlistSnapshot;
          const idx = snap.currentIndex;
          const newDurations = [...snap.durationsSeconds];
          if (idx >= 0 && idx < newDurations.length) {
            newDurations[idx] = Math.ceil(currentTrackDuration);
            updates.playlistSnapshot = { ...snap, durationsSeconds: newDurations };
          }
        }
      }
      if (isOwner || isAdminUser) {
        if (bodyScheduledStartAt !== undefined) updates.scheduledStartAt = bodyScheduledStartAt === null || bodyScheduledStartAt === "" ? null : new Date(bodyScheduledStartAt);
        if (bodyScheduledEndAt !== undefined) updates.scheduledEndAt = bodyScheduledEndAt === null || bodyScheduledEndAt === "" ? null : new Date(bodyScheduledEndAt);
        if (bodyNotice !== undefined) {
          const text = typeof bodyNotice === "string" ? bodyNotice.trim() : "";
          updates.notice = text ? text.slice(0, 200) : null;
        }
        const { name: bodyName, description: bodyDescription, coverFilename: bodyCoverFilename } = req.body || {};
        if (bodyName !== undefined) {
          const trimmed = typeof bodyName === "string" ? bodyName.trim() : "";
          if (trimmed) (updates as any).name = trimmed.slice(0, 50);
        }
        if (bodyDescription !== undefined) {
          const trimmed = typeof bodyDescription === "string" ? bodyDescription.trim() : "";
          (updates as any).description = trimmed ? trimmed.slice(0, 200) : null;
        }
        if (bodyCoverFilename !== undefined) {
          (updates as any).coverFilename = typeof bodyCoverFilename === "string" && bodyCoverFilename.trim() ? bodyCoverFilename.trim() : null;
        }
      }

      if (Object.keys(updates).length > 0) {
        await storage.updateRadioChannel(channel.id, updates);
      }
      const updated = await storage.getRadioChannelBySlug(slug);
      if ((updates.nowPlayingMusicId !== undefined || updates.nowPlayingObjectPath !== undefined) && updated) {
        const startedAt = updated!.nowPlayingStartedAt ? (updated!.nowPlayingStartedAt as Date).getTime() : 0;
        const elapsedSeconds = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
        broadcastToRadioChannel(slug, {
          type: "radio_now_playing",
          slug,
          musicId: updated!.nowPlayingMusicId ?? null,
          nowPlayingObjectPath: (updated as any).nowPlayingObjectPath ?? null,
          nowPlayingLocalTitle: radioLocalTitles.get(slug) ?? null,
          startedAt: updated!.nowPlayingStartedAt ? (updated!.nowPlayingStartedAt as Date).toISOString() : null,
          elapsedSeconds,
        });
      }
      if (updates.status === "ended" && updated) {
        try {
          await storage.deleteRadioChatMessagesByChannel(updated.id);
        } catch (e) {
          console.warn("[radio] deleteRadioChatMessagesByChannel failed", e);
        }
        const endedByUserId = (req as any).user?.claims?.sub;
        let hostDisplayName: string = "DJ";
        if (endedByUserId) {
          try {
            const hostUser = await storage.getUserById(endedByUserId);
            hostDisplayName = (hostUser?.username ?? hostUser?.firstName ?? hostUser?.id ?? "DJ") as string;
          } catch (_) {}
        }
        broadcastToRadioChannel(slug, { type: "radio_broadcast_ended", slug, hostDisplayName });
      }
      res.json(updated);
    } catch (e) {
      console.error("[radio/channels PATCH]", e);
      res.status(500).json({ message: "채널 수정에 실패했습니다" });
    }
  });

  // 리스너가 곡 종료 시 즉시 다음 곡 진행 요청 (낙관적 락: currentMusicId가 서버와 일치할 때만 진행)
  app.post("/api/radio/channels/:slug/client-advance", async (req, res) => {
    try {
      const slug = String(req.params.slug).trim().toLowerCase();
      const currentMusicId = req.body?.currentMusicId != null ? Number(req.body.currentMusicId) : null;
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel || channel.status !== "live") return res.json({ ok: false, reason: "not_live" });
      // 송출실(DJ)이 활성화된 경우 리스너가 임의로 곡을 넘기지 않도록 차단
      if ((channel as any).currentHostId) return res.json({ ok: false, reason: "studio_active" });
      const snap = channel.playlistSnapshot as { musicIds: number[]; durationsSeconds: number[]; currentIndex: number } | null;
      if (!snap || !Array.isArray(snap.musicIds) || snap.musicIds.length === 0) return res.json({ ok: false, reason: "no_playlist" });
      // 낙관적 락: 이미 다른 리스너가 진행했으면 무시
      if (currentMusicId != null && channel.nowPlayingMusicId !== currentMusicId) return res.json({ ok: false, reason: "already_advanced" });
      const curIdx = currentMusicId != null ? snap.musicIds.indexOf(currentMusicId) : snap.currentIndex;
      const nextIndex = curIdx >= 0 ? (curIdx + 1) % snap.musicIds.length : 0;
      const nextId = snap.musicIds[nextIndex];
      await storage.updateRadioChannel(channel.id, {
        nowPlayingMusicId: nextId,
        nowPlayingStartedAt: new Date(),
        nowPlayingObjectPath: null,
        nowPlayingTempDurationSeconds: null,
        nowPlayingTempNextSnapshotIndex: null,
        playlistSnapshot: { musicIds: snap.musicIds, durationsSeconds: snap.durationsSeconds, currentIndex: nextIndex },
      });
      radioLocalTitles.delete(slug);
      broadcastToRadioChannel(slug, {
        type: "radio_now_playing",
        slug,
        musicId: nextId,
        nowPlayingObjectPath: null,
        nowPlayingLocalTitle: null,
        startedAt: new Date().toISOString(),
        elapsedSeconds: 0,
      });
      return res.json({ ok: true, nextMusicId: nextId });
    } catch (e) {
      console.error("[client-advance]", e);
      return res.status(500).json({ ok: false });
    }
  });

  // 서버 자동 진행: DJ 송출창을 닫아도 플레이리스트 순서대로 곡이 계속 재생됨
  const AUTO_ADVANCE_INTERVAL_MS = 3000;
  setInterval(async () => {
    try {
      const channels = await storage.listLiveRadioChannelsForAutoAdvance();
      const now = Date.now();
      for (const ch of channels) {
        // 송출실(DJ)이 활성화된 경우 서버 자동 진행 건너뜀 (DJ가 직접 제어)
        if ((ch as any).currentHostId) continue;
        const started = (ch.nowPlayingStartedAt as Date).getTime();
        const snap = ch.playlistSnapshot;
        if (!snap || snap.musicIds.length === 0) continue;

        let durationMs: number;
        if (ch.nowPlayingObjectPath != null && ch.nowPlayingTempDurationSeconds != null) {
          durationMs = ch.nowPlayingTempDurationSeconds * 1000;
        } else if (ch.nowPlayingMusicId != null) {
          const idx = snap.musicIds.indexOf(ch.nowPlayingMusicId);
          const dur = idx >= 0 && snap.durationsSeconds[idx] ? snap.durationsSeconds[idx] : 240;
          durationMs = dur * 1000;
        } else {
          continue;
        }

        if (now - started < durationMs + 1000) continue; // 1초 여유

        // 다음 곡 결정
        let nextIndex: number;
        if (ch.nowPlayingObjectPath != null && ch.nowPlayingTempNextSnapshotIndex != null) {
          nextIndex = ch.nowPlayingTempNextSnapshotIndex;
        } else if (ch.nowPlayingMusicId != null) {
          const curIdx = snap.musicIds.indexOf(ch.nowPlayingMusicId);
          nextIndex = curIdx >= 0 ? (curIdx + 1) % snap.musicIds.length : 0;
        } else {
          nextIndex = 0;
        }
        if (nextIndex >= snap.musicIds.length) nextIndex = 0;
        const nextId = snap.musicIds[nextIndex];

        await storage.updateRadioChannel(ch.id, {
          nowPlayingMusicId: nextId,
          nowPlayingStartedAt: new Date(),
          nowPlayingObjectPath: null,
          nowPlayingTempDurationSeconds: null,
          nowPlayingTempNextSnapshotIndex: null,
          playlistSnapshot: { musicIds: snap.musicIds, durationsSeconds: snap.durationsSeconds, currentIndex: nextIndex },
        });
        radioLocalTitles.delete(ch.slug);
        broadcastToRadioChannel(ch.slug, {
          type: "radio_now_playing",
          slug: ch.slug,
          musicId: nextId,
          nowPlayingObjectPath: null,
          nowPlayingLocalTitle: null,
          startedAt: new Date().toISOString(),
          elapsedSeconds: 0,
        });
      }
    } catch (e) {
      console.error("[radio auto-advance]", e);
    }
  }, AUTO_ADVANCE_INTERVAL_MS);

  // 라디오 채팅 보관 기간: 1일 (오래된 채팅 자동 삭제)
  const RADIO_CHAT_TTL_DAYS = 1;
  const RADIO_CHAT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1시간마다
  setInterval(async () => {
    try {
      await storage.deleteRadioChatMessagesOlderThanDays(RADIO_CHAT_TTL_DAYS);
    } catch (e) {
      console.warn("[radio chat cleanup]", e);
    }
  }, RADIO_CHAT_CLEANUP_INTERVAL_MS);

  app.delete("/api/radio/channels/:slug", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub;
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다." });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다." });
      const role = await storage.getUserRole(userId);
      const isOwner = channel.ownerId === userId;
      const isAdminUser = role === "admin";
      if (!isOwner && !isAdminUser) return res.status(403).json({ message: "채널 소유자 또는 관리자만 삭제할 수 있습니다." });
      await storage.deleteRadioChannel(channel.id);
      res.status(204).send();
    } catch (e) {
      console.error("[radio/channels DELETE]", e);
      res.status(500).json({ message: "채널 삭제에 실패했습니다" });
    }
  });

  app.get("/api/radio/channels/:slug/chat", isAuthenticated, async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
      const messages = await storage.getRadioChatMessages(channel.id, limit);
      res.json(messages);
    } catch (e) {
      console.error("[radio/channels/:slug/chat]", e);
      if ((e as any)?.code === "42P01" || String((e as any)?.message || "").includes("does not exist")) {
        return res.json([]);
      }
      res.status(500).json({ message: "채팅 내역을 불러올 수 없습니다" });
    }
  });

  app.get("/api/radio/channels/:slug/requests", async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const list = await storage.getRadioSongRequestsByChannel(channel.id, status);
      res.json(list);
    } catch (e) {
      console.error("[radio/channels/:slug/requests]", e);
      if ((e as any)?.code === "42P01" || String((e as any)?.message || "").includes("does not exist")) {
        return res.json([]);
      }
      res.status(500).json({ message: "신청곡 목록을 불러올 수 없습니다" });
    }
  });

  app.post("/api/radio/channels/:slug/requests", isAuthenticated, async (req, res) => {
    try {
      const slug = String(req.params.slug || "").trim().toLowerCase();
      if (!slug) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { musicId, title, artist, message } = req.body || {};
      const musicIdNum = musicId != null ? Number(musicId) : null;
      if (musicIdNum != null && !Number.isNaN(musicIdNum)) {
        const musicExists = await storage.getMusicById(musicIdNum);
        if (!musicExists) return res.status(400).json({ message: "해당 음원을 찾을 수 없습니다." });
      }
      const row = await storage.createRadioSongRequest({
        channelId: channel.id,
        userId,
        musicId: musicIdNum != null && !Number.isNaN(musicIdNum) ? musicIdNum : null,
        title: title != null ? String(title).trim().slice(0, 200) : null,
        artist: artist != null ? String(artist).trim().slice(0, 200) : null,
        message: message != null ? String(message).trim().slice(0, 300) : null,
      });
      // 송출실(스튜디오)에 실시간으로 신청곡 알림
      broadcastToRadioChannel(slug, {
        type: "radio_new_request",
        slug,
        request: {
          id: row.id,
          musicId: row.musicId,
          title: row.title,
          artist: row.artist,
          status: row.status,
          createdAt: row.createdAt,
        },
      });
      res.status(201).json(row);
    } catch (e: any) {
      console.error("[radio/channels/:slug/requests POST]", e);
      const code = e?.code;
      const msg = e?.message || "";
      if (code === "42P01" || msg.includes("does not exist")) {
        return res.status(500).json({ message: "신청곡 테이블이 없습니다. npm run db:deploy 또는 deploy/radio-chat-and-requests.sql 을 실행해 주세요." });
      }
      if (code === "23503") {
        return res.status(400).json({ message: "채널 또는 음원 정보가 올바르지 않습니다." });
      }
      res.status(500).json({ message: e?.message || "신청곡 등록에 실패했습니다" });
    }
  });

  app.patch("/api/radio/channels/:slug/requests/:id", isAuthenticated, async (req, res) => {
    try {
      const { slug, id } = req.params;
      const channel = await storage.getRadioChannelBySlug(slug);
      if (!channel) return res.status(404).json({ message: "채널을 찾을 수 없습니다" });
      // @ts-ignore
      const userId = req.user.claims.sub;
      const role = await storage.getUserRole(userId);
      const isOwner = channel.ownerId === userId;
      const isCurrentHost = (channel as any).currentHostId === userId;
      const isAdminUser = role === "admin";
      const isStaff = await storage.isRadioChannelStaff(channel.id, userId);
      const canManageRequests = isOwner || isCurrentHost || isAdminUser || isStaff;
      if (!canManageRequests) return res.status(403).json({ message: "운영진(방장/스텝/CJ)만 수정할 수 있습니다" });
      const requestId = parseInt(id, 10);
      if (Number.isNaN(requestId)) return res.status(400).json({ message: "잘못된 요청입니다" });
      const { status, sortOrder } = req.body || {};
      const updates: { status?: string; sortOrder?: number } = {};
      if (status !== undefined && ["pending", "playing", "played", "cancelled"].includes(String(status))) updates.status = String(status);
      if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);
      if (Object.keys(updates).length > 0) await storage.updateRadioSongRequest(requestId, channel.id, updates);
      const list = await storage.getRadioSongRequestsByChannel(channel.id);
      res.json(list);
    } catch (e) {
      console.error("[radio/channels/:slug/requests PATCH]", e);
      res.status(500).json({ message: "수정에 실패했습니다" });
    }
  });

  // === Tips (후원) Routes ===
  app.post("/api/tips", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const fromUserId = req.user.claims.sub;
      const { toUserId, musicId, amount, message } = req.body;

      if (!toUserId || !amount || amount < 100) {
        return res.status(400).json({ message: "후원 금액은 최소 100 크레딧입니다" });
      }
      if (fromUserId === toUserId) {
        return res.status(400).json({ message: "자기 자신에게 후원할 수 없습니다" });
      }

      const deducted = await storage.deductCredits(fromUserId, amount);
      if (!deducted) {
        return res.status(400).json({ message: "크레딧이 부족합니다. 충전 후 다시 시도해주세요.", insufficientCredits: true });
      }

      const tip = await storage.createTip({ fromUserId, toUserId, musicId: musicId || null, amount, message: message || null });
      await storage.addToBalance(toUserId, amount);

      const fromUser = await storage.getUserById(fromUserId);
      const fromName = fromUser?.firstName || "누군가";

      await storage.createCreditTransaction({
        userId: fromUserId,
        type: "tip_sent",
        amount: -amount,
        description: `후원 보내기`,
        relatedId: tip.id,
      });
      await storage.createCreditTransaction({
        userId: toUserId,
        type: "tip_received",
        amount,
        description: `${fromName}님 후원`,
        relatedId: tip.id,
      });

      await storage.createNotification({
        userId: toUserId,
        type: "tip",
        message: `${fromName}님이 ${amount.toLocaleString()} 크레딧을 후원했습니다${message ? `: "${message}"` : ""}`,
        payload: { fromName, amount, tipMessage: message || undefined },
        url: musicId ? `/explore` : undefined,
      });

      // 후원 뱃지 자동 계산 및 업데이트
      const totalSent = await storage.getTipsTotalSent(fromUserId);
      const newBadge = calculateDonationBadge(totalSent);
      const currentBadge = fromUser?.donationBadge ?? null;
      if (newBadge !== currentBadge) {
        await storage.updateDonationBadge(fromUserId, newBadge);
        if (newBadge) {
          const badgeNames: Record<string, string> = { seed: "🌱 씨앗", sprout: "🌿 새싹", supporter: "⭐ 후원자", sponsor: "💎 스폰서" };
          await storage.createNotification({
            userId: fromUserId,
            type: "badge",
            message: `축하합니다! ${badgeNames[newBadge]} 후원 뱃지를 획득했습니다!`,
            payload: { badgeKey: newBadge },
          });
        }
      }

      res.json({ ...tip, donationBadge: newBadge });
    } catch (err) {
      console.error("Tip error:", err);
      res.status(500).json({ message: "후원에 실패했습니다" });
    }
  });

  app.get("/api/tips/sent", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const tipsList = await storage.getTipsByUser(userId);
      res.json(tipsList);
    } catch (err) {
      res.status(500).json({ message: "후원 내역을 불러올 수 없습니다" });
    }
  });

  app.get("/api/tips/received", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const tipsList = await storage.getTipsReceived(userId);
      res.json(tipsList);
    } catch (err) {
      res.status(500).json({ message: "받은 후원 내역을 불러올 수 없습니다" });
    }
  });

  // === Purchases (유료 다운로드) Routes ===
  app.post("/api/purchases", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const buyerId = req.user.claims.sub;
      const { musicId } = req.body;

      if (!musicId) {
        return res.status(400).json({ message: "음원 정보가 필요합니다" });
      }

      const musicItem = await storage.getMusicById(musicId);
      if (!musicItem) {
        return res.status(404).json({ message: "음원을 찾을 수 없습니다" });
      }
      if (!musicItem.isDownloadable || !musicItem.price || musicItem.price <= 0) {
        return res.status(400).json({ message: "이 음원은 유료 다운로드가 불가능합니다" });
      }
      if (buyerId === musicItem.userId) {
        return res.status(400).json({ message: "자신의 음원은 무료로 다운로드할 수 있습니다" });
      }

      const alreadyPurchased = await storage.hasPurchased(buyerId, musicId);
      if (alreadyPurchased) {
        return res.status(400).json({ message: "이미 구매한 음원입니다", alreadyPurchased: true });
      }

      const deducted = await storage.deductCredits(buyerId, musicItem.price);
      if (!deducted) {
        return res.status(400).json({ message: "크레딧이 부족합니다. 충전 후 다시 시도해주세요.", insufficientCredits: true });
      }

      const purchase = await storage.createPurchase({
        buyerId,
        musicId,
        sellerId: musicItem.userId,
        amount: musicItem.price,
      });
      await storage.addToBalance(musicItem.userId, musicItem.price);

      await storage.createCreditTransaction({
        userId: buyerId,
        type: "purchase",
        amount: -musicItem.price,
        description: `"${musicItem.title}" 구매`,
        relatedId: purchase.id,
      });

      const buyer = await storage.getUserById(buyerId);
      const buyerName = buyer?.firstName || "누군가";
      await storage.createNotification({
        userId: musicItem.userId,
        type: "purchase",
        message: `${buyerName}님이 "${musicItem.title}"을(를) ${musicItem.price.toLocaleString()} 크레딧에 구매했습니다`,
        payload: { fromName: buyerName, musicTitle: musicItem.title, price: musicItem.price },
        url: `/explore`,
      });

      res.json(purchase);
    } catch (err) {
      console.error("Purchase error:", err);
      res.status(500).json({ message: "구매에 실패했습니다" });
    }
  });

  app.get("/api/purchases/check/:musicId", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const buyerId = req.user.claims.sub;
      const musicId = Number(req.params.musicId);
      const purchased = await storage.hasPurchased(buyerId, musicId);
      res.json({ purchased });
    } catch (err) {
      res.status(500).json({ message: "구매 확인에 실패했습니다" });
    }
  });

  app.get("/api/purchases/my", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const purchasesList = await storage.getPurchasesByUser(userId);
      res.json(purchasesList);
    } catch (err) {
      res.status(500).json({ message: "구매 내역을 불러올 수 없습니다" });
    }
  });

  app.get("/api/music/:id/download", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const musicId = Number(req.params.id);

      const purchased = await storage.hasPurchased(userId, musicId);
      if (!purchased) {
        return res.status(403).json({ message: "구매한 음원만 다운로드할 수 있습니다" });
      }

      const musicItem = await storage.getMusicById(musicId);
      if (!musicItem) {
        return res.status(404).json({ message: "음원을 찾을 수 없습니다" });
      }

      const fn = musicItem.filename || "";
      let fileId = "";
      const objMatch = fn.match(/\/objects\/uploads\/(.+)$/);
      if (objMatch) fileId = objMatch[1];
      else if (fn.startsWith("uploads/")) fileId = fn.replace(/^uploads\//, "");
      else if (/^[a-f0-9-]{36}(\.[a-z]+)?$/i.test(fn.trim())) fileId = fn.trim();
      else if (fn.includes("/")) fileId = fn.split("/").pop() || "";
      else fileId = fn;
      fileId = fileId.replace(/^\//, "");

      if (!fileId) {
        return res.status(404).json({ message: "파일 경로를 찾을 수 없습니다" });
      }

      const baseId = fileId.replace(/\.(mp3|wav|ogg)$/i, "");
      const candidates = [
        path.join(uploadsDir, fileId),
        path.join(uploadsDir, `${baseId}.mp3`),
        path.join(uploadsDir, `${baseId}.wav`),
        path.join(uploadsDir, `${baseId}.ogg`),
      ];
      const localPath = candidates.find((p) => existsSync(p));
      const safeTitle = (musicItem.title || "music").replace(/[^\w\s가-힣-]/g, "").trim();
      const extFromFileId = path.extname(fileId).toLowerCase() || ".mp3";

      if (localPath) {
        const ext = path.extname(localPath).toLowerCase();
        const mime: Record<string, string> = {
          ".mp3": "audio/mpeg",
          ".wav": "audio/wav",
          ".ogg": "audio/ogg",
        };
        res.set("Content-Type", mime[ext] || "audio/mpeg");
        res.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle + ext)}`);
        const fileStat = statSync(localPath);
        res.set("Content-Length", String(fileStat.size));
        createReadStream(localPath).pipe(res);
        return;
      }

      return res.status(404).json({ message: "음원 파일을 찾을 수 없습니다" });
    } catch (err) {
      res.status(500).json({ message: "다운로드에 실패했습니다" });
    }
  });

  app.get("/api/music/:id/ringtone", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const musicId = Number(req.params.id);

      const musicItem = await storage.getMusicById(musicId);
      if (!musicItem) {
        return res.status(404).json({ message: "음원을 찾을 수 없습니다" });
      }

      const isOwner = String(musicItem.userId) === String(userId);
      const purchased = await storage.hasPurchased(userId, musicId);
      const canDownload =
        isOwner ||
        (musicItem.isDownloadable && (Number(musicItem.price || 0) === 0 || purchased));

      if (!canDownload) {
        return res.status(403).json({ message: "구매 또는 무료 다운로드가 가능한 음원만 벨소리로 다운로드할 수 있습니다" });
      }

      const fn = musicItem.filename || "";
      let fileId = "";
      const objMatch = fn.match(/\/objects\/uploads\/(.+)$/);
      if (objMatch) fileId = objMatch[1];
      else if (fn.startsWith("uploads/")) fileId = fn.replace(/^uploads\//, "");
      else if (/^[a-f0-9-]{36}(\.[a-z]+)?$/i.test(fn.trim())) fileId = fn.trim();
      else if (fn.includes("/")) fileId = fn.split("/").pop() || "";
      else fileId = fn;
      fileId = fileId.replace(/^\//, "");

      if (!fileId) {
        return res.status(404).json({ message: "파일 경로를 찾을 수 없습니다" });
      }

      const baseId = fileId.replace(/\.(mp3|wav|ogg)$/i, "");
      const candidates = [
        path.join(uploadsDir, fileId),
        path.join(uploadsDir, `${baseId}.mp3`),
        path.join(uploadsDir, `${baseId}.wav`),
        path.join(uploadsDir, `${baseId}.ogg`),
      ];
      const localPath = candidates.find((p) => existsSync(p));
      const safeTitle = (musicItem.title || "music").replace(/[^\w\s가-힣-]/g, "").trim();
      const ringtoneBase = `${safeTitle}_벨소리`;
      const extFromFileId = path.extname(fileId).toLowerCase() || ".mp3";

      if (localPath) {
        const ext = path.extname(localPath).toLowerCase();
        const mime: Record<string, string> = {
          ".mp3": "audio/mpeg",
          ".wav": "audio/wav",
          ".ogg": "audio/ogg",
        };
        res.set("Content-Type", mime[ext] || "audio/mpeg");
        res.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(ringtoneBase + ext)}`);
        const fileStat = statSync(localPath);
        res.set("Content-Length", String(fileStat.size));
        createReadStream(localPath).pipe(res);
        return;
      }

      return res.status(404).json({ message: "음원 파일을 찾을 수 없습니다" });
    } catch (err) {
      res.status(500).json({ message: "다운로드에 실패했습니다" });
    }
  });

  // === Earnings (수익) Routes ===
  app.get("/api/earnings", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const summary = await storage.getEarningsSummary(userId);
      res.json(summary);
    } catch (err) {
      res.status(500).json({ message: "수익 정보를 불러올 수 없습니다" });
    }
  });

  app.get("/api/earnings/sales", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const sales = await storage.getSalesByUser(userId);
      res.json(sales);
    } catch (err) {
      res.status(500).json({ message: "판매 내역을 불러올 수 없습니다" });
    }
  });

  // === Withdrawals (출금) Routes ===
  app.post("/api/withdrawals", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { amount, bankName, accountNumber, accountHolder } = req.body;

      if (!amount || amount < 1000) {
        return res.status(400).json({ message: "최소 출금 금액은 1,000원입니다" });
      }

      const balance = await storage.getUserBalance(userId);
      if (balance < amount) {
        return res.status(400).json({ message: "잔액이 부족합니다" });
      }
      if (!bankName || !accountNumber || !accountHolder) {
        return res.status(400).json({ message: "계좌 정보를 모두 입력해주세요" });
      }

      const fee = Math.floor(amount * 0.15);
      const vat = Math.floor(fee * 0.1);
      const totalDeduction = fee + vat;
      const netAmount = amount - totalDeduction;

      const deducted = await storage.deductBalance(userId, amount);
      if (!deducted) {
        return res.status(400).json({ message: "잔액이 부족합니다" });
      }

      const withdrawal = await storage.createWithdrawal({
        userId,
        amount,
        fee,
        netAmount,
        bankName,
        accountNumber,
        accountHolder,
      });

      res.json(withdrawal);
    } catch (err) {
      console.error("Withdrawal error:", err);
      res.status(500).json({ message: "출금 요청에 실패했습니다" });
    }
  });

  app.get("/api/withdrawals", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const withdrawalsList = await storage.getWithdrawalsByUser(userId);
      res.json(withdrawalsList);
    } catch (err) {
      res.status(500).json({ message: "출금 내역을 불러올 수 없습니다" });
    }
  });

  // Admin withdrawal management
  app.get("/api/admin/withdrawals", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const role = await storage.getUserRole(userId);
      if (role !== "admin") return res.status(403).json({ message: "관리자 권한이 필요합니다" });

      const status = req.query.status as string | undefined;
      const allWithdrawals = await storage.getAllWithdrawals(status);
      res.json(allWithdrawals);
    } catch (err) {
      res.status(500).json({ message: "출금 목록을 불러올 수 없습니다" });
    }
  });

  app.patch("/api/admin/withdrawals/:id", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const role = await storage.getUserRole(userId);
      if (role !== "admin") return res.status(403).json({ message: "관리자 권한이 필요합니다" });

      const withdrawalId = Number(req.params.id);
      const { status, adminNote } = req.body;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "유효하지 않은 상태입니다" });
      }

      if (status === "rejected") {
        const existing = await storage.getWithdrawalsByUser("");
        const allWithdrawals = await storage.getAllWithdrawals();
        const target = allWithdrawals.find((w: any) => w.id === withdrawalId);
        if (target && target.status === "pending") {
          await storage.addToBalance(target.userId, target.amount);
        }
      }

      const updated = await storage.updateWithdrawalStatus(withdrawalId, status, adminNote);
      if (updated && updated.userId) {
        const statusLabel = status === "approved" ? "승인" : "거절";
        await storage.createNotification({
          userId: updated.userId,
          type: "system",
          message: `출금 신청이 ${statusLabel}되었습니다.${adminNote ? ` (${adminNote})` : ""}`,
          payload: { status, adminNote: adminNote || undefined },
          url: "/credits",
        });
      }
      res.json(updated);
    } catch (err) {
      console.error("Withdrawal update error:", err);
      res.status(500).json({ message: "출금 상태 변경에 실패했습니다" });
    }
  });

  // === Streaming Logs ===

  // Record streaming duration
  app.get("/api/streaming-limit", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user?.claims?.sub;
      if (!userId) return res.json({ limited: false });
      const { isPremium } = await ensureExpiredSubscriptionDowngrade(userId);
      if (isPremium) return res.json({ limited: false });
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const result = await db.execute(sql`
        SELECT COUNT(DISTINCT music_id) as count FROM streaming_logs 
        WHERE user_id = ${userId} AND created_at >= ${today.toISOString()}
      `);
      const count = Number(result.rows[0]?.count || 0);
      res.json({ limited: count >= 100, current: count, limit: 100 });
    } catch (error) {
      res.json({ limited: false });
    }
  });

  app.post("/api/streaming-log", async (req, res) => {
    try {
      const { musicId, durationSeconds } = req.body;
      if (!musicId || !durationSeconds || durationSeconds < 1) {
        return res.status(400).json({ message: "잘못된 요청입니다" });
      }
      // @ts-ignore
      const userId = req.user?.claims?.sub || null;

      if (userId) {
        const { isPremium } = await ensureExpiredSubscriptionDowngrade(userId);
        if (!isPremium) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const result = await db.execute(sql`
            SELECT COUNT(DISTINCT music_id) as count FROM streaming_logs 
            WHERE user_id = ${userId} AND created_at >= ${today.toISOString()}
          `);
          const count = Number(result.rows[0]?.count || 0);
          if (count >= 100) {
            return res.status(403).json({ 
              message: "Free 플랜은 일일 100곡까지 스트리밍할 수 있습니다. 프리미엄으로 업그레이드하면 무제한 스트리밍이 가능합니다.",
              code: "STREAMING_LIMIT_REACHED"
            });
          }
        }
      }

      await db.insert(streamingLogs).values({
        userId,
        musicId: Number(musicId),
        durationSeconds: Math.round(Number(durationSeconds)),
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "스트리밍 기록 실패" });
    }
  });

  // Get total streaming time for a user's uploaded music
  app.get("/api/streaming-stats/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      const totalResult = await db.execute(sql`
        SELECT 
          COALESCE(SUM(sl.duration_seconds), 0) as total_seconds,
          COUNT(sl.id) as total_plays
        FROM streaming_logs sl
        INNER JOIN music m ON sl.music_id = m.id
        WHERE m.user_id = ${userId}
      `);
      const perTrackResult = await db.execute(sql`
        SELECT 
          m.id as music_id,
          m.title,
          m.artist,
          m.image_filename as image,
          COALESCE(SUM(sl.duration_seconds), 0) as total_seconds,
          COUNT(sl.id) as play_count
        FROM music m
        LEFT JOIN streaming_logs sl ON sl.music_id = m.id
        WHERE m.user_id = ${userId}
        GROUP BY m.id, m.title, m.artist, m.image_filename
        ORDER BY total_seconds DESC
      `);
      const totalRow = totalResult.rows[0] as any;
      const tracks = (perTrackResult.rows as any[]).map(r => ({
        musicId: Number(r.music_id),
        title: r.title,
        artist: r.artist,
        image: r.image,
        totalSeconds: Number(r.total_seconds || 0),
        playCount: Number(r.play_count || 0),
      }));
      res.json({
        totalSeconds: Number(totalRow?.total_seconds || 0),
        totalPlays: Number(totalRow?.total_plays || 0),
        tracks,
      });
    } catch (error) {
      res.json({ totalSeconds: 0, totalPlays: 0, tracks: [] });
    }
  });

  app.get("/api/streaming-log/music/:musicId", async (req, res) => {
    try {
      const musicId = Number(req.params.musicId);
      const result = await db.execute(sql`
        SELECT 
          COALESCE(SUM(duration_seconds), 0) as total_duration,
          COUNT(id) as total_plays
        FROM streaming_logs
        WHERE music_id = ${musicId}
      `);
      const row = result.rows[0] as any;
      res.json({
        totalPlays: Number(row?.total_plays || 0),
        totalDuration: Number(row?.total_duration || 0),
      });
    } catch (error) {
      res.json({ totalPlays: 0, totalDuration: 0 });
    }
  });

  // === Artist Dashboard Stats ===
  app.get("/api/dashboard/my-music-stats", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const dailyPlays = await db.execute(sql`
        SELECT 
          DATE(sl.created_at) as date,
          COUNT(sl.id) as plays,
          COALESCE(SUM(sl.duration_seconds), 0) as duration
        FROM streaming_logs sl
        JOIN music m ON sl.music_id = m.id
        WHERE m.user_id = ${userId}
          AND sl.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(sl.created_at)
        ORDER BY date ASC
      `);

      const hourlyPlays = await db.execute(sql`
        SELECT 
          EXTRACT(HOUR FROM sl.created_at) as hour,
          COUNT(sl.id) as plays
        FROM streaming_logs sl
        JOIN music m ON sl.music_id = m.id
        WHERE m.user_id = ${userId}
          AND sl.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY EXTRACT(HOUR FROM sl.created_at)
        ORDER BY hour ASC
      `);

      const topTracks = await db.execute(sql`
        SELECT 
          m.id, m.title, m.artist, m.image_filename as "imageFilename",
          COUNT(sl.id) as plays,
          COALESCE(SUM(sl.duration_seconds), 0) as duration
        FROM streaming_logs sl
        JOIN music m ON sl.music_id = m.id
        WHERE m.user_id = ${userId}
        GROUP BY m.id, m.title, m.artist, m.image_filename
        ORDER BY plays DESC
        LIMIT 10
      `);

      const totals = await db.execute(sql`
        SELECT 
          COUNT(sl.id) as total_plays,
          COALESCE(SUM(sl.duration_seconds), 0) as total_duration,
          COUNT(DISTINCT sl.user_id) as unique_listeners
        FROM streaming_logs sl
        JOIN music m ON sl.music_id = m.id
        WHERE m.user_id = ${userId}
      `);

      const myMusicCount = await db.execute(sql`
        SELECT COUNT(id) as count FROM music WHERE user_id = ${userId}
      `);

      res.json({
        dailyPlays: dailyPlays.rows,
        hourlyPlays: hourlyPlays.rows,
        topTracks: topTracks.rows,
        totals: totals.rows[0] || { total_plays: 0, total_duration: 0, unique_listeners: 0 },
        musicCount: Number((myMusicCount.rows[0] as any)?.count || 0),
      });
    } catch (error: any) {
      res.status(500).json({ message: "통계 조회 실패: " + (error?.message || "") });
    }
  });

  // === Announcements (Artist -> Followers) ===
  app.post("/api/announcements", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const parsed = insertAnnouncementSchema.safeParse({ ...req.body, artistId: userId });
      if (!parsed.success) {
        return res.status(400).json({ message: "입력값이 올바르지 않습니다" });
      }

      const [announcement] = await db.insert(announcements).values(parsed.data).returning();

      const followerRows = await db.select({ followerId: follows.followerId })
        .from(follows)
        .where(eq(follows.followedId, userId));

      if (followerRows.length > 0) {
        const userData = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));
        const artistName = userData[0]?.username || "아티스트";

        const notifValues = followerRows.map(f => ({
          userId: f.followerId,
          type: "announcement",
          message: `${artistName}님의 공지: ${parsed.data.title}`,
          url: `/announcements/${announcement.id}`,
          isRead: false,
        }));
        await db.insert(notifications).values(notifValues);
        for (const f of followerRows) {
          await storage.pruneNotificationsForUser(f.followerId, 20);
        }
      }

      res.json(announcement);
    } catch (error: any) {
      res.status(500).json({ message: "공지 등록 실패: " + (error?.message || "") });
    }
  });

  app.get("/api/announcements/my", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const result = await db.select().from(announcements)
        .where(eq(announcements.artistId, userId))
        .orderBy(desc(announcements.createdAt));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "공지 조회 실패" });
    }
  });

  app.get("/api/announcements/artist/:artistId", async (req, res) => {
    try {
      const artistId = req.params.artistId;
      const result = await db.select().from(announcements)
        .where(eq(announcements.artistId, artistId))
        .orderBy(desc(announcements.createdAt))
        .limit(20);
      res.json(result);
    } catch (error: any) {
      res.json([]);
    }
  });

  app.delete("/api/announcements/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const announcementId = Number(req.params.id);
      const [existing] = await db.select().from(announcements).where(eq(announcements.id, announcementId));
      if (!existing || existing.artistId !== userId) {
        return res.status(403).json({ message: "권한이 없습니다" });
      }
      await db.delete(announcements).where(eq(announcements.id, announcementId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "공지 삭제 실패" });
    }
  });

  // === Direct Messages Routes ===
  app.get("/api/conversations", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const convos = await storage.getConversationsByUser(userId);
      const serialized = convos.map((c: any) => ({ ...c, last_msg_time: toUTCISO(c.last_msg_time) }));
      res.json(serialized);
    } catch (error: any) {
      console.error("Conversations list error:", error?.message ?? error);
      res.status(500).json({ message: "대화 목록 조회 실패" });
    }
  });

  app.post("/api/conversations", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { otherUserId } = req.body;
      if (!otherUserId || otherUserId === userId) {
        return res.status(400).json({ message: "유효하지 않은 사용자입니다" });
      }
      const conv = await storage.getOrCreateConversation(userId, otherUserId);
      res.json(conv);
    } catch (error: any) {
      if (error?.code === "MESSAGES_NOT_ACCEPTED") {
        return res.status(403).json({ message: "해당 사용자는 새 메시지를 받지 않도록 설정했습니다." });
      }
      if (error?.code === "BLOCKED") {
        return res.status(403).json({ message: "메시지를 보낼 수 없습니다." });
      }
      res.status(500).json({ message: "대화 생성 실패" });
    }
  });

  app.get("/api/users/me/message-settings", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const u = await storage.getUserById(userId);
      const allow = u?.allowDirectMessages ?? u?.allow_direct_messages ?? true;
      res.json({ allowDirectMessages: !!allow });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "조회 실패" });
    }
  });

  app.patch("/api/users/me/message-settings", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { allowDirectMessages } = req.body;
      if (typeof allowDirectMessages !== "boolean") {
        return res.status(400).json({ message: "allowDirectMessages는 true/false여야 합니다." });
      }
      await storage.updateUserProfile(userId, { allowDirectMessages });
      res.json({ allowDirectMessages });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "설정 저장 실패" });
    }
  });

  app.get("/api/blocked-users", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const ids = await storage.getBlockedUserIds(userId);
      const users = await Promise.all(ids.map((id) => storage.getUserById(id)));
      res.json(users.filter(Boolean).map((u: any) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, profileImageUrl: u.profileImageUrl })));
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "조회 실패" });
    }
  });

  app.post("/api/block/:userId", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const blockerId = req.user.claims.sub;
      const blockedId = req.params.userId;
      if (!blockedId || blockedId === blockerId) {
        return res.status(400).json({ message: "유효하지 않은 사용자입니다." });
      }
      await storage.blockUser(blockerId, blockedId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "차단 실패" });
    }
  });

  app.delete("/api/block/:userId", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const blockerId = req.user.claims.sub;
      const blockedId = req.params.userId;
      if (!blockedId) return res.status(400).json({ message: "유효하지 않은 사용자입니다." });
      await storage.unblockUser(blockerId, blockedId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "차단 해제 실패" });
    }
  });

  app.post("/api/report-user", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const reporterId = req.user.claims.sub;
      const { reportedUserId, reason, messageId, conversationId } = req.body;
      if (!reportedUserId || !reason || !reason.trim()) {
        return res.status(400).json({ message: "신고 대상과 사유를 입력해주세요." });
      }
      await storage.createUserReport({ reporterId, reportedUserId, reason: reason.trim(), messageId, conversationId });
      const adminRows = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      for (const admin of adminRows) {
        await storage.createNotification({
          userId: admin.id,
          type: "system",
          message: "새 회원 신고가 접수되었습니다.",
          payload: { reportedUserId },
          url: getAdminPagePath(),
        });
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e?.message || "신고 접수 실패" });
    }
  });

  app.get("/api/conversations/:id/messages", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id as string);
      const isParticipant = await storage.isConversationParticipant(conversationId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "접근 권한이 없습니다" });
      }
      const before = req.query.before ? parseInt(req.query.before as string) : undefined;
      const messages = await storage.getMessages(conversationId, 50, before);
      await storage.markMessagesRead(conversationId, userId);
      const serialized = messages.map((m: any) => {
        const created_at = toUTCISO(m.created_at ?? m.createdAt);
        return {
          ...m,
          created_at,
          content: m.content ?? m.body ?? "",
          sender_id: m.sender_id ?? m.senderId,
          sender_first_name: m.sender_first_name,
          sender_last_name: m.sender_last_name,
          sender_image: m.sender_image,
        };
      });
      res.json(serialized);
    } catch (error: any) {
      res.status(500).json({ message: "메시지 조회 실패" });
    }
  });

  app.post("/api/conversations/:id/messages", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id as string);
      const isParticipant = await storage.isConversationParticipant(conversationId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "접근 권한이 없습니다" });
      }
      const { content } = req.body;
      if (!content || !content.trim()) {
        return res.status(400).json({ message: "메시지 내용을 입력해주세요" });
      }
      const msg = await storage.createMessage(conversationId, userId, content.trim());

      const convos = await storage.getConversationsByUser(userId);
      const thisConvo = convos.find((c: any) => c.id === conversationId);
      if (thisConvo) {
        const otherUserId = thisConvo.other_user_id ?? thisConvo.otherUserId;
        const sender = await storage.getUserById(userId);
        const at = (msg as any).createdAt ?? (msg as any).created_at;
        sendToUser(otherUserId, {
          type: "new_message",
          conversationId,
          message: {
            ...msg,
            created_at: toUTCISO(at),
            sender_first_name: sender?.firstName || "",
            sender_last_name: sender?.lastName || "",
            sender_image: sender?.profileImageUrl || null,
          },
        });
        const senderLabel = `${sender?.firstName || ""} ${sender?.lastName || ""}`.trim() || "사용자";
        queueActivityEmail(otherUserId, "dm", {
          actorName: senderLabel,
          snippet: content.trim(),
          actionPath: "/messages",
        });
      }

      const at = (msg as any).createdAt ?? (msg as any).created_at;
      res.json({ ...msg, created_at: toUTCISO(at) });
    } catch (error: any) {
      console.error("Message send error:", error?.message ?? error);
      res.status(500).json({ message: "메시지 전송 실패" });
    }
  });

  app.get("/api/messages/unread-count", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const count = await storage.getUnreadMessageCount(userId);
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ message: "읽지 않은 메시지 수 조회 실패" });
    }
  });

  app.post("/api/conversations/:id/read", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const conversationId = parseInt(req.params.id as string);
      const isParticipant = await storage.isConversationParticipant(conversationId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: "접근 권한이 없습니다" });
      }
      await storage.markMessagesRead(conversationId, userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "읽음 처리 실패" });
    }
  });

  // === Database Backup (Admin only) ===
  app.get("/api/admin/code-download", isAuthenticated, isAdmin, (req, res) => {
    try {
      const projectRoot = process.cwd();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `베니사운드_소스코드_${timestamp}.zip`;

      const EXCLUDE = new Set(["node_modules", ".git", "local-uploads", "dist", ".next"]);

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

      const archive = archiver("zip", { zlib: { level: 6 } });

      archive.on("error", (err: any) => {
        console.error("Archive error:", err);
        if (!res.headersSent) res.status(500).end();
      });

      archive.pipe(res);

      // 최상위 항목만 순회하여 제외 폴더 건너뜀
      const entries = readdirSync(projectRoot);
      for (const entry of entries) {
        if (EXCLUDE.has(entry)) continue;
        const fullPath = path.join(projectRoot, entry);
        const stat = lstatSync(fullPath);
        if (stat.isDirectory()) {
          archive.directory(fullPath, entry);
        } else {
          archive.file(fullPath, { name: entry });
        }
      }

      archive.finalize();
    } catch (error: any) {
      console.error("Code download error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "코드 다운로드 실패: " + (error?.message || "알 수 없는 오류") });
      }
    }
  });

  app.get("/api/admin/uploads-download", isAuthenticated, isAdmin, (req, res) => {
    try {
      const uploadsRoot = path.resolve(process.cwd(), "local-uploads");
      if (!existsSync(uploadsRoot)) {
        return res.status(404).json({ message: "local-uploads 폴더가 없습니다" });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `베니사운드_음원파일_${timestamp}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

      const archive = archiver("zip", { zlib: { level: 6 } });

      archive.on("error", (err: any) => {
        console.error("Uploads archive error:", err);
        if (!res.headersSent) res.status(500).end();
      });

      archive.pipe(res);
      archive.directory(uploadsRoot, "local-uploads");
      archive.finalize();
    } catch (error: any) {
      console.error("Uploads download error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "음원 다운로드 실패: " + (error?.message || "알 수 없는 오류") });
      }
    }
  });

  // 서버가 직접 지정 경로(E: 또는 .env BACKUP_LOCAL_DIR)에 저장 (Windows 로컬 PC 전용 — VPS에서는 실행 불가)
  app.post("/api/admin/save-to-local", isAuthenticated, isAdmin, async (req, res) => {
    if (process.platform !== "win32") {
      return res.status(400).json({
        message: "전체 백업 저장(E드라이브)은 Windows 로컬 PC에서만 사용할 수 있습니다. 서버(VPS)에서는 실행되지 않습니다.",
        results: [],
      });
    }
    const results: { type: string; file: string; success: boolean; error?: string }[] = [];
    try {
      const preferredDir = process.env.BACKUP_LOCAL_DIR || "E:\\뉴베니사운드백업폴더";
      let LOCAL_BACKUP_DIR: string;
      try {
        mkdirSync(preferredDir, { recursive: true });
        LOCAL_BACKUP_DIR = preferredDir;
      } catch (e: any) {
        const fallback = path.join(process.cwd(), "backups", "local");
        mkdirSync(fallback, { recursive: true });
        LOCAL_BACKUP_DIR = fallback;
        console.warn("[admin save-to-local] Preferred dir failed, using fallback:", preferredDir, e?.message);
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    // 1. DB 백업
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) throw new Error("DATABASE_URL 없음");
      const pgDumpCandidates = [
        "pg_dump",
        "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe",
        "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe",
        "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe",
        "C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe",
      ];
      const pgDumpPath = pgDumpCandidates.find((p) => {
        try { execSync(`"${p}" --version`, { stdio: "pipe" }); return true; } catch { return false; }
      });
      if (!pgDumpPath) throw new Error("pg_dump을 찾을 수 없음");
      const dump = execSync(`"${pgDumpPath}" "${dbUrl}" --no-owner --no-acl`, {
        maxBuffer: 50 * 1024 * 1024,
        encoding: "utf-8",
      });
      const dbFile = path.join(LOCAL_BACKUP_DIR, `베니사운드_DB백업_${timestamp}.sql`);
      writeFileSync(dbFile, dump, "utf-8");
      results.push({ type: "DB", file: dbFile, success: true });
    } catch (e: any) {
      results.push({ type: "DB", file: "", success: false, error: e?.message });
    }

    // 2. 소스코드 ZIP
    try {
      const projectRoot = process.cwd();
      const EXCLUDE = new Set(["node_modules", ".git", "local-uploads", "dist", ".next", ".env"]);
      const codeFile = path.join(LOCAL_BACKUP_DIR, `베니사운드_소스코드_${timestamp}.zip`);

      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(codeFile);
        const archive = archiver("zip", { zlib: { level: 6 } });
        archive.on("error", reject);
        output.on("close", resolve);
        archive.pipe(output);
        const entries = readdirSync(projectRoot);
        for (const entry of entries) {
          if (EXCLUDE.has(entry)) continue;
          const fullPath = path.join(projectRoot, entry);
          const stat = lstatSync(fullPath);
          if (stat.isDirectory()) archive.directory(fullPath, entry);
          else archive.file(fullPath, { name: entry });
        }
        archive.finalize();
      });
      results.push({ type: "소스코드", file: codeFile, success: true });
    } catch (e: any) {
      results.push({ type: "소스코드", file: "", success: false, error: e?.message });
    }

    // 3. 음원파일 ZIP
    try {
      const uploadsRoot = path.resolve(process.cwd(), "local-uploads");
      if (!existsSync(uploadsRoot)) throw new Error("local-uploads 폴더 없음");
      const uploadsFile = path.join(LOCAL_BACKUP_DIR, `베니사운드_음원파일_${timestamp}.zip`);

      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(uploadsFile);
        const archive = archiver("zip", { zlib: { level: 6 } });
        archive.on("error", reject);
        output.on("close", resolve);
        archive.pipe(output);
        archive.directory(uploadsRoot, "음원파일");
        archive.finalize();
      });
      results.push({ type: "음원파일", file: uploadsFile, success: true });
    } catch (e: any) {
      results.push({ type: "음원파일", file: "", success: false, error: e?.message });
    }

      res.json({ dir: LOCAL_BACKUP_DIR, results });
    } catch (err: any) {
      console.error("[admin save-to-local]", err);
      res.status(500).json({ message: err?.message || "백업 저장 실패", results: [] });
    }
  });

  app.post("/api/admin/server-backup", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      if (process.platform === "win32") {
        return res.status(400).json({ message: "이 백업 기능은 서버(VPS)에서만 사용할 수 있습니다." });
      }

      const projectRoot = process.cwd();
      const serverRoot = path.resolve(projectRoot, "..");
      const uploadsRoot = path.resolve(projectRoot, "local-uploads");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

      const dbFilename = `베니사운드_DB백업_${timestamp}.sql`;
      const codeFilename = `베니사운드_소스코드_${timestamp}.zip`;
      const uploadsFilename = `베니사운드_음원파일_${timestamp}.zip`;

      const dbPath = path.join(serverRoot, dbFilename);
      const codePath = path.join(serverRoot, codeFilename);
      const uploadsPath = path.join(serverRoot, uploadsFilename);

      // 1) DB 덤프 생성 (pg_dump는 리눅스 서버에 설치되어 있다고 가정)
      try {
        execSync(`sudo -u postgres pg_dump venysounddb > "${dbPath}"`, {
          maxBuffer: 50 * 1024 * 1024,
          stdio: "ignore",
          shell: "/bin/bash",
        });
      } catch (err: any) {
        console.error("Server backup - DB dump error:", err?.message || err);
        return res.status(500).json({ message: "DB 백업 생성에 실패했습니다. 서버의 pg_dump 설치를 확인해주세요." });
      }

      // 2) 소스코드 ZIP 생성
      const EXCLUDE = new Set(["node_modules", ".git", "local-uploads", "dist", ".next", ".env"]);
      try {
        await new Promise<void>((resolve, reject) => {
          const output = createWriteStream(codePath);
          const archive = archiver("zip", { zlib: { level: 6 } });
          archive.on("error", reject);
          output.on("close", resolve);
          archive.pipe(output);

          const entries = readdirSync(projectRoot);
          for (const entry of entries) {
            if (EXCLUDE.has(entry)) continue;
            const fullPath = path.join(projectRoot, entry);
            const stat = lstatSync(fullPath);
            if (stat.isDirectory()) {
              archive.directory(fullPath, entry);
            } else {
              archive.file(fullPath, { name: entry });
            }
          }

          archive.finalize();
        });
      } catch (err: any) {
        console.error("Server backup - code zip error:", err?.message || err);
        return res.status(500).json({ message: "소스코드 압축 생성에 실패했습니다." });
      }

      // 3) 음원/업로드 ZIP 생성
      try {
        if (!existsSync(uploadsRoot)) {
          console.warn("Server backup - uploads directory not found:", uploadsRoot);
        } else {
          await new Promise<void>((resolve, reject) => {
            const output = createWriteStream(uploadsPath);
            const archive = archiver("zip", { zlib: { level: 6 } });
            archive.on("error", reject);
            output.on("close", resolve);
            archive.pipe(output);
            archive.directory(uploadsRoot, "local-uploads");
            archive.finalize();
          });
        }
      } catch (err: any) {
        console.error("Server backup - uploads zip error:", err?.message || err);
        return res.status(500).json({ message: "음원/업로드 파일 압축 생성에 실패했습니다." });
      }

      res.json({
        message: "원격 서버에 백업 파일이 생성되었습니다.",
        files: {
          db: dbPath,
          code: codePath,
          uploads: uploadsPath,
        },
      });
    } catch (error: any) {
      console.error("Server backup unexpected error:", error?.message || error);
      res.status(500).json({ message: "백업 생성 실패: " + (error?.message || "알 수 없는 오류") });
    }
  });

  return httpServer;
}
