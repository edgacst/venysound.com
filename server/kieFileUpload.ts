/**
 * Suno 호환 파일 업로드 (KIE · sunoapi.org — API base와 업로드 호스트가 다름).
 * @see https://docs.kie.ai/file-upload-api/upload-file-stream
 * @see https://docs.sunoapi.org/file-upload-api/upload-file-stream
 */
const DEFAULT_KIE_FILE_UPLOAD_BASE = "https://kieai.redpandaai.co";
const DEFAULT_SUNOAPI_FILE_UPLOAD_BASE = "https://sunoapiorg.redpandaai.co";

export function kieFileUploadBase(override?: string): string {
  const raw = (override ?? process.env.KIE_FILE_UPLOAD_BASE ?? DEFAULT_KIE_FILE_UPLOAD_BASE).trim();
  return raw.replace(/\/$/, "");
}

/** sunoapi.org 보이스·add-vocals 녹음 업로드 */
export function sunoapiFileUploadBase(override?: string): string {
  const raw = (
    override ??
    process.env.SUNOAPI_FILE_UPLOAD_BASE ??
    process.env.SUNO_FILE_UPLOAD_BASE ??
    DEFAULT_SUNOAPI_FILE_UPLOAD_BASE
  ).trim();
  return raw.replace(/\/$/, "");
}

export function resolveSunoStyleFileUploadBase(provider: "kie" | "suno"): string {
  return provider === "suno" ? sunoapiFileUploadBase() : kieFileUploadBase();
}

type KieFileUploadJson = {
  success?: boolean;
  code?: number;
  msg?: string;
  data?: { downloadUrl?: string; fileUrl?: string };
};

export async function kieUploadAudioBuffer(params: {
  apiKey: string;
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  uploadPath?: string;
  /** @deprecated Suno API base — 업로드 URL에는 쓰지 않음. KIE_FILE_UPLOAD_BASE 사용 */
  base?: string;
  fileUploadBase?: string;
}): Promise<string> {
  const uploadBase = (params.fileUploadBase ?? kieFileUploadBase()).replace(/\/$/, "");
  const uploadPath = (params.uploadPath ?? "venysound/voice-records").replace(/^\/+|\/+$/g, "");
  const mime = params.mimeType ?? "audio/webm";

  const form = new FormData();
  const blob = new Blob([new Uint8Array(params.buffer)], { type: mime });
  form.append("file", blob, params.fileName);
  form.append("uploadPath", uploadPath);
  form.append("fileName", params.fileName);

  const res = await fetch(`${uploadBase}/api/file-stream-upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${params.apiKey}` },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as KieFileUploadJson;
  if (!res.ok || json.success === false || (typeof json.code === "number" && json.code !== 200)) {
    throw new Error(json.msg ?? `오디오 파일 업로드 실패 (${res.status})`);
  }
  const url = (json.data?.downloadUrl ?? json.data?.fileUrl ?? "").trim();
  if (!url) throw new Error("오디오 업로드 응답에 downloadUrl이 없습니다.");
  return url;
}
