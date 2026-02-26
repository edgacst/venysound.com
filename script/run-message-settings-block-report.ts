/**
 * 메시지 수신 설정, 차단, 신고 테이블/컬럼 추가
 * 사용법: npx tsx script/run-message-settings-block-report.ts
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
      ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_direct_messages BOOLEAN DEFAULT true;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_blocks (
        id SERIAL PRIMARY KEY,
        blocker_id TEXT NOT NULL REFERENCES users(id),
        blocked_id TEXT NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(blocker_id, blocked_id)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_reports (
        id SERIAL PRIMARY KEY,
        reporter_id TEXT NOT NULL REFERENCES users(id),
        reported_user_id TEXT NOT NULL REFERENCES users(id),
        reason TEXT NOT NULL,
        message_id INTEGER REFERENCES direct_messages(id),
        conversation_id INTEGER REFERENCES conversations(id),
        status TEXT DEFAULT 'pending',
        admin_note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✅ 메시지 설정·차단·신고 테이블/컬럼이 추가되었습니다.");
  } catch (err: any) {
    console.error("❌ 오류:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
