import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
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
