/**
 * users 테이블에 register_source 컬럼 추가
 * 사용법: 프로젝트 폴더에서 npx tsx script/add-register-source.ts
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
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS register_source VARCHAR(32);
    `);
    console.log("✅ users 테이블에 register_source 컬럼이 추가되었습니다.");
  } catch (err: any) {
    console.error("❌ 오류:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
