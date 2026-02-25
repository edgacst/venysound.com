/**
 * 공지 등 텍스트 자동 번역 (LibreTranslate 공개 API 사용, API 키 불필요)
 * 원문은 ko 기준으로 가정하고 en, ja, zh 로 번역
 */

const LIBRE_TRANSLATE_URL = "https://libretranslate.com/translate";
const SOURCE_LANG = "ko";
const TARGET_LANGS = ["en", "ja", "zh"] as const;

export type TranslationMap = Partial<Record<typeof TARGET_LANGS[number], string>>;

async function translateChunk(text: string, targetLang: string): Promise<string> {
  const res = await fetch(LIBRE_TRANSLATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: SOURCE_LANG,
      target: targetLang,
      format: "text",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Translate ${targetLang}: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.translatedText ?? text;
}

/** 원문(한국어)을 en, ja, zh 로 번역. 실패한 언어는 제외하고 반환 */
export async function translateAnnouncementContent(content: string): Promise<TranslationMap> {
  const trimmed = content.trim();
  if (!trimmed) return {};

  const result: TranslationMap = {};
  for (const target of TARGET_LANGS) {
    try {
      result[target] = await translateChunk(trimmed, target);
    } catch (e) {
      console.warn("[translate] skip", target, e);
    }
  }
  return result;
}
