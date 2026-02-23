import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { i18nReady } from "./lib/i18n";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

i18nReady.then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
