import { useRef, useCallback, useState } from "react";

export type RecordingState = "idle" | "recording" | "stopped";

const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "",
] as const;

function pickRecorderMimeType(): string | undefined {
  for (const mime of RECORDER_MIME_CANDIDATES) {
    if (!mime || MediaRecorder.isTypeSupported(mime)) return mime || undefined;
  }
  return undefined;
}

/** 녹음 Blob 재생 호환용 type (codecs=opus 등은 일부 브라우저 audio 태그에서 무음). */
export function normalizeRecordedBlobType(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes("webm")) return "audio/webm";
  if (m.includes("mp4") || m.includes("m4a")) return "audio/mp4";
  if (m.includes("ogg")) return "audio/ogg";
  return mimeType || "audio/webm";
}

/** 마이크 녹음(WebM/Opus 등). AI 보이스 레퍼런스 업로드용. */
export function useVoiceRecorder() {
  const [state, setState] = useState<RecordingState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    if (mediaRecorderRef.current?.state === "recording") return;

    releaseStream();
    chunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    streamRef.current = stream;

    const mimeType = pickRecorderMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.start(250);
    setState("recording");
  }, [releaseStream]);

  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== "recording") {
        releaseStream();
        mediaRecorderRef.current = null;
        chunksRef.current = [];
        setState("idle");
        resolve(new Blob());
        return;
      }

      const finalize = () => {
        const rawType = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blobType = normalizeRecordedBlobType(rawType);
        const blob = new Blob(chunksRef.current, { type: blobType });
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        releaseStream();
        setState("stopped");
        resolve(blob);
      };

      recorder.onstop = () => {
        window.setTimeout(finalize, 50);
      };

      try {
        if (typeof recorder.requestData === "function") {
          recorder.requestData();
        }
      } catch {
        /* ignore */
      }
      recorder.stop();
    });
  }, [releaseStream]);

  const resetRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      try {
        if (typeof recorder.requestData === "function") recorder.requestData();
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    releaseStream();
    setState("idle");
  }, [releaseStream]);

  return { state, startRecording, stopRecording, resetRecording };
}
