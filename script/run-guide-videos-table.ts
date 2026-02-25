/**
 * .env의 DATABASE_URL로 guide_videos 테이블만 생성 (다른 테이블은 건드리지 않음)
 * 실행: npx tsx script/run-guide-videos-table.ts
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
  const sqlPath = path.join(process.cwd(), "deploy", "guide-videos.sql");
  const sql = readFileSync(sqlPath, "utf8");
  try {
    await client.connect();
    await client.query(sql);
    console.log("guide_videos 테이블 생성/보강 완료.");
  } catch (e: any) {
    console.error("실행 오류:", e?.message || e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

