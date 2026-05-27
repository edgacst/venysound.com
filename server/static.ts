import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { injectSpaCanonicalPlaceholders } from "./spa-canonical";
import { injectAdSenseReviewContent } from "./spa-adsense";

/** index.ts 와 동일 — tsx(ESM) 에서는 __dirname 이 없을 수 있음 */
function projectRoot(): string {
  const g = globalThis as { __APP_ROOT__?: string };
  if (g.__APP_ROOT__ != null) return g.__APP_ROOT__;
  if (typeof __dirname !== "undefined") return path.resolve(__dirname, "..");
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function serveStatic(app: Express) {
  const distPath = path.join(projectRoot(), "dist", "public");
  const assetsPath = path.join(distPath, "assets");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  const indexPath = path.resolve(distPath, "index.html");
  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `SPA index 가 없습니다: ${indexPath}\n프로젝트 루트에서 npm run build (Vite → dist/public) 후 pm2 restart 하세요.`,
    );
  }
  let indexTemplate = fs.readFileSync(indexPath, "utf-8");
  if (!fs.existsSync(assetsPath)) {
    throw new Error(
      `SPA assets directory is missing: ${assetsPath}\nRun npm run build before restarting the server.`,
    );
  }

  const sendHashedAssetFallback = (req: Request, res: Response) => {
    const requested = path.basename(req.path);
    const requestedPath = path.join(assetsPath, requested);
    if (fs.existsSync(requestedPath)) {
      res.sendFile(requestedPath);
      return;
    }

    const match = /^(.+)-[A-Za-z0-9_-]+(\.(?:js|css|png|jpe?g|gif|svg|webp|woff2?))$/i.exec(requested);
    if (!match) {
      res.status(404).type("text/plain; charset=utf-8").send("asset not found");
      return;
    }

    const [, prefix, ext] = match;
    const replacement = fs
      .readdirSync(assetsPath)
      .filter((name) => name.startsWith(`${prefix}-`) && name.toLowerCase().endsWith(ext.toLowerCase()))
      .sort()
      .at(-1);
    if (!replacement) {
      res.status(404).type("text/plain; charset=utf-8").send("asset not found");
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(assetsPath, replacement));
  };

  /** AdSense ads.txt — 크롤러/대시보드가 text/plain 루트 파일을 기대 */
  const adsTxtPath = path.resolve(distPath, "ads.txt");
  app.get("/ads.txt", (_req, res) => {
    if (!fs.existsSync(adsTxtPath)) {
      res.status(404).setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.send("ads.txt missing — run npm run build after adding client/public/ads.txt\n");
    }
    res.status(200).setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.sendFile(adsTxtPath);
  });

  const sendSpaIndex = (req: Request, res: Response) => {
    let body = injectSpaCanonicalPlaceholders(indexTemplate, req);
    body = injectAdSenseReviewContent(body, req);
    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(body);
  };

  // 직접 /index.html 요청은 정적 파일로 나가면 캐노니컬 미주입 → 홈으로 통일
  app.get("/index.html", (req, res) => {
    const i = req.originalUrl.indexOf("?");
    const q = i >= 0 ? req.originalUrl.slice(i) : "";
    res.redirect(301, "/" + q);
  });

  // HTML은 캐시가 남으면 배포 반영이 안 된 것처럼 보이므로 no-store로 강제
  app.use(
    express.static(distPath, {
      // true면 GET / 가 디스크 index.html로 바로 나가 캐노니컬 주입(sendSpaIndex)을 건너뜀
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-store");
        }
      },
    }),
  );

  // Never let built asset requests fall through to SPA HTML. During a rolling or partial deploy,
  // stale HTML may reference an older hashed filename, so serve the latest matching asset when possible.
  app.get("/assets/:file", sendHashedAssetFallback);

  app.get("/", sendSpaIndex);
  // SPA: serve index.html for any other GET (e.g. /music/190). Express 5: /*splat does not match "/"
  app.get("/*splat", sendSpaIndex);
}
