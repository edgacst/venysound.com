import { createReadStream, existsSync, mkdirSync, statSync } from "fs";
import { writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import multer from "multer";
import type { Express, Response } from "express";

const LOCAL_UPLOADS_DIR = path.resolve(process.cwd(), "local-uploads");
const UPLOADS_SUBDIR = path.join(LOCAL_UPLOADS_DIR, "uploads");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

/** 확장자가 없거나 비표준이어도 mimetype으로 올바른 확장자를 쓰면 커버 이미지가 깨지지 않습니다. */
function storedExtensionForUpload(file: Express.Multer.File): string {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const extMap: Record<string, string> = {
    ".mp3": ".mp3",
    ".wav": ".wav",
    ".ogg": ".ogg",
    ".mp4": ".mp4",
    ".webm": ".webm",
    ".mov": ".mov",
    ".jpg": ".jpg",
    ".jpeg": ".jpg",
    ".png": ".png",
    ".webp": ".webp",
    ".gif": ".gif",
    ".avif": ".avif",
    ".jfif": ".jpg",
    ".bmp": ".bmp",
  };
  if (extMap[ext]) return extMap[ext];

  const mt = (file.mimetype || "").toLowerCase();
  const mimeMap: Record<string, string> = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/ogg": ".ogg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/pjpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
    "image/bmp": ".bmp",
    "image/x-ms-bmp": ".bmp",
  };
  if (mimeMap[mt]) return mimeMap[mt];
  if (mt.startsWith("audio/")) return ".mp3";
  if (mt.startsWith("video/")) return ".mp4";
  if (mt.startsWith("image/")) return ".jpg";
  return ".mp3";
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  getObjectEntityUploadURL(): Promise<string> {
    // 로컬에서는 presigned URL 없음 → 항상 로컬 업로드 엔드포인트 사용
    throw new Error("LOCAL_MODE: use /api/uploads/local endpoint");
  }

  normalizeObjectEntityPath(rawPath: string): string {
    return rawPath;
  }

  async getObjectEntityFile(objectPath: string): Promise<never> {
    // 로컬 모드에서는 항상 로컬 파일로 서빙 → Replit 폴백 불필요
    throw new ObjectNotFoundError();
  }

  async downloadObject(_file: never, _res: Response): Promise<void> {
    throw new ObjectNotFoundError();
  }

  async trySetObjectEntityAclPolicy(rawPath: string): Promise<string> {
    return rawPath;
  }

  async canAccessObjectEntity(): Promise<boolean> {
    return true;
  }
}

export function registerObjectStorageRoutes(app: Express): void {
  app.post("/api/uploads/request-url", async (_req, res) => {
    // 로컬 모드: presigned URL 없이 직접 업로드 엔드포인트 안내
    res.json({
      localMode: true,
      uploadEndpoint: "/api/uploads/local",
    });
  });

  app.post("/api/uploads/local", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "파일이 없습니다" });
      }
      mkdirSync(UPLOADS_SUBDIR, { recursive: true });
      const uuid = randomUUID();
      const safeExt = storedExtensionForUpload(file);
      const filename = `${uuid}${safeExt}`;
      const destPath = path.join(UPLOADS_SUBDIR, filename);
      await writeFile(destPath, file.buffer);
      const objectPath = `/objects/uploads/${filename}`;
      res.json({ uploadURL: "", objectPath, metadata: { name: file.originalname } });
    } catch (err) {
      console.error("Local upload error:", err);
      res.status(500).json({ error: "업로드 실패" });
    }
  });

  app.get("/objects/:subpath/:id", async (req, res) => {
    const { subpath, id } = req.params;

    const baseDir = path.join(LOCAL_UPLOADS_DIR, subpath);
    const candidates = [
      path.join(baseDir, id),
      path.join(baseDir, `${id}.mp3`),
      path.join(baseDir, `${id}.wav`),
      path.join(baseDir, `${id}.ogg`),
      path.join(baseDir, `${id}.mp4`),
      path.join(baseDir, `${id}.webm`),
      path.join(baseDir, `${id}.mov`),
    ];
    const localPath = candidates.find((p) => existsSync(p));
    if (localPath) {
      try {
        const ext = path.extname(localPath) || "";
        const mime: Record<string, string> = {
          ".mp3": "audio/mpeg",
          ".wav": "audio/wav",
          ".ogg": "audio/ogg",
          ".mp4": "video/mp4",
          ".webm": "video/webm",
          ".mov": "video/quicktime",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".webp": "image/webp",
          ".gif": "image/gif",
          ".avif": "image/avif",
          ".bmp": "image/bmp",
        };
        const contentType = mime[ext.toLowerCase()] || "application/octet-stream";
        const stat = statSync(localPath);
        const fileSize = stat.size;
        const rangeHeader = req.headers.range;

        res.set("Content-Type", contentType);
        res.set("Accept-Ranges", "bytes");
        res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
        res.set("Last-Modified", stat.mtime.toUTCString());
        const etag = `W/\"${fileSize}-${Math.floor(stat.mtimeMs)}\"`;
        res.set("ETag", etag);

        // 조건부 GET (range 없는 경우에만)
        if (!rangeHeader) {
          const ifNoneMatch = req.headers["if-none-match"];
          const ifModifiedSince = req.headers["if-modified-since"];
          if (ifNoneMatch && String(ifNoneMatch).trim() === etag) {
            return res.status(304).end();
          }
          if (ifModifiedSince) {
            const ims = new Date(String(ifModifiedSince)).getTime();
            if (!Number.isNaN(ims) && stat.mtime.getTime() <= ims) {
              return res.status(304).end();
            }
          }
        }

        if (rangeHeader) {
          const m = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader).trim());
          if (!m) {
            res.status(416);
            res.set("Content-Range", `bytes */${fileSize}`);
            return res.end();
          }
          const startStr = m[1];
          const endStr = m[2];
          let start: number | null = startStr ? parseInt(startStr, 10) : null;
          let end: number | null = endStr ? parseInt(endStr, 10) : null;
          if (start != null && Number.isNaN(start)) start = null;
          if (end != null && Number.isNaN(end)) end = null;
          if (start == null && end != null) {
            const suffixLen = Math.max(0, end);
            start = Math.max(0, fileSize - suffixLen);
            end = fileSize - 1;
          } else {
            if (start == null) start = 0;
            if (end == null || end >= fileSize) end = fileSize - 1;
          }
          if (start >= fileSize || start < 0 || end < 0 || start > end) {
            res.status(416);
            res.set("Content-Range", `bytes */${fileSize}`);
            return res.end();
          }
          const chunkSize = end - start + 1;
          res.status(206);
          res.set("Content-Range", `bytes ${start}-${end}/${fileSize}`);
          res.set("Content-Length", String(chunkSize));
          const stream = createReadStream(localPath, { start, end });
          res.on("close", () => stream.destroy());
          stream.on("error", () => {
            if (!res.headersSent) res.status(500).end();
            else res.destroy();
          });
          stream.pipe(res);
          return;
        }

        res.set("Content-Length", String(fileSize));
        const stream = createReadStream(localPath);
        res.on("close", () => stream.destroy());
        stream.on("error", () => {
          if (!res.headersSent) res.status(500).end();
          else res.destroy();
        });
        stream.pipe(res);
        return;
      } catch (err) {
        console.error("Error serving local file:", err);
      }
    }

    return res.status(404).json({
      error: "Object not found",
      hint: `음원 파일을 ${LOCAL_UPLOADS_DIR}/${subpath}/ 폴더에 넣어주세요. 파일명: ${id}`,
    });
  });
}
