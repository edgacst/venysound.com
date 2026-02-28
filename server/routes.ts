import type { Express } from "express";
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
import { sendNewMusicNotificationEmail } from "./email";
import { sendPushNotification } from "./push";
import { WebSocketServer, WebSocket } from "ws";
import { subscriptionPlans, payments } from "../shared/models/auth";
import { db } from "./db";
import { users, streamingLogs, music, announcements, follows, notifications, insertAnnouncementSchema, musicStories as musicStoriesTable, postComments } from "../shared/schema";
import { eq, sql, inArray, and, desc } from "drizzle-orm";
import geoip from "geoip-lite";

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

  /** 구독 만료 시 DB를 free로 갱신하고, 해당 유저가 현재 프리미엄(또는 admin)인지 반환 */
  async function ensureExpiredSubscriptionDowngrade(userId: string): Promise<{ isPremium: boolean }> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return { isPremium: false };
    if (user.role === "admin") return { isPremium: true };
    const now = new Date();
    if (user.subscriptionTier === "premium" && user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) <= now) {
      await db.update(users).set({ subscriptionTier: "free", subscriptionPlan: null, subscriptionExpiresAt: null }).where(eq(users.id, userId));
      return { isPremium: false };
    }
    return { isPremium: user.subscriptionTier === "premium" };
  }

  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);
  registerObjectStorageRoutes(app);

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

  wss.on("connection", (ws) => {
    visitorCount++;
    broadcastVisitorCount();
    let wsUserId: string | null = null;

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "auth" && msg.userId) {
          wsUserId = msg.userId;
          if (!userSockets.has(wsUserId!)) {
            userSockets.set(wsUserId!, new Set());
          }
          userSockets.get(wsUserId!)!.add(ws);
        }
      } catch {}
    });

    ws.on("close", () => {
      visitorCount--;
      broadcastVisitorCount();
      if (wsUserId && userSockets.has(wsUserId)) {
        userSockets.get(wsUserId)!.delete(ws);
        if (userSockets.get(wsUserId)!.size === 0) {
          userSockets.delete(wsUserId);
        }
      }
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
      "/login",
      "/register",
      "/faq",
      "/legal",
      "/privacy",
      "/guide",
      "/file-guide",
      "/suno-guide",
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

  // === Music Routes ===
  app.get(api.music.list.path, async (req, res) => {
    const { genre, search, tag, page, limit } = req.query as { genre?: string, search?: string, tag?: string, page?: string, limit?: string };
    const pageNum = Math.max(1, parseInt(page || "1", 10));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit || "30", 10)));
    const result = await storage.getMusicList(genre, search, tag, pageNum, limitNum);
    res.json(result);
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

  app.get("/api/artists/top-weekly", async (_req, res) => {
    try {
      const data = await storage.getWeeklyTopArtist(5);
      if (!data) return res.json(null);
      res.json(data);
    } catch (e) {
      console.error("[artists/top-weekly]", e);
      res.json(null);
    }
  });

  app.get("/api/music/popular", async (_req, res) => {
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
        const subscriptionPremium = tier === "premium" && (expiresAt == null || new Date(expiresAt) > now);
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
          uploaderSubscriptionTier: isPremium ? "premium" : "free",
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
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const music = await storage.getMusicById(Number(id));
    if (!music) {
      return res.status(404).json({ error: "Music not found" });
    }
    const fn = music.filename || "";
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
      return res.status(404).json({
        error: "파일 경로를 찾을 수 없습니다",
        hint: "DB의 filename 형식을 확인해 주세요. /file-guide 에서 연결 방법을 안내합니다.",
      });
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
      return res.status(404).json({
        error: "음원 파일을 찾을 수 없습니다",
        hint: `local-uploads/uploads/ 에 ${baseId}.mp3 (또는 .wav, .ogg) 파일을 넣어 주세요. /file-guide 에서 전체 목록을 확인할 수 있습니다.`,
      });
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

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.set("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.set("Content-Length", String(chunkSize));
      createReadStream(localPath, { start, end }).pipe(res);
    } else {
      res.set("Content-Length", String(fileSize));
      createReadStream(localPath).pipe(res);
    }
  });

  app.get(api.music.get.path, async (req, res) => {
    const music = await storage.getMusicById(Number(req.params.id));
    if (!music) {
      return res.status(404).json({ message: "Music not found" });
    }
    const uploader = await storage.getUserById(music.userId);
    const now = new Date();
    const subscriptionPremium = uploader?.subscriptionTier === "premium" && (uploader?.subscriptionExpiresAt == null || new Date(uploader.subscriptionExpiresAt) > now);
    const uploaderIsPremium = (uploader as any)?.role === "admin" || subscriptionPremium;
    res.json({
      ...music,
      uploaderSubscriptionTier: uploaderIsPremium ? "premium" : "free",
      uploaderDonationBadge: (uploader as any)?.donationBadge ?? null,
      uploader: uploader ? { id: uploader.id, firstName: uploader.firstName, lastName: uploader.lastName, profileImageUrl: uploader.profileImageUrl, email: uploader.email, subscriptionTier: uploader.subscriptionTier } : null,
    });
  });

  app.get("/api/music/:id/similar", async (req, res) => {
    const id = Number(req.params.id);
    const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit), 10) || 8));
    try {
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
      await storage.addCredits(userId, 200);
      await storage.createCreditTransaction({
        userId,
        type: "music_upload_bonus",
        amount: 200,
        description: "음원 등록 보너스",
        relatedId: music.id,
      });
      await storage.createNotification({
        userId,
        type: "system",
        message: "음원이 등록되었습니다. 200 크레딧이 지급되었습니다.",
        payload: { musicTitle: music.title, amount: 200 },
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

      // 이벤트: 음원 등록 시 지급한 200 크레딧 회수
      const ownerId = existing.userId;
      await storage.addCredits(ownerId, -200);
      await storage.createCreditTransaction({
        userId: ownerId,
        type: "music_upload_bonus_reversal",
        amount: -200,
        description: "음원 삭제 시 등록 보너스 회수",
        relatedId: musicId,
      });
      await storage.createNotification({
        userId: ownerId,
        type: "system",
        message: `"${existing.title}" 음원이 삭제되어 등록 보너스 200 크레딧이 회수되었습니다.`,
        payload: { musicTitle: existing.title, amount: -200 },
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
      const { content, imageUrl, textSize, startsAt, endsAt } = req.body;
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
      const saved = await storage.saveSiteAnnouncement({ content: content.trim(), imageUrl: imageUrlVal, textSize: textSizeVal, startsAt: start, endsAt: end });
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

  app.put("/api/admin/curated-playlists/:id/tracks", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { musicIds } = req.body || {};
      const ids = Array.isArray(musicIds) ? musicIds.filter((x): x is number => typeof x === "number") : [];
      await storage.setCuratedPlaylistTracks(id, ids);
      res.json({ success: true });
    } catch (e) {
      console.error("[admin/curated-playlists tracks PUT]", e);
      res.status(500).json({ message: "트랙 저장에 실패했습니다." });
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
      if (!tier || !["free", "premium"].includes(tier)) {
        return res.status(400).json({ message: "유효하지 않은 구독 플랜입니다" });
      }
      let expiresAt: Date | null = null;
      if (tier === "premium") {
        expiresAt = new Date();
        expiresAt.setFullYear(expiresAt.getFullYear() + 99);
      }
      await storage.updateUserSubscription(targetId, tier, expiresAt);
      if (tier === "premium") {
        await storage.createNotification({
          userId: targetId,
          type: "system",
          message: "관리자에 의해 프리미엄 회원으로 적용되었습니다.",
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
      if (user.subscriptionTier === "premium" && user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > now) {
        return res.json({
          tier: "premium",
          plan: user.subscriptionPlan,
          expiresAt: user.subscriptionExpiresAt,
          hasBillingKey: !!user.tossBillingKey,
        });
      }

      if (user.subscriptionTier === "premium" && user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) <= now) {
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
    if (!clientKey) {
      return res.status(500).json({ message: "토스페이먼츠 설정이 필요합니다" });
    }
    res.json({ clientKey });
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

      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, 'premium'));
      if (!plan) return res.status(500).json({ message: "플랜 정보를 찾을 수 없습니다" });

      const amount = billingPeriod === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
      const orderName = billingPeriod === 'monthly' ? 'Veny Sound Premium 월간 구독' : 'Veny Sound Premium 연간 구독';
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
        plan: 'premium',
        billingPeriod,
      });

      await db.update(users).set({
        subscriptionTier: 'premium',
        subscriptionPlan: billingPeriod,
        subscriptionExpiresAt: expiresAt,
      }).where(eq(users.id, userId));

      await storage.createNotification({
        userId,
        type: "system",
        message: `프리미엄 구독이 완료되었습니다. (${billingPeriod === "monthly" ? "월간" : "연간"})`,
        payload: { plan: billingPeriod, amount },
        url: "/pricing",
      });

      res.json({
        success: true,
        tier: 'premium',
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
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, "premium")).limit(1);
    const amountMonthly = plan?.monthlyPrice ?? 5500;
    const amountYearly = plan?.yearlyPrice ?? 59400;
    res.json({
      bankName,
      bankAccount,
      bankHolder,
      amountMonthly,
      amountYearly,
    });
  });

  app.post("/api/subscription/request-bank", isAuthenticated, async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.user.claims.sub;
      const { billingPeriod } = req.body;
      if (!billingPeriod || !["monthly", "yearly"].includes(billingPeriod)) {
        return res.status(400).json({ message: "결제 주기를 선택해주세요" });
      }
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });

      let amount: number;
      try {
        const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, "premium")).limit(1);
        amount = plan ? (billingPeriod === "monthly" ? plan.monthlyPrice : plan.yearlyPrice) : (billingPeriod === "monthly" ? 5500 : 59400);
      } catch {
        amount = billingPeriod === "monthly" ? 5500 : 59400;
      }
      const orderId = `BANK_${userId.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 20)}_${Date.now()}`;

      await db.insert(payments).values({
        userId,
        orderId,
        paymentKey: "bank_transfer",
        amount,
        status: "pending",
        plan: "premium",
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
        message: "입금 신청이 등록되었습니다. 월간 6,600원을 아래 계좌로 입금해 주시면 확인 후 즉시 프리미엄이 적용됩니다.",
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
        const creditAmount = Math.round(payment.amount / 1.1);
        await storage.addCredits(payment.userId, creditAmount);
        await storage.createCreditTransaction({
          userId: payment.userId,
          type: "charge",
          amount: creditAmount,
          description: `${creditAmount.toLocaleString()}원 크레딧 충전 (계좌이체, 총결재 ${payment.amount.toLocaleString()}원)`,
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
      await db.update(users).set({
        subscriptionTier: "premium",
        subscriptionPlan: payment.billingPeriod,
        subscriptionExpiresAt: expiresAt,
      }).where(eq(users.id, payment.userId));

      res.json({ success: true, expiresAt });
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

      await storage.addCredits(userId, amount);
      await storage.createCreditTransaction({
        userId,
        type: "charge",
        amount,
        description: `${amount.toLocaleString()}원 크레딧 충전`,
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
          url: "/admin",
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

      await storage.createCreditTransaction({
        userId: fromUserId,
        type: "tip_sent",
        amount: -amount,
        description: `후원 보내기`,
        relatedId: tip.id,
      });

      const fromUser = await storage.getUserById(fromUserId);
      const fromName = fromUser?.firstName || "누군가";
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

  // Toss client key for frontend
  app.get("/api/toss/client-key", (_req, res) => {
    const clientKey = process.env.TOSS_CLIENT_KEY;
    res.json({ clientKey: clientKey || null });
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
          url: "/admin",
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
