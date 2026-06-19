import type { Express, Request, Response } from "express";
import http from "node:http";

const DEFAULT_UPSTREAM = "http://127.0.0.1:3001";

function masteringUpstream(): URL {
  const raw = (process.env.MASTERING_UPSTREAM ?? DEFAULT_UPSTREAM).trim() || DEFAULT_UPSTREAM;
  return new URL(raw.endsWith("/") ? raw : `${raw}/`);
}

function forwardMasteringRequest(req: Request, res: Response, path: string): void {
  const upstream = masteringUpstream();

  const headers: http.OutgoingHttpHeaders = { ...req.headers, host: upstream.host };
  delete headers["content-length"];

  const proxyReq = http.request(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || (upstream.protocol === "https:" ? 443 : 80),
      path,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      const outHeaders = { ...proxyRes.headers };
      const status = proxyRes.statusCode ?? 502;

      if (status >= 300 && status < 400 && outHeaders.location) {
        const loc = String(outHeaders.location);
        if (/^\/mastering\/?(\?|$)/i.test(loc) || loc.includes("/mastering/")) {
          delete outHeaders.location;
          res.writeHead(200, outHeaders);
          proxyRes.pipe(res);
          return;
        }
      }

      res.writeHead(status, outHeaders);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (err) => {
    console.error("[mastering-proxy]", err.message);
    if (!res.headersSent) {
      res
        .status(502)
        .type("text/plain; charset=utf-8")
        .send(
          "MP3 마스터링 서비스(127.0.0.1:3001)에 연결할 수 없습니다.\n" +
            "서버에서: cd /var/www/mp3mastering && bash deploy/run-on-server.sh\n" +
            "pm2 status mastering-app",
        );
    }
  });

  req.pipe(proxyReq);
}

/** venysound.com/mastering → 별도 PM2 앱(127.0.0.1:3001). Nginx 미반영 시에도 동작하는 폴백. */
export function registerMasteringProxy(app: Express): void {
  if (process.env.MASTERING_PROXY_ENABLED === "0") return;

  app.get(/^\/mastering$/, (req: Request, res: Response) => {
    const q = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    res.redirect(301, `/mastering/${q}`);
  });

  app.use("/mastering", (req: Request, res: Response) => {
    let path = req.url || "/";
    if (!path.startsWith("/")) path = `/${path}`;
    forwardMasteringRequest(req, res, path);
  });
}
