import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { i18nReady } from "./lib/i18n";

let didMount = false;

function mountApp() {
  if (didMount) return;
  const root = document.getElementById("root");
  if (!root) return;
  didMount = true;
  createRoot(root).render(<App />);
}

void i18nReady.then(mountApp).catch((err) => {
  console.error("[startup] i18n init failed; mounting app with fallback locale", err);
  mountApp();
});

window.setTimeout(mountApp, 2000);
