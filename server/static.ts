import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // HTML은 캐시가 남으면 배포 반영이 안 된 것처럼 보이므로 no-store로 강제
  app.use(
    express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-store");
        }
      },
    }),
  );

  const indexPath = path.resolve(distPath, "index.html");
  app.get("/", (_req, res) => res.sendFile(indexPath));
  // SPA: serve index.html for any other GET (e.g. /music/190). Express 5: /*splat does not match "/"
  app.get("/*splat", (_req, res) => res.sendFile(indexPath));
}
