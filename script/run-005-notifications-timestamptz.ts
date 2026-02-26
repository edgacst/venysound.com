/**
 * notifications.created_at 을 TIMESTAMPTZ 로 변경 (알림 시간 한국 시간으로 맞추기)
 * 기존 데이터: DB에 저장된 시간이 서버 로컬(KST)이었다면, 마이그레이션 시 세션을 Asia/Seoul 로 두고 실행하세요.
 * 사용법: npx tsx script/run-005-notifications-timestamptz.ts
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
    // 기존 값이 KST로 저장됐다면, 세션을 Asia/Seoul 로 두고 변환하면 UTC로 올바르게 저장됨
    await pool.query(`SET timezone = 'Asia/Seoul'`);
    await pool.query(`
      ALTER TABLE notifications
      ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE current_setting('TIMEZONE');
    `);
    console.log("✅ notifications.created_at 이 TIMESTAMPTZ 로 변경되었습니다.");
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
