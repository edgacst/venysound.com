/**
 * 음악 생성 전 가사 초안 미리보기(과금 없음). OPENAI_API_KEY 또는 AI_INTEGRATIONS_OPENAI_API_KEY.
 */
import OpenAI from "openai";

function getOpenAI(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }
  return new OpenAI({ apiKey });
}

export async function generatePreviewSongLyrics(params: {
  partialLyrics: string;
  moodDescription: string;
  styleHint: string;
}): Promise<string> {
  const partial = (params.partialLyrics ?? "").trim().slice(0, 6000);
  const mood = (params.moodDescription ?? "").trim().slice(0, 8000);
  const style = (params.styleHint ?? "").trim().slice(0, 500);

  const openai = getOpenAI();
  const system = `You are a songwriting assistant for pop/K-pop style songs.
Return ONLY the lyrics text, no markdown fences, no commentary.
Use clear section labels like [Verse 1], [Chorus], [Bridge] where appropriate.
Match the language of the user's partial lyrics if they wrote Korean, use Korean; if English, use English; if mixed, keep that style.
If partial lyrics are empty, invent a full song from the mood/description only.
Keep total length reasonable for a 3–4 minute song (not an epic).`;

  const userParts: string[] = [];
  if (style) userParts.push(`Style / instrumentation hints: ${style}`);
  if (partial && mood && partial === mood) {
    userParts.push(`Song direction, theme, and/or partial lyrics to extend:\n${partial}`);
  } else {
    if (mood) userParts.push(`Mood / theme / description:\n${mood}`);
    if (partial) userParts.push(`Existing lyrics to continue from (keep voice and tone):\n${partial}`);
    if (!mood && !partial) userParts.push("No input — write a short pop song.");
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.75,
    max_tokens: 4096,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userParts.join("\n\n---\n\n") },
    ],
  });
  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("EMPTY_LYRICS_PREVIEW");
  return text.length > 12000 ? text.slice(0, 12000) : text;
}
