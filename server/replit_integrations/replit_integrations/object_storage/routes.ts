import type { Express } from "express";
import { createReadStream, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import multer from "multer";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

/** 로컬 개발용: Replit 없이 local-uploads 폴더에서 파일 서빙 */
const LOCAL_UPLOADS_DIR = path.resolve(process.cwd(), "local-uploads");
const UPLOADS_SUBDIR = path.join(LOCAL_UPLOADS_DIR, "uploads");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

/**
 * Register object storage routes for file uploads.
 *
 * This provides example routes for the presigned URL upload flow:
 * 1. POST /api/uploads/request-url - Get a presigned URL for uploading
 * 2. The client then uploads directly to the presigned URL
 *
 * IMPORTANT: These are example routes. Customize based on your use case:
 * - Add authentication middleware for protected uploads
 * - Add file metadata storage (save to database after upload)
 * - Add ACL policies for access control
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * Request a presigned URL for file upload.
   *
   * Request body (JSON):
   * {
   *   "name": "filename.jpg",
   *   "size": 12345,
   *   "contentType": "image/jpeg"
   * }
   *
   * Response:
   * {
   *   "uploadURL": "https://storage.googleapis.com/...",
   *   "objectPath": "/objects/uploads/uuid"
   * }
   *
   * IMPORTANT: The client should NOT send the file to this endpoint.
   * Send JSON metadata only, then upload the file directly to uploadURL.
   */
  app.post("/api/uploads/request-url", async (req, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      if (!process.env.PRIVATE_OBJECT_DIR) {
        return res.json({
          localMode: true,
          uploadEndpoint: "/api/uploads/local",
        });
      }
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  function sanitizeFilename(name: string, maxLen = 80): string {
    const s = name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\s+/g, " ")
      .trim();
    return s.slice(0, maxLen) || "track";
  }

  app.post("/api/uploads/local", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "파일이 없습니다" });
      }
      mkdirSync(UPLOADS_SUBDIR, { recursive: true });
      const ext = path.extname(file.originalname) || ".mp3";
      const extMap: Record<string, string> = {
        ".mp3": ".mp3", ".wav": ".wav", ".ogg": ".ogg",
        ".jpg": ".jpg", ".jpeg": ".jpg", ".png": ".png",
      };
      const safeExt = extMap[ext.toLowerCase()] || ".mp3";
      const rawDesired = (req.body?.desiredFilename as string)?.trim();
      const baseName = rawDesired ? sanitizeFilename(rawDesired) : "";
      const shortId = randomUUID().slice(0, 8);
      const filename = baseName ? `${baseName}_${shortId}${safeExt}` : `${randomUUID()}${safeExt}`;
      const destPath = path.join(UPLOADS_SUBDIR, filename);
      await writeFile(destPath, file.buffer);
      const objectPath = `/objects/uploads/${filename}`;
      res.json({ uploadURL: "", objectPath, metadata: { name: file.originalname } });
    } catch (err) {
      console.error("Local upload error:", err);
      res.status(500).json({ error: "업로드 실패" });
    }
  });

  /**
   * Serve uploaded objects.
   *
   * GET /objects/:objectPath(*)
   *
   * This serves files from object storage. For public files, no auth needed.
   * For protected files, add authentication middleware and ACL checks.
   */
  app.get("/objects/:subpath/:id", async (req, res) => {
    const { subpath, id } = req.params;
    const objectPath = `/objects/${subpath}/${id}`;

    // 1) 로컬 파일 먼저 시도 (Replit 없을 때)
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

    // 2) Replit Object Storage 시도
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(404).json({
        error: "Object not found",
        hint: `로컬에서 재생하려면 음원 파일을 ${LOCAL_UPLOADS_DIR} 폴더에 넣어주세요. 경로: ${subpath}/${id}`,
      });
    }
  });
}

