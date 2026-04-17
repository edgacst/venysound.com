import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ko from "./locales/ko.json";
import en from "./locales/en.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";

/** 사이트 전용 키 — 다른 서비스·확장이 쓰는 `i18nextLng`와 분리 */
const PRIMARY_STORAGE_KEY = "venysound_i18n_lng";
/** 예전 버전·타 라이브러리 호환 (읽기만 보조, 쓰기는 둘 다 동기화) */
const LEGACY_STORAGE_KEY = "i18nextLng";

const SUPPORTED = new Set(["ko", "en", "zh", "ja"]);

function normalizeLng(code: string | undefined | null): "ko" | "en" | "zh" | "ja" {
  const base = String(code ?? "")
    .trim()
    .split(/[-_]/)[0]
    .toLowerCase();
  if (SUPPORTED.has(base)) return base as "ko" | "en" | "zh" | "ja";
  return "ko";
}

function readPersistedLng(): "ko" | "en" | "zh" | "ja" {
  if (typeof window === "undefined") return "ko";
  try {
    const primary = window.localStorage.getItem(PRIMARY_STORAGE_KEY);
    if (primary) return normalizeLng(primary);
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) return normalizeLng(legacy);
  } catch {
    /* private mode 등 */
  }
  return "ko";
}

const initialLng = readPersistedLng();

export const i18nReady = i18n.use(initReactI18next).init({
  lng: initialLng,
  debug: false,
  resources: {
    ko: { translation: ko },
    en: { translation: en },
    zh: { translation: zh },
    ja: { translation: ja },
  },
  fallbackLng: "ko",
  supportedLngs: ["ko", "en", "zh", "ja"],
  interpolation: {
    escapeValue: false,
  },
});

function persistLng(normalized: "ko" | "en" | "zh" | "ja") {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PRIMARY_STORAGE_KEY, normalized);
      window.localStorage.setItem(LEGACY_STORAGE_KEY, normalized);
    }
  } catch {
    /* ignore */
  }
}

/** HMR 시 리스너 중복 방지 */
const g = globalThis as typeof globalThis & { __venysoundI18nListener?: boolean };
if (!g.__venysoundI18nListener) {
  g.__venysoundI18nListener = true;
  i18n.on("languageChanged", (lng) => {
    persistLng(normalizeLng(lng));
  });
}

void i18nReady.then(() => {
  persistLng(normalizeLng(i18n.language));
});

export default i18n;
