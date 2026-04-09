import { useEffect, useRef } from "react";

/**
 * 홈 히어로 라디오 카드 위 장식 파형 — Canvas + rAF로 여러 주파수를 겹쳐 계속 변하는 “살아 있는” 곡선.
 * 실제 오디오 분석 아님(GlobalRadioPlayer `<audio>`와 연결하지 않음).
 */
export function HomeHeroLiveWaveform() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let phase = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = wrap.getBoundingClientRect();
      const w = Math.max(1, Math.floor(width));
      const h = Math.max(1, Math.floor(height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const sampleY = (xNorm: number, t: number, h: number, amp: number) => {
      const mid = h * 0.52;
      const p = xNorm * Math.PI * 11;
      const y =
        Math.sin(p + t * 1.25) * (h * 0.17) +
        Math.sin(p * 2.15 + t * 1.95) * (h * 0.095) +
        Math.sin(p * 0.41 + t * 0.62) * (h * 0.072) +
        Math.sin(p * 3.45 + t * 2.2) * (h * 0.045) +
        Math.sin(p * 5.25 - t * 1.08) * (h * 0.028) +
        Math.sin(p * 7.1 + t * 2.8) * (h * 0.018);
      return mid + y * amp;
    };

    const fillUnder = (pts: [number, number][], fillStyle: CanvasGradient) => {
      ctx.beginPath();
      ctx.moveTo(0, wrap.clientHeight);
      ctx.lineTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0], pts[i][1]);
      }
      ctx.lineTo(wrap.clientWidth, wrap.clientHeight);
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();
    };

    const strokeTop = (pts: [number, number][], strokeStyle: CanvasGradient, lineWidth: number) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0], pts[i][1]);
      }
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    };

    const buildPts = (tOff: number, amp: number, w: number, h: number, n: number) => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const x = (i / n) * w;
        pts.push([x, sampleY(i / n, phase + tOff, h, amp)]);
      }
      return pts;
    };

    const draw = (now: number) => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const dt = reduceMotion ? 0 : Math.min(0.045, (now - last) / 1000);
      last = now;
      phase += dt;

      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 2 || h < 2) {
        raf = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, w, h);

      const n = Math.min(200, Math.max(56, Math.ceil(w / 2.5)));

      const fillBack = ctx.createLinearGradient(0, h, 0, 0);
      fillBack.addColorStop(0, "rgba(139,92,246,0.12)");
      fillBack.addColorStop(1, "rgba(34,211,238,0.16)");

      const strokeBack = ctx.createLinearGradient(0, 0, w, 0);
      strokeBack.addColorStop(0, "rgba(167,139,250,0.4)");
      strokeBack.addColorStop(1, "rgba(34,211,238,0.45)");

      const ptsBack = buildPts(2.1, 0.52, w, h, n);
      fillUnder(ptsBack, fillBack);
      strokeTop(ptsBack, strokeBack, 1.25);

      const fillMain = ctx.createLinearGradient(0, h, 0, 0);
      fillMain.addColorStop(0, "rgba(6,182,212,0.18)");
      fillMain.addColorStop(0.5, "rgba(139,92,246,0.34)");
      fillMain.addColorStop(1, "rgba(217,70,239,0.4)");

      const strokeMain = ctx.createLinearGradient(0, 0, w, 0);
      strokeMain.addColorStop(0, "rgba(34,211,238,0.98)");
      strokeMain.addColorStop(0.45, "rgba(167,139,250,0.98)");
      strokeMain.addColorStop(1, "rgba(240,171,252,0.98)");

      const ptsMain = buildPts(0, 1, w, h, n);
      fillUnder(ptsMain, fillMain);
      ctx.shadowColor = "rgba(168,85,247,0.35)";
      ctx.shadowBlur = 8;
      strokeTop(ptsMain, strokeMain, 2.1);
      ctx.shadowBlur = 0;

      raf = requestAnimationFrame(draw);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="mb-2 h-32 w-full min-w-0 overflow-hidden rounded-xl border border-white/12 bg-gradient-to-b from-violet-950/55 via-black/60 to-black/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:h-36 md:h-40"
      data-testid="home-hero-fake-waveform"
      aria-hidden
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
