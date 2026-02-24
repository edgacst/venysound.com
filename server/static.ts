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

  app.use(express.static(distPath));

  const indexPath = path.resolve(distPath, "index.html");
  app.get("/", (_req, res) => res.sendFile(indexPath));
  // SPA: serve index.html for any other GET (e.g. /music/190). Express 5: /*splat does not match "/"
  app.get("/*splat", (_req, res) => res.sendFile(indexPath));
}
