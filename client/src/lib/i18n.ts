import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ko from "./locales/ko.json";
import en from "./locales/en.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";

/** 기존 i18next-browser-languagedetector와 동일 키 — 사용자 설정 유지 */
const STORAGE_KEY = "i18nextLng";

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
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeLng(raw);
  } catch {
    /* private mode 등 */
  }
  return "ko";
}

const initialLng = readPersistedLng();

void i18n.use(initReactI18next).init({
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

/** 사용자가 메뉴에서 바꾼 뒤에도 새로고침 후 동일 언어 유지 */
i18n.on("languageChanged", (lng) => {
  const normalized = normalizeLng(lng);
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, normalized);
    }
  } catch {
    /* ignore */
  }
});

export default i18n;
