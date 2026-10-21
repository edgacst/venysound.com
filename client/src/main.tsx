import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { i18nReady } from "./lib/i18n";

// 서비스워커 등록 (PWA + 웹 푸시)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => {
      console.warn("[SW] 등록 실패:", e);
    });
  });
}

void i18nReady.then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
