import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, copyFile, writeFile } from "fs/promises";
import { join } from "path";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  // 배포 반영 확인용: index.html에 빌드 시각 주입 (페이지 소스에서 확인 가능)
  const publicIndex = join(process.cwd(), "dist/public/index.html");
  try {
    let html = await readFile(publicIndex, "utf-8");
    const buildTime = new Date().toISOString();
    const buildComment = `<!-- build: ${buildTime} -->`;
    if (html.includes("<!-- build:")) {
      html = html.replace(/<!-- build: [^>]+ -->/, buildComment);
    } else {
      html = html.replace("</head>", `\n    ${buildComment}\n  </head>`);
    }
    await writeFile(publicIndex, html);
  } catch (_) {}

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
      "import.meta.url": '""',
    },
    // 번들 본문(의존성)보다 먼저 실행: PM2 cwd·ESM 호이스트와 무관하게 .env 로드
    banner: {
      js: "const path=require('path');var _vsRoot=path.resolve(__dirname,'..');globalThis.__APP_ROOT__=_vsRoot;process.chdir(_vsRoot);try{require('dotenv').config({path:path.join(_vsRoot,'.env'),override:true});}catch(e){console.error('[startup] dotenv',e&&e.message);}",
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // connect-pg-simple이 번들 안에서 __dirname=dist 로 table.sql을 찾으므로 복사
  await copyFile(
    join(process.cwd(), "node_modules/connect-pg-simple/table.sql"),
    join(process.cwd(), "dist/table.sql")
  );
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
