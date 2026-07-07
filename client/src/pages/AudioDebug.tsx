import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

const AUDIO_DEBUG_KEY = "venyAudioDebug";
const AUDIO_DEBUG_BUFFER_KEY = "venyAudioDebugBuffer";

function getEnabled() {
  try {
    return window.localStorage.getItem(AUDIO_DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

function getBufferedLogs() {
  try {
    return window.localStorage.getItem(AUDIO_DEBUG_BUFFER_KEY) || "";
  } catch {
    return "";
  }
}

export default function AudioDebug() {
  const [enabled, setEnabled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logText, setLogText] = useState("");

  const statusText = useMemo(() => (enabled ? "켜짐" : "꺼짐"), [enabled]);

  const refresh = () => {
    setEnabled(getEnabled());
    setLogText(getBufferedLogs());
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 1200);
    return () => window.clearInterval(timer);
  }, []);

  const enable = () => {
    window.localStorage.setItem(AUDIO_DEBUG_KEY, "1");
    refresh();
  };

  const disable = () => {
    window.localStorage.removeItem(AUDIO_DEBUG_KEY);
    refresh();
  };

  const clearLogs = () => {
    window.localStorage.removeItem(AUDIO_DEBUG_BUFFER_KEY);
    setCopied(false);
    refresh();
  };

  const copyLogs = async () => {
    const text = getBufferedLogs();
    setLogText(text);
    try {
      await navigator.clipboard.writeText(text || "(no audio debug logs)");
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold">Audio Debug</h1>
          <p className="mt-2 text-sm text-slate-300">
            상태: <span className={enabled ? "text-emerald-300" : "text-rose-300"}>{statusText}</span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={enable} className="bg-emerald-500 text-white hover:bg-emerald-600">
            진단 켜기
          </Button>
          <Button onClick={disable} variant="secondary">
            진단 끄기
          </Button>
          <Button onClick={copyLogs} className="bg-sky-500 text-white hover:bg-sky-600">
            로그 복사
          </Button>
          <Button onClick={clearLogs} variant="outline" className="border-slate-600 bg-transparent text-white hover:bg-slate-800">
            로그 지우기
          </Button>
        </div>

        {copied ? <p className="text-sm text-emerald-300">복사되었습니다.</p> : null}

        <section className="rounded-lg border border-slate-700 bg-slate-900 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">최근 로그</h2>
            <Button size="sm" variant="ghost" onClick={refresh} className="h-8 text-slate-200 hover:bg-slate-800">
              새로고침
            </Button>
          </div>
          <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-200">
            {logText || "아직 로그가 없습니다. 진단 켜기 후 음악/라디오를 재생하고 통화 테스트를 해주세요."}
          </pre>
        </section>
      </div>
    </main>
  );
}
