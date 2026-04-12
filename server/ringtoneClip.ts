import { spawn } from "node:child_process";

export const RINGTONE_CLIP_SECONDS = 30;
/** 비소유자 벨소리 다운로드 시 차감·업로더 지급액(원) */
export const RINGTONE_FEE_WON = 200;
const FFMPEG_BIN = (process.env.FFMPEG_PATH || "ffmpeg").trim() || "ffmpeg";

/**
 * 로컬 오디오 파일 앞 RINGTONE_CLIP_SECONDS초를 MP3로 인코딩해 버퍼로 반환.
 * 벨소리 다운로드 전용 — 스트리밍/재생 경로와 무관.
 */
export function encodeRingtoneClipMp3(localInputPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn(
      FFMPEG_BIN,
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        localInputPath,
        "-t",
        String(RINGTONE_CLIP_SECONDS),
        "-vn",
        "-acodec",
        "libmp3lame",
        "-b:a",
        "160k",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-f",
        "mp3",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    const chunks: Buffer[] = [];
    let stderr = "";
    ff.stdout.on("data", (c: Buffer) => chunks.push(c));
    ff.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    ff.on("error", (err) => {
      reject(err);
    });
    ff.on("close", (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 800)}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      if (buf.length < 100) {
        reject(new Error(`ffmpeg output too small (${buf.length} bytes)`));
        return;
      }
      resolve(buf);
    });
  });
}
