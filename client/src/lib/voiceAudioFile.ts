/** 서버 aiVoiceRecordUpload limits.fileSize 와 동일 */
export const MAX_VOICE_AUDIO_BYTES = 8 * 1024 * 1024;

export const VOICE_AUDIO_INPUT_ACCEPT =
  "audio/*,audio/webm,audio/mpeg,audio/wav,audio/mp4,audio/ogg,.webm,.mp3,.wav,.m4a,.ogg";

const VOICE_AUDIO_EXTENSIONS = [".webm", ".mp3", ".wav", ".m4a", ".ogg", ".mpeg", ".mp4"] as const;

export function isAcceptedVoiceAudioFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("audio/")) return true;
  const name = file.name.toLowerCase();
  return VOICE_AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function voiceBlobUploadFileName(blob: Blob, baseName: string): string {
  const type = (blob.type || "").toLowerCase();
  if (type.includes("mpeg") || type.includes("mp3")) return `${baseName}.mp3`;
  if (type.includes("wav")) return `${baseName}.wav`;
  if (type.includes("mp4") || type.includes("m4a")) return `${baseName}.m4a`;
  if (type.includes("ogg")) return `${baseName}.ogg`;
  return `${baseName}.webm`;
}

export async function readVoiceAudioFile(file: File): Promise<Blob> {
  if (!isAcceptedVoiceAudioFile(file)) {
    throw new Error("UNSUPPORTED_TYPE");
  }
  if (!file.size) {
    throw new Error("EMPTY");
  }
  if (file.size > MAX_VOICE_AUDIO_BYTES) {
    throw new Error("TOO_LARGE");
  }
  const type = file.type || guessMimeFromName(file.name) || "application/octet-stream";
  return file.slice(0, file.size, type);
}

function guessMimeFromName(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) return "audio/mp4";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  return undefined;
}
