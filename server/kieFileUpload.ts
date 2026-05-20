/**
 * KIE File Stream Upload — Suno add-vocals 등에 쓸 공개 downloadUrl 반환.
 * @see https://docs.kie.ai/file-upload-api/upload-file-stream
 */
export async function kieUploadAudioBuffer(params: {
  base: string;
  apiKey: string;
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  uploadPath?: string;
}): Promise<string> {
  const base = params.base.replace(/\/$/, "");
  const uploadPath = (params.uploadPath ?? "venysound/voice-records").replace(/^\/+|\/+$/g, "");
  const mime = params.mimeType ?? "audio/webm";

  const form = new FormData();
  const blob = new Blob([new Uint8Array(params.buffer)], { type: mime });
  form.append("file", blob, params.fileName);
  form.append("uploadPath", uploadPath);
  form.append("fileName", params.fileName);

  const res = await fetch(`${base}/api/file-stream-upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${params.apiKey}` },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    code?: number;
    msg?: string;
    data?: { downloadUrl?: string };
  };
  if (!res.ok || json.success === false || (typeof json.code === "number" && json.code !== 200)) {
    throw new Error(json.msg ?? `KIE 파일 업로드 실패 (${res.status})`);
  }
  const url = json.data?.downloadUrl?.trim();
  if (!url) throw new Error("KIE 파일 업로드 응답에 downloadUrl이 없습니다.");
  return url;
}
