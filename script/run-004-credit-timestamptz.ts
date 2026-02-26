/**
 * credit_transactions.created_at 을 TIMESTAMPTZ 로 변경
 * 사용법: npx tsx script/run-004-credit-timestamptz.ts
 */
import "dotenv/config";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ .env에 DATABASE_URL이 없습니다.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function main() {
  try {
    await pool.query(`
      ALTER TABLE credit_transactions
      ALTER COLUMN created_at TYPE TIMESTAMPTZ;
    `);
    console.log("✅ credit_transactions.created_at 이 TIMESTAMPTZ 로 변경되었습니다.");
  } catch (e: any) {
    if (e.code === "42704" || e.message?.includes("type") || e.message?.includes("already")) {
      console.log("ℹ️ 컬럼이 이미 TIMESTAMPTZ 이거나 변경할 수 없습니다.", e.message);
    } else {
      console.error("❌ 실행 실패:", e.message);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main();
