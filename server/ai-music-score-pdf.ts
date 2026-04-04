/**
 * AI 라이브러리 곡 오디오 → Basic Pitch(MIDI) → MuseScore(PDF).
 * 서버에 설치 필요: pip install basic-pitch, MuseScore 3 CLI (예: musescore3).
 * 활성화: .env 에 AI_SCORE_ENABLED=1
 * 선택: AI_SCORE_MUSESCORE_BIN, AI_SCORE_BASIC_PITCH_BIN, AI_SCORE_XVFB=1 (헤드리스)
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
import { aiMusicSavedTracks } from "../shared/models/auth";

const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
const BASIC_PITCH_TIMEOUT_MS = 180_000;
const MUSESCORE_TIMEOUT_MS = 120_000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_PER_HOUR = 10;

const rateBuckets = new Map<string, number[]>();

function isScoreEnabled(): boolean {
  const v = (process.env.AI_SCORE_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function basicPitchBin(): string {
  return (process.env.AI_SCORE_BASIC_PITCH_BIN ?? "basic-pitch").trim() || "basic-pitch";
}

function museScoreArgsTemplate(): { useXvfb: boolean; bin: string } {
  const useXvfb = ["1", "true", "yes"].includes((process.env.AI_SCORE_XVFB ?? "").trim().toLowerCase());
  const bin = (process.env.AI_SCORE_MUSESCORE_BIN ?? "musescore3").trim() || "musescore3";
  return { useXvfb, bin };
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
      else reject(new Error(`Command failed (${code}): ${command} ${args.join(" ")}\n${stderr.slice(-800)}`));
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

export function registerAiMusicScorePdfRoutes(app: Express): void {
  app.get("/api/ai-music/score-pdf/availability", isAuthenticated, (_req: Request, res: Response) => {
    res.json({ enabled: isScoreEnabled() });
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
    } catch (e) {
      console.error("[ai-music score-pdf] db", e);
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
    const audioPath = join(workRoot, "source_audio.bin");
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
      if (buf.byteLength > MAX_AUDIO_BYTES) {
        return res.status(413).json({ message: "오디오 파일이 너무 큽니다." });
      }
      if (buf.byteLength < 256) {
        return res.status(400).json({ message: "오디오 데이터가 너무 짧습니다." });
      }

      await writeFile(audioPath, buf);

      await runCmd(basicPitchBin(), [audioPath, workRoot], { timeoutMs: BASIC_PITCH_TIMEOUT_MS });

      const foundMid = await findMidiInDir(workRoot);
      if (!foundMid) {
        return res.status(500).json({ message: "MIDI 변환 결과를 찾을 수 없습니다. basic-pitch 설치를 확인하세요." });
      }

      const { useXvfb, bin: mscoreBin } = museScoreArgsTemplate();

      if (useXvfb) {
        await runCmd("xvfb-run", ["-a", mscoreBin, foundMid, "-o", pdfPath], {
          timeoutMs: MUSESCORE_TIMEOUT_MS,
        });
      } else {
        await runCmd(mscoreBin, [foundMid, "-o", pdfPath], { timeoutMs: MUSESCORE_TIMEOUT_MS });
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
      return res.status(500).json({
        message: "악보 PDF 생성 중 오류가 났습니다. 서버에 basic-pitch·MuseScore가 설치되어 있는지 확인하세요.",
        detail: process.env.NODE_ENV === "development" ? msg.slice(0, 500) : undefined,
      });
    } finally {
      try {
        await rm(workRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
}
