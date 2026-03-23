import path from "path";
import { fileURLToPath } from "url";

// 프로덕션(dist/index.cjs): 배너로 주입된 __APP_ROOT__ 사용.
// 개발(tsx): __dirname(tsx가 제공) 또는 import.meta.url 기준으로 프로젝트 루트
const APP_ROOT =
  (globalThis as any).__APP_ROOT__ != null
    ? (globalThis as any).__APP_ROOT__
    : typeof __dirname !== "undefined"
      ? path.resolve(__dirname, "..")
      : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(APP_ROOT);

import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { pool } from "./db";

// 마이그레이션 SQL을 코드에 직접 내장 (파일 읽기 방식은 배포 패키지에 포함 안 됨)
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "001-add-payload-donation-badge",
    sql: `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payload JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS donation_badge VARCHAR(32);`,
  },
  {
    name: "002-add-register-source",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS register_source VARCHAR(32);`,
  },
  {
    name: "003-message-settings-block-report",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_direct_messages BOOLEAN DEFAULT true;
CREATE TABLE IF NOT EXISTS user_blocks (
  id SERIAL PRIMARY KEY,
  blocker_id TEXT NOT NULL REFERENCES users(id),
  blocked_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);
CREATE TABLE IF NOT EXISTS user_reports (
  id SERIAL PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  reported_user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  message_id INTEGER,
  conversation_id INTEGER,
  status TEXT DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);`,
  },
  {
    name: "004-credit-transactions-timestamptz",
    sql: `ALTER TABLE credit_transactions ALTER COLUMN created_at TYPE TIMESTAMPTZ;`,
  },
  {
    name: "008-notify-activity-email",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_activity_email boolean NOT NULL DEFAULT true;`,
  },
  {
    name: "009-notify-music-email-push",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_new_music_email boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_new_music_push boolean NOT NULL DEFAULT true;`,
  },
  {
    name: "010-ai-music-tables",
    sql: `CREATE TABLE IF NOT EXISTS ai_music_usage (
  user_id VARCHAR NOT NULL,
  period_month VARCHAR NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, period_month)
);
CREATE TABLE IF NOT EXISTS ai_music_generation_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  billing_kind VARCHAR(32) NOT NULL,
  subscription_tier_at VARCHAR(32),
  provider VARCHAR(32) NOT NULL,
  task_id VARCHAR(128),
  request_title VARCHAR(512),
  request_summary TEXT,
  credits_charged INTEGER NOT NULL DEFAULT 0,
  publishments JSONB DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_ai_music_gen_logs_user ON ai_music_generation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_music_gen_logs_task ON ai_music_generation_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_ai_music_gen_logs_created ON ai_music_generation_logs(created_at);`,
  },
  {
    name: "011-distribution-core",
    sql: `CREATE TABLE IF NOT EXISTS distribution_releases (
  id SERIAL PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  music_id INTEGER NOT NULL REFERENCES music(id),
  release_title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  rights_confirmed BOOLEAN NOT NULL DEFAULT false,
  release_date TIMESTAMP,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by_user_id TEXT REFERENCES users(id),
  rejection_reason TEXT,
  external_release_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS distribution_releases_music_unique ON distribution_releases(music_id);
CREATE INDEX IF NOT EXISTS idx_distribution_releases_owner_status ON distribution_releases(owner_user_id, status);

CREATE TABLE IF NOT EXISTS distribution_splits (
  id SERIAL PRIMARY KEY,
  release_id INTEGER NOT NULL REFERENCES distribution_releases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  split_bps INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS distribution_splits_release_user_unique ON distribution_splits(release_id, user_id);

CREATE TABLE IF NOT EXISTS distribution_earnings_ledger (
  id SERIAL PRIMARY KEY,
  release_id INTEGER NOT NULL REFERENCES distribution_releases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  period_month TEXT NOT NULL,
  gross_amount INTEGER NOT NULL DEFAULT 0,
  platform_fee_amount INTEGER NOT NULL DEFAULT 0,
  net_amount INTEGER NOT NULL DEFAULT 0,
  user_amount INTEGER NOT NULL DEFAULT 0,
  platform_amount INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  external_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS distribution_earnings_external_ref_unique ON distribution_earnings_ledger(external_ref);
CREATE INDEX IF NOT EXISTS idx_distribution_earnings_user_month ON distribution_earnings_ledger(user_id, period_month);

CREATE TABLE IF NOT EXISTS distribution_payouts (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  note TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_distribution_payouts_user_status ON distribution_payouts(user_id, status);`,
  },
];

async function runAutoMigrations() {
  // 마이그레이션 추적 테이블 생성
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (
    name VARCHAR PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  const { rows } = await pool.query<{ name: string }>(`SELECT name FROM _migrations`);
  const applied = new Set(rows.map((r) => r.name));

  for (const { name, sql } of MIGRATIONS) {
    if (applied.has(name)) continue;
    try {
      await pool.query(sql);
      await pool.query(`INSERT INTO _migrations(name) VALUES($1) ON CONFLICT DO NOTHING`, [name]);
      console.log(`[migrate] ✓ ${name}`);
    } catch (err: any) {
      console.error(`[migrate] ✗ ${name}:`, err.message);
    }
  }
}

const app = express();
const httpServer = createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    await runAutoMigrations();
  } catch (err) {
    console.error("[migrate] 마이그레이션 실행 중 오류:", err);
  }
  try {
    await seedDatabase();
  } catch (err) {
    console.error("[seed] Error seeding database:", err);
    console.error("[seed] DB 연결 실패 시 .env의 DATABASE_URL 비밀번호를 확인하세요.");
  }
  await registerRoutes(httpServer, app);

  const sunoRaw = (process.env.SUNOAPI_API_KEY ?? "").replace(/^\uFEFF/, "").replace(/\r\n?|\n/g, "").trim();
  const aimusicRaw = (process.env.AIMUSICAPI_API_KEY ?? "").replace(/^\uFEFF/, "").replace(/\r\n?|\n/g, "").trim();
  if (sunoRaw) {
    log(`[aimusic] Suno API (sunoapi.org) 키 설정됨 (길이 ${sunoRaw.length}) — create-music 사용 가능`);
  } else if (aimusicRaw) {
    log(`[aimusic] AIMusicAPI 키 설정됨 (길이 ${aimusicRaw.length}) — create-music 사용 가능`);
  } else {
    log("[aimusic] API key 없음 — .env에 SUNOAPI_API_KEY 또는 AIMUSICAPI_API_KEY 설정 시 /create-music에서 음악 생성 가능");
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.HOST || (process.platform === "win32" ? "127.0.0.1" : "0.0.0.0");
  httpServer.listen(
    {
      port,
      host,
      ...(process.platform !== "win32" && { reusePort: true }),
    },
    () => {
      log(`serving on port ${port}`);
      const url = host === "0.0.0.0" ? `http://localhost:${port}` : `http://${host}:${port}`;
      log(`로컬 테스트: 브라우저에서 ${url} 로 접속하세요.`);
    },
  );
})();
