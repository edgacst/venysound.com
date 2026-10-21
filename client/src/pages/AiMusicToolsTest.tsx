import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

/**
 * 로컬 테스트 전용 페이지.
 * KIE/Suno API 신규 기능(Replace Section, Advanced Stem Separation) 연동 확인용.
 * 절대 프로덕션에 노출하지 말 것 — /ai-music-tools-test
 */

type Provider = "kie" | "suno";

type LibraryTrack = {
  id?: string;
  title?: string;
  createdAt?: number;
  clip_id?: string;
  generationTaskId?: string;
  generationProvider?: string;
  audio_url?: string;
};

/* ------------------------------------------------------------------ */
/* 라이브러리 저장                                                      */
/* ------------------------------------------------------------------ */

/** 결과 오디오 하나를 "내 라이브러리"에 새 곡으로 저장 (기존 곡은 건드리지 않음) */
async function saveTrackToLibrary(track: {
  title: string;
  audioUrl: string;
  provider: Provider;
  generationTaskId?: string;
  tags?: string;
  prompt?: string;
}) {
  const id = `local-tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await apiRequest("PUT", "/api/ai-music/library", {
    tracks: [
      {
        id,
        createdAt: Date.now(),
        clip_id: id,
        audio_url: track.audioUrl,
        title: track.title,
        tags: track.tags,
        prompt: track.prompt,
        generationTaskId: track.generationTaskId,
        generationProvider: track.provider,
      },
    ],
  });
  if (!res.ok) {
    let msg = `저장 실패 (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data?.message) msg = data.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

/* ------------------------------------------------------------------ */
/* 공통 UI 부품                                                        */
/* ------------------------------------------------------------------ */

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

function SectionHeader({
  step,
  icon,
  title,
  subtitle,
}: {
  step?: string;
  icon: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {step ? (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-xs font-bold text-white shadow-lg shadow-sky-500/20">
          {step}
        </span>
      ) : (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-base font-semibold text-white sm:text-lg">
          {step ? <span>{icon}</span> : null} {title}
        </h2>
        {subtitle ? <p className="mt-1 text-xs leading-relaxed text-slate-400">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs text-slate-300">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50";

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <Field label={label}>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </Field>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={`${inputClass} resize-y`}
      />
    </Field>
  );
}

function StyledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** 선택지가 적은 값(provider, 모드, type 등)을 위한 세그먼트 버튼 그룹 — select보다 한눈에 들어옴 */
function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean; disabledReason?: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-slate-950/60 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => !o.disabled && onChange(o.value)}
            disabled={o.disabled}
            title={o.disabled ? o.disabledReason : undefined}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              o.disabled
                ? "cursor-not-allowed text-slate-600 line-through opacity-50"
                : value === o.value
                  ? "bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow shadow-sky-500/30"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 화면 표시용 — 실제 차감액은 서버(server/routes.ts)가 확정. 여기 값은 그것과 반드시 일치시킬 것. (kie 크레딧 × 15원) */
const REPLACE_SECTION_PRICE_WON_CLIENT = 75;
const STEM_SEPARATION_PRICE_WON_CLIENT: Record<"separate_vocal" | "split_stem" | "split_stem_advanced", number> = {
  separate_vocal: 150,
  split_stem: 750,
  split_stem_advanced: 300,
};

const PROVIDER_OPTIONS: { value: Provider; label: string; disabled?: boolean; disabledReason?: string }[] = [
  {
    value: "kie",
    label: "kie.ai",
    disabled: true,
    disabledReason: "지금은 kie.ai 계정 크레딧이 소진돼서 사용할 수 없어요. sunoapi.org를 이용해 주세요.",
  },
  { value: "suno", label: "sunoapi.org" },
];

/* ------------------------------------------------------------------ */
/* 진행 상태 파싱 + 안내 메시지                                         */
/* ------------------------------------------------------------------ */

type Phase = "idle" | "submitting" | "pending" | "success" | "fail";

function extractStatusText(pollResult: unknown): string | null {
  if (!pollResult || typeof pollResult !== "object") return null;
  const obj: any = pollResult;
  const candidates = [
    obj.state,
    obj.status,
    obj.data?.status,
    obj.data?.state,
    obj.data?.successFlag,
    obj.data?.response?.successFlag,
    obj.data?.response?.status,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim().toUpperCase();
  }
  return null;
}

function extractErrorMessage(pollResult: unknown): string | undefined {
  if (!pollResult || typeof pollResult !== "object") return undefined;
  const obj: any = pollResult;
  const candidates = [obj.msg, obj.message, obj.data?.errorMessage, obj.data?.response?.errorMessage, obj.error];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return undefined;
}

function statusToPhase(status: string | null): "pending" | "success" | "fail" | null {
  if (!status) return null;
  if (/SUCCESS|COMPLETE|DONE|FIRST_SUCCESS/.test(status)) return "success";
  if (/FAIL|ERROR/.test(status)) return "fail";
  return "pending";
}

function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

/** 처리 중 로딩(경과 시간) / 완료 메시지 / 실패 메시지를 하나로 보여줌 — 원본 JSON 대신 사람이 읽는 안내문 */
function ProcessStatus({
  phase,
  elapsedS,
  successMessage,
  errorMessage,
  onRetry,
}: {
  phase: Phase;
  elapsedS: number;
  successMessage: string;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  if (phase === "idle") return null;

  if (phase === "submitting" || phase === "pending") {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
        </span>
        <span>
          {phase === "submitting" ? "요청을 보내는 중…" : "AI가 처리하는 중…"}{" "}
          <span className="font-mono text-amber-300">{fmtElapsed(elapsedS)}</span> 경과 · 보통 1~3분 정도 걸려요.
        </span>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200">
        <span>✅</span>
        <span>{successMessage}</span>
      </div>
    );
  }

  // fail
  const isInsufficientBalance = Boolean(errorMessage && /잔액이 부족/.test(errorMessage));
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
      <span className="flex items-center gap-2.5">
        <span>❌</span>
        <span>{errorMessage || "처리에 실패했어요. 잠시 후 다시 시도해 주세요."}</span>
      </span>
      <span className="ml-auto flex items-center gap-2">
        {isInsufficientBalance ? (
          <a
            href="/credits"
            className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
          >
            지갑 충전하기 →
          </a>
        ) : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
          >
            다시 시도
          </button>
        ) : null}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 라이브러리 선택                                                      */
/* ------------------------------------------------------------------ */

function LibraryPicker({
  onPick,
}: {
  onPick: (v: { taskId: string; audioId: string; provider: Provider; title: string }) => void;
}) {
  const [tracks, setTracks] = useState<LibraryTrack[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pickedKey, setPickedKey] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("GET", "/api/ai-music/library");
      const data = await res.json();
      const list: LibraryTrack[] = Array.isArray(data?.tracks) ? data.tracks : [];
      // taskId + audioId(clip_id)가 모두 있는 곡만 (구간 교체·스템 분리에 필요)
      const usable = list.filter((t) => t.generationTaskId && t.clip_id);
      setTracks(usable.slice(0, 20));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const pick = (t: LibraryTrack, key: string) => {
    const provider: Provider = t.generationProvider === "suno" ? "suno" : "kie";
    onPick({
      taskId: t.generationTaskId ?? "",
      audioId: t.clip_id ?? "",
      provider,
      title: t.title ?? "(제목 없음)",
    });
    setPickedKey(key);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          icon="📚"
          title="내 라이브러리에서 곡 선택"
          subtitle='"새로 만들기"에서 생성 후 저장된 곡 목록을 불러와요. 클릭 한 번으로 아래 두 도구의 taskId·audioId가 자동으로 채워집니다.'
        />
        <Button
          onClick={load}
          disabled={loading}
          className="shrink-0 bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-sky-500/20 hover:from-sky-300 hover:to-blue-500"
        >
          {loading ? "불러오는 중…" : "라이브러리 불러오기"}
        </Button>
      </div>

      {error ? (
        <p className="mt-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      {tracks !== null ? (
        tracks.length === 0 ? (
          <p className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-3 text-sm text-slate-400">
            taskId·audioId가 있는 저장된 곡이 없어요. 먼저 "새로 만들기"에서 곡을 하나 생성·저장한 뒤 다시 불러와 주세요.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {tracks.map((t, i) => {
              const key = `${t.generationTaskId}-${t.clip_id}-${i}`;
              const selected = key === pickedKey;
              return (
                <div
                  key={key}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
                    selected
                      ? "border-emerald-500/40 bg-emerald-500/[0.06]"
                      : "border-white/10 bg-slate-950/40 hover:border-white/20"
                  }`}
                >
                  <div className="min-w-0 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-white">{t.title || "(제목 없음)"}</span>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        {t.generationProvider || "?"}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px] text-slate-500">
                      taskId: {t.generationTaskId} · audioId: {t.clip_id}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => pick(t, key)}
                    className={
                      selected
                        ? "shrink-0 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                        : "shrink-0 bg-emerald-500 text-white hover:bg-emerald-600"
                    }
                  >
                    {selected ? "✓ 선택됨" : "이 곡 선택"}
                  </Button>
                </div>
              );
            })}
          </div>
        )
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 오디오 재생 목록 (파형 플레이어)                                     */
/* ------------------------------------------------------------------ */

type AudioPlayerInfo = { label: string; url: string; onSave?: () => Promise<void> };

/** stemName/필드명 → 화면에 보여줄 한국어 라벨 */
const STEM_LABEL_KO: Record<string, string> = {
  vocal: "🎤 보컬 (가사)",
  vocals: "🎤 보컬 (가사)",
  instrumental: "🎹 반주 (MR)",
  backingVocals: "🎤 코러스",
  drums: "🥁 드럼",
  bass: "🎸 베이스",
  guitar: "🎸 기타",
  piano: "🎹 피아노",
  keyboard: "🎹 키보드",
  percussion: "🥁 퍼커션",
  strings: "🎻 현악",
  synth: "🎛️ 신스",
  fx: "✨ 이펙트",
  brass: "🎺 관악(브라스)",
  woodwinds: "🎷 목관악기",
};
function stemLabelKo(key: string): string {
  const k = key.trim();
  return STEM_LABEL_KO[k] || STEM_LABEL_KO[k.toLowerCase()] || key;
}

/** Stem Separation 폴링 결과(response 안의 *Url 필드들, 또는 originData 배열)에서 재생 가능한 오디오 목록 추출 */
function extractStemPlayers(pollResult: unknown): { label: string; url: string }[] {
  const resp = (pollResult as any)?.data?.response;
  if (!resp || typeof resp !== "object") return [];
  if (Array.isArray(resp.originData) && resp.originData.length > 0) {
    return resp.originData
      .filter((s: any) => typeof s?.audio_url === "string" && s.audio_url)
      .map((s: any) => ({ label: stemLabelKo(s.stem_type_group_name || "stem"), url: s.audio_url as string }));
  }
  const players: { label: string; url: string }[] = [];
  for (const [k, v] of Object.entries(resp)) {
    if (k.endsWith("Url") && typeof v === "string" && v) {
      players.push({ label: stemLabelKo(k.replace(/Url$/, "")), url: v });
    }
  }
  return players;
}

/** Replace Section 폴링 결과({state, data:[clip,...]})에서 재생 가능한 오디오 목록 추출 */
function extractReplaceSectionPlayers(pollResult: unknown): { label: string; url: string }[] {
  const data = (pollResult as any)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((c: any) => typeof c?.audio_url === "string" && c.audio_url)
    .map((c: any, i: number) => ({ label: c.title || `클립 ${i + 1}`, url: c.audio_url as string }));
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${sec}`;
}

/** 오디오 URL 하나를 파형(웨이브폼) + 재생 버튼 + 저장 버튼으로 보여줌. 파형 분석(fetch+decode)이 CORS 등으로 실패해도 기본 재생 컨트롤은 항상 동작함. */
function WaveformPlayer({ url, label, onSave }: { url: string; label: string; onSave?: () => Promise<void> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [waveError, setWaveError] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    setWaveError(false);
    (async () => {
      try {
        const AudioCtx: typeof AudioContext | undefined =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) throw new Error("no AudioContext");
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const ctx = new AudioCtx();
        const audioBuf = await ctx.decodeAudioData(buf.slice(0));
        if (cancelled) return;
        const channel = audioBuf.getChannelData(0);
        const samples = 220;
        const blockSize = Math.max(1, Math.floor(channel.length / samples));
        const result: number[] = [];
        for (let i = 0; i < samples; i++) {
          const start = i * blockSize;
          let max = 0;
          for (let j = 0; j < blockSize; j++) {
            const v = Math.abs(channel[start + j] ?? 0);
            if (v > max) max = v;
          }
          result.push(max);
        }
        const peakMax = Math.max(...result, 0.0001);
        if (!cancelled) setPeaks(result.map((v) => v / peakMax));
        void ctx.close();
      } catch {
        if (!cancelled) setWaveError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 300;
    const height = canvas.clientHeight || 48;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const g = canvas.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    const barGap = 1;
    const barWidth = width / peaks.length;
    const playedBars = Math.floor(progress * peaks.length);
    peaks.forEach((p, i) => {
      const barHeight = Math.max(2, p * height);
      const x = i * barWidth;
      const y = (height - barHeight) / 2;
      const played = i <= playedBars;
      g.fillStyle = played ? "#38bdf8" : "#3f495c";
      const r = Math.min(2, Math.max(1, barWidth - barGap) / 2);
      g.beginPath();
      // @ts-ignore roundRect widely supported in modern browsers
      if (typeof (g as any).roundRect === "function") {
        (g as any).roundRect(x, y, Math.max(1, barWidth - barGap), barHeight, r);
        g.fill();
      } else {
        g.fillRect(x, y, Math.max(1, barWidth - barGap), barHeight);
      }
    });
  }, [peaks, progress]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setProgress(audio.currentTime / audio.duration);
    setCurrentTime(audio.currentTime);
  };

  const seek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas || !audio.duration) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  };

  const handleSave = async () => {
    if (!onSave || saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    try {
      await onSave();
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/60 p-3 transition-colors hover:border-white/20">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="truncate font-semibold text-white">{label}</span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[11px] text-slate-500">
            {fmtTime(currentTime)} / {fmtTime(duration)}
          </span>
          {onSave ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={saveState === "saving" || saveState === "saved"}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                saveState === "saved"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : saveState === "error"
                    ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                    : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {saveState === "saved"
                ? "✓ 저장됨"
                : saveState === "saving"
                  ? "저장 중…"
                  : saveState === "error"
                    ? "저장 실패 · 재시도"
                    : "💾 저장"}
            </button>
          ) : null}
          <a href={url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
            원본 ↗
          </a>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "정지" : "재생"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-sky-500/20 transition-transform hover:scale-105 active:scale-95"
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <canvas
          ref={canvasRef}
          onClick={seek}
          className="h-12 w-full min-w-0 flex-1 cursor-pointer overflow-hidden rounded-lg bg-slate-900"
        />
      </div>
      {!peaks && !waveError ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" /> 파형 분석 중…
        </p>
      ) : null}
      {waveError ? (
        <p className="mt-1.5 text-[11px] text-amber-400">파형 미리보기는 실패했지만(CORS 등), 재생 버튼은 정상 동작해요.</p>
      ) : null}
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        className="hidden"
      />
    </div>
  );
}

function AudioPlayerList({ players }: { players: AudioPlayerInfo[] }) {
  if (players.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
        🎧 결과 오디오 <span className="text-slate-600">({players.length}개) · 마음에 들면 저장하세요</span>
      </div>
      {players.map((p) => (
        <WaveformPlayer key={p.url} url={p.url} label={p.label} onSave={p.onSave} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Replace Section 패널                                                */
/* ------------------------------------------------------------------ */

function ReplaceSectionPanel({
  provider,
  setProvider,
  taskId,
  setTaskId,
  audioId,
  setAudioId,
}: {
  provider: Provider;
  setProvider: (v: Provider) => void;
  taskId: string;
  setTaskId: (v: string) => void;
  audioId: string;
  setAudioId: (v: string) => void;
}) {
  const [mode, setMode] = useState<"existing" | "upload">("existing");
  const [uploadUrl, setUploadUrl] = useState("");
  const [model, setModel] = useState("V5");
  const [prompt, setPrompt] = useState("");
  const [tags, setTags] = useState("");
  const [title, setTitle] = useState("");
  const [negativeTags, setNegativeTags] = useState("");
  const [fullLyrics, setFullLyrics] = useState("");
  const [infillStartS, setInfillStartS] = useState("30");
  const [infillEndS, setInfillEndS] = useState("45");

  const [resultTaskId, setResultTaskId] = useState<string>("");
  const [pollResult, setPollResult] = useState<unknown>(undefined);
  const [phase, setPhase] = useState<Phase>("idle");
  const [phaseError, setPhaseError] = useState<string | undefined>(undefined);
  const [elapsedS, setElapsedS] = useState(0);

  const submit = async () => {
    setPollResult(undefined);
    setPhaseError(undefined);
    setPhase("submitting");
    try {
      const body: Record<string, unknown> = {
        provider,
        prompt,
        infillStartS: Number(infillStartS),
        infillEndS: Number(infillEndS),
      };
      if (tags.trim()) body.tags = tags.trim();
      if (title.trim()) body.title = title.trim();
      if (negativeTags.trim()) body.negativeTags = negativeTags.trim();
      if (fullLyrics.trim()) body.fullLyrics = fullLyrics.trim();
      if (mode === "existing") {
        body.taskId = taskId.trim();
        body.audioId = audioId.trim();
      } else {
        body.uploadUrl = uploadUrl.trim();
        body.mv = model;
      }
      const res = await apiRequest("POST", "/api/ai-music/replace-section", body);
      const data = await res.json();
      if (typeof data?.task_id === "string" && data.task_id) {
        setResultTaskId(data.task_id);
        setPhase("pending");
      } else {
        setPhase("fail");
        setPhaseError(extractErrorMessage(data) || "요청은 접수됐지만 작업 ID를 받지 못했어요.");
      }
    } catch (e: any) {
      setPhase("fail");
      setPhaseError(e?.message || String(e));
    }
  };

  // resultTaskId가 생기면 완료될 때까지 자동으로 상태를 확인 (수동 새로고침 불필요)
  useEffect(() => {
    if (!resultTaskId) return;
    let stopped = false;
    const startedAt = Date.now();
    setElapsedS(0);
    const tick = setInterval(() => {
      if (!stopped) setElapsedS(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    (async () => {
      while (!stopped) {
        try {
          const res = await apiRequest(
            "GET",
            `/api/ai-music/task/${encodeURIComponent(resultTaskId)}?provider=${provider}&_t=${Date.now()}`,
          );
          const data = await res.json();
          if (stopped) return;
          setPollResult(data);
          const ph = statusToPhase(extractStatusText(data));
          if (ph === "success") {
            setPhase("success");
            break;
          }
          if (ph === "fail") {
            setPhase("fail");
            setPhaseError(extractErrorMessage(data));
            break;
          }
        } catch {
          // 네트워크 일시 오류는 무시하고 계속 재시도
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
    })();

    return () => {
      stopped = true;
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultTaskId]);

  const players: AudioPlayerInfo[] = extractReplaceSectionPlayers(pollResult).map((p) => ({
    ...p,
    onSave: async () => {
      await saveTrackToLibrary({
        title: title.trim() || p.label,
        audioUrl: p.url,
        provider,
        generationTaskId: resultTaskId,
        tags: tags.trim() || "구간교체",
        prompt: prompt.trim() || undefined,
      });
    },
  }));

  const busy = phase === "submitting" || phase === "pending";

  return (
    <Card>
      <SectionHeader
        step="1"
        icon="✂️"
        title="Replace Section — 구간 교체"
        subtitle="기존 곡의 특정 구간을 다시 생성하거나, 업로드한 오디오를 기준으로 구간을 교체합니다."
      />

      <div className="flex flex-wrap gap-4">
        <SegmentedControl label="Provider" value={provider} onChange={setProvider} options={PROVIDER_OPTIONS} />
        <SegmentedControl
          label="모드"
          value={mode}
          onChange={setMode}
          options={[
            { value: "existing", label: "기존 곡" },
            { value: "upload", label: "업로드 오디오" },
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {mode === "existing" ? (
          <>
            <TextField label="taskId (원본 생성 taskId)" value={taskId} onChange={setTaskId} />
            <TextField label="audioId (교체할 클립 id)" value={audioId} onChange={setAudioId} />
          </>
        ) : (
          <>
            <TextField
              label="uploadUrl (업로드된 오디오 URL)"
              value={uploadUrl}
              onChange={setUploadUrl}
              placeholder="kieUploadAudioBuffer로 먼저 업로드한 downloadUrl"
            />
            <StyledSelect
              label="model"
              value={model}
              onChange={setModel}
              options={["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5", "V5_5"].map((m) => ({ value: m, label: m }))}
            />
          </>
        )}
        <TextField label="infillStartS (초, 최소 10초 구간)" value={infillStartS} onChange={setInfillStartS} type="number" />
        <TextField label="infillEndS (초)" value={infillEndS} onChange={setInfillEndS} type="number" />
        <TextField label="tags (선택)" value={tags} onChange={setTags} placeholder="pop, upbeat" />
        <TextField label="title (선택)" value={title} onChange={setTitle} />
        <TextField label="negativeTags (선택)" value={negativeTags} onChange={setNegativeTags} />
      </div>
      <div className="mt-3.5">
        <TextAreaField label="prompt (교체 구간 설명/가사)" value={prompt} onChange={setPrompt} />
      </div>
      <div className="mt-3.5">
        <TextAreaField label="fullLyrics (선택, 수정 반영된 전체 가사)" value={fullLyrics} onChange={setFullLyrics} />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          onClick={submit}
          disabled={busy || !prompt.trim()}
          className="bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-sky-500/20 hover:from-sky-300 hover:to-blue-500 disabled:opacity-40"
        >
          {phase === "submitting" ? "요청 중…" : phase === "pending" ? "처리 중…" : "구간 교체 요청"}
        </Button>
        <span className="text-xs text-slate-500">이용료 {REPLACE_SECTION_PRICE_WON_CLIENT.toLocaleString()}원</span>
      </div>

      <ProcessStatus
        phase={phase}
        elapsedS={elapsedS}
        successMessage="구간 교체가 완료됐어요! 아래에서 결과를 들어보고 저장하세요."
        errorMessage={phaseError}
        onRetry={submit}
      />
      {phase === "success" ? <AudioPlayerList players={players} /> : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Stem Separation 패널                                                */
/* ------------------------------------------------------------------ */

function stemSuccessMessage(type: string, stemName: string): string {
  if (type === "separate_vocal") return "보컬과 반주가 분리됐어요! 아래에서 들어보고 저장하세요.";
  if (type === "split_stem") return "전체 스템 분리가 완료됐어요! 아래에서 각 트랙을 들어보고 저장하세요.";
  return `${stemName || "선택한 악기"} 트랙 추출이 완료됐어요! 아래에서 들어보고 저장하세요.`;
}

/** "모드"(기존 곡 / URL 직접 입력)가 정확히 뭘 하는 건지 보여주는 설명 */
function stemModeDescription(mode: string): string {
  if (mode === "existing")
    return "이미 라이브러리에 저장된 곡을 taskId/audioId로 지정해서 분리해요. 위 '라이브러리 불러오기'에서 곡을 고르면 자동으로 채워져요.";
  return "라이브러리에 없는 오디오도 분리할 수 있어요 — 인터넷에서 바로 접근 가능한 오디오 파일 주소(URL)를 아래 칸에 직접 붙여넣으면, 그 파일을 기준으로 분리해요. 최대 20MB까지 지원돼요.";
}

/** type 선택지가 정확히 뭘 하는 기능인지 한눈에 알 수 있도록 보여주는 설명 */
function stemTypeDescription(type: string): string {
  if (type === "separate_vocal") return "보컬(가사)과 반주(MR), 딱 2트랙으로만 분리해요. 가장 간단하고 저렴해요.";
  if (type === "split_stem")
    return "보컬·드럼·베이스·기타·피아노 등 곡에 들어있는 모든 악기를 최대 12개 트랙으로 전부 따로 분리해요. 편곡·믹싱용으로 모든 소스가 필요할 때 사용하세요.";
  return "여러 개를 다 받는 게 아니라 원하는 악기 딱 하나만 골라서 추출해요. 아래 stemName에 악기 이름(예: Lead Vocal, Drum Kit, Bass)을 적어주세요.";
}

function StemSeparationPanel({
  provider,
  setProvider,
  taskId,
  setTaskId,
  audioId,
  setAudioId,
}: {
  provider: Provider;
  setProvider: (v: Provider) => void;
  taskId: string;
  setTaskId: (v: string) => void;
  audioId: string;
  setAudioId: (v: string) => void;
}) {
  const [mode, setMode] = useState<"existing" | "url">("existing");
  const [audioUrl, setAudioUrl] = useState("");
  const [type, setType] = useState<"separate_vocal" | "split_stem" | "split_stem_advanced">("separate_vocal");
  const [stemName, setStemName] = useState("Lead Vocal");

  const [resultTaskId, setResultTaskId] = useState<string>("");
  const [pollResult, setPollResult] = useState<unknown>(undefined);
  const [phase, setPhase] = useState<Phase>("idle");
  const [phaseError, setPhaseError] = useState<string | undefined>(undefined);
  const [elapsedS, setElapsedS] = useState(0);

  const submit = async () => {
    setPollResult(undefined);
    setPhaseError(undefined);
    setPhase("submitting");
    try {
      const body: Record<string, unknown> = { provider, type };
      if (type === "split_stem_advanced") body.stemName = stemName.trim();
      if (mode === "existing") {
        body.taskId = taskId.trim();
        body.audioId = audioId.trim();
      } else {
        body.audioUrl = audioUrl.trim();
      }
      const res = await apiRequest("POST", "/api/ai-music/stem-separation", body);
      const data = await res.json();
      if (typeof data?.task_id === "string" && data.task_id) {
        setResultTaskId(data.task_id);
        setPhase("pending");
      } else {
        setPhase("fail");
        setPhaseError(extractErrorMessage(data) || "요청은 접수됐지만 작업 ID를 받지 못했어요.");
      }
    } catch (e: any) {
      setPhase("fail");
      setPhaseError(e?.message || String(e));
    }
  };

  // resultTaskId가 생기면 완료될 때까지 자동으로 상태를 확인 (수동 새로고침 불필요)
  useEffect(() => {
    if (!resultTaskId) return;
    let stopped = false;
    const startedAt = Date.now();
    setElapsedS(0);
    const tick = setInterval(() => {
      if (!stopped) setElapsedS(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    (async () => {
      while (!stopped) {
        try {
          const res = await apiRequest(
            "GET",
            `/api/ai-music/stem-separation/${encodeURIComponent(resultTaskId)}?provider=${provider}&_t=${Date.now()}`,
          );
          const data = await res.json();
          if (stopped) return;
          setPollResult(data);
          const ph = statusToPhase(extractStatusText(data));
          if (ph === "success") {
            setPhase("success");
            break;
          }
          if (ph === "fail") {
            setPhase("fail");
            setPhaseError(extractErrorMessage(data));
            break;
          }
        } catch {
          // 네트워크 일시 오류는 무시하고 계속 재시도
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
    })();

    return () => {
      stopped = true;
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultTaskId]);

  const players: AudioPlayerInfo[] = extractStemPlayers(pollResult).map((p) => ({
    ...p,
    onSave: async () => {
      await saveTrackToLibrary({
        title: `${p.label} · 스템 분리`,
        audioUrl: p.url,
        provider,
        generationTaskId: resultTaskId,
        tags: "스템분리",
      });
    },
  }));

  const busy = phase === "submitting" || phase === "pending";

  return (
    <Card>
      <SectionHeader
        step="2"
        icon="🎚️"
        title="Advanced Stem Separation — 보컬/악기 분리"
        subtitle="보컬 분리(2트랙) · 전체 스템(최대 12트랙) · 악기 1개 추출 중 선택합니다."
      />

      <div className="flex flex-wrap gap-4">
        <SegmentedControl label="Provider" value={provider} onChange={setProvider} options={PROVIDER_OPTIONS} />
        <SegmentedControl
          label="모드"
          value={mode}
          onChange={setMode}
          options={[
            { value: "existing", label: "기존 곡" },
            { value: "url", label: "URL 직접 입력" },
          ]}
        />
        <SegmentedControl
          label="type"
          value={type}
          onChange={setType}
          options={[
            { value: "separate_vocal", label: "보컬 분리 (10)" },
            { value: "split_stem", label: "전체 스템 (50)" },
            { value: "split_stem_advanced", label: "악기 1개 (20)" },
          ]}
        />
      </div>

      <p className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-sky-500/15 bg-sky-500/[0.05] px-3 py-2 text-xs leading-relaxed text-sky-100/80">
        <span className="shrink-0">💡</span>
        <span>{stemModeDescription(mode)}</span>
      </p>
      <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-sky-500/15 bg-sky-500/[0.05] px-3 py-2 text-xs leading-relaxed text-sky-100/80">
        <span className="shrink-0">💡</span>
        <span>{stemTypeDescription(type)}</span>
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {mode === "existing" ? (
          <>
            <TextField label="taskId" value={taskId} onChange={setTaskId} />
            <TextField label="audioId" value={audioId} onChange={setAudioId} />
          </>
        ) : (
          <TextField label="audioUrl (직접 URL, 최대 20MB)" value={audioUrl} onChange={setAudioUrl} />
        )}
        {type === "split_stem_advanced" ? (
          <TextField label="stemName (예: Lead Vocal, Drum Kit, Bass)" value={stemName} onChange={setStemName} />
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          onClick={submit}
          disabled={busy}
          className="bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-sky-500/20 hover:from-sky-300 hover:to-blue-500 disabled:opacity-40"
        >
          {phase === "submitting" ? "요청 중…" : phase === "pending" ? "분리 중…" : "스템 분리 요청"}
        </Button>
        <span className="text-xs text-slate-500">이용료 {STEM_SEPARATION_PRICE_WON_CLIENT[type].toLocaleString()}원</span>
      </div>

      <ProcessStatus
        phase={phase}
        elapsedS={elapsedS}
        successMessage={stemSuccessMessage(type, stemName)}
        errorMessage={phaseError}
        onRetry={submit}
      />
      {phase === "success" ? <AudioPlayerList players={players} /> : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 페이지 루트                                                          */
/* ------------------------------------------------------------------ */

export default function AiMusicToolsTest() {
  // 두 패널이 공유하는 taskId/audioId/provider — 라이브러리에서 선택하면 여기로 채워짐
  const [provider, setProviderRaw] = useState<Provider>("suno");
  // kie.ai는 현재 크레딧 소진으로 사용 불가 — 어디서 설정되든(라이브러리 선택 포함) 항상 suno로 고정
  const setProvider = (v: Provider) => setProviderRaw(v === "kie" ? "suno" : v);
  const [taskId, setTaskId] = useState("");
  const [audioId, setAudioId] = useState("");

  return (
    <main className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(56,189,248,0.14),rgba(15,23,42,0))] px-4 py-10 text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-xl shadow-lg shadow-sky-500/30">
              🎵
            </span>
            <div>
              <h1 className="bg-gradient-to-r from-white to-slate-300 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
                AI Music Tools
              </h1>
              <p className="text-xs text-slate-400">구간 교체 · 보컬/악기 분리</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-slate-400">
            <p className="flex items-start gap-1.5 text-amber-200/90">
              <span className="shrink-0">⚡</span>
              <span>
                이 기능들(구간 교체, 스템 분리)은 <span className="font-semibold">음악 생성과 별도로 사용료(크레딧)가
                차감</span>돼요. 실행할 때마다 추가 비용이 발생하니 참고하세요.
              </span>
            </p>
          </div>
        </header>

        <LibraryPicker
          onPick={({ taskId: t, audioId: a, provider: p }) => {
            setTaskId(t);
            setAudioId(a);
            setProvider(p);
          }}
        />

        <ReplaceSectionPanel
          provider={provider}
          setProvider={setProvider}
          taskId={taskId}
          setTaskId={setTaskId}
          audioId={audioId}
          setAudioId={setAudioId}
        />
        <StemSeparationPanel
          provider={provider}
          setProvider={setProvider}
          taskId={taskId}
          setTaskId={setTaskId}
          audioId={audioId}
          setAudioId={setAudioId}
        />
      </div>
    </main>
  );
}
