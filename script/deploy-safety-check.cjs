#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const publicDir = path.join(root, "dist", "public");
const indexPath = path.join(publicDir, "index.html");
const buildJsonPath = path.join(publicDir, "build.json");

function fail(message) {
  console.error(`[deploy-check] FAIL: ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`[deploy-check] OK: ${message}`);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractAssetPaths(html) {
  const matches = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

async function checkUrl(url) {
  const res = await fetch(url, { method: "HEAD", redirect: "manual" });
  const contentType = res.headers.get("content-type") || "";
  return { status: res.status, contentType };
}

async function main() {
  if (!fs.existsSync(indexPath)) {
    fail(`missing ${path.relative(root, indexPath)}. Run npm run build first.`);
    return;
  }

  const html = readText(indexPath);
  const assetPaths = extractAssetPaths(html);
  if (assetPaths.length === 0) {
    fail("index.html does not reference any /assets files.");
  } else {
    ok(`index.html references ${assetPaths.length} built asset(s).`);
  }

  for (const assetPath of assetPaths) {
    const filePath = path.join(publicDir, assetPath.replace(/^\//, ""));
    if (!fs.existsSync(filePath)) {
      fail(`missing referenced asset: ${assetPath}`);
      continue;
    }

    const ext = path.extname(filePath).toLowerCase();
    const bytes = fs.readFileSync(filePath);
    if ((ext === ".js" || ext === ".css") && bytes.slice(0, 64).toString("utf8").includes("<!DOCTYPE html")) {
      fail(`${assetPath} looks like HTML, not ${ext}`);
      continue;
    }
    ok(`${assetPath} exists (${bytes.length} bytes).`);
  }

  if (fs.existsSync(buildJsonPath)) {
    ok(`build.json ${readText(buildJsonPath).trim()}`);
  } else {
    fail("missing dist/public/build.json.");
  }

  const siteUrl = (process.argv[2] || process.env.SITE_URL || "").replace(/\/$/, "");
  if (!siteUrl) {
    console.log("[deploy-check] Skip live URL check. Pass https://venysound.com to verify production assets.");
    return;
  }

  for (const assetPath of assetPaths.filter((p) => /\.(js|css)$/i.test(p))) {
    const url = `${siteUrl}${assetPath}`;
    const { status, contentType } = await checkUrl(url);
    if (status < 200 || status >= 300) {
      fail(`${url} returned HTTP ${status}`);
      continue;
    }
    if (/\.js$/i.test(assetPath) && !/(javascript|ecmascript)/i.test(contentType)) {
      fail(`${url} returned ${contentType || "no content-type"} instead of JavaScript`);
      continue;
    }
    if (/\.css$/i.test(assetPath) && !/text\/css/i.test(contentType)) {
      fail(`${url} returned ${contentType || "no content-type"} instead of CSS`);
      continue;
    }
    ok(`${url} -> ${contentType}`);
  }
}

main().catch((err) => {
  fail(err && err.stack ? err.stack : String(err));
});
