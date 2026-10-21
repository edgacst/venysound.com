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

  /** AdSense ads.txt / AdMob app-ads.txt — 크롤러가 text/plain 루트 파일을 기대 */
  const adsTxtPath = path.resolve(distPath, "ads.txt");
  const appAdsTxtPath = path.resolve(distPath, "app-ads.txt");
  const sendAdsTxtFile = (res: Response, filePath: string, label: string) => {
    if (!fs.existsSync(filePath)) {
      res.status(404).setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.send(`${label} missing — run npm run build after adding client/public/${label}\n`);
    }
    res.status(200).setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.sendFile(filePath);
  };
  app.get("/ads.txt", (_req, res) => sendAdsTxtFile(res, adsTxtPath, "ads.txt"));
  app.get("/app-ads.txt", (_req, res) => sendAdsTxtFile(res, appAdsTxtPath, "app-ads.txt"));

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

  app.get("/", sendSpaIndex);
  // SPA: serve index.html for any other GET (e.g. /music/190). Express 5: /*splat does not match "/"
  app.get("/*splat", sendSpaIndex);
}
