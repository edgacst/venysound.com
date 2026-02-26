/**
 * 기존 회원의 register_source 한 번에 채우기 (가입 경로가 비어 있는 회원만)
 * 사용법: 프로젝트 폴더에서 npx tsx script/backfill-register-source.ts
 */
import "dotenv/config";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ .env에 DATABASE_URL이 없습니다.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

function getSourceFromId(id: string): string {
  if (id.startsWith("google_")) return "google";
  if (id.startsWith("naver_")) return "naver";
  if (id.startsWith("kakao_")) return "kakao";
  if (id.startsWith("facebook_")) return "facebook";
  if (id.startsWith("tiktok_")) return "tiktok";
  return "email";
}

async function main() {
  try {
    const res = await pool.query(
      `SELECT id FROM users WHERE register_source IS NULL`
    );
    const rows = res.rows as { id: string }[];
    if (rows.length === 0) {
      console.log("✅ 채울 회원이 없습니다. (이미 다 채워져 있음)");
      return;
    }
    let updated = 0;
    for (const row of rows) {
      const source = getSourceFromId(row.id);
      await pool.query(
        `UPDATE users SET register_source = $1 WHERE id = $2`,
        [source, row.id]
      );
      updated++;
    }
    console.log(`✅ ${updated}명 회원의 가입 경로를 채웠습니다.`);
  } catch (err: any) {
    console.error("❌ 오류:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
