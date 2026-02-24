/**
 * .env의 DATABASE_URL로 로컬 DB에 subscription_plans, payments 테이블 생성
 * 실행: npx tsx script/run-create-subscription-tables.ts
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
  const sqlPath = path.join(process.cwd(), "script", "create-subscription-tables.sql");
  let sql = readFileSync(sqlPath, "utf8");
  // GRANT 줄 제거 (postgres 슈퍼유저만 가능)
  sql = sql.replace(/\nGRANT .+;/g, "");
  try {
    await client.connect();
    await client.query(sql);
    console.log("subscription_plans, payments 테이블 생성 완료.");
  } catch (e: any) {
    console.error("실행 오류:", e?.message || e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
