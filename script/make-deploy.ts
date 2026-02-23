/**
 * 배포 패키지 생성 스크립트
 * 실행: npx tsx script/make-deploy.ts
 *
 * 실행 후 deploy-package/ 폴더 내용을 서버 /var/www/venysound/app/ 에 통째로 올리면 됩니다.
 */

import { execSync } from "child_process";
import { cpSync, rmSync, mkdirSync, existsSync, copyFileSync } from "fs";
import path from "path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "deploy-package");

console.log("⚠️  배포 전 확인: shared/schema.ts 또는 shared/models/ 에 테이블·컬럼 추가했다면");
console.log("   → script/migrations/ 의 SQL을 서버 DB에 먼저 실행했는지 확인하세요. (docs/DEPLOY-CHECKLIST.md)\n");
console.log("🔨 1단계: 빌드 중...");
execSync("npm run build", { stdio: "inherit" });

console.log("\n📦 2단계: 배포 패키지 생성 중...");

// 기존 deploy-package 폴더 삭제 후 재생성
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// dist/ 복사
cpSync(path.join(ROOT, "dist"), path.join(OUT, "dist"), { recursive: true });
console.log("  ✅ dist/ 복사 완료");

// package.json, package-lock.json
copyFileSync(path.join(ROOT, "package.json"), path.join(OUT, "package.json"));
copyFileSync(path.join(ROOT, "package-lock.json"), path.join(OUT, "package-lock.json"));
console.log("  ✅ package.json 복사 완료");

// ecosystem.config.cjs (PM2 설정)
copyFileSync(path.join(ROOT, "ecosystem.config.cjs"), path.join(OUT, "ecosystem.config.cjs"));
console.log("  ✅ ecosystem.config.cjs 복사 완료");

console.log(`
✨ 완료! deploy-package/ 폴더가 생성되었습니다.

📋 서버 업로드 방법 (FileZilla) — 꼭 지켜주세요:
  1. 로컬: deploy-package/ "안에 있는" dist, package.json, package-lock.json, ecosystem.config.cjs 만 선택
  2. 원격: /var/www/venysound/app/ 안으로 "넣기" (덮어쓰기)
     → app/ 안의 .env, local-uploads 폴더는 절대 삭제하거나 덮어쓰지 마세요.
  3. 서버 터미널에서 실행:
     cd /var/www/venysound/app && npm install --omit=dev && pm2 restart venysound

⚠️  서버에 반드시 있어야 하는 것 (올리지 말고 그대로 두기):
  - .env (DB 주소, SESSION_SECRET, OAuth 키 등) → 없으면 로그인/DB 연결 안 됨
  - local-uploads/ (음원 파일) → 없으면 음원 재생 안 됨
`);
