/**
 * venysound.com(배포 사이트)에서 누락된 음원 파일을 다운로드하여 local-uploads에 저장합니다.
 *
 * 사용법:
 *   npm run download-files
 *
 * 요구사항:
 *   - .env에 DATABASE_URL 설정 (로컬 DB)
 *   - 배포 사이트(venysound.com)가 음원을 서빙 중이어야 함
 *
 * 환경변수:
 *   PRODUCTION_URL - 배포 사이트 URL (기본: https://venysound.com)
 */
import "dotenv/config";
import path from "path";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import { db } from "../server/db";
import { music } from "../shared/schema";

const PRODUCTION_BASE = process.env.PRODUCTION_URL || "https://venysound.com";
const UPLOADS_DIR = path.resolve(process.cwd(), "local-uploads", "uploads");

function extractFileId(fn: string): string {
  if (!fn) return "";
  const objMatch = fn.match(/\/objects\/uploads\/(.+)$/);
  if (objMatch) return objMatch[1];
  if (fn.startsWith("uploads/")) return fn.replace(/^uploads\//, "");
  if (/^[a-f0-9-]{36}(\.[a-z]+)?$/i.test(fn.trim())) return fn.trim();
  if (fn.includes("/")) return fn.split("/").pop() || "";
  return fn.replace(/^\//, "");
}

function getSaveAs(fileId: string): string {
  const hasExt = /\.(mp3|wav|ogg)$/i.test(fileId);
  return hasExt ? fileId : `${fileId.replace(/\.(mp3|wav|ogg)$/i, "")}.mp3`;
}

async function downloadFile(saveAs: string): Promise<boolean> {
  const baseId = saveAs.replace(/\.(mp3|wav|ogg)$/i, "");
  const candidates = [saveAs, baseId, `${baseId}.mp3`, `${baseId}.wav`, `${baseId}.ogg`];
  const toTry = [...new Set(candidates)];
  for (const name of toTry) {
    const url = `${PRODUCTION_BASE}/objects/uploads/${name}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const destPath = path.join(UPLOADS_DIR, saveAs);
        writeFileSync(destPath, buf);
        return true;
      }
    } catch (e) {
      // try next candidate
    }
  }
  return false;
}

async function main() {
  mkdirSync(UPLOADS_DIR, { recursive: true });

  const all = await db.select({ id: music.id, title: music.title, artist: music.artist, filename: music.filename }).from(music);
  const missing: { id: number; title: string; artist: string; saveAs: string }[] = [];

  for (const m of all) {
    const fileId = extractFileId(m.filename || "");
    if (!fileId) continue;
    const saveAs = getSaveAs(fileId);
    const localPath = path.join(UPLOADS_DIR, saveAs);
    const baseId = fileId.replace(/\.(mp3|wav|ogg)$/i, "");
    const hasLocal =
      existsSync(localPath) ||
      existsSync(path.join(UPLOADS_DIR, fileId)) ||
      existsSync(path.join(UPLOADS_DIR, `${baseId}.mp3`)) ||
      existsSync(path.join(UPLOADS_DIR, `${baseId}.wav`)) ||
      existsSync(path.join(UPLOADS_DIR, `${baseId}.ogg`));
    if (!hasLocal) {
      missing.push({ id: m.id, title: m.title, artist: m.artist, saveAs });
    }
  }

  if (missing.length === 0) {
    console.log("모든 음원 파일이 이미 로컬에 있습니다.");
    process.exit(0);
    return;
  }

  console.log(`누락된 ${missing.length}개 파일을 ${PRODUCTION_BASE} 에서 다운로드합니다.\n`);

  let ok = 0;
  let fail = 0;

  for (const item of missing) {
    process.stdout.write(`  [${ok + fail + 1}/${missing.length}] ${item.title} (${item.saveAs}) ... `);
    const success = await downloadFile(item.saveAs);
    if (success) {
      console.log("OK");
      ok++;
    } else {
      console.log("실패");
      fail++;
    }
  }

  console.log(`\n완료: ${ok}개 성공, ${fail}개 실패`);
  if (fail > 0) {
    console.log("\n실패한 파일은 venysound.com 에서 직접 서빙 중이지 않을 수 있습니다.");
    console.log("해당 파일은 별도로 준비하여 local-uploads/uploads/ 에 넣어주세요.");
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
