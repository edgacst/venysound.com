import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ko from './locales/ko.json';
import en from './locales/en.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    debug: false,
    resources: {
      ko: { translation: ko },
      en: { translation: en },
      zh: { translation: zh },
      ja: { translation: ja },
    },
    fallbackLng: 'ko',
    supportedLngs: ['ko', 'en', 'zh', 'ja'],
    interpolation: {
      escapeValue: false,
    },
    // localStorage에 사용자가 고른 값이 있을 때만 반영. navigator 자동 감지는
    // OS/브라우저가 영어면 '선택 안 함'인데도 영어로 넘어가는 문제를 일으킴.
    detection: {
      order: ['localStorage'],
      caches: ['localStorage'],
    },
  });

export default i18n;
