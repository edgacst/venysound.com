import express, { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { injectSpaCanonicalPlaceholders } from "./spa-canonical";
import { injectAdSenseReviewContent } from "./spa-adsense";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: process.env.DISABLE_HMR === "1" ? false : {
      server,
      clientPort: parseInt(process.env.PORT || "5000", 10),
      path: "/_vite_hmr",
    },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      /** 기본 로거는 exit 하지 않음. 여기서 exit(1)을 두면 HMR/경고성 메시지에도 dev 서버가 즉시 종료될 수 있음 */
      error: (msg, options) => {
        viteLogger.error(msg, options);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Vite dev는 public의 ads.txt / app-ads.txt를 자동 노출하지 않을 수 있어 명시적으로 서빙
  const servePublicTextFile = (relativePath: string) => (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    const filePath = path.resolve(import.meta.dirname, "..", "client", "public", relativePath);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(filePath, (err) => {
      if (err) next(err);
    });
  };
  app.get("/ads.txt", servePublicTextFile("ads.txt"));
  app.get("/app-ads.txt", servePublicTextFile("app-ads.txt"));

  // DJ 스튜디오 목업 HTML은 Vite catch-all 전에 직접 서빙 (그렇지 않으면 SPA index.html이 반환됨)
  app.get("/radio-dj-ui-mockup.html", (_req, res, next) => {
    const filePath = path.resolve(import.meta.dirname, "..", "client", "public", "radio-dj-ui-mockup.html");
    res.sendFile(filePath, (err) => {
      if (err) next(err);
    });
  });

  // 재설계된 단순 송출실 (docs/RADIO_REDESIGN_2026.md)
  app.get("/radio-studio.html", (_req, res, next) => {
    const filePath = path.resolve(import.meta.dirname, "..", "client", "public", "radio-studio.html");
    res.sendFile(filePath, (err) => {
      if (err) next(err);
    });
  });

  app.use(vite.middlewares);

  const serveSpa = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.headers.upgrade === "websocket") return next();
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(import.meta.dirname, "..", "client", "index.html");
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = injectSpaCanonicalPlaceholders(template, req);
      template = injectAdSenseReviewContent(template, req);
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`);
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  };

  app.get("/", serveSpa);
  // Express 5: wildcard must be named; /*splat does not match "/" so we handle "/" above
  app.use("/*splat", serveSpa);
}
