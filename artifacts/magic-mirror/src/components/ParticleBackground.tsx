import React, { useEffect, useRef } from 'react';

interface Dot {
  x: number; y: number;
  vx: number; vy: number;
  r: number; alpha: number;
  twinkle: number; phase: number;
}

const COUNT = 72;

function makeDot(W: number, H: number): Dot {
  return {
    x: Math.random() * W,
    y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.18,
    vy: (Math.random() - 0.5) * 0.18,
    r: 0.6 + Math.random() * 1.6,
    alpha: 0.06 + Math.random() * 0.22,
    twinkle: 0.4 + Math.random() * 0.9,
    phase: Math.random() * Math.PI * 2,
  };
}

interface Props {
  primaryRgb?: string; // e.g. "0,210,255"
}

export function ParticleBackground({ primaryRgb = '0,210,255' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    let dots: Dot[] = Array.from({ length: COUNT }, () => makeDot(W, H));
    let t = 0;
    let raf: number;

    const onResize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W;
      canvas.height = H;
      dots = Array.from({ length: COUNT }, () => makeDot(W, H));
    };
    window.addEventListener('resize', onResize);

    const draw = () => {
      t += 0.012;
      ctx.clearRect(0, 0, W, H);

      for (const d of dots) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < -10) d.x = W + 10;
        if (d.x > W + 10) d.x = -10;
        if (d.y < -10) d.y = H + 10;
        if (d.y > H + 10) d.y = -10;

        const pulse = 0.5 + Math.sin(t * d.twinkle + d.phase) * 0.5;
        const a = d.alpha * pulse;

        // Glow halo
        const gr = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 6);
        gr.addColorStop(0, `rgba(${primaryRgb},${(a * 0.7).toFixed(3)})`);
        gr.addColorStop(1, `rgba(${primaryRgb},0)`);
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r * 6, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `rgba(${primaryRgb},${Math.min(1, a * 2.5).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [primaryRgb]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
      style={{ opacity: 0.55 }}
    />
  );
}
