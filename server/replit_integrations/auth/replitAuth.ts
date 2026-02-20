import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as NaverStrategy } from "passport-naver-v2";
import { Strategy as KakaoStrategy } from "passport-kakao";
import { Strategy as FacebookStrategy } from "passport-facebook";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { databaseConnectionString } from "../../db";
import { authStorage } from "./storage";
import { db } from "../../db";
import { users } from "@shared/models/auth";
import { eq, or } from "drizzle-orm";

function buildUserSession(id: string, email: string | null, firstName: string, lastName: string, profileImageUrl: string, accessToken: string, refreshToken?: string) {
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
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/auth/google/callback",
        proxy: true,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value || null;
          const firstName = profile.name?.givenName || profile.displayName?.split(" ")[0] || "";
          const lastName = profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || "";
          const profileImageUrl = profile.photos?.[0]?.value || "";

          const id = `google_${profile.id}`;
          const user = await authStorage.upsertUser({ id, email, firstName, lastName, profileImageUrl });
          done(null, buildUserSession(user.id, user.email || email, user.firstName || firstName, user.lastName || lastName, user.profileImageUrl || profileImageUrl, accessToken, refreshToken));
        } catch (error) {
          done(error as Error);
        }
      }
    )
  );
  }

  if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
    const naverCallback = process.env.SITE_URL
      ? `${process.env.SITE_URL.replace(/\/$/, "")}/api/auth/naver/callback`
      : "/api/auth/naver/callback";
    passport.use(
      new NaverStrategy(
      {
        clientID: process.env.NAVER_CLIENT_ID,
        clientSecret: process.env.NAVER_CLIENT_SECRET,
        callbackURL: naverCallback,
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          const email = profile.email || null;
          const firstName = profile.name || profile.nickname || "";
          const lastName = "";
          const profileImageUrl = profile.profileImage || "";

          const id = `naver_${profile.id}`;
          const user = await authStorage.upsertUser({ id, email, firstName, lastName, profileImageUrl });
          done(null, buildUserSession(user.id, user.email || email, user.firstName || firstName, user.lastName || lastName, user.profileImageUrl || profileImageUrl, accessToken, refreshToken));
        } catch (error) {
          done(error as Error);
        }
      }
    )
  );
  }

  if (process.env.KAKAO_CLIENT_ID && process.env.KAKAO_CLIENT_SECRET) {
    const kakaoCallback = process.env.SITE_URL
      ? `${process.env.SITE_URL.replace(/\/$/, "")}/api/auth/kakao/callback`
      : "/api/auth/kakao/callback";
    passport.use(
      new KakaoStrategy(
      {
        clientID: process.env.KAKAO_CLIENT_ID,
        clientSecret: process.env.KAKAO_CLIENT_SECRET,
        callbackURL: kakaoCallback,
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          const kakaoAccount = profile._json?.kakao_account || {};
          const kakaoProfile = kakaoAccount.profile || {};
          const email = kakaoAccount.email || null;
          const firstName = kakaoProfile.nickname || profile.displayName || "";
          const lastName = "";
          const profileImageUrl = kakaoProfile.profile_image_url || "";

          const id = `kakao_${profile.id}`;
          const user = await authStorage.upsertUser({ id, email, firstName, lastName, profileImageUrl });
          done(null, buildUserSession(user.id, user.email || email, user.firstName || firstName, user.lastName || lastName, user.profileImageUrl || profileImageUrl, accessToken, refreshToken));
        } catch (error) {
          done(error as Error);
        }
      }
    )
  );
  }

  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    const facebookCallback = process.env.SITE_URL
      ? `${process.env.SITE_URL.replace(/\/$/, "")}/api/auth/facebook/callback`
      : "/api/auth/facebook/callback";
    passport.use(
      new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
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
          const user = await authStorage.upsertUser({ id, email, firstName, lastName, profileImageUrl });
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

  const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const hasNaver = !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
  const hasKakao = !!(process.env.KAKAO_CLIENT_ID && process.env.KAKAO_CLIENT_SECRET);
  const hasFacebook = !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);

  app.get("/api/auth/login-options", (_req, res) => {
    res.json({ hasGoogle, hasNaver, hasKakao, hasFacebook });
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
    if (password.length < 6) {
      return res.status(400).json({ error: "비밀번호는 6자 이상이어야 합니다." });
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
        .values({ username, email, passwordHash, firstName: username, role: "user" })
        .returning();
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

  app.post("/api/auth/dev-login", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "프로덕션 환경에서는 개발용 로그인을 사용할 수 없습니다." });
    }
    if (hasGoogle || hasNaver || hasKakao || hasFacebook) {
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
      const session = buildUserSession(user.id, user.email || null, user.firstName || "", user.lastName || "", user.profileImageUrl || "", "dev");
      req.login(session, (err) => {
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
    else res.redirect("/?msg=로그인_설정_필요");
  });

  if (hasGoogle) {
    app.get(
      "/api/auth/google",
      passport.authenticate("google", {
        scope: ["profile", "email"],
        prompt: "select_account",
      })
    );
    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", {
        failureRedirect: "/login",
        successRedirect: "/",
      })
    );
  }

  if (hasNaver) {
    app.get("/api/auth/naver", passport.authenticate("naver"));
    app.get(
      "/api/auth/naver/callback",
      passport.authenticate("naver", {
        failureRedirect: "/login",
        successRedirect: "/",
      })
    );
  }

  if (hasKakao) {
    app.get("/api/auth/kakao", passport.authenticate("kakao"));
    app.get(
      "/api/auth/kakao/callback",
      passport.authenticate("kakao", {
        failureRedirect: "/login",
        successRedirect: "/",
      })
    );
  }

  if (hasFacebook) {
    app.get("/api/auth/facebook", passport.authenticate("facebook", { scope: ["email", "public_profile"] }));
    app.get(
      "/api/auth/facebook/callback",
      passport.authenticate("facebook", {
        failureRedirect: "/login",
        successRedirect: "/",
      })
    );
  }

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.redirect("/");
      });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  return next();
};
