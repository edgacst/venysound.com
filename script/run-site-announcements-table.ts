/**
 * .env의 DATABASE_URL로 site_announcements 테이블 생성 (psql 없이 실행)
 * 실행: npx tsx script/run-site-announcements-table.ts
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
  const sqlPath = path.join(process.cwd(), "deploy", "site-announcements.sql");
  const sql = readFileSync(sqlPath, "utf8");
  try {
    await client.connect();
    await client.query(sql);
    console.log("site_announcements 테이블 생성 완료.");
  } catch (e: any) {
    console.error("실행 오류:", e?.message || e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
