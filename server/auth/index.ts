import crypto from "node:crypto";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as NaverStrategy } from "passport-naver-v2";
import { Strategy as KakaoStrategy } from "passport-kakao";
import { Strategy as FacebookStrategy } from "passport-facebook";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { databaseConnectionString } from "../db";
import { authStorage } from "./storage";
import { db } from "../db";
import { users } from "../../shared/models/auth";
import { eq, or } from "drizzle-orm";
import { sendWelcomeEmail } from "../email";
import {
  sendCreditRefundOtp,
  verifyCreditRefundOtp,
  SENSITIVE_OTP_PURPOSE_CREDIT_REFUND,
  sendAccountEmailVerificationOtp,
  verifyAccountEmailBind,
} from "../sensitiveOtp";
import { getLoginPagePath } from "../site-paths";

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
  /** www / apex 겸용 시 `.venysound.com` 처럼 앞에 점을 넣어 동일 세션 쿠키 공유 (OAuth 콜백 호스트와 청취 호스트가 다를 때 로그인 유지) */
  const cookieDomain = (process.env.SESSION_COOKIE_DOMAIN || "").trim() || undefined;
  return session({
    secret: process.env.SESSION_SECRET || "local-dev-secret-change-in-prod",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      maxAge: sessionTtl,
      sameSite: "lax",
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

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
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value || null;
            const firstName = profile.name?.givenName || profile.displayName?.split(" ")[0] || "";
            const lastName = profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || "";
            const profileImageUrl = profile.photos?.[0]?.value || "";
            const id = `google_${profile.id}`;
            const existing = await authStorage.getUser(id);
            const user = await authStorage.upsertUser({ id, email, firstName, lastName, profileImageUrl, registerSource: "google" });
            if (!existing && user.id === id && user.email) {
              sendWelcomeEmail(user.email, { username: user.firstName || firstName || "회원" }).catch((e) =>
                console.error("[auth] welcome email failed:", e)
              );
            }
            done(null, buildUserSession(user.id, user.email || email, user.firstName || firstName, user.lastName || lastName, user.profileImageUrl || profileImageUrl, accessToken, refreshToken));
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
      new NaverStrategy(
        {
          clientID: process.env.NAVER_CLIENT_ID!,
          clientSecret: process.env.NAVER_CLIENT_SECRET!,
          callbackURL: naverCallback,
        },
        async (accessToken: string, refreshToken: string, profile: any, done: any) => {
          try {
            const email = profile.email || null;
            const firstName = profile.name || profile.nickname || "";
            const profileImageUrl = profile.profileImage || "";
            const id = `naver_${profile.id}`;
            const existing = await authStorage.getUser(id);
            const user = await authStorage.upsertUser({ id, email, firstName, lastName: "", profileImageUrl, registerSource: "naver" });
            if (!existing && user.id === id && user.email) {
              sendWelcomeEmail(user.email, { username: user.firstName || firstName || "회원" }).catch((e) =>
                console.error("[auth] welcome email failed:", e)
              );
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
        },
        async (accessToken: string, refreshToken: string, profile: any, done: any) => {
          try {
            const kakaoAccount = profile._json?.kakao_account || {};
            const kakaoProfile = kakaoAccount.profile || {};
            const email = kakaoAccount.email || null;
            const firstName = kakaoProfile.nickname || profile.displayName || "";
            const profileImageUrl = kakaoProfile.profile_image_url || "";
            const id = `kakao_${profile.id}`;
            const existing = await authStorage.getUser(id);
            const user = await authStorage.upsertUser({ id, email, firstName, lastName: "", profileImageUrl, registerSource: "kakao" });
            if (!existing && user.id === id && user.email) {
              sendWelcomeEmail(user.email, { username: user.firstName || firstName || "회원" }).catch((e) =>
                console.error("[auth] welcome email failed:", e)
              );
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
        },
        async (accessToken: string, _refreshToken: string, profile: any, done: any) => {
          try {
            const email = profile.emails?.[0]?.value || null;
            const firstName = profile.name?.givenName || profile.displayName?.split(" ")[0] || "";
            const lastName = profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || "";
            const profileImageUrl = profile.photos?.[0]?.value || "";
            const id = `facebook_${profile.id}`;
            const existing = await authStorage.getUser(id);
            const user = await authStorage.upsertUser({ id, email, firstName, lastName, profileImageUrl, registerSource: "facebook" });
            if (!existing && user.id === id && user.email) {
              sendWelcomeEmail(user.email, { username: user.firstName || firstName || "회원" }).catch((e) =>
                console.error("[auth] welcome email failed:", e)
              );
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
    res.json({ hasGoogle, hasNaver, hasKakao, hasFacebook, hasTikTok });
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
      if (user.email) {
        const locale = typeof req.body?.locale === "string" ? req.body.locale : undefined;
        sendWelcomeEmail(user.email, { username: user.username, locale }).catch((e) =>
          console.error("[auth] welcome email failed:", e)
        );
      }
      const sessionUser = buildUserSession(user.id, user.email || null, user.firstName || username, "", "", "local");
      req.login(sessionUser, (err) => {
        if (err) return res.status(500).json({ error: "가입 후 로그인 실패" });
        res.json({ success: true, user: { id: user.id, username: user.username, email: user.email } });
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
        res.json({ success: true });
      });
    } catch (err) {
      console.error("Local login error:", err);
      res.status(500).json({ error: "로그인 실패" });
    }
  });

  // 개발용 로그인 (OAuth 없을 때만)
  app.post("/api/auth/dev-login", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "프로덕션 환경에서는 개발용 로그인을 사용할 수 없습니다." });
    }
    if (hasGoogle || hasNaver || hasKakao || hasFacebook || hasTikTok) {
      return res.status(400).json({ error: "OAuth가 설정되어 있어 개발용 로그인을 사용할 수 없습니다." });
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
        res.json({ success: true });
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
          req.login(user, (loginErr) => {
            if (loginErr) {
              console.error("[auth] Google session error:", loginErr);
              return res.redirect(`${getLoginPagePath()}?error=google`);
            }
            res.redirect("/");
          });
        })(req, res, next);
      }
    );
  }

  if (hasNaver) {
    app.get("/api/auth/naver", passport.authenticate("naver"));
    app.get("/api/auth/naver/callback", passport.authenticate("naver", { failureRedirect: getLoginPagePath(), successRedirect: "/" }));
  }

  if (hasKakao) {
    app.get("/api/auth/kakao", passport.authenticate("kakao"));
    app.get("/api/auth/kakao/callback", passport.authenticate("kakao", { failureRedirect: getLoginPagePath(), successRedirect: "/" }));
  }

  if (hasFacebook) {
    app.get("/api/auth/facebook", passport.authenticate("facebook", { scope: ["email", "public_profile"] }));
    app.get("/api/auth/facebook/callback", passport.authenticate("facebook", { failureRedirect: getLoginPagePath(), successRedirect: "/" }));
  }

  if (hasTikTok) {
    const tiktokCallbackUrl = process.env.SITE_URL
      ? `${process.env.SITE_URL.replace(/\/$/, "")}/api/auth/tiktok/callback`
      : "/api/auth/tiktok/callback";
    app.get("/api/auth/tiktok", (req, res) => {
      const state = crypto.randomBytes(24).toString("hex");
      (req.session as any).tiktokCsrfState = state;
      const base = "https://www.tiktok.com/v2/auth/authorize/";
      const params = new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        scope: "user.info.basic",
        response_type: "code",
        redirect_uri: tiktokCallbackUrl.startsWith("http") ? tiktokCallbackUrl : `${process.env.SITE_URL || "http://localhost:5000"}${tiktokCallbackUrl}`,
        state,
      });
      res.redirect(`${base}?${params.toString()}`);
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
        return res.redirect(`${getLoginPagePath()}?error=invalid_state`);
      }
      const redirectUri = tiktokCallbackUrl.startsWith("http") ? tiktokCallbackUrl : `${process.env.SITE_URL || "http://localhost:5000"}${tiktokCallbackUrl}`;
      try {
        const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_key: process.env.TIKTOK_CLIENT_KEY!,
            client_secret: process.env.TIKTOK_CLIENT_SECRET!,
            code,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
          }),
        });
        const tokenData = await tokenRes.json();
        if (tokenData.error || !tokenData.access_token || !tokenData.open_id) {
          console.error("TikTok token error:", tokenData);
          return res.redirect(`${getLoginPagePath()}?error=tiktok`);
        }
        const userRes = await fetch(
          "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
          {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          }
        );
        const userData = await userRes.json();
        const userInfo = userData?.data?.user ?? userData?.user;
        const openId = tokenData.open_id as string;
        const displayName = userInfo?.display_name ?? openId;
        const avatarUrl = userInfo?.avatar_url ?? "";
        const id = `tiktok_${openId}`;
        const user = await authStorage.upsertUser({
          id,
          email: null,
          firstName: displayName,
          lastName: "",
          profileImageUrl: avatarUrl,
          registerSource: "tiktok",
        });
        const sessionUser = buildUserSession(user.id, user.email ?? null, user.firstName ?? displayName, user.lastName ?? "", user.profileImageUrl ?? avatarUrl, tokenData.access_token, tokenData.refresh_token);
        req.login(sessionUser, (err) => {
          if (err) {
            console.error("TikTok login session error:", err);
            return res.redirect(`${getLoginPagePath()}?error=session`);
          }
          res.redirect("/");
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
