import React, { useEffect, useRef } from 'react';
import { AvatarStatus } from '../hooks/useAvatarState';

interface AvatarProps {
  status: AvatarStatus;
  mouthOpenAmount: number;
}

type Region = 'face' | 'leftBrow' | 'rightBrow' | 'nose' | 'upperLip' | 'lowerLip' | 'skip';

interface Particle {
  fx: number;
  fy: number;
  fzBase: number;
  region: Region;
  phase: number;
}

function inEllipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number) {
  return ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 < 1;
}

function buildParticles(): Particle[] {
  const particles: Particle[] = [];
  const STEP = 14;
  const FW = 165;
  const FH = 225;

  for (let px = -FW; px <= FW; px += STEP) {
    for (let py = -FH; py <= FH; py += STEP) {
      // Face ellipse with chin taper
      const chinStart = 65;
      const xRadius =
        py > chinStart
          ? FW * (1 - ((py - chinStart) / (FH - chinStart)) * 0.44)
          : FW;

      if ((px / xRadius) ** 2 + (py / FH) ** 2 > 1.0) continue;

      // Skip particle if inside eye pupil area (eyes drawn separately)
      const inLeftPupil  = inEllipse(px, py, -62, -60, 28, 18);
      const inRightPupil = inEllipse(px, py,  62, -60, 28, 18);
      if (inLeftPupil || inRightPupil) continue;

      const nx = px / FW;
      const ny = py / FH;
      const fzBase = Math.sqrt(Math.max(0, 1 - nx * nx * 0.75 - ny * ny * 0.75));

      let region: Region = 'face';

      // Brow arcs
      if (py >= -108 && py <= -84 && px >= -98 && px <= -24) region = 'leftBrow';
      if (py >= -108 && py <= -84 && px >=  24 && px <=  98) region = 'rightBrow';

      // Nose bridge
      if (Math.abs(px) < 11 && py > -20 && py < 54) region = 'nose';
      if (inEllipse(px, py, -24, 53, 17, 12)) region = 'nose';
      if (inEllipse(px, py,  24, 53, 17, 12)) region = 'nose';

      // Lips
      const inMouth = Math.abs(px) < 60;
      if (py >= 82 && py <= 106 && inMouth)  region = 'upperLip';
      if (py >= 110 && py <= 138 && inMouth) region = 'lowerLip';

      particles.push({ fx: px, fy: py, fzBase, region, phase: Math.random() * Math.PI * 2 });
    }
  }
  return particles;
}

const PARTICLES = buildParticles();

export function Avatar({ status, mouthOpenAmount }: AvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const mouseRef     = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const frameRef     = useRef<number>(0);
  const stateRef     = useRef({ status, mouthOpenAmount });
  const blinkRef     = useRef({ phase: 0, nextBlink: 3 + Math.random() * 2, blinking: false });
  const scaleRef     = useRef(1);

  useEffect(() => { stateRef.current = { status, mouthOpenAmount }; }, [status, mouthOpenAmount]);

  // Resize canvas to container
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

  // Mouse tracking
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current.tx = (e.clientX / window.innerWidth  - 0.5) * 2;
      mouseRef.current.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Main loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let t = 0;

    const loop = () => {
      t += 0.016;
      const { status, mouthOpenAmount } = stateRef.current;
      const sc = scaleRef.current;

      const m = mouseRef.current;
      m.x += (m.tx - m.x) * 0.06;
      m.y += (m.ty - m.y) * 0.06;

      // Blink
      const bl = blinkRef.current;
      bl.phase += 0.016;
      if (!bl.blinking && bl.phase > bl.nextBlink) { bl.blinking = true; bl.phase = 0; }
      if (bl.blinking && bl.phase > 0.22) {
        bl.blinking = false; bl.phase = 0;
        bl.nextBlink = 2.5 + Math.random() * 5;
      }
      const blinkFactor = bl.blinking ? Math.sin((bl.phase / 0.22) * Math.PI) : 0;

      const W = canvas.width;
      const H = canvas.height;
      const CX = W / 2;
      const CY = H / 2 + 10 * sc;

      ctx.clearRect(0, 0, W, H);

      // Ambient glow
      const bgCol = status === 'thinking' ? 'rgba(50,10,110,0.35)'
                  : status === 'listening' ? 'rgba(0,65,140,0.38)'
                  : 'rgba(0,40,95,0.22)';
      const bg = ctx.createRadialGradient(CX, CY, 20 * sc, CX, CY, 290 * sc);
      bg.addColorStop(0, bgCol);
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Rotation
      const rotY =  m.x * 0.36;
      const rotX = -m.y * 0.22;
      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

      // Project particles
      const projected = PARTICLES.map(p => {
        const fz = p.fzBase * 115;
        let vy = p.fy;

        // Mouth open
        if (status === 'speaking' && mouthOpenAmount > 0) {
          const shift = mouthOpenAmount * 26;
          if (p.region === 'upperLip') vy = p.fy - shift * 0.3;
          if (p.region === 'lowerLip') vy = p.fy + shift * 0.7;
        }

        // Breathing wave
        const bx = Math.sin(t * 1.3 + p.phase) * 1.5;
        const by = Math.cos(t * 1.0 + p.phase * 0.7) * 1.0;

        // Rotate
        const x2 =  p.fx * cosY + fz  * sinY;
        const z2 = -p.fx * sinY + fz  * cosY;
        const y3 =    vy  * cosX - z2 * sinX;
        const z3 =    vy  * sinX + z2 * cosX;

        return { p, sx: CX + x2 * sc + bx, sy: CY + y3 * sc + by, depth: z3, fz: p.fzBase };
      });
      projected.sort((a, b) => a.depth - b.depth);

      // Draw face particles
      for (const { p, sx, sy, fz } of projected) {
        let brightness = 0.18 + fz * 0.88;
        let size       = 0.9 + fz * 3.0;
        let cr = 0, cg = 175, cb = 255;

        switch (p.region) {
          case 'leftBrow': case 'rightBrow':
            cr = 0; cg = 155; cb = 240;
            brightness *= 1.1; size *= 1.05;
            break;
          case 'nose':
            cr = 0; cg = 148; cb = 228;
            brightness *= 0.68; size *= 0.8;
            break;
          case 'upperLip': case 'lowerLip':
            cr = 10; cg = 190; cb = 255;
            brightness *= status === 'speaking' ? 1.2 + mouthOpenAmount * 0.4 : 0.75;
            break;
        }

        if (status === 'listening') {
          brightness *= 1 + Math.sin(t * 5.5 + p.phase) * 0.2;
        }
        if (status === 'thinking') {
          const dist   = Math.sqrt(p.fx ** 2 + p.fy ** 2);
          const ripple = Math.sin(t * 3.8 - dist / 26) * 0.5;
          brightness  *= 0.5 + ripple;
          cr = Math.round(cr * 0.25 + 135 * 0.75);
          cg = Math.round(cg * 0.2  +  50 * 0.8);
          cb = Math.round(cb * 0.55 + 255 * 0.45);
        }
        if (status === 'speaking') brightness *= 1 + Math.sin(t * 9 + p.phase) * 0.08;

        brightness = Math.max(0.04, Math.min(2.0, brightness));
        const alpha = Math.min(1, brightness);
        const r = Math.min(255, Math.round(cr * Math.min(1, brightness)));
        const g = Math.min(255, Math.round(cg * Math.min(1, brightness)));
        const b = Math.min(255, Math.round(cb * Math.min(1, brightness)));

        // Glow
        const gr = size * 4.2 * sc;
        const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, gr);
        grd.addColorStop(0,   `rgba(${r},${g},${b},${(alpha * 0.5).toFixed(2)})`);
        grd.addColorStop(0.4, `rgba(${r},${g},${b},${(alpha * 0.1).toFixed(2)})`);
        grd.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(sx, sy, gr, 0, Math.PI * 2);
        ctx.fill();

        // Core dot
        ctx.fillStyle = `rgba(${Math.min(255,r+90)},${Math.min(255,g+50)},${Math.min(255,b+25)},${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, size * 0.52 * sc, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Draw glowing eyes ──────────────────────────────────
      const eyeDefs = [
        { fx: -62, fy: -60 },
        { fx:  62, fy: -60 },
      ];

      for (const { fx, fy } of eyeDefs) {
        // Eye blink: squish Y
        const drawFY = blinkFactor > 0 ? -60 + (fy - (-60)) * (1 - blinkFactor * 0.95) : fy;

        // Apply same rotation as particles
        const fz = 0.85 * 115;
        const x2 =  fx * cosY + fz  * sinY;
        const z2 = -fx * sinY + fz  * cosY;
        const y3 = drawFY * cosX - z2 * sinX;

        const ex = CX + x2 * sc;
        const ey = CY + y3 * sc;

        // Eye inner glow (iris)
        const eyeRX = 38 * sc;
        const eyeRY = blinkFactor > 0 ? (22 * (1 - blinkFactor * 0.92)) * sc : 22 * sc;
        const eyePulse = status === 'listening' ? 1 + Math.sin(t * 6) * 0.2 : 1;
        const eyeAlpha = eyeRY < 1 ? 0 : 1;

        if (eyeAlpha > 0 && eyeRY > 0) {
          // Iris gradient
          const eyeColor1 = status === 'thinking' ? '130,40,255' : '0,210,255';
          const eyeColor2 = status === 'thinking' ? '80,10,180'  : '0,100,200';

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

          // Outer eye glow
          const outerGrd = ctx.createRadialGradient(ex, ey, eyeRX * 0.7, ex, ey, eyeRX * 2.2);
          outerGrd.addColorStop(0, `rgba(${eyeColor1},${0.25 * eyePulse})`);
          outerGrd.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = outerGrd;
          ctx.beginPath();
          ctx.ellipse(ex, ey, eyeRX * 2.2, eyeRY * 2.2, 0, 0, Math.PI * 2);
          ctx.fill();

          // Highlight glint
          ctx.fillStyle = `rgba(255,255,255,0.85)`;
          ctx.beginPath();
          ctx.ellipse(ex - eyeRX * 0.28, ey - eyeRY * 0.35, eyeRX * 0.1, eyeRY * 0.15, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── Decorative rings ───────────────────────────────────
      const ringAlpha = status === 'thinking' ? 0.28
                      : status === 'listening' ? 0.38
                      : status === 'speaking'  ? 0.30 : 0.16;
      const ringHue = status === 'thinking' ? '140,50,255' : '0,195,255';

      ctx.strokeStyle = `rgba(${ringHue},${ringAlpha})`;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 9]);
      ctx.lineDashOffset = -t * 28;
      ctx.beginPath();
      ctx.arc(CX, CY, 245 * sc, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(${ringHue},${ringAlpha * 0.55})`;
      ctx.lineWidth   = 0.6;
      ctx.setLineDash([2, 14]);
      ctx.lineDashOffset = t * 18;
      ctx.beginPath();
      ctx.arc(CX, CY, 270 * sc, 0, Math.PI * 2);
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
