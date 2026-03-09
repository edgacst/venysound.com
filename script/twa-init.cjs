/**
 * TWA(Trusted Web Activity) 프로젝트 초기화
 * android-twa 폴더를 만들고 bubblewrap init 실행 (대화형)
 * 실행: node script/twa-init.cjs
 */
const { mkdirSync, existsSync } = require("fs");
const { resolve } = require("path");
const { spawn } = require("child_process");

const ROOT = resolve(__dirname, "..");
const TWA_DIR = resolve(ROOT, "android-twa");
const MANIFEST_URL = "https://venysound.com/manifest.json";

if (existsSync(TWA_DIR)) {
  console.log("android-twa 폴더가 이미 있습니다. 해당 폴더에서 직접 다음을 실행하세요:");
  console.log("  npx --yes @bubblewrap/cli init --manifest=" + MANIFEST_URL);
  console.log("  npx --yes @bubblewrap/cli build");
  process.exit(0);
}

mkdirSync(TWA_DIR, { recursive: true });
console.log("android-twa 폴더를 생성했습니다. bubblewrap init을 실행합니다 (패키지명 등 입력 필요).\n");

const child = spawn(
  "npx",
  ["--yes", "@bubblewrap/cli", "init", "--manifest=" + MANIFEST_URL],
  { cwd: TWA_DIR, stdio: "inherit", shell: true }
);
child.on("exit", (code) => process.exit(code ?? 0));
