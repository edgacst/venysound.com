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

  // SPA: serve index.html for any GET that didn't match a file (so /music/190 etc. load the app)
  // Express 5: wildcard must be named (e.g. /*splat), plain * causes "Missing parameter name"
  app.get("/*splat", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
