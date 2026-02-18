import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as NaverStrategy } from "passport-naver-v2";
import { Strategy as KakaoStrategy } from "passport-kakao";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";

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
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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

  passport.use(
    new NaverStrategy(
      {
        clientID: process.env.NAVER_CLIENT_ID!,
        clientSecret: process.env.NAVER_CLIENT_SECRET!,
        callbackURL: "/api/auth/naver/callback",
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

  passport.use(
    new KakaoStrategy(
      {
        clientID: process.env.KAKAO_CLIENT_ID!,
        clientSecret: process.env.KAKAO_CLIENT_SECRET!,
        callbackURL: "/api/auth/kakao/callback",
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

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (_req, res) => {
    res.redirect("/api/auth/google");
  });

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

  app.get(
    "/api/auth/naver",
    passport.authenticate("naver")
  );

  app.get(
    "/api/auth/naver/callback",
    passport.authenticate("naver", {
      failureRedirect: "/login",
      successRedirect: "/",
    })
  );

  app.get(
    "/api/auth/kakao",
    passport.authenticate("kakao")
  );

  app.get(
    "/api/auth/kakao/callback",
    passport.authenticate("kakao", {
      failureRedirect: "/login",
      successRedirect: "/",
    })
  );

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
