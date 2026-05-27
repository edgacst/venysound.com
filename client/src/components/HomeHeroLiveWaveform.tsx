import { useEffect, useRef } from "react";

/**
 * Decorative bar waveform for the home hero card.
 * This is not connected to real audio analysis.
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

    const barLevel = (xNorm: number, t: number) => {
      const p = xNorm * Math.PI;
      const carrier =
        Math.sin(p * 5.8 + t * 1.35) * 0.36 +
        Math.sin(p * 12.5 - t * 1.9) * 0.24 +
        Math.sin(p * 21.7 + t * 2.45) * 0.18 +
        Math.sin(p * 33.1 - t * 1.1) * 0.12;
      const envelope = 0.72 + Math.sin(p * 2.2 - t * 0.58) * 0.22;
      return Math.max(0.16, Math.min(1, (0.58 + carrier) * envelope));
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

      const centerY = h * 0.54;
      const barCount = Math.min(88, Math.max(34, Math.floor(w / 7)));
      const gap = Math.max(2, Math.min(4, w / 120));
      const barW = Math.max(3, (w - gap * (barCount - 1)) / barCount);

      const rail = ctx.createLinearGradient(0, 0, w, 0);
      rail.addColorStop(0, "rgba(34,211,238,0.12)");
      rail.addColorStop(0.5, "rgba(167,139,250,0.16)");
      rail.addColorStop(1, "rgba(240,171,252,0.12)");
      ctx.fillStyle = rail;
      ctx.fillRect(0, centerY - 1, w, 2);

      ctx.shadowColor = "rgba(168,85,247,0.32)";
      ctx.shadowBlur = 9;

      for (let i = 0; i < barCount; i++) {
        const xNorm = barCount <= 1 ? 0 : i / (barCount - 1);
        const x = i * (barW + gap);
        const edgeFalloff = 0.72 + Math.sin(xNorm * Math.PI) * 0.28;
        const level = barLevel(xNorm, phase) * edgeFalloff;
        const barH = Math.max(12, level * h * 0.78);
        const y = centerY - barH / 2;

        const grad = ctx.createLinearGradient(x, y, x, y + barH);
        grad.addColorStop(0, "rgba(240,171,252,0.96)");
        grad.addColorStop(0.48, "rgba(167,139,250,0.92)");
        grad.addColorStop(1, "rgba(34,211,238,0.96)");
        ctx.fillStyle = grad;

        const radius = Math.min(barW / 2, 4);
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, radius);
        ctx.fill();
      }

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
