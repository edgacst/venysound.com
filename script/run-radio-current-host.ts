/**
 * radio_channels.current_host_id 컬럼 추가 (psql 없이 실행)
 * 실행: npx tsx script/run-radio-current-host.ts
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
  const sqlPath = path.join(process.cwd(), "script", "migrations", "005-radio-current-host.sql");
  const sql = readFileSync(sqlPath, "utf8");
  try {
    await client.connect();
    await client.query(sql);
    console.log("radio_channels.current_host_id 컬럼 적용 완료.");
  } catch (e: unknown) {
    console.error("실행 오류:", (e as Error)?.message || e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
