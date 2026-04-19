/** DM·알림 수신 시 짧은 효과음 (Web Audio). 브라우저 자동 재생 정책으로 첫 클릭 전엔 무시될 수 있음. */

let ctxRef: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
    if (!ctxRef) ctxRef = new AudioContext();
    return ctxRef;
  } catch {
    return null;
  }
}

function tone(
  audioCtx: AudioContext,
  when: number,
  freq: number,
  duration: number,
  peak: number,
) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(peak, when + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0008, when + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.03);
}

export function playInAppSound(kind: "message" | "notification") {
  const c = ctx();
  if (!c) return;
  void c.resume().catch(() => {});
  const t0 = c.currentTime;
  if (kind === "message") {
    tone(c, t0, 740, 0.09, 0.09);
  } else {
    tone(c, t0, 880, 0.07, 0.085);
    tone(c, t0 + 0.08, 660, 0.09, 0.075);
  }
}
