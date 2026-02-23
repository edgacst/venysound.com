import { createReadStream, existsSync, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import multer from "multer";
import type { Express, Response } from "express";

const LOCAL_UPLOADS_DIR = path.resolve(process.cwd(), "local-uploads");
const UPLOADS_SUBDIR = path.join(LOCAL_UPLOADS_DIR, "uploads");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

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
      const ext = path.extname(file.originalname) || ".mp3";
      const extMap: Record<string, string> = {
        ".mp3": ".mp3", ".wav": ".wav", ".ogg": ".ogg",
        ".jpg": ".jpg", ".jpeg": ".jpg", ".png": ".png",
      };
      const safeExt = extMap[ext.toLowerCase()] || ".mp3";
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
    ];
    const localPath = candidates.find((p) => existsSync(p));
    if (localPath) {
      try {
        const ext = path.extname(localPath) || "";
        const mime: Record<string, string> = {
          ".mp3": "audio/mpeg",
          ".wav": "audio/wav",
          ".ogg": "audio/ogg",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
        };
        res.set("Content-Type", mime[ext.toLowerCase()] || "application/octet-stream");
        createReadStream(localPath).pipe(res);
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
