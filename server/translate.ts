/**
 * 공지 등 텍스트 자동 번역 (MyMemory 1차, LibreTranslate 2차)
 * 원문은 ko 기준으로 가정하고 en, ja, zh 로 번역
 */

const SOURCE_LANG = "ko";
const TARGET_LANGS = ["en", "ja", "zh"] as const;

export type TranslationMap = Partial<Record<typeof TARGET_LANGS[number], string>>;

/** MyMemory API (무료, 키 불필요). 텍스트가 길면 앞 400자만 번역 */
async function translateWithMyMemory(text: string, targetLang: string): Promise<string> {
  const maxLen = 400;
  const toTranslate = text.length > maxLen ? text.slice(0, maxLen) : text;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(toTranslate)}&langpair=${SOURCE_LANG}|${targetLang}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`MyMemory ${res.status}`);
  const data = await res.json();
  const translated = data?.responseData?.translatedText;
  if (!translated || typeof translated !== "string") throw new Error("MyMemory no translatedText");
  return translated;
}

/** LibreTranslate (공개 인스턴스, 제한 있을 수 있음) */
async function translateWithLibre(text: string, targetLang: string): Promise<string> {
  const res = await fetch("https://libretranslate.com/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: SOURCE_LANG,
      target: targetLang,
      format: "text",
    }),
  });
  if (!res.ok) throw new Error(`LibreTranslate ${res.status}`);
  const data = await res.json();
  return data?.translatedText ?? text;
}

async function translateToLang(text: string, targetLang: string): Promise<string> {
  try {
    return await translateWithMyMemory(text, targetLang);
  } catch (e1) {
    try {
      return await translateWithLibre(text, targetLang);
    } catch (e2) {
      throw new Error(`Translate ${targetLang} failed: MyMemory ${e1}, Libre ${e2}`);
    }
  }
}

/** 원문(한국어)을 en, ja, zh 로 번역. 실패한 언어는 제외하고 반환 */
export async function translateAnnouncementContent(content: string): Promise<TranslationMap> {
  const trimmed = content.trim();
  if (!trimmed) return {};

  const result: TranslationMap = {};
  for (const target of TARGET_LANGS) {
    try {
      result[target] = await translateToLang(trimmed, target);
      if (result[target]) console.info("[translate] ok", target);
    } catch (e) {
      console.warn("[translate] skip", target, e);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (Object.keys(result).length === 0) {
    console.warn("[translate] no translations succeeded for announcement");
  }
  return result;
}
