/**
 * AI 가사 자동 정렬: 음원 + 플레인 가사 → Whisper segment 타임스탬프로 LRC 생성
 */
import OpenAI, { toFile } from "openai";
import { readFile } from "fs/promises";
import path from "path";

function getOpenAI(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 필요합니다. .env에 설정해 주세요.");
  }
  return new OpenAI({ apiKey });
}

/** verbose_json 응답의 segment */
interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

/** LRC 한 줄 포맷: [mm:ss.xx] */
function toLrcTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const ss = Math.floor(s);
  const xx = Math.round((s - ss) * 100);
  return `[${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}.${xx.toString().padStart(2, "0")}]`;
}

/**
 * 음원 로컬 경로 + 플레인 가사 → Whisper segment 타임스탬프로 LRC 문자열 반환.
 */
export async function alignLyricsToAudio(
  localPath: string,
  plainLyrics: string,
  language?: string
): Promise<string> {
  const lines = plainLyrics
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return plainLyrics;

  const buffer = await readFile(localPath);
  const ext = path.extname(localPath).toLowerCase() || ".mp3";
  const file = await toFile(buffer, `audio${ext}`);

  const openai = getOpenAI();
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
    language: language || undefined,
  });

  const verbose = transcription as unknown as {
    segments?: WhisperSegment[];
    duration?: number;
  };
  const segments = verbose?.segments || [];
  if (segments.length === 0) {
    // 타임스탬프 없으면 곡 길이로 균등 배치
    const duration = verbose?.duration ?? 180;
    const interval = duration / (lines.length + 1);
    return lines
      .map((text, i) => `${toLrcTime(interval * (i + 1))}${text}`)
      .join("\n");
  }

  // 줄을 구간에 순서대로 매핑 (구간 수와 줄 수가 다를 수 있음)
  const lrcLines = lines.map((text, i) => {
    const segIndex = Math.min(
      Math.floor((i * segments.length) / lines.length),
      segments.length - 1
    );
    const start = segments[segIndex]!.start;
    return `${toLrcTime(start)}${text}`;
  });
  return lrcLines.join("\n");
}
