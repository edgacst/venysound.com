import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./lib/i18n";

/** 탭 최초 로드 URL — TWA 등에서 history.length===2·빈 이전 항목일 때만 스택 보정할지 판별 */
if (typeof window !== "undefined") {
  try {
    if (!sessionStorage.getItem("venyBootPath")) {
      sessionStorage.setItem(
        "venyBootPath",
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
    }
  } catch {
    /* 사생활 모드 등 */
  }
}

createRoot(document.getElementById("root")!).render(<App />);
