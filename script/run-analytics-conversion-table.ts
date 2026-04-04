/**
 * analytics_conversion_events 테이블 생성 (psql 없이)
 * 실행: npm run db:analytics-conversion
 */
import "dotenv/config";
import pg from "pg";
import { readFileSync } from "fs";
import path from "path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL이 .env에 없습니다.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url.replace(/^postgresql:/, "postgres:"),
});

async function main() {
  const sqlPath = path.join(process.cwd(), "deploy", "create-analytics-conversion-events.sql");
  const sql = readFileSync(sqlPath, "utf8");
  try {
    await client.connect();
    await client.query(sql);
    console.log("analytics_conversion_events 테이블 생성 완료.");
  } catch (e: unknown) {
    console.error("실행 오류:", (e as Error)?.message || e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

void main();
