/**
 * 배포 시 서버 DB에 필요한 테이블/컬럼을 한 번에 적용합니다.
 * (이미 있으면 IF NOT EXISTS / ADD COLUMN IF NOT EXISTS 로 건너뜀)
 * 실행: npm run db:deploy  또는  npx tsx script/run-all-deploy-migrations.ts
 */
import "dotenv/config";
import pg from "pg";
import { readFileSync, existsSync } from "fs";
import path from "path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL이 .env에 없습니다.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url.replace(/^postgresql:/, "postgres:"),
});

const MIGRATIONS: { file: string; name: string }[] = [
  { file: "create-analytics-table.sql", name: "analytics_visits" },
  { file: "site-announcements.sql", name: "site_announcements" },
  { file: "guide-videos.sql", name: "guide_videos" },
  { file: "create-curated-playlists.sql", name: "curated_playlists" },
  { file: "create-push-subscriptions-and-notify-prefs.sql", name: "push_subscriptions + user 알림 설정" },
  { file: "radio-channels.sql", name: "radio_channels" },
  { file: "radio-chat-and-requests.sql", name: "radio_chat_messages + radio_song_requests" },
  { file: "radio-channel-staff.sql", name: "radio_channel_staff" },
  { file: "radio-channel-playlist-snapshot.sql", name: "radio_channel_playlist_snapshot" },
  { file: "radio-now-playing-object-path.sql", name: "radio_channels 로컬 송출 컬럼" },
  { file: "create-ai-music-usage.sql", name: "ai_music_usage" },
  { file: "create-ai-music-generation-logs.sql", name: "ai_music_generation_logs" },
  { file: "music-ai-provider-column.sql", name: "music ai_provider 컬럼" },
  { file: "notify-activity-email.sql", name: "users notify_activity_email 컬럼" },
  { file: "credit-refund-requests.sql", name: "credit_refund_requests" },
];

async function main() {
  const deployDir = path.join(process.cwd(), "deploy");
  try {
    await client.connect();
    for (const { file, name } of MIGRATIONS) {
      const sqlPath = path.join(deployDir, file);
      if (!existsSync(sqlPath)) {
        console.log(`[skip] ${file} (파일 없음)`);
        continue;
      }
      const sql = readFileSync(sqlPath, "utf8");
      await client.query(sql);
      console.log(`[ok] ${name}`);
    }
    console.log("db:deploy 완료.");
  } catch (e: unknown) {
    console.error("실행 오류:", (e as Error)?.message || e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
