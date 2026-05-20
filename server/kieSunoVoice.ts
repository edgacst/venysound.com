/**
 * KIE Suno custom voice API (validate → generate → voiceId).
 * @see https://docs.kie.ai/suno-api/suno-voice-validate
 */

export type KieVoiceUpstream = { base: string; key: string };

type KieEnvelope<T> = {
  code?: number;
  msg?: string;
  data?: T;
};

export function kieVoiceBizOk(json: KieEnvelope<unknown>): boolean {
  const code = json.code;
  return code === undefined || code === 200;
}

export async function kieVoiceFetchJson<T>(
  upstream: KieVoiceUpstream,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: KieEnvelope<T> }> {
  const base = upstream.base.replace(/\/$/, "");
  const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${upstream.key}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as KieEnvelope<T>;
  const bizOk = res.ok && kieVoiceBizOk(json);
  return { ok: bizOk, status: res.status, json };
}

export async function kieVoiceValidateSource(params: {
  upstream: KieVoiceUpstream;
  voiceUrl: string;
  vocalStartS: number;
  vocalEndS: number;
  language?: string;
}): Promise<{ taskId: string }> {
  const body: Record<string, unknown> = {
    voiceUrl: params.voiceUrl,
    vocalStartS: params.vocalStartS,
    vocalEndS: params.vocalEndS,
  };
  if (params.language?.trim()) body.language = params.language.trim();

  const { ok, json } = await kieVoiceFetchJson<{ taskId?: string }>(params.upstream, "/api/v1/voice/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!ok) {
    throw new Error(json.msg ?? "검증 문구 생성 요청에 실패했습니다.");
  }
  const taskId = json.data?.taskId?.trim();
  if (!taskId) throw new Error("검증 taskId가 없습니다.");
  return { taskId };
}

export async function kieVoiceValidateInfo(
  upstream: KieVoiceUpstream,
  taskId: string,
): Promise<{
  taskId: string;
  status: string;
  validateInfo?: string;
  errorMessage?: string;
}> {
  const q = new URLSearchParams({ taskId });
  const { ok, json } = await kieVoiceFetchJson<{
    taskId?: string;
    status?: string;
    validateInfo?: string;
    errorMessage?: string;
  }>(upstream, `/api/v1/voice/validate-info?${q}`);

  if (!ok) {
    throw new Error(json.msg ?? "검증 문구 조회에 실패했습니다.");
  }
  const d = json.data ?? {};
  return {
    taskId: d.taskId ?? taskId,
    status: String(d.status ?? ""),
    validateInfo: typeof d.validateInfo === "string" ? d.validateInfo : undefined,
    errorMessage: typeof d.errorMessage === "string" ? d.errorMessage : undefined,
  };
}

export async function kieVoiceGenerate(params: {
  upstream: KieVoiceUpstream;
  taskId: string;
  verifyUrl: string;
  voiceName?: string;
  style?: string;
  description?: string;
  singerSkillLevel?: string;
}): Promise<{ taskId: string }> {
  const body: Record<string, unknown> = {
    taskId: params.taskId,
    verifyUrl: params.verifyUrl,
  };
  if (params.voiceName?.trim()) body.voiceName = params.voiceName.trim().slice(0, 120);
  if (params.style?.trim()) body.style = params.style.trim().slice(0, 500);
  if (params.description?.trim()) body.description = params.description.trim().slice(0, 500);
  const skill = params.singerSkillLevel?.trim();
  if (skill && ["beginner", "intermediate", "advanced", "professional"].includes(skill)) {
    body.singerSkillLevel = skill;
  }

  const { ok, json } = await kieVoiceFetchJson<{ taskId?: string }>(params.upstream, "/api/v1/voice/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!ok) {
    throw new Error(json.msg ?? "보이스 등록 요청에 실패했습니다.");
  }
  const genTaskId = json.data?.taskId?.trim();
  if (!genTaskId) throw new Error("보이스 생성 taskId가 없습니다.");
  return { taskId: genTaskId };
}

export async function kieVoiceRecordInfo(
  upstream: KieVoiceUpstream,
  taskId: string,
): Promise<{
  taskId: string;
  status: string;
  voiceId?: string;
  errorMessage?: string;
}> {
  const q = new URLSearchParams({ taskId });
  const { ok, json } = await kieVoiceFetchJson<{
    taskId?: string;
    status?: string;
    voiceId?: string;
    errorMessage?: string;
  }>(upstream, `/api/v1/voice/record-info?${q}`);

  if (!ok) {
    throw new Error(json.msg ?? "보이스 등록 상태 조회에 실패했습니다.");
  }
  const d = json.data ?? {};
  return {
    taskId: d.taskId ?? taskId,
    status: String(d.status ?? ""),
    voiceId: typeof d.voiceId === "string" && d.voiceId.trim() ? d.voiceId.trim() : undefined,
    errorMessage: typeof d.errorMessage === "string" ? d.errorMessage : undefined,
  };
}

/** Suno generate API — 등록 voiceId 적용 시 V5+ customMode 필요 */
export function sunoModelSupportsVoicePersona(resolvedModel: string): boolean {
  return resolvedModel === "V5" || resolvedModel === "V5_5";
}
