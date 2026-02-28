import { useRef, useEffect } from "react";

/** 배너 중앙에 표시되는 움직이는 파형(시뮬레이션) */
export function RadioBannerWaveformCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const barCount = 36;
    let rafId = 0;
    const draw = () => {
      rafId = requestAnimationFrame(draw);
      if (!canvasRef.current || !containerRef.current) return;
      const w = containerRef.current.offsetWidth;
      const h = containerRef.current.offsetHeight;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const t = performance.now() * 0.002;
      ctx.clearRect(0, 0, w, h);
      const barW = Math.max(2, (w / barCount) - 1.5);
      const gap = 1.5;
      for (let i = 0; i < barCount; i++) {
        const x = i * (barW + gap) + gap / 2;
        const heightRatio = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t + i * 0.25));
        const barH = (h / 2) * heightRatio;
        ctx.fillStyle = "rgba(250, 204, 21, 0.95)";
        ctx.fillRect(x, (h - barH) / 2, barW, barH);
      }
    };
    draw();
    return () => cancelAnimationFrame(rafId);
  }, []);
  return (
    <div ref={containerRef} className={className}>
      <canvas ref={canvasRef} className="w-full h-full block" aria-hidden />
    </div>
  );
}
