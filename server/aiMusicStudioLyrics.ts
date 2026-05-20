/**
 * Create Music 스튜디오: 가사 생성(KIE/Suno 호환) · 가사 최적화(OpenAI).
 * 음악 생성 과금과 별도 — KIE 가사 API 크레딧 / OpenAI 토큰은 각 제공사 정책을 따릅니다.
 */
import OpenAI from "openai";

export type StudioLyricsVariation = { text: string; title?: string };

const KIE_LYRICS_POLL_MS = 2_500;
const KIE_LYRICS_MAX_WAIT_MS = 120_000;
const KIE_LYRICS_PROMPT_MAX = 200;

function getOpenAI(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }
  return new OpenAI({ apiKey: apiKey.trim() });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** KIE 가사 생성 prompt — 최대 200자 */
export function buildKieLyricsPrompt(params: {
  theme: string;
  styleTags?: string;
  existingLyrics?: string;
}): string {
  const style = (params.styleTags ?? "").trim();
  const theme = (params.theme ?? "").trim();
  const existing = (params.existingLyrics ?? "").trim();
  let p: string;
  if (existing) {
    const head = existing.replace(/\s+/g, " ").slice(0, 100);
    p = style
      ? `${style}. Song lyrics theme or draft: ${head}`
      : `Song lyrics theme or draft: ${head}`;
  } else if (theme && style) {
    p = `${style}. ${theme}`;
  } else {
    p = theme || style || "A heartfelt original pop song about hope and connection";
  }
  p = p.replace(/\s+/g, " ").trim();
  if (p.length > KIE_LYRICS_PROMPT_MAX) {
    p = p.slice(0, KIE_LYRICS_PROMPT_MAX - 1) + "…";
  }
  return p;
}

function pickLyricsVariationsFromKieRecord(data: unknown): StudioLyricsVariation[] {
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const d = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
  const response = d.response && typeof d.response === "object" ? (d.response as Record<string, unknown>) : null;
  const list = response?.data;
  if (!Array.isArray(list)) return [];
  const out: StudioLyricsVariation[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const status = String(o.status ?? "").toLowerCase();
    if (status === "failed") continue;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!text) continue;
    const title = typeof o.title === "string" ? o.title.trim() : undefined;
    out.push({ text, title: title || undefined });
  }
  return out;
}

export async function kieGenerateLyrics(params: {
  base: string;
  key: string;
  prompt: string;
  callBackUrl: string;
}): Promise<StudioLyricsVariation[]> {
  const createRes = await fetch(`${params.base.replace(/\/$/, "")}/api/v1/lyrics`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: params.prompt,
      callBackUrl: params.callBackUrl,
    }),
  });
  const createJson = (await createRes.json().catch(() => ({}))) as {
    code?: number;
    msg?: string;
    data?: { taskId?: string };
  };
  if (!createRes.ok || createJson.code !== 200) {
    throw new Error(createJson.msg ?? `가사 생성 요청 실패 (${createRes.status})`);
  }
  const taskId = createJson.data?.taskId;
  if (!taskId) throw new Error("가사 생성 taskId를 받지 못했습니다.");

  const started = Date.now();
  while (Date.now() - started < KIE_LYRICS_MAX_WAIT_MS) {
    await sleep(KIE_LYRICS_POLL_MS);
    const pollRes = await fetch(
      `${params.base.replace(/\/$/, "")}/api/v1/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${params.key}` } },
    );
    const pollJson = (await pollRes.json().catch(() => ({}))) as {
      code?: number;
      msg?: string;
      data?: { status?: string; errorMessage?: string };
    };
    if (!pollRes.ok || (typeof pollJson.code === "number" && pollJson.code !== 200)) {
      throw new Error(pollJson.msg ?? `가사 조회 실패 (${pollRes.status})`);
    }
    const status = String(pollJson.data?.status ?? "PENDING").toUpperCase();
    if (status === "PENDING") continue;
    if (
      status === "CREATE_TASK_FAILED" ||
      status === "GENERATE_LYRICS_FAILED" ||
      status === "CALLBACK_EXCEPTION" ||
      status === "SENSITIVE_WORD_ERROR"
    ) {
      throw new Error(pollJson.data?.errorMessage ?? pollJson.msg ?? `가사 생성 실패 (${status})`);
    }
    if (status === "SUCCESS") {
      const variations = pickLyricsVariationsFromKieRecord(pollJson);
      if (variations.length === 0) throw new Error("생성된 가사가 비어 있습니다.");
      return variations;
    }
  }
  throw new Error("가사 생성 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
}

export async function openaiGenerateStudioLyrics(params: {
  theme: string;
  styleTags?: string;
  language?: string;
}): Promise<StudioLyricsVariation> {
  const openai = getOpenAI();
  const lang = (params.language ?? "ko").toLowerCase().startsWith("en") ? "English" : "Korean";
  const userPayload = {
    language: lang,
    theme: params.theme.slice(0, 2000),
    style_tags: (params.styleTags ?? "").slice(0, 500),
  };
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.85,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You write original song lyrics for AI music generation. Return ONLY JSON: {"title":"...","lyrics":"..."}.
- lyrics must use section markers like [Verse], [Chorus], [Bridge] on their own lines.
- Write in ${lang}. No copyrighted artist names or existing song titles.
- title under 50 characters.`,
      },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
  });
  const text = completion.choices[0]?.message?.content?.trim() ?? "{}";
  let parsed: { title?: string; lyrics?: string };
  try {
    parsed = JSON.parse(text) as { title?: string; lyrics?: string };
  } catch {
    parsed = {};
  }
  const lyrics = typeof parsed.lyrics === "string" ? parsed.lyrics.trim() : "";
  if (!lyrics) throw new Error("가사 생성 결과가 비어 있습니다.");
  const title = typeof parsed.title === "string" ? parsed.title.trim().slice(0, 50) : undefined;
  return { text: lyrics, title: title || undefined };
}

export async function openaiOptimizeStudioLyrics(params: {
  lyrics: string;
  styleTags?: string;
  language?: string;
}): Promise<StudioLyricsVariation> {
  const openai = getOpenAI();
  const lang = (params.language ?? "ko").toLowerCase().startsWith("en") ? "English" : "Korean";
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.5,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You improve song lyrics for AI music tools. Return ONLY JSON: {"title":"...","lyrics":"..."}.
- Keep the author's intent; fix grammar, rhythm, and structure.
- Use [Verse], [Chorus], [Bridge] markers. Language: ${lang}.
- title optional, under 50 chars. No artist names.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          style_tags: (params.styleTags ?? "").slice(0, 500),
          lyrics: params.lyrics.slice(0, 12000),
        }),
      },
    ],
  });
  const text = completion.choices[0]?.message?.content?.trim() ?? "{}";
  let parsed: { title?: string; lyrics?: string };
  try {
    parsed = JSON.parse(text) as { title?: string; lyrics?: string };
  } catch {
    parsed = {};
  }
  const lyrics = typeof parsed.lyrics === "string" ? parsed.lyrics.trim() : "";
  if (!lyrics) throw new Error("최적화 결과가 비어 있습니다.");
  const title = typeof parsed.title === "string" ? parsed.title.trim().slice(0, 50) : undefined;
  return { text: lyrics, title: title || undefined };
}

export function mapOpenAiError(err: unknown): { status: number; message: string } {
  if (err instanceof Error && err.message === "OPENAI_API_KEY_MISSING") {
    return {
      status: 503,
      message: "가사 최적화·보조 생성을 사용하려면 서버에 OPENAI_API_KEY를 설정해 주세요.",
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("rate") || lower.includes("429")) {
    return { status: 429, message: "요청이 많습니다. 잠시 후 다시 시도해 주세요." };
  }
  return { status: 500, message: msg || "가사 처리에 실패했습니다." };
}
