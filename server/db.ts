import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import * as schema from "@shared/schema";

// 프로덕션 CJS 번들에서는 __dirname 사용. ESM(tsx)에서는 import.meta.url 사용. (CJS에서 import.meta 참조 시 esbuild 경고 방지 위해 __dirname 먼저)
const _dir =
  typeof __dirname !== "undefined"
    ? __dirname
    : typeof import.meta !== "undefined" && import.meta.url
      ? path.dirname(fileURLToPath(import.meta.url))
      : process.cwd();
const envPath = path.resolve(_dir, "..", ".env");
dotenv.config({ path: envPath, override: true });
if (!process.env.DATABASE_URL?.startsWith("postgresql://") && !process.env.DATABASE_URL?.startsWith("postgres://")) {
  dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: true });
}

const { Pool } = pg;

const rawUrl = process.env.DATABASE_URL ?? "";
if (!rawUrl || rawUrl.includes("여기에") || rawUrl.includes("복붙")) {
  throw new Error(
    "DATABASE_URL must be set in .env (e.g. postgresql://user:password@host:port/dbname). Remove any placeholder text.",
  );
}

/** pg 연결 설정 (SCRAM 오류 방지: password는 반드시 string) */
function getPoolConfig() {
  const url = process.env.DATABASE_URL!.replace(/^postgresql:/, "postgres:");
  const parsed = new URL(url);
  const password = parsed.password ?? "";
  return {
    host: parsed.hostname || "localhost",
    port: parseInt(parsed.port || "5432", 10),
    database: (parsed.pathname.slice(1) || "venysound").replace(/\/$/, ""),
    user: parsed.username || "postgres",
    password: String(password),
  };
}

const poolConfig = getPoolConfig();
export const pool = new Pool(poolConfig);
export const db = drizzle(pool, { schema });

/** 세션 스토어용 연결 문자열 */
export const databaseConnectionString =
  `postgresql://${poolConfig.user}:${encodeURIComponent(poolConfig.password)}@${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`;
