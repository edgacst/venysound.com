/**
 * 음원 소유자용: 동영상 플랫폼 홍보 문구(제목 후보·설명·태그·고정댓글·다국어) 생성.
 * OPENAI_API_KEY 또는 AI_INTEGRATIONS_OPENAI_API_KEY 필요.
 */
import OpenAI from "openai";

export type PromoSocialKit = {
  titleIdeas: string[];
  descriptionKo: string;
  descriptionEn: string;
  videoTags: string;
  hashtagsLine: string;
  pinnedCommentKo: string;
  pinnedCommentEn: string;
};

function getOpenAI(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }
  return new OpenAI({ apiKey });
}

function safeString(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.slice(0, max).trim();
}

function safeStringArray(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim().slice(0, maxLen))
    .filter((s) => s.length > 0)
    .slice(0, maxItems);
}

export function normalizePromoKit(raw: unknown): PromoSocialKit {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const titles = safeStringArray(o.titleIdeas, 5, 120);
  while (titles.length < 3) titles.push("");
  return {
    titleIdeas: titles.slice(0, 3).map((s) => s || "—"),
    descriptionKo: safeString(o.descriptionKo, 4500),
    descriptionEn: safeString(o.descriptionEn, 4500),
    videoTags: safeString(o.videoTags, 400),
    hashtagsLine: safeString(o.hashtagsLine, 400),
    pinnedCommentKo: safeString(o.pinnedCommentKo, 800),
    pinnedCommentEn: safeString(o.pinnedCommentEn, 800),
  };
}

export async function generatePromoSocialKit(params: {
  title: string;
  artist: string;
  genre?: string | null;
  tags?: string | null;
  lyricsSnippet?: string | null;
  isAi?: boolean;
  trackUrl: string;
  siteLabel: string;
}): Promise<PromoSocialKit> {
  const openai = getOpenAI();
  const payload = {
    title: params.title,
    artist: params.artist,
    genre: params.genre ?? "",
    tags: params.tags ?? "",
    lyrics_excerpt: (params.lyricsSnippet ?? "").slice(0, 2500),
    is_ai_assisted: Boolean(params.isAi),
    official_listen_url: params.trackUrl,
    platform_name: params.siteLabel,
  };

  const system = `You help independent musicians write metadata for long-form music videos (official audio / lyric video style) on major video platforms.
Return ONLY a JSON object with these exact keys (all strings except titleIdeas):
- titleIdeas: array of exactly 3 distinct title strings, each under 95 characters, catchy and searchable, include artist name where natural, Korean or mixed Korean/English as fits the track.
- descriptionKo: Korean description, 2–4 short paragraphs, first paragraph hook, include the official_listen_url on its own line once, mention ${params.siteLabel}, CTA to stream/support, no fabricated awards.
- descriptionEn: English translation of the same intent, same URL line once.
- videoTags: single line, comma-separated platform-appropriate keywords (no #), under 400 characters.
- hashtagsLine: single line of hashtags separated by spaces (with #), under 400 characters, mix Korean and English.
- pinnedCommentKo: one short Korean first/pinned comment inviting likes, subs, and link to ${params.siteLabel}.
- pinnedCommentEn: English version, same tone, under 500 characters.
Do not include markdown fences or commentary outside JSON.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 4096,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(payload) },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    parsed = {};
  }
  return normalizePromoKit(parsed);
}
