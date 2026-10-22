import crypto from "node:crypto";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as NaverStrategy } from "passport-naver-v2";
import { Strategy as KakaoStrategy } from "passport-kakao";
import { Strategy as FacebookStrategy } from "passport-facebook";
import session from "express-session";
import type { Express, Request, Response, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { databaseConnectionString } from "../db";
import { authStorage } from "./storage";
import { db } from "../db";
import { users } from "../../shared/models/auth";
import { eq, or } from "drizzle-orm";
import { sendWelcomeEmail, normalizeOutgoingEmailAddress } from "../email";
import {
  sendCreditRefundOtp,
  verifyCreditRefundOtp,
  SENSITIVE_OTP_PURPOSE_CREDIT_REFUND,
  sendAccountEmailVerificationOtp,
  verifyAccountEmailBind,
} from "../sensitiveOtp";
import { getLoginPagePath } from "../site-paths";

/** OAuth 성공 후 홈 — 모바일 터치 기기 레이아웃 1회 보정(veny-mobile-bootstrap.js) */
const POST_LOGIN_HOME = "/?veny_layout=1";
import { recordSignupSuccessAfterNewOauth } from "../oauthSignupAnalytics";
import { storage } from "../storage";
import { ensurePaidUserSubscriptionAiExhaustedIfWalletDepleted } from "../subscription-ai-budget-exhaustion";

/** 신규 가입 시 사이트 종 알림(인앱) 환영 — 재생·라디오 로직과 무관 */
async function createSignupWelcomeNotification(userId: string, displayName: string): Promise<void> {
  const name = (displayName && String(displayName).trim()) || "회원";
  try {
    await storage.createNotification({
      userId,
      type: "welcome",
      message: `${name}님, 베니사운드에 오신 것을 환영합니다! 음악·라디오·AI 생성 등 서비스를 마음껏 둘러보세요.`,
      payload: { userName: name },
      url: "/",
    });
  } catch (e) {
    console.error("[auth] welcome notification failed:", e);
  }
}

/** .env 값 앞의 UTF-8 BOM·앞뒤 공백 제거 (redirect_uri 한 글자 불일치 방지) */
function cleanEnvValue(s: string): string {
  return s.replace(/^\uFEFF/, "").trim();
}

/**
 * TikTok OAuth redirect_uri — authorize 요청과 token 교환에 동일한 문자열이어야 함.
 * 개발: 실제 접속 호스트 사용 → localhost vs 127.0.0.1 세션 불일치 방지.
 * 운영: SITE_URL 고정(프록시 뒤에서는 x-forwarded-* 반영).
 * 필요 시 .env에 TIKTOK_REDIRECT_URI 로 전체 콜백 URL을 직접 지정.
 */
function getTikTokRedirectUri(req: Request): string {
  const explicit = cleanEnvValue(process.env.TIKTOK_REDIRECT_URI || "");
  if (explicit) return explicit.replace(/\/$/, "");

  const site = cleanEnvValue(process.env.SITE_URL || "").replace(/\/$/, "");
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && site) {
    return `${site}/api/auth/tiktok/callback`;
  }

  const xfProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = xfProto || req.protocol || "http";
  const host = req.get("host") || "localhost:5000";
  return `${proto}://${host}/api/auth/tiktok/callback`;
}

function buildUserSession(
  id: string,
  email: string | null,
  firstName: string,
  lastName: string,
  profileImageUrl: string,
  accessToken: string,
  refreshToken?: string
) {
  return {
    claims: {
      sub: id,
      email,
      first_name: firstName,
      last_name: lastName,
      profile_image_url: profileImageUrl,
    },
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
  };
}

/**
 * connect-pg-simple 는 세션을 DB에 비동기 저장함. req.login 직후 바로 res.json 하면
 * 클라이언트가 다음 /api/auth/me 를 때릴 때 아직 store 에 반영 안 돼 401 이 날 수 있음.
 */
function respondAfterSessionSaved(req: Request, res: Response, send: () => void, onStoreError?: () => void) {
  req.session.save((saveErr) => {
    if (saveErr) {
      console.error("[auth] session.save failed after login:", saveErr);
      if (!res.headersSent) {
        if (onStoreError) onStoreError();
        else res.status(500).json({ error: "세션 저장에 실패했습니다. 잠시 후 다시 시도해 주세요." });
      }
      return;
    }
    send();
  });
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: databaseConnectionString,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  const isProd = process.env.NODE_ENV === "production";
  const siteUrlRaw = (process.env.SITE_URL || "").trim();
  const siteHost = (() => {
    if (!siteUrlRaw) return "";
    try {
      const withProto = /^https?:\/\//i.test(siteUrlRaw) ? siteUrlRaw : `https://${siteUrlRaw}`;
      return new URL(withProto).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const siteIsLocalHost =
    siteHost === "localhost" || siteHost === "127.0.0.1" || siteHost === "[::1]" || siteHost.endsWith(".localhost");

  /**
   * Cookie Domain 은 프로덕션에서만 적용.
   * 로컬 호스트용 SITE_URL 이면 domain 도 무시(프로덕션 .env 를 localhost 에서 쓸 때).
   */
  let cookieDomain: string | undefined =
    isProd && !siteIsLocalHost && (process.env.SESSION_COOKIE_DOMAIN || "").trim().length > 0
      ? (process.env.SESSION_COOKIE_DOMAIN || "").trim()
      : undefined;
  const sessionInsecure = /^(1|true|yes)$/i.test(String(process.env.SESSION_COOKIE_INSECURE || "").trim());
  let cookieSecure = isProd && !sessionInsecure;
  /** http://localhost + NODE_ENV=production 조합에서 Secure 쿠키가 저장 안 되는 문제 완화 */
  if (siteIsLocalHost) {
    cookieSecure = false;
    cookieDomain = undefined;
  }

  if (!isProd || siteIsLocalHost) {
    console.log(
      `[auth] 세션 쿠키: Secure=${cookieSecure} Domain=${cookieDomain ?? "(호스트만)"} NODE_ENV=${process.env.NODE_ENV ?? ""} SITE_URL.host=${siteHost || "-"}`
    );
  }

  return session({
    secret: process.env.SESSION_SECRET || "local-dev-secret-change-in-prod",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: cookieSecure,
      maxAge: sessionTtl,
      sameSite: "lax",
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    },
  });
}

export async function setupAuth(app: Express) {
  /** 프록시 단계: Nginx만=1, Cloudflare+Nginx 등=2. .env TRUST_PROXY=true | 숫자 */
  const tp = process.env.TRUST_PROXY?.trim();
  if (tp === "true" || tp === "1") {
    app.set("trust proxy", true);
  } else if (tp && /^\d+$/.test(tp)) {
    app.set("trust proxy", parseInt(tp, 10));
  } else {
    app.set("trust proxy", 1);
  }
  app.use(getSession());
  app.use(passport.initialize());
  /** pauseStream: 바디 파서 이후에도 역직렬화 전 요청 스트림 이슈 방지(세션 복원·analytics 에서 req.user 누락 완화) */
  app.use(passport.session({ pauseStream: true }));

  const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const hasNaver = !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
  const hasKakao = !!(process.env.KAKAO_CLIENT_ID && process.env.KAKAO_CLIENT_SECRET);
  const hasFacebook = !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
  const hasTikTok = !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);

  if (hasGoogle) {
    const googleCallback =
      process.env.SITE_URL ? `${process.env.SITE_URL.replace(/\/$/, "")}/api/auth/google/callback` : "/api/auth/google/callback";
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: googleCallback,
          proxy: true,
          passReqToCallback: true,
        },
        async (req, accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value || null;
            const firstName = profile.name?.givenName || profile.displayName?.split(" ")[0] || "";
            const lastName = profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || "";
            const profileImageUrl = profile.photos?.[0]?.value || "";
            const id = `google_${profile.id}`;
            const existing = await authStorage.getUser(id);
            const user = await authStorage.upsertUser({ id, email, firstName, lastName, profileImageUrl, registerSource: "google" });
            const welcomeTo =
              normalizeOutgoingEmailAddress(user.email) ?? normalizeOutgoingEmailAddress(email);
            if (!existing && user.id === id && welcomeTo) {
              sendWelcomeEmail(welcomeTo, { username: user.firstName || firstName || "회원" }).catch((e) =>
                console.error("[auth] welcome email failed:", e)
              );
            }
            if (!existing && user.id === id) {
              void createSignupWelcomeNotification(user.id, user.firstName || firstName || "회원");
              recordSignupSuccessAfterNewOauth(req, "google");
            }
            done(null, buildUserSession(user.id, user.email || email, user.firstName ?? firstName, user.lastName ?? "", user.profileImageUrl || profileImageUrl, accessToken, refreshToken));
          } catch (error) {
            done(error as Error);
          }
        }
      )
    );
  }

  if (hasNaver) {
    const naverCallback = process.env.SITE_URL
      ? `${process.env.SITE_URL.replace(/\/$/, "")}/api/auth/naver/callback`
      : "/api/auth/naver/callback";
    passport.use(
      new (NaverStrategy as any)(
        ({
          clientID: process.env.NAVER_CLIENT_ID!,
          clientSecret: process.env.NAVER_CLIENT_SECRET!,
          callbackURL: naverCallback,
          passReqToCallback: true,
        } as any),
        async (req: Request, accessToken: string, refreshToken: string, profile: any, done: any) => {
          try {
            const email = profile.email || null;
            const firstName = profile.name || profile.nickname || "";
            const profileImageUrl = profile.profileImage || "";
            const id = `naver_${profile.id}`;
            const existing = await authStorage.getUser(id);
            const user = await authStorage.upsertUser({ id, email, firstName, lastName: "", profileImageUrl, registerSource: "naver" });
            const welcomeTo =
              normalizeOutgoingEmailAddress(user.email) ?? normalizeOutgoingEmailAddress(email);
            if (!existing && user.id === id && welcomeTo) {
              sendWelcomeEmail(welcomeTo, { username: user.firstName || firstName || "회원" }).catch((e) =>
                console.error("[auth] welcome email failed:", e)
              );
            }
            if (!existing && user.id === id) {
              void createSignupWelcomeNotification(user.id, user.firstName || firstName || "회원");
              recordSignupSuccessAfterNewOauth(req, "naver");
            }
            done(null, buildUserSession(user.id, user.email || email, user.firstName || firstName, user.lastName || "", user.profileImageUrl || profileImageUrl, accessToken, refreshToken));
          } catch (error) {
            done(error as Error);
          }
        }
      )
    );
  }

  if (hasKakao) {
    const kakaoCallback = process.env.SITE_URL
      ? `${process.env.SITE_URL.replace(/\/$/, "")}/api/auth/kakao/callback`
      : "/api/auth/kakao/callback";
    passport.use(
      new KakaoStrategy(
        {
          clientID: process.env.KAKAO_CLIENT_ID!,
          clientSecret: process.env.KAKAO_CLIENT_SECRET!,
          callbackURL: kakaoCallback,
          passReqToCallback: true,
        },
        async (req: Request, accessToken: string, refreshToken: string, profile: any, done: any) => {
          try {
            const kakaoAccount = profile._json?.kakao_account || {};
            const kakaoProfile = kakaoAccount.profile || {};
            const email = kakaoAccount.email || null;
            const firstName = kakaoProfile.nickname || profile.displayName || "";
            const profileImageUrl = kakaoProfile.profile_image_url || "";
            const id = `kakao_${profile.id}`;
            const existing = await authStorage.getUser(id);
            const user = await authStorage.upsertUser({ id, email, firstName, lastName: "", profileImageUrl, registerSource: "kakao" });
            const welcomeTo =
              normalizeOutgoingEmailAddress(user.email) ?? normalizeOutgoingEmailAddress(email);
            if (!existing && user.id === id && welcomeTo) {
              sendWelcomeEmail(welcomeTo, { username: user.firstName || firstName || "회원" }).catch((e) =>
                console.error("[auth] welcome email failed:", e)
              );
            }
            if (!existing && user.id === id) {
              void createSignupWelcomeNotification(user.id, user.firstName || firstName || "회원");
              recordSignupSuccessAfterNewOauth(req, "kakao");
            }
            done(null, buildUserSession(user.id, user.email || email, user.firstName || firstName, "", user.profileImageUrl || profileImageUrl, accessToken, refreshToken));
          } catch (error) {
            done(error as Error);
          }
        }
      )
    );
  }

  if (hasFacebook) {
    const facebookCallback = process.env.SITE_URL
      ? `${process.env.SITE_URL.replace(/\/$/, "")}/api/auth/facebook/callback`
      : "/api/auth/facebook/callback";
    passport.use(
      new FacebookStrategy(
        {
          clientID: process.env.FACEBOOK_APP_ID!,
          clientSecret: process.env.FACEBOOK_APP_SECRET!,
          callbackURL: facebookCallback,
          profileFields: ["id", "displayName", "name", "emails", "photos"],
          passReqToCallback: true,
        },
        async (req: Request, accessToken: string, _refreshToken: string, profile: any, done: any) => {
          try {
            const email = profile.emails?.[0]?.value || null;
            const firstName = profile.name?.givenName || profile.displayName?.split(" ")[0] || "";
            const lastName = profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || "";
            const profileImageUrl = profile.photos?.[0]?.value || "";
            const id = `facebook_${profile.id}`;
            const existing = await authStorage.getUser(id);
            const user = await authStorage.upsertUser({ id, email, firstName, lastName, profileImageUrl, registerSource: "facebook" });
            const welcomeTo =
              normalizeOutgoingEmailAddress(user.email) ?? normalizeOutgoingEmailAddress(email);
            if (!existing && user.id === id && welcomeTo) {
              sendWelcomeEmail(welcomeTo, { username: user.firstName || firstName || "회원" }).catch((e) =>
                console.error("[auth] welcome email failed:", e)
              );
            }
            if (!existing && user.id === id) {
              void createSignupWelcomeNotification(user.id, user.firstName || firstName || "회원");
              recordSignupSuccessAfterNewOauth(req, "facebook");
            }
            done(null, buildUserSession(user.id, user.email || email, user.firstName || firstName, user.lastName || lastName, user.profileImageUrl || profileImageUrl, accessToken));
          } catch (error) {
            done(error as Error);
          }
        }
      )
    );
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/auth/login-options", (_req, res) => {
    const isProd = process.env.NODE_ENV === "production";
    const devLoginDisabled = String(process.env.DISABLE_DEV_LOGIN || "").trim() === "1";
    const allowDevLogin = !isProd && !devLoginDisabled;
    res.json({ hasGoogle, hasNaver, hasKakao, hasFacebook, hasTikTok, allowDevLogin });
  });

  // 일반 회원가입
  app.post("/api/auth/register", async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;
    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: "모든 항목을 입력해주세요." });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "비밀번호가 일치하지 않습니다." });
    }
    if (/(.)\1\1/.test(username)) {
      return res.status(400).json({ error: "아이디에는 같은 문자를 3번 이상 연속해서 사용할 수 없습니다." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "비밀번호는 8자 이상이어야 합니다." });
    }
    // 비밀번호 강도 검사: 영문 대소문자/숫자/특수문자 중 3종 이상, 흔한 비밀번호 차단
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);
    const categories = [hasUpper, hasLower, hasNumber, hasSymbol].filter(Boolean).length;
    const commonList = ["123456", "1234567", "12345678", "123456789", "password", "qwerty", "111111", "000000"];
    const isCommon = commonList.includes(String(password).toLowerCase());
    if (categories < 3 || isCommon) {
      return res.status(400).json({
        error: "비밀번호는 영문 대소문자, 숫자, 특수문자 중 3종 이상을 조합해 8자 이상으로 설정해주세요.",
      });
    }
    try {
      const [existing] = await db
        .select()
        .from(users)
        .where(or(eq(users.email, email), eq(users.username, username)));
      if (existing) {
        if (existing.username === username) return res.status(409).json({ error: "이미 사용 중인 아이디입니다." });
        if (existing.email === email) return res.status(409).json({ error: "이미 사용 중인 이메일입니다." });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const [user] = await db
        .insert(users)
        .values({
          username,
          email,
          passwordHash,
          firstName: username,
          role: "user",
          registerSource: "email",
        })
        .returning();
      const welcomeTo =
        normalizeOutgoingEmailAddress(email) ?? normalizeOutgoingEmailAddress(user.email);
      if (welcomeTo) {
        const locale = typeof req.body?.locale === "string" ? req.body.locale : undefined;
        sendWelcomeEmail(welcomeTo, { username: user.username ?? username, locale }).catch((e) =>
          console.error("[auth] welcome email failed:", e)
        );
      }
      void createSignupWelcomeNotification(user.id, user.username || user.firstName || "회원");
      const sessionUser = buildUserSession(user.id, user.email || null, user.firstName || username, "", "", "local");
      req.login(sessionUser, (err) => {
        if (err) return res.status(500).json({ error: "가입 후 로그인 실패" });
        respondAfterSessionSaved(req, res, () =>
          res.json({ success: true, user: { id: user.id, username: user.username, email: user.email } })
        );
      });
    } catch (err) {
      console.error("Register error:", err);
      res.status(500).json({ error: "회원가입 실패" });
    }
  });

  // 일반 로그인
  app.post("/api/auth/local-login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "아이디와 비밀번호를 입력해주세요." });
    }
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(or(eq(users.username, username), eq(users.email, username)));
      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
      }
      const sessionUser = buildUserSession(user.id, user.email || null, user.firstName || username, "", user.profileImageUrl || "", "local");
      req.login(sessionUser, (err) => {
        if (err) return res.status(500).json({ error: "로그인 실패" });
        respondAfterSessionSaved(req, res, () => res.json({ success: true }));
      });
    } catch (err) {
      console.error("Local login error:", err);
      res.status(500).json({ error: "로그인 실패" });
    }
  });

  // 개발용 로그인 (NODE_ENV !== production). OAuth 키가 있어도 로컬 편의상 허용 — 막으려면 DISABLE_DEV_LOGIN=1
  app.post("/api/auth/dev-login", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "프로덕션 환경에서는 개발용 로그인을 사용할 수 없습니다." });
    }
    if (String(process.env.DISABLE_DEV_LOGIN || "").trim() === "1") {
      return res.status(403).json({ error: "개발용 로그인이 비활성화되어 있습니다." });
    }
    try {
      const user = await authStorage.upsertUser({
        id: "dev_local_user",
        email: "dev@venysound.local",
        firstName: "개발",
        lastName: "사용자",
        profileImageUrl: "",
      });
      const sessionUser = buildUserSession(user.id, user.email || null, user.firstName || "", user.lastName || "", user.profileImageUrl || "", "dev");
      req.login(sessionUser, (err) => {
        if (err) return res.status(500).json({ error: "로그인 실패" });
        respondAfterSessionSaved(req, res, () => res.json({ success: true }));
      });
    } catch (err) {
      console.error("Dev login error:", err);
      res.status(500).json({ error: "로그인 실패" });
    }
  });

  app.get("/api/login", (_req, res) => {
    if (hasGoogle) res.redirect("/api/auth/google");
    else if (hasNaver) res.redirect("/api/auth/naver");
    else if (hasKakao) res.redirect("/api/auth/kakao");
    else if (hasFacebook) res.redirect("/api/auth/facebook");
    else if (hasTikTok) res.redirect("/api/auth/tiktok");
    else res.redirect("/?msg=로그인_설정_필요");
  });

  if (hasGoogle) {
    app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" }));
    app.get(
      "/api/auth/google/callback",
      (req, res, next) => {
        passport.authenticate("google", (err: Error | null, user: unknown) => {
          if (err) {
            console.error("[auth] Google callback error:", err.message);
            return res.redirect(`${getLoginPagePath()}?error=google`);
          }
          if (!user) return res.redirect(`${getLoginPagePath()}?error=google`);
          req.login(user as Express.User, (loginErr) => {
            if (loginErr) {
              console.error("[auth] Google session error:", loginErr);
              return res.redirect(`${getLoginPagePath()}?error=google`);
            }
            respondAfterSessionSaved(req, res, () => res.redirect(POST_LOGIN_HOME), () =>
              res.redirect(`${getLoginPagePath()}?error=session`)
            );
          });
        })(req, res, next);
      }
    );
  }

  if (hasNaver) {
    app.get("/api/auth/naver", passport.authenticate("naver"));
    app.get("/api/auth/naver/callback", passport.authenticate("naver", { failureRedirect: getLoginPagePath(), successRedirect: POST_LOGIN_HOME }));
  }

  if (hasKakao) {
    app.get("/api/auth/kakao", passport.authenticate("kakao"));
    app.get("/api/auth/kakao/callback", passport.authenticate("kakao", { failureRedirect: getLoginPagePath(), successRedirect: POST_LOGIN_HOME }));
  }

  if (hasFacebook) {
    app.get("/api/auth/facebook", passport.authenticate("facebook", { scope: ["email", "public_profile"] }));
    app.get("/api/auth/facebook/callback", passport.authenticate("facebook", { failureRedirect: getLoginPagePath(), successRedirect: POST_LOGIN_HOME }));
  }

  if (hasTikTok) {
    app.get("/api/auth/tiktok", (req, res) => {
      const state = crypto.randomBytes(24).toString("hex");
      (req.session as any).tiktokCsrfState = state;
      const redirectUri = getTikTokRedirectUri(req);
      console.log("[TikTok] authorize redirect_uri (TikTok 콘솔 Redirect URI와 이 문자열이 완전히 같아야 함):", redirectUri);
      const base = "https://www.tiktok.com/v2/auth/authorize/";
      const params = new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        scope: "user.info.basic",
        response_type: "code",
        redirect_uri: redirectUri,
        state,
      });
      // TikTok 리다이렉트 직전에 세션을 확실히 저장 (PG 스토어 지연 시 콜백에서 state 불일치 방지)
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("TikTok session save error:", saveErr);
          return res.redirect(`${getLoginPagePath()}?error=session`);
        }
        res.redirect(`${base}?${params.toString()}`);
      });
    });
    app.get("/api/auth/tiktok/callback", async (req, res) => {
      const { code, state, error, error_description } = req.query;
      const savedState = (req.session as any)?.tiktokCsrfState;
      delete (req.session as any)?.tiktokCsrfState;
      if (error) {
        console.error("TikTok OAuth error:", error, error_description);
        return res.redirect(`${getLoginPagePath()}?error=tiktok`);
      }
      if (!savedState || state !== savedState || typeof code !== "string") {
        console.error("[TikTok] invalid_state: session state missing or mismatch (check host: use same URL as started login, e.g. not mixing localhost and 127.0.0.1)");
        return res.redirect(`${getLoginPagePath()}?error=invalid_state`);
      }
      const redirectUri = getTikTokRedirectUri(req);
      const codeStr = code as string;
      try {
        const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cache-Control": "no-cache",
          },
          body: new URLSearchParams({
            client_key: process.env.TIKTOK_CLIENT_KEY!,
            client_secret: process.env.TIKTOK_CLIENT_SECRET!,
            code: codeStr,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
          }),
        });
        const tokenData = (await tokenRes.json()) as Record<string, unknown>;
        if (tokenData.error || !tokenData.access_token || !tokenData.open_id) {
          console.error("[TikTok] token exchange failed:", tokenRes.status, tokenData, "redirect_uri used:", redirectUri);
          return res.redirect(`${getLoginPagePath()}?error=tiktok`);
        }
        const userRes = await fetch(
          "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
          {
            headers: { Authorization: `Bearer ${String(tokenData.access_token)}` },
          }
        );
        const userData = (await userRes.json()) as {
          data?: { user?: { display_name?: string; avatar_url?: string } };
          user?: { display_name?: string; avatar_url?: string };
          error?: { code?: string; message?: string };
        };
        const errCode = userData?.error?.code;
        if (!userRes.ok || (errCode && errCode !== "ok")) {
          console.error("[TikTok] user/info:", userRes.status, userData);
        }
        const userInfo = userData?.data?.user ?? userData?.user;
        const openId = tokenData.open_id as string;
        const displayName = userInfo?.display_name ?? openId;
        const avatarUrl = userInfo?.avatar_url ?? "";
        const id = `tiktok_${openId}`;
        const existingTiktok = await authStorage.getUser(id);
        const user = await authStorage.upsertUser({
          id,
          email: null,
          firstName: displayName,
          lastName: "",
          profileImageUrl: avatarUrl,
          registerSource: "tiktok",
        });
        if (!existingTiktok && user.id === id) {
          void createSignupWelcomeNotification(user.id, user.firstName || displayName || "회원");
          recordSignupSuccessAfterNewOauth(req, "tiktok");
        }
        const sessionUser = buildUserSession(
          user.id,
          user.email ?? null,
          user.firstName ?? displayName,
          user.lastName ?? "",
          user.profileImageUrl ?? avatarUrl,
          String(tokenData.access_token),
          tokenData.refresh_token != null ? String(tokenData.refresh_token) : undefined
        );
        req.login(sessionUser, (err) => {
          if (err) {
            console.error("TikTok login session error:", err);
            return res.redirect(`${getLoginPagePath()}?error=session`);
          }
          respondAfterSessionSaved(req, res, () => res.redirect(POST_LOGIN_HOME), () =>
            res.redirect(`${getLoginPagePath()}?error=session`)
          );
        });
      } catch (err) {
        console.error("TikTok callback error:", err);
        res.redirect(`${getLoginPagePath()}?error=tiktok`);
      }
    });
  }

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.redirect("/");
      });
    });
  });
}

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/me", async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.claims?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const userId = req.user.claims.sub;
      await authStorage.downgradeExpiredSubscription(userId);
      try {
        await ensurePaidUserSubscriptionAiExhaustedIfWalletDepleted(userId, new Date());
      } catch (e) {
        console.error("[auth/me] subscription AI budget exhaustion check", e);
      }
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        role: user.role,
        subscriptionTier: user.subscriptionTier,
        subscriptionPlan: user.subscriptionPlan,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        donationBadge: user.donationBadge ?? null,
        // 기존 호환성 유지
        claims: req.user.claims,
      });
    } catch {
      res.status(500).json({ message: "Server error" });
    }
  });

  // 본인인증(재확인): 환불/정산 같은 민감 요청 전에 비밀번호를 다시 확인
  app.post("/api/auth/confirm-password", isAuthenticated, async (req, res) => {
    const { password } = req.body as { password?: unknown };
    if (typeof password !== "string" || password.trim().length === 0) {
      return res.status(400).json({ message: "비밀번호를 입력해 주세요" });
    }
    try {
      const userId = (req.user as any).claims?.sub as string | undefined;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user || !user.passwordHash) {
        return res.status(400).json({ message: "비밀번호 인증이 불가능한 계정입니다. 비밀번호 설정 후 이용해 주세요." });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ message: "비밀번호가 올바르지 않습니다." });

      return res.json({ success: true });
    } catch (e) {
      console.error("[auth] confirm-password error:", e);
      return res.status(500).json({ message: "본인인증에 실패했습니다" });
    }
  });

  // 이메일 OTP: 크레딧 환불 등 (소셜 로그인·비밀번호 없음 계정 포함)
  app.post("/api/auth/send-sensitive-otp", isAuthenticated, async (req, res) => {
    const purpose = (req.body as { purpose?: unknown }).purpose;
    if (purpose !== SENSITIVE_OTP_PURPOSE_CREDIT_REFUND) {
      return res.status(400).json({ message: "지원하지 않는 인증 유형입니다." });
    }
    const userId = (req.user as any).claims?.sub as string | undefined;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const result = await sendCreditRefundOtp(userId);
    if ("error" in result) {
      return res.status(result.status).json({ message: result.error });
    }
    return res.json({ success: true });
  });

  app.post("/api/auth/verify-sensitive-otp", isAuthenticated, async (req, res) => {
    const purpose = (req.body as { purpose?: unknown }).purpose;
    const code = (req.body as { code?: unknown }).code;
    if (purpose !== SENSITIVE_OTP_PURPOSE_CREDIT_REFUND) {
      return res.status(400).json({ message: "지원하지 않는 인증 유형입니다." });
    }
    if (typeof code !== "string") {
      return res.status(400).json({ message: "인증 코드를 입력해 주세요" });
    }
    const userId = (req.user as any).claims?.sub as string | undefined;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const result = await verifyCreditRefundOtp(userId, code);
    if ("error" in result) {
      return res.status(result.status).json({ message: result.error });
    }
    return res.json({ success: true, refundProofToken: result.refundProofToken });
  });

  /** SNS 등 이메일 미등록 계정: 입력 주소로 OTP → 검증 후 users.email 저장 */
  app.post("/api/auth/send-account-email-otp", isAuthenticated, async (req, res) => {
    const email = (req.body as { email?: unknown }).email;
    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ message: "이메일을 입력해 주세요" });
    }
    const userId = (req.user as any).claims?.sub as string | undefined;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const result = await sendAccountEmailVerificationOtp(userId, email);
    if ("error" in result) {
      return res.status(result.status).json({ message: result.error });
    }
    return res.json({ success: true });
  });

  app.post("/api/auth/verify-account-email-otp", isAuthenticated, async (req, res) => {
    const email = (req.body as { email?: unknown }).email;
    const code = (req.body as { code?: unknown }).code;
    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ message: "이메일을 입력해 주세요" });
    }
    if (typeof code !== "string") {
      return res.status(400).json({ message: "인증 코드를 입력해 주세요" });
    }
    const userId = (req.user as any).claims?.sub as string | undefined;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const result = await verifyAccountEmailBind(userId, email, code);
    if ("error" in result) {
      return res.status(result.status).json({ message: result.error });
    }
    return res.json({ success: true });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  if (!req.isAuthenticated() || !user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};
