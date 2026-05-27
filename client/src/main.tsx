import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { i18nReady } from "./lib/i18n";

void i18nReady.then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
