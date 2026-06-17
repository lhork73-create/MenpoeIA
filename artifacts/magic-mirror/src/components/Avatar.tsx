import React, { useEffect, useRef } from 'react';
import { AvatarStatus } from '../hooks/useAvatarState';
import { ThemeColors } from '../hooks/useTheme';

interface AvatarProps {
  status: AvatarStatus;
  mouthOpenAmount: number;
  micLevel?: number;       // 0-1 from analyser while recording
  theme?: ThemeColors;
}

type Region = 'face' | 'leftBrow' | 'rightBrow' | 'nose' | 'upperLip' | 'lowerLip' | 'skip';

interface Particle {
  fx: number; fy: number; fzBase: number;
  region: Region; phase: number;
}

function inEllipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number) {
  return ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 < 1;
}

function buildParticles(): Particle[] {
  const particles: Particle[] = [];
  const STEP = 14, FW = 165, FH = 225;
  for (let px = -FW; px <= FW; px += STEP) {
    for (let py = -FH; py <= FH; py += STEP) {
      const chinStart = 65;
      const xRadius = py > chinStart
        ? FW * (1 - ((py - chinStart) / (FH - chinStart)) * 0.44)
        : FW;
      if ((px / xRadius) ** 2 + (py / FH) ** 2 > 1.0) continue;
      const inLeftPupil  = inEllipse(px, py, -62, -60, 28, 18);
      const inRightPupil = inEllipse(px, py,  62, -60, 28, 18);
      if (inLeftPupil || inRightPupil) continue;

      const nx = px / FW, ny = py / FH;
      const fzBase = Math.sqrt(Math.max(0, 1 - nx * nx * 0.75 - ny * ny * 0.75));
      let region: Region = 'face';
      if (py >= -108 && py <= -84 && px >= -98 && px <= -24) region = 'leftBrow';
      if (py >= -108 && py <= -84 && px >=  24 && px <=  98) region = 'rightBrow';
      if (Math.abs(px) < 11 && py > -20 && py < 54) region = 'nose';
      if (inEllipse(px, py, -24, 53, 17, 12)) region = 'nose';
      if (inEllipse(px, py,  24, 53, 17, 12)) region = 'nose';
      const inMouth = Math.abs(px) < 60;
      if (py >= 82 && py <= 106 && inMouth)  region = 'upperLip';
      if (py >= 110 && py <= 138 && inMouth) region = 'lowerLip';
      particles.push({ fx: px, fy: py, fzBase, region, phase: Math.random() * Math.PI * 2 });
    }
  }
  return particles;
}

const PARTICLES = buildParticles();

export function Avatar({ status, mouthOpenAmount, micLevel = 0, theme }: AvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const mouseRef     = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const frameRef     = useRef<number>(0);
  const stateRef     = useRef({ status, mouthOpenAmount, micLevel, theme });
  const blinkRef     = useRef({ phase: 0, nextBlink: 3 + Math.random() * 2, blinking: false });
  const scaleRef     = useRef(1);
  // Ripple for "thinking" state
  const thinkRippleRef = useRef({ active: false, radius: 0, alpha: 0 });

  useEffect(() => { stateRef.current = { status, mouthOpenAmount, micLevel, theme }; }, [status, mouthOpenAmount, micLevel, theme]);

  // Trigger ripple burst on thinking start
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current !== 'thinking' && status === 'thinking') {
      thinkRippleRef.current = { active: true, radius: 20, alpha: 0.8 };
    }
    prevStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width  = width;
      canvas.height = height;
      scaleRef.current = Math.min(width / 620, height / 700);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current.tx = (e.clientX / window.innerWidth  - 0.5) * 2;
      mouseRef.current.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let t = 0;

    const loop = () => {
      t += 0.016;
      const { status, mouthOpenAmount, micLevel, theme } = stateRef.current;
      const sc  = scaleRef.current;
      const brl = blinkRef.current;

      // Theme colors
      const pr = theme?.particleR ?? 0;
      const pg = theme?.particleG ?? 175;
      const pb = theme?.particleB ?? 255;

      const m = mouseRef.current;
      m.x += (m.tx - m.x) * 0.06;
      m.y += (m.ty - m.y) * 0.06;

      // Blink
      brl.phase += 0.016;
      if (!brl.blinking && brl.phase > brl.nextBlink) { brl.blinking = true; brl.phase = 0; }
      if (brl.blinking && brl.phase > 0.22) {
        brl.blinking = false; brl.phase = 0;
        brl.nextBlink = 2.5 + Math.random() * 5;
      }
      const blinkFactor = brl.blinking ? Math.sin((brl.phase / 0.22) * Math.PI) : 0;

      const W = canvas.width, H = canvas.height;
      const CX = W / 2, CY = H / 2 + 10 * sc;
      ctx.clearRect(0, 0, W, H);

      // Ambient glow
      const bgCol = status === 'thinking'
        ? `rgba(${Math.round(pr * 0.3 + 40)},${Math.round(pg * 0.05 + 5)},${Math.round(pb * 0.4 + 50)},0.35)`
        : status === 'listening'
        ? `rgba(${Math.round(pr * 0.15)},${Math.round(pg * 0.25 + 30)},${Math.round(pb * 0.5 + 40)},0.38)`
        : `rgba(${Math.round(pr * 0.05)},${Math.round(pg * 0.15 + 20)},${Math.round(pb * 0.35 + 40)},0.22)`;
      const bg = ctx.createRadialGradient(CX, CY, 20 * sc, CX, CY, 290 * sc);
      bg.addColorStop(0, bgCol);
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Rotation
      const rotY =  m.x * 0.36, rotX = -m.y * 0.22;
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

      // Thinking ripple burst
      const ripple = thinkRippleRef.current;
      if (ripple.active) {
        ripple.radius += 3.5;
        ripple.alpha  -= 0.012;
        if (ripple.alpha <= 0) { ripple.active = false; ripple.alpha = 0; }
        if (ripple.alpha > 0) {
          ctx.beginPath();
          ctx.arc(CX, CY, ripple.radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${pr},${pg},${pb},${ripple.alpha.toFixed(3)})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      const projected = PARTICLES.map(p => {
        let fz = p.fzBase * 115;
        let vy = p.fy;

        // Mouth open
        if (status === 'speaking' && mouthOpenAmount > 0) {
          const shift = mouthOpenAmount * 26;
          if (p.region === 'upperLip') vy = p.fy - shift * 0.3;
          if (p.region === 'lowerLip') vy = p.fy + shift * 0.7;
        }

        // Mic level expansion — particles "breathe out" while recording
        if (status === 'listening' && micLevel > 0.05) {
          const dist = Math.sqrt(p.fx ** 2 + p.fy ** 2);
          const push = micLevel * 18 * (1 - dist / 300);
          const angle = Math.atan2(p.fy, p.fx);
          fz += micLevel * 12;
          const nx2 = p.fx + Math.cos(angle) * push;
          const ny2 = vy   + Math.sin(angle) * push;
          vy = ny2;
          const x2 =  nx2  * cosY + fz * sinY;
          const z2 = -nx2  * sinY + fz * cosY;
          const y3 =  ny2  * cosX - z2 * sinX;
          const z3 =  ny2  * sinX + z2 * cosX;
          return { p, sx: CX + x2 * sc, sy: CY + y3 * sc, depth: z3, fz: p.fzBase };
        }

        // Breathing wave
        const bx = Math.sin(t * 1.3 + p.phase) * 1.5;
        const by = Math.cos(t * 1.0 + p.phase * 0.7) * 1.0;
        const x2 =  p.fx * cosY + fz * sinY;
        const z2 = -p.fx * sinY + fz * cosY;
        const y3 =  vy   * cosX - z2 * sinX;
        const z3 =  vy   * sinX + z2 * cosX;
        return { p, sx: CX + x2 * sc + bx, sy: CY + y3 * sc + by, depth: z3, fz: p.fzBase };
      });
      projected.sort((a, b) => a.depth - b.depth);

      for (const { p, sx, sy, fz } of projected) {
        let brightness = 0.18 + fz * 0.88;
        let size       = 0.9 + fz * 3.0;
        let cr = pr, cg = pg, cb = pb;

        switch (p.region) {
          case 'leftBrow': case 'rightBrow':
            brightness *= 1.1; size *= 1.05;
            break;
          case 'nose':
            brightness *= 0.68; size *= 0.8;
            break;
          case 'upperLip': case 'lowerLip':
            cr = Math.min(255, pr + 10);
            cg = Math.min(255, pg + 15);
            brightness *= status === 'speaking' ? 1.2 + mouthOpenAmount * 0.4 : 0.75;
            break;
        }

        if (status === 'listening') {
          const lvlBoost = 1 + micLevel * 0.55;
          brightness *= (1 + Math.sin(t * 5.5 + p.phase) * 0.2) * lvlBoost;
        }
        if (status === 'thinking') {
          const dist = Math.sqrt(p.fx ** 2 + p.fy ** 2);
          const wave = Math.sin(t * 4.2 - dist / 24) * 0.5;
          brightness *= 0.45 + wave;
          // Shift color toward purple regardless of theme
          cr = Math.round(cr * 0.2 + 160 * 0.8);
          cg = Math.round(cg * 0.15 + 40 * 0.85);
          cb = Math.round(cb * 0.55 + 255 * 0.45);
        }
        if (status === 'speaking') brightness *= 1 + Math.sin(t * 9 + p.phase) * 0.08;

        brightness = Math.max(0.04, Math.min(2.0, brightness));
        const alpha = Math.min(1, brightness);
        const r = Math.min(255, Math.round(cr * Math.min(1, brightness)));
        const g = Math.min(255, Math.round(cg * Math.min(1, brightness)));
        const b = Math.min(255, Math.round(cb * Math.min(1, brightness)));

        const gr2 = size * 4.2 * sc;
        const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, gr2);
        grd.addColorStop(0,   `rgba(${r},${g},${b},${(alpha * 0.5).toFixed(2)})`);
        grd.addColorStop(0.4, `rgba(${r},${g},${b},${(alpha * 0.1).toFixed(2)})`);
        grd.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(sx, sy, gr2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(${Math.min(255,r+90)},${Math.min(255,g+50)},${Math.min(255,b+25)},${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, size * 0.52 * sc, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Eyes ──────────────────────────────────────────────────────
      const eyeDefs = [{ fx: -62, fy: -60 }, { fx: 62, fy: -60 }];
      for (const { fx, fy } of eyeDefs) {
        const drawFY = blinkFactor > 0 ? -60 + (fy - (-60)) * (1 - blinkFactor * 0.95) : fy;
        const fz = 0.85 * 115;
        const x2 =  fx * cosY + fz * sinY;
        const z2 = -fx * sinY + fz * cosY;
        const y3 = drawFY * cosX - z2 * sinX;
        const ex = CX + x2 * sc;
        const ey = CY + y3 * sc;

        const eyeRX = 38 * sc;
        const eyeRY = blinkFactor > 0 ? (22 * (1 - blinkFactor * 0.92)) * sc : 22 * sc;
        const eyePulse = status === 'listening' ? 1 + Math.sin(t * 6) * 0.2 * (1 + micLevel) : 1;

        if (eyeRY > 0) {
          const eyeColor1 = status === 'thinking' ? '160,50,255' : `${pr},${pg},${pb}`;
          const eyeColor2 = status === 'thinking' ? '90,15,180'  : `${Math.round(pr*0.4)},${Math.round(pg*0.45)},${Math.round(pb*0.8)}`;

          ctx.save();
          ctx.beginPath();
          ctx.ellipse(ex, ey, eyeRX, eyeRY, 0, 0, Math.PI * 2);
          ctx.clip();

          const eyeGrad = ctx.createRadialGradient(ex, ey, 0, ex, ey, eyeRX);
          eyeGrad.addColorStop(0,    `rgba(255,255,255,${0.7 * eyePulse})`);
          eyeGrad.addColorStop(0.25, `rgba(${eyeColor1},${0.9 * eyePulse})`);
          eyeGrad.addColorStop(0.65, `rgba(${eyeColor2},0.7)`);
          eyeGrad.addColorStop(1,    'rgba(0,0,0,0.95)');
          ctx.fillStyle = eyeGrad;
          ctx.fillRect(ex - eyeRX - 2, ey - eyeRY - 2, eyeRX * 2 + 4, eyeRY * 2 + 4);
          ctx.restore();

          const outerGrd = ctx.createRadialGradient(ex, ey, eyeRX * 0.7, ex, ey, eyeRX * 2.2);
          outerGrd.addColorStop(0, `rgba(${eyeColor1},${0.25 * eyePulse})`);
          outerGrd.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = outerGrd;
          ctx.beginPath();
          ctx.ellipse(ex, ey, eyeRX * 2.2, eyeRY * 2.2, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = `rgba(255,255,255,0.85)`;
          ctx.beginPath();
          ctx.ellipse(ex - eyeRX * 0.28, ey - eyeRY * 0.35, eyeRX * 0.1, eyeRY * 0.15, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── Decorative rings ───────────────────────────────────────────
      const ringAlpha = status === 'thinking' ? 0.28
                      : status === 'listening' ? 0.38 + micLevel * 0.25
                      : status === 'speaking'  ? 0.30 : 0.16;
      const ringHue = status === 'thinking' ? '140,50,255' : `${pr},${pg},${pb}`;

      ctx.strokeStyle = `rgba(${ringHue},${ringAlpha})`;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 9]);
      ctx.lineDashOffset = -t * 28;
      ctx.beginPath();
      ctx.arc(CX, CY, (245 + micLevel * 25) * sc, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(${ringHue},${ringAlpha * 0.55})`;
      ctx.lineWidth   = 0.6;
      ctx.setLineDash([2, 14]);
      ctx.lineDashOffset = t * 18;
      ctx.beginPath();
      ctx.arc(CX, CY, (270 + micLevel * 35) * sc, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([]);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
