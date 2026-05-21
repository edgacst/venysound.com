import { useCallback, useEffect, useRef, useState } from "react";
import { voiceBlobUploadFileName } from "@/lib/voiceAudioFile";
import { formatKieVoiceUserMessage, isKieVoiceCopyrightRejection } from "@shared/kieVoiceUserMessage";

export type CustomVoiceProfile = {
  voiceId: string;
  voiceName: string;
  style: string;
  description: string;
  singerSkillLevel: string;
  updatedAt?: string;
};

export type CustomVoiceWizardStep = "source" | "phrase" | "verify" | "meta" | "done";

const POLL_MS = 2500;
const POLL_MAX = 48;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export function useKieCustomVoiceRegister() {
  const [step, setStep] = useState<CustomVoiceWizardStep>("source");
  const [validateTaskId, setValidateTaskId] = useState<string | null>(null);
  const [generateTaskId, setGenerateTaskId] = useState<string | null>(null);
  const [validatePhrase, setValidatePhrase] = useState("");
  const [voiceName, setVoiceName] = useState("");
  const [style, setStyle] = useState("");
  const [description, setDescription] = useState("created from uploaded voice");
  const [singerSkillLevel, setSingerSkillLevel] = useState("beginner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const reset = useCallback(() => {
    abortRef.current = true;
    setStep("source");
    setValidateTaskId(null);
    setGenerateTaskId(null);
    setValidatePhrase("");
    setVoiceName("");
    setStyle("");
    setDescription("created from uploaded voice");
    setSingerSkillLevel("beginner");
    setBusy(false);
    setError(null);
    abortRef.current = false;
  }, []);

  const pollValidatePhrase = useCallback(async (taskId: string) => {
    abortRef.current = false;
    setBusy(true);
    setError(null);
    try {
      for (let i = 0; i < POLL_MAX; i++) {
        if (abortRef.current) return null;
        const res = await fetch(`/api/ai-music/custom-voice/validate-info?taskId=${encodeURIComponent(taskId)}`, {
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
          status?: string;
          validateInfo?: string;
          errorMessage?: string;
        };
        if (!res.ok) {
          throw new Error(data.message ?? "검증 문구 조회 실패");
        }
        const st = String(data.status ?? "");
        if (st === "processing_validate_fail" || st === "fail") {
          if (isKieVoiceCopyrightRejection(data.errorMessage)) setStep("source");
          throw new Error(formatKieVoiceUserMessage(data.errorMessage, { creditsProvider: "suno" }));
        }
        const phrase = (data.validateInfo ?? "").trim();
        if (phrase && (st === "wait_validating" || st === "processing_validate")) {
          setValidatePhrase(phrase);
          setStep("verify");
          return phrase;
        }
        await sleep(POLL_MS);
      }
      throw new Error("검증 문구 생성 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }, []);

  const submitSource = useCallback(async (blob: Blob) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("audio", blob, voiceBlobUploadFileName(blob, "voice-source"));
      fd.append("vocal_start_s", "0");
      fd.append("vocal_end_s", "15");
      fd.append("language", "ko");
      const res = await fetch("/api/ai-music/custom-voice/validate-source", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; validate_task_id?: string };
      if (!res.ok) throw new Error(formatKieVoiceUserMessage(data.message, { creditsProvider: "suno" }) || "원본 업로드 실패");
      const tid = data.validate_task_id?.trim();
      if (!tid) throw new Error("validate_task_id 없음");
      setValidateTaskId(tid);
      setStep("phrase");
      const phrase = await pollValidatePhrase(tid);
      if (!phrase?.trim()) {
        setStep("phrase");
        throw new Error("검증 문구를 받지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
      return phrase;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "오류";
      setError(msg);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [pollValidatePhrase]);

  /** ② 화면인데 문구가 비었을 때 자동 재조회 */
  useEffect(() => {
    if (step !== "verify" || validatePhrase.trim() || !validateTaskId || busy) return;
    void pollValidatePhrase(validateTaskId).catch(() => {});
  }, [step, validatePhrase, validateTaskId, busy, pollValidatePhrase]);

  const pollVoiceId = useCallback(async (taskId: string) => {
    abortRef.current = false;
    setBusy(true);
    setError(null);
    try {
      for (let i = 0; i < POLL_MAX; i++) {
        if (abortRef.current) return null;
        const res = await fetch(`/api/ai-music/custom-voice/record-info?taskId=${encodeURIComponent(taskId)}`, {
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
          status?: string;
          voiceId?: string;
          errorMessage?: string;
        };
        if (!res.ok) throw new Error(data.message ?? "보이스 등록 상태 조회 실패");
        const st = String(data.status ?? "");
        if (st === "fail" || st === "processing_validate_fail") {
          throw new Error(formatKieVoiceUserMessage(data.errorMessage, { creditsProvider: "suno" }));
        }
        if (st === "success" && data.voiceId?.trim()) {
          setStep("done");
          return data.voiceId.trim();
        }
        await sleep(POLL_MS);
      }
      throw new Error("보이스 등록 시간이 초과되었습니다.");
    } finally {
      setBusy(false);
    }
  }, []);

  const submitVerifyAndRegister = useCallback(async (blob: Blob) => {
    if (!validateTaskId) throw new Error("검증 작업 ID가 없습니다.");
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("audio", blob, voiceBlobUploadFileName(blob, "voice-verify"));
      fd.append("validate_task_id", validateTaskId);
      fd.append("voice_name", voiceName.trim() || "My Voice");
      fd.append("style", style.trim() || "Pop, Korean vocal");
      fd.append("description", description.trim());
      fd.append("singer_skill_level", singerSkillLevel);
      const res = await fetch("/api/ai-music/custom-voice/register", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; generate_task_id?: string };
      if (!res.ok) throw new Error(formatKieVoiceUserMessage(data.message, { creditsProvider: "suno" }) || "등록 요청 실패");
      const gid = data.generate_task_id?.trim();
      if (!gid) throw new Error("generate_task_id 없음");
      setGenerateTaskId(gid);
      return await pollVoiceId(gid);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "오류";
      setError(msg);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [validateTaskId, voiceName, style, description, singerSkillLevel, pollVoiceId]);

  return {
    step,
    setStep,
    validateTaskId,
    validatePhrase,
    voiceName,
    setVoiceName,
    style,
    setStyle,
    description,
    setDescription,
    singerSkillLevel,
    setSingerSkillLevel,
    busy,
    error,
    reset,
    submitSource,
    submitVerifyAndRegister,
    pollValidatePhrase,
  };
}
