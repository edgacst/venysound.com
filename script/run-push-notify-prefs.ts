/**
 * push_subscriptions 테이블 및 users 알림 설정 컬럼 생성
 * 실행: npm run db:push-notify  또는  npx tsx script/run-push-notify-prefs.ts
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
  const sqlPath = path.join(process.cwd(), "deploy", "create-push-subscriptions-and-notify-prefs.sql");
  const sql = readFileSync(sqlPath, "utf8");
  try {
    await client.connect();
    await client.query(sql);
    console.log("push_subscriptions 및 notify_new_music_* 컬럼 적용 완료.");
  } catch (e: unknown) {
    console.error("실행 오류:", (e as Error)?.message || e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
