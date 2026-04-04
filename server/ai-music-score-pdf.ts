/**
 * AI 라이브러리 곡 오디오 → Basic Pitch(MIDI) → MuseScore(PDF).
 * 서버에 설치 필요: pip install basic-pitch, MuseScore 3 CLI (예: musescore3).
 * 활성화: .env 에 AI_SCORE_ENABLED=1 — 이용: Premium(유효 구독) 또는 관리자만
 * 선택: AI_SCORE_MUSESCORE_BIN, AI_SCORE_BASIC_PITCH_BIN, AI_SCORE_XVFB=1 (헤드리스)
 * basic-pitch 모델: AI_SCORE_BP_MODEL=tflite(기본)|onnx|tf — tflite가 서버에서 실패하면 onnxruntime 설치 후 onnx
 * 디버그: AI_SCORE_VERBOSE=1 이면 detail 길이 확장
 */
import type { Express, Request, Response } from "express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, and } from "drizzle-orm";
import { isAuthenticated } from "./auth";
import { db } from "./db";
import { aiMusicSavedTracks, users } from "../shared/models/auth";

const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
const BASIC_PITCH_TIMEOUT_MS = 180_000;
const MUSESCORE_TIMEOUT_MS = 120_000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_PER_HOUR = 10;

const rateBuckets = new Map<string, number[]>();

/** Premium(유효 구독) 또는 관리자만 악보 PDF. 만료일 없으면 유효로 간주. */
function isPremiumScorePdfUser(
  row:
    | { subscriptionTier: string | null; subscriptionExpiresAt: Date | null; role: string | null }
    | undefined,
): boolean {
  if (!row) return false;
  if (row.role === "admin") return true;
  const tier = row.subscriptionTier ?? "free";
  if (tier !== "premium") return false;
  if (!row.subscriptionExpiresAt) return true;
  return new Date(row.subscriptionExpiresAt) > new Date();
}

function isScoreEnabled(): boolean {
  const v = (process.env.AI_SCORE_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function basicPitchBin(): string {
  return (process.env.AI_SCORE_BASIC_PITCH_BIN ?? "basic-pitch").trim() || "basic-pitch";
}

/** 기본 tflite; GLIBC 등으로 tflite 실패 시 venv에 onnxruntime 설치 후 AI_SCORE_BP_MODEL=onnx */
function basicPitchModelCliArgs(): string[] {
  const v = (process.env.AI_SCORE_BP_MODEL ?? "tflite").trim().toLowerCase();
  if (v === "onnx" || v === "onnxruntime") return ["--model-serialization", "onnx"];
  if (v === "tf" || v === "tensorflow") return ["--model-serialization", "tf"];
  return ["--model-serialization", "tflite"];
}

function museScoreArgsTemplate(): { useXvfb: boolean; bin: string } {
  const useXvfb = ["1", "true", "yes"].includes((process.env.AI_SCORE_XVFB ?? "").trim().toLowerCase());
  const bin = (process.env.AI_SCORE_MUSESCORE_BIN ?? "musescore3").trim() || "musescore3";
  return { useXvfb, bin };
}

/** basic-pitch/librosa 가 포맷 추론에 확장자를 쓰는 경우가 있어 .bin 대신 실제 확장자 사용 */
function guessAudioExtFromUrlAndType(urlStr: string, contentType: string | null): string {
  const ct = (contentType ?? "").toLowerCase().split(";")[0]!.trim();
  if (ct.includes("mpeg") || ct === "audio/mp3" || ct.includes("mp3")) return ".mp3";
  if (ct.includes("wav") || ct.includes("wave")) return ".wav";
  if (ct.includes("ogg")) return ".ogg";
  if (ct.includes("flac")) return ".flac";
  if (ct.includes("mp4") || ct.includes("m4a") || ct.includes("aac") || ct.includes("x-m4a")) return ".m4a";
  try {
    const pathLower = new URL(urlStr).pathname.toLowerCase();
    const m = pathLower.match(/\.(mp3|wav|ogg|flac|m4a|aac|webm)(?:\?|$)/);
    if (m) return `.${m[1]}`;
  } catch {
    /* ignore */
  }
  return ".mp3";
}

function bodyLooksLikeNonAudio(buf: Buffer): boolean {
  const s = buf.subarray(0, Math.min(400, buf.length)).toString("utf8").trimStart().toLowerCase();
  return (
    s.startsWith("<!doctype") ||
    s.startsWith("<html") ||
    s.startsWith("<?xml") ||
    s.startsWith("<error") ||
    (s.startsWith("{") && (s.includes('"error"') || s.includes('"message"') || s.includes('"code"')))
  );
}

function isHttpsUrlSafeForFetch(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".local")) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      const p = host.split(".").map((x) => parseInt(x, 10));
      if (p[0] === 10) return false;
      if (p[0] === 127) return false;
      if (p[0] === 0) return false;
      if (p[0] === 192 && p[1] === 168) return false;
      if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const arr = rateBuckets.get(userId) ?? [];
  const fresh = arr.filter((t) => now - t < RATE_WINDOW_MS);
  if (fresh.length >= RATE_MAX_PER_HOUR) return false;
  fresh.push(now);
  rateBuckets.set(userId, fresh);
  return true;
}

function runCmd(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs: number; env?: NodeJS.ProcessEnv },
): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    const killTimer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, options.timeoutMs);
    child.on("error", (e) => {
      clearTimeout(killTimer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(killTimer);
      if (code === 0) resolve({ stderr: stderr + stdout });
      else {
        const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n--- stderr ---\n");
        reject(
          new Error(`Command failed (${code}): ${command} ${args.join(" ")}\n${combined.slice(-4500)}`),
        );
      }
    });
  });
}

async function findMidiInDir(dir: string): Promise<string | null> {
  const names = await readdir(dir);
  const mids = names.filter((n) => /\.mid(i)?$/i.test(n));
  if (mids.length === 0) return null;
  mids.sort();
  const preferred = mids.find((n) => /basic_pitch/i.test(n)) ?? mids[0];
  return join(dir, preferred!);
}

function isVerboseScoreErrors(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const v = (process.env.AI_SCORE_VERBOSE ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function looksLikeMissingBinary(errText: string): boolean {
  return /ENOENT|ENOTDIR|spawn .* ENOENT|command not found|No such file/i.test(errText);
}

function jsonCliFailure(
  res: Response,
  title: string,
  raw: string,
  missingBinHint: string,
): void {
  const hint = looksLikeMissingBinary(raw) ? missingBinHint : "아래 detail 또는 pm2 logs 를 확인하세요.";
  const collapsed = raw.replace(/\s+/g, " ").trim();
  const maxDetail = isVerboseScoreErrors() ? 2000 : 700;
  const payload: { message: string; detail: string } = {
    message: `${title} ${hint}`,
    detail: collapsed.slice(0, maxDetail) || "(CLI 출력 없음)",
  };
  res.status(500).json(payload);
}

export function registerAiMusicScorePdfRoutes(app: Express): void {
  app.get("/api/ai-music/score-pdf/availability", isAuthenticated, async (req: Request, res: Response) => {
    if (!isScoreEnabled()) {
      return res.json({ enabled: false });
    }
    const userId = req.user?.claims?.sub as string | undefined;
    if (!userId) {
      return res.json({ enabled: false });
    }
    try {
      const [u] = await db
        .select({
          subscriptionTier: users.subscriptionTier,
          subscriptionExpiresAt: users.subscriptionExpiresAt,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      res.json({ enabled: isPremiumScorePdfUser(u) });
    } catch (e) {
      console.error("[ai-music score-pdf] availability", e);
      res.json({ enabled: false });
    }
  });

  app.post("/api/ai-music/score-pdf", isAuthenticated, async (req: Request, res: Response) => {
    if (!isScoreEnabled()) {
      return res.status(503).json({
        message:
          "악보 PDF 추출이 비활성화되어 있습니다. 서버에 basic-pitch·MuseScore를 설치하고 AI_SCORE_ENABLED=1 을 설정하세요.",
        code: "SCORE_PIPELINE_DISABLED",
      });
    }

    const userId = req.user?.claims?.sub as string | undefined;
    if (!userId) {
      return res.status(401).json({ message: "로그인이 필요합니다." });
    }

    try {
      const [u] = await db
        .select({
          subscriptionTier: users.subscriptionTier,
          subscriptionExpiresAt: users.subscriptionExpiresAt,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!isPremiumScorePdfUser(u)) {
        return res.status(403).json({
          message: "악보 PDF 다운로드는 Premium 구독자만 이용할 수 있습니다.",
          code: "SCORE_PDF_PREMIUM_ONLY",
        });
      }
    } catch (e) {
      console.error("[ai-music score-pdf] user lookup", e);
      return res.status(500).json({ message: "사용자 정보를 확인하지 못했습니다." });
    }

    if (!checkRateLimit(userId)) {
      return res.status(429).json({ message: "악보 추출 요청이 너무 많습니다. 잠시 후 다시 시도하세요." });
    }

    const body = req.body as { clientId?: string };
    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    if (!clientId || clientId.length > 220) {
      return res.status(400).json({ message: "clientId가 필요합니다." });
    }

    let audioUrl: string | undefined;
    try {
      const [row] = await db
        .select({ audioUrl: aiMusicSavedTracks.audioUrl })
        .from(aiMusicSavedTracks)
        .where(and(eq(aiMusicSavedTracks.userId, userId), eq(aiMusicSavedTracks.clientId, clientId)))
        .limit(1);
      audioUrl = row?.audioUrl?.trim() || undefined;
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      console.error("[ai-music score-pdf] db", e);
      if (err?.code === "42P01" || String(err?.message || "").includes("does not exist")) {
        return res.status(503).json({
          message:
            "라이브러리 DB 테이블이 없습니다. 서버에서 npm run db:deploy(또는 ai_music_saved_tracks 마이그레이션)를 실행한 뒤 다시 시도하세요.",
          code: "AI_LIBRARY_TABLE_MISSING",
        });
      }
      return res.status(500).json({ message: "라이브러리 조회에 실패했습니다." });
    }

    if (!audioUrl) {
      return res.status(404).json({
        message: "해당 곡을 서버 라이브러리에서 찾을 수 없습니다. 라이브러리 동기화 후 다시 시도하세요.",
        code: "TRACK_NOT_IN_LIBRARY",
      });
    }

    if (!isHttpsUrlSafeForFetch(audioUrl)) {
      return res.status(400).json({ message: "허용되지 않은 오디오 URL입니다." });
    }

    const workRoot = join(tmpdir(), `veny-score-${randomUUID()}`);
    const pdfPath = join(workRoot, "score.pdf");

    try {
      await mkdir(workRoot, { recursive: true });

      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 60_000);
      let fetchRes: globalThis.Response;
      try {
        fetchRes = await fetch(audioUrl, {
          signal: ac.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; VenySoundScoreBot/1.0; +https://venysound.com)",
            Accept: "audio/*,*/*;q=0.8",
          },
        });
      } finally {
        clearTimeout(to);
      }

      if (!fetchRes.ok) {
        return res.status(502).json({ message: `오디오를 가져오지 못했습니다. (${fetchRes.status})` });
      }

      const buf = Buffer.from(await fetchRes.arrayBuffer());
      const contentType = fetchRes.headers.get("content-type");
      if (buf.byteLength > MAX_AUDIO_BYTES) {
        return res.status(413).json({ message: "오디오 파일이 너무 큽니다." });
      }
      if (bodyLooksLikeNonAudio(buf)) {
        console.error("[ai-music score-pdf] fetched body is not audio", {
          len: buf.byteLength,
          contentType,
          host: new URL(audioUrl).hostname,
        });
        return res.status(502).json({
          message:
            "오디오 URL이 실제 음원이 아니라 HTML·JSON 오류 페이지를 반환했습니다. 링크 만료, 로그인 필요 URL, 또는 브라우저 전용 주소일 수 있습니다.",
        });
      }
      if (buf.byteLength < 256) {
        console.error("[ai-music score-pdf] audio body too short", {
          len: buf.byteLength,
          contentType,
          host: new URL(audioUrl).hostname,
        });
        return res.status(400).json({
          message:
            "서버가 받은 오디오가 너무 짧습니다. 저장된 음원 주소가 만료됐거나 빈 응답일 수 있으니, 곡을 다시 생성·다운로드한 뒤 라이브러리를 동기화한 후 다시 시도하세요.",
        });
      }

      const ext = guessAudioExtFromUrlAndType(audioUrl, contentType);
      const audioPath = join(workRoot, `source_audio${ext}`);
      await writeFile(audioPath, buf);

      const bpBin = basicPitchBin();
      try {
        // CLI: basic-pitch [--flags] output_dir audio_paths…  (모델은 AI_SCORE_BP_MODEL)
        await runCmd(
          bpBin,
          [...basicPitchModelCliArgs(), "--no-melodia", "--save-midi", workRoot, audioPath],
          { timeoutMs: BASIC_PITCH_TIMEOUT_MS, env: { PYTHONUNBUFFERED: "1" } },
        );
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        console.error("[ai-music score-pdf] basic-pitch", raw);
        jsonCliFailure(
          res,
          "MIDI 전사(basic-pitch) 단계에서 실패했습니다.",
          raw,
          `${bpBin} 을(를) 찾을 수 없거나 실행할 수 없습니다. venv 경로와 AI_SCORE_BASIC_PITCH_BIN 을 확인하세요.`,
        );
        return;
      }

      const foundMid = await findMidiInDir(workRoot);
      if (!foundMid) {
        return res.status(500).json({ message: "MIDI 변환 결과를 찾을 수 없습니다. basic-pitch 설치·버전을 확인하세요." });
      }

      const { useXvfb, bin: mscoreBin } = museScoreArgsTemplate();

      try {
        if (useXvfb) {
          await runCmd("xvfb-run", ["-a", mscoreBin, foundMid, "-o", pdfPath], {
            timeoutMs: MUSESCORE_TIMEOUT_MS,
          });
        } else {
          await runCmd(mscoreBin, [foundMid, "-o", pdfPath], { timeoutMs: MUSESCORE_TIMEOUT_MS });
        }
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        console.error("[ai-music score-pdf] musescore", raw);
        const msHint = useXvfb
          ? "xvfb-run 또는 MuseScore CLI 경로(AI_SCORE_MUSESCORE_BIN)를 확인하세요."
          : "MuseScore CLI(musescore3 등)와 AI_SCORE_MUSESCORE_BIN 을 확인하세요. 헤드리스면 AI_SCORE_XVFB=1 과 xvfb-run 설치가 필요합니다.";
        jsonCliFailure(res, "PDF 조판(MuseScore) 단계에서 실패했습니다.", raw, msHint);
        return;
      }

      const pdfBuf = await readFile(pdfPath);
      if (pdfBuf.byteLength < 64) {
        return res.status(500).json({ message: "PDF 생성에 실패했습니다. MuseScore CLI를 확인하세요." });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="score.pdf"');
      return res.send(pdfBuf);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ai-music score-pdf]", msg);
      const payload: { message: string; detail?: string } = {
        message: "악보 PDF 처리 중 예기치 않은 오류가 났습니다. pm2 logs 로 전체 스택을 확인하세요.",
      };
      if (isVerboseScoreErrors()) {
        payload.detail = msg.slice(0, 800);
      }
      return res.status(500).json(payload);
    } finally {
      try {
        await rm(workRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
}
