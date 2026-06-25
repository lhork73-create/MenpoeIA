/**
 * RealisticFace2D — Canvas 2D portrait face
 * Works in ALL environments (no WebGL required).
 * Renders a detailed, shaded human face with:
 * - Gender-specific proportions and hair
 * - Animated mouth (open/close with speaking)
 * - Realistic eye with iris, pupil, eyelid, lashes
 * - Natural blinking
 * - Subtle idle head movement via canvas transform
 * - Eyebrow expression changes per status
 */
import React, { useRef, useEffect } from 'react';
import { AvatarStatus } from '../hooks/useAvatarState';
import { ThemeColors } from '../hooks/useTheme';
import { AvatarGender } from './RealisticFaceAvatar';

interface Props {
  status: AvatarStatus;
  mouthOpenAmount: number;
  micLevel?: number;
  gender?: AvatarGender;
  theme?: ThemeColors;
}

export function RealisticFace2D({
  status, mouthOpenAmount, micLevel = 0, gender = 'female', theme,
}: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef     = useRef<number>(0);
  const stateRef     = useRef({ status, mouthOpenAmount, micLevel, gender, theme });
  const scaleRef     = useRef(1);
  const blink        = useRef({ v: 0, timer: 3.5 + Math.random() * 3, phase: false });

  useEffect(() => { stateRef.current = { status, mouthOpenAmount, micLevel, gender, theme }; }, [status, mouthOpenAmount, micLevel, gender, theme]);

  // Resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width  = width  * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      canvas.style.width  = `${width}px`;
      canvas.style.height = `${height}px`;
      scaleRef.current = Math.min(width, height) / 520;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let startTime = performance.now();

    const draw = (now: number) => {
      const t = (now - startTime) / 1000;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { status, mouthOpenAmount, gender, theme } = stateRef.current;
      const sc  = scaleRef.current * window.devicePixelRatio;
      const W   = canvas.width, H = canvas.height;
      const CX  = W / 2, CY  = H / 2;

      // Theme accent
      const pr = theme?.particleR ?? 0;
      const pg = theme?.particleG ?? 175;
      const pb = theme?.particleB ?? 255;

      ctx.clearRect(0, 0, W, H);

      // Blink timer
      blink.current.timer -= 0.016;
      if (!blink.current.phase && blink.current.timer < 0) {
        blink.current.phase = true; blink.current.v = 1;
        blink.current.timer = 3 + Math.random() * 5;
      }
      if (blink.current.phase) {
        blink.current.v = Math.max(0, blink.current.v - 0.1);
        if (blink.current.v === 0) blink.current.phase = false;
      }
      const blinkV = blink.current.v;

      // Idle head sway (canvas transform)
      const swayX = Math.sin(t * 0.28) * 4 * sc;
      const swayY = Math.sin(t * 0.19) * 2 * sc;
      const swayR = Math.sin(t * 0.22) * 0.018;

      ctx.save();
      ctx.translate(CX + swayX, CY + swayY);
      ctx.rotate(swayR);
      ctx.translate(-CX, -CY);

      // ── Glow background ──────────────────────────────────────────────────
      const glowAlpha = status === 'speaking' ? 0.18
        : status === 'listening' ? 0.22
        : status === 'thinking'  ? 0.14 : 0.09;
      const glow = ctx.createRadialGradient(CX, CY, 0, CX, CY, 200 * sc);
      glow.addColorStop(0,   `rgba(${pr},${pg},${pb},${glowAlpha})`);
      glow.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // ── Parameters ───────────────────────────────────────────────────────
      const isFemale = gender === 'female';
      const skinBase  = isFemale ? '#D4916A' : '#C07850';
      const skinLight = isFemale ? '#E8B090' : '#D49060';
      const skinShadow= isFemale ? '#A06040' : '#8A5030';
      const lipColor  = isFemale ? '#C06070' : '#A05548';
      const hairColor = isFemale ? '#1C0C06' : '#1A1008';
      // Eye color changes with status
      const eyeColorMap: Record<string, string> = {
        listening: '#00D4AA',  // teal
        speaking:  '#4499FF',  // blue
        thinking:  '#AA66FF',  // violet
        idle:      isFemale ? '#5B8A6E' : '#4A6A88', // calm green/blue
        error:     '#FF5555',
      };
      const eyeColor = eyeColorMap[status] ?? eyeColorMap.idle;

      // Face size
      const FW = 120 * sc, FH = 150 * sc;
      const FX = CX, FY = CY + 10 * sc;

      // ── HAIR (draw before face for overlap) ──────────────────────────────
      if (isFemale) {
        // Female: long hair extending below face
        ctx.save();
        // Left side hair
        ctx.beginPath();
        ctx.moveTo(FX - FW * 0.95, FY - FH * 0.4);
        ctx.bezierCurveTo(
          FX - FW * 1.25, FY, FX - FW * 1.15, FY + FH * 0.5, FX - FW * 0.85, FY + FH * 0.9
        );
        ctx.bezierCurveTo(FX - FW * 0.6, FY + FH * 1.0, FX - FW * 0.5, FY + FH * 0.85, FX - FW * 0.4, FY + FH * 0.7);
        ctx.bezierCurveTo(FX - FW * 0.6, FY + FH * 0.4, FX - FW * 0.75, FY + FH * 0.1, FX - FW * 0.65, FY - FH * 0.1);
        ctx.fillStyle = hairColor;
        ctx.fill();
        // Right side hair
        ctx.beginPath();
        ctx.moveTo(FX + FW * 0.95, FY - FH * 0.4);
        ctx.bezierCurveTo(
          FX + FW * 1.25, FY, FX + FW * 1.15, FY + FH * 0.5, FX + FW * 0.85, FY + FH * 0.9
        );
        ctx.bezierCurveTo(FX + FW * 0.6, FY + FH * 1.0, FX + FW * 0.5, FY + FH * 0.85, FX + FW * 0.4, FY + FH * 0.7);
        ctx.bezierCurveTo(FX + FW * 0.6, FY + FH * 0.4, FX + FW * 0.75, FY + FH * 0.1, FX + FW * 0.65, FY - FH * 0.1);
        ctx.fillStyle = hairColor;
        ctx.fill();
        ctx.restore();
      }

      // ── NECK ─────────────────────────────────────────────────────────────
      const neckGrad = ctx.createLinearGradient(FX - 30 * sc, FY + FH * 0.6, FX + 30 * sc, FY + FH * 0.6);
      neckGrad.addColorStop(0, skinShadow);
      neckGrad.addColorStop(0.4, skinBase);
      neckGrad.addColorStop(0.6, skinBase);
      neckGrad.addColorStop(1, skinShadow);
      ctx.fillStyle = neckGrad;
      ctx.beginPath();
      ctx.roundRect(FX - 28 * sc, FY + FH * 0.6, 56 * sc, 60 * sc, [4 * sc]);
      ctx.fill();

      // ── FACE SHAPE ───────────────────────────────────────────────────────
      const faceGrad = ctx.createRadialGradient(FX, FY - FH * 0.15, 10 * sc, FX, FY + FH * 0.1, FH * 1.1);
      faceGrad.addColorStop(0,   skinLight);
      faceGrad.addColorStop(0.45, skinBase);
      faceGrad.addColorStop(0.8,  skinShadow);
      faceGrad.addColorStop(1,    skinShadow);

      // Face oval
      ctx.beginPath();
      ctx.ellipse(FX, FY, FW, FH, 0, 0, Math.PI * 2);
      ctx.fillStyle = faceGrad;
      ctx.fill();

      // Subtle chin shape (jaw) for male
      if (!isFemale) {
        const jawGrad = ctx.createLinearGradient(FX, FY + FH * 0.7, FX, FY + FH);
        jawGrad.addColorStop(0, skinBase);
        jawGrad.addColorStop(1, skinShadow);
        ctx.beginPath();
        ctx.ellipse(FX, FY + FH * 0.85, FW * 0.65, FH * 0.2, 0, 0, Math.PI);
        ctx.fillStyle = jawGrad;
        ctx.fill();
      }

      // Side shadows (cheeks)
      const leftShad = ctx.createRadialGradient(FX - FW * 0.72, FY + FH * 0.1, 0, FX - FW * 0.72, FY + FH * 0.1, FW * 0.6);
      leftShad.addColorStop(0,   `rgba(${isFemale ? '160,80,60' : '130,60,40'},0.35)`);
      leftShad.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = leftShad;
      ctx.beginPath();
      ctx.ellipse(FX, FY, FW, FH, 0, 0, Math.PI * 2);
      ctx.fill();
      const rightShad = ctx.createRadialGradient(FX + FW * 0.72, FY + FH * 0.1, 0, FX + FW * 0.72, FY + FH * 0.1, FW * 0.6);
      rightShad.addColorStop(0,   `rgba(${isFemale ? '160,80,60' : '130,60,40'},0.35)`);
      rightShad.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = rightShad;
      ctx.beginPath();
      ctx.ellipse(FX, FY, FW, FH, 0, 0, Math.PI * 2);
      ctx.fill();

      // Forehead highlight
      const fhGrad = ctx.createRadialGradient(FX, FY - FH * 0.5, 0, FX, FY - FH * 0.5, FW * 0.8);
      fhGrad.addColorStop(0,   'rgba(255,240,225,0.30)');
      fhGrad.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = fhGrad;
      ctx.beginPath();
      ctx.ellipse(FX, FY, FW, FH, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── HAIR TOP (over face edges) ────────────────────────────────────────
      ctx.save();
      if (isFemale) {
        // Top hair dome
        ctx.beginPath();
        ctx.moveTo(FX - FW * 0.95, FY - FH * 0.38);
        ctx.bezierCurveTo(FX - FW * 0.85, FY - FH * 1.1, FX - FW * 0.2, FY - FH * 1.28, FX, FY - FH * 1.28);
        ctx.bezierCurveTo(FX + FW * 0.2, FY - FH * 1.28, FX + FW * 0.85, FY - FH * 1.1, FX + FW * 0.95, FY - FH * 0.38);
        ctx.bezierCurveTo(FX + FW * 0.8, FY - FH * 0.55, FX + FW * 0.3, FY - FH * 0.65, FX, FY - FH * 0.65);
        ctx.bezierCurveTo(FX - FW * 0.3, FY - FH * 0.65, FX - FW * 0.8, FY - FH * 0.55, FX - FW * 0.95, FY - FH * 0.38);
        const hairGrad = ctx.createRadialGradient(FX, FY - FH * 0.9, 0, FX, FY - FH * 0.9, FW * 1.2);
        hairGrad.addColorStop(0, '#2A1208');
        hairGrad.addColorStop(0.5, hairColor);
        hairGrad.addColorStop(1, '#0A0604');
        ctx.fillStyle = hairGrad;
        ctx.fill();
        // Shine on hair
        const hairShine = ctx.createRadialGradient(FX - FW * 0.15, FY - FH * 0.9, 0, FX, FY - FH * 0.7, FW * 0.5);
        hairShine.addColorStop(0, 'rgba(255,240,220,0.12)');
        hairShine.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = hairShine;
        ctx.beginPath();
        ctx.ellipse(FX, FY - FH * 0.82, FW * 0.5, FH * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Male: short hair, buzz cut style
        ctx.beginPath();
        ctx.moveTo(FX - FW * 0.92, FY - FH * 0.45);
        ctx.bezierCurveTo(FX - FW * 0.78, FY - FH * 1.02, FX - FW * 0.15, FY - FH * 1.12, FX, FY - FH * 1.12);
        ctx.bezierCurveTo(FX + FW * 0.15, FY - FH * 1.12, FX + FW * 0.78, FY - FH * 1.02, FX + FW * 0.92, FY - FH * 0.45);
        ctx.bezierCurveTo(FX + FW * 0.88, FY - FH * 0.62, FX + FW * 0.25, FY - FH * 0.72, FX, FY - FH * 0.72);
        ctx.bezierCurveTo(FX - FW * 0.25, FY - FH * 0.72, FX - FW * 0.88, FY - FH * 0.62, FX - FW * 0.92, FY - FH * 0.45);
        const hairGradM = ctx.createLinearGradient(FX, FY - FH * 1.1, FX, FY - FH * 0.55);
        hairGradM.addColorStop(0, '#2A2010');
        hairGradM.addColorStop(1, '#1A1008');
        ctx.fillStyle = hairGradM;
        ctx.fill();
        // Stubble / beard shadow for male
        const beardGrad = ctx.createLinearGradient(FX, FY + FH * 0.4, FX, FY + FH * 0.85);
        beardGrad.addColorStop(0, 'rgba(40,28,16,0)');
        beardGrad.addColorStop(1, 'rgba(40,28,16,0.22)');
        ctx.fillStyle = beardGrad;
        ctx.beginPath();
        ctx.ellipse(FX, FY + FH * 0.6, FW * 0.72, FH * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ── EYEBROWS ─────────────────────────────────────────────────────────
      const browY     = FY - FH * 0.38;
      const browLift  = status === 'thinking'  ? -12 * sc :
                        status === 'listening' ? -8 * sc  : 0;
      const browFrown = status === 'thinking'  ? 4 * sc   : 0;
      const browThick = isFemale ? 4 * sc : 6 * sc;

      ctx.lineCap = 'round';
      ctx.lineWidth = browThick;
      // Left brow
      ctx.beginPath();
      ctx.moveTo(FX - FW * 0.58, browY + browFrown + browLift);
      ctx.bezierCurveTo(
        FX - FW * 0.38, browY - 7 * sc + browLift,
        FX - FW * 0.22, browY - 7 * sc + browLift,
        FX - FW * 0.10, browY + browLift
      );
      const browAlpha = 0.75;
      ctx.strokeStyle = isFemale ? `rgba(60,30,15,${browAlpha})` : `rgba(40,25,10,${browAlpha})`;
      ctx.stroke();
      // Right brow
      ctx.beginPath();
      ctx.moveTo(FX + FW * 0.58, browY + browFrown + browLift);
      ctx.bezierCurveTo(
        FX + FW * 0.38, browY - 7 * sc + browLift,
        FX + FW * 0.22, browY - 7 * sc + browLift,
        FX + FW * 0.10, browY + browLift
      );
      ctx.stroke();
      ctx.lineCap = 'butt';

      // ── EYES ─────────────────────────────────────────────────────────────
      const eyeYBase = FY - FH * 0.18;
      const eyeRX    = FW * 0.23;
      const eyeRY    = FH * 0.12 * (1 - blinkV * 0.92);
      const eyePositions = [
        { x: FX - FW * 0.36, y: eyeYBase },
        { x: FX + FW * 0.36, y: eyeYBase },
      ];

      for (const { x: EX, y: EY } of eyePositions) {
        if (eyeRY < 1) continue; // fully closed — skip

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(EX, EY, eyeRX, eyeRY, 0, 0, Math.PI * 2);
        ctx.clip();

        // Sclera (white)
        const scleraGrad = ctx.createRadialGradient(EX, EY - eyeRY * 0.2, 0, EX, EY, eyeRX);
        scleraGrad.addColorStop(0,   'rgba(255,255,255,1)');
        scleraGrad.addColorStop(0.7, 'rgba(240,238,235,1)');
        scleraGrad.addColorStop(1,   'rgba(210,205,200,1)');
        ctx.fillStyle = scleraGrad;
        ctx.fillRect(EX - eyeRX - 2, EY - eyeRY - 2, eyeRX * 2 + 4, eyeRY * 2 + 4);

        // Iris
        const irisR    = eyeRY * 0.9;
        const irisGrad = ctx.createRadialGradient(EX, EY - irisR * 0.15, 0, EX, EY, irisR);
        irisGrad.addColorStop(0,    eyeColor);
        irisGrad.addColorStop(0.5,  eyeColor);
        irisGrad.addColorStop(0.85, `${eyeColor}88`);
        irisGrad.addColorStop(1,    'rgba(0,0,0,0.6)');
        ctx.fillStyle = irisGrad;
        ctx.beginPath();
        ctx.ellipse(EX, EY, irisR, irisR, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pupil
        const pupilR    = irisR * (status === 'thinking' ? 0.42 : 0.35);
        const pupilGrad = ctx.createRadialGradient(EX, EY, 0, EX, EY, pupilR);
        pupilGrad.addColorStop(0, '#000000');
        pupilGrad.addColorStop(1, '#080808');
        ctx.fillStyle = pupilGrad;
        ctx.beginPath();
        ctx.ellipse(EX, EY, pupilR, pupilR, 0, 0, Math.PI * 2);
        ctx.fill();

        // Eye specular highlights
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.beginPath();
        ctx.ellipse(EX - irisR * 0.28, EY - irisR * 0.3, irisR * 0.14, irisR * 0.18, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.40)';
        ctx.beginPath();
        ctx.ellipse(EX + irisR * 0.18, EY + irisR * 0.22, irisR * 0.07, irisR * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();

        // Status glow around iris
        if (status === 'speaking' || status === 'listening') {
          const eyeGlow = ctx.createRadialGradient(EX, EY, irisR * 0.8, EX, EY, eyeRX);
          eyeGlow.addColorStop(0, `rgba(${pr},${pg},${pb},0.3)`);
          eyeGlow.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = eyeGlow;
          ctx.beginPath();
          ctx.ellipse(EX, EY, eyeRX, eyeRY, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();

        // Eyelid line (upper)
        ctx.beginPath();
        ctx.ellipse(EX, EY - eyeRY * 0.08, eyeRX * 1.02, eyeRY * 1.02, 0, Math.PI, 0);
        ctx.strokeStyle = isFemale ? 'rgba(40,20,10,0.65)' : 'rgba(30,18,8,0.55)';
        ctx.lineWidth = isFemale ? 2.5 * sc : 2 * sc;
        ctx.stroke();

        // Eyelashes (upper) — simple arcs
        if (isFemale && eyeRY > 2) {
          ctx.strokeStyle = 'rgba(20,10,5,0.70)';
          ctx.lineWidth = 1.5 * sc;
          for (let a = -0.7; a <= 0.7; a += 0.14) {
            const lx = EX + Math.cos(a) * eyeRX;
            const ly = EY - Math.sin(Math.abs(a) * 0.5 + 0.3) * eyeRY - eyeRY * 0.15;
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(lx + Math.cos(a) * 5 * sc, ly - 6 * sc);
            ctx.stroke();
          }
        }
      }

      // ── NOSE ─────────────────────────────────────────────────────────────
      const noseY = FY + FH * 0.1;
      // Bridge shadow
      ctx.beginPath();
      ctx.moveTo(FX - 6 * sc, eyeYBase + FH * 0.12);
      ctx.bezierCurveTo(FX - 10 * sc, noseY - FH * 0.04, FX - 14 * sc, noseY + FH * 0.04, FX - 12 * sc, noseY + FH * 0.04);
      ctx.strokeStyle = `rgba(${isFemale ? '140,70,45' : '110,55,35'},0.25)`;
      ctx.lineWidth = 1.5 * sc;
      ctx.stroke();
      // Nostrils
      ctx.fillStyle = `rgba(${isFemale ? '140,70,45' : '100,50,30'},0.30)`;
      ctx.beginPath();
      ctx.ellipse(FX - 10 * sc, noseY + FH * 0.04, 7 * sc, 4.5 * sc, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(FX + 10 * sc, noseY + FH * 0.04, 7 * sc, 4.5 * sc, 0.3, 0, Math.PI * 2);
      ctx.fill();
      // Tip highlight
      const nTipG = ctx.createRadialGradient(FX, noseY + FH * 0.01, 0, FX, noseY + FH * 0.01, 12 * sc);
      nTipG.addColorStop(0, 'rgba(255,235,215,0.30)');
      nTipG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = nTipG;
      ctx.beginPath();
      ctx.ellipse(FX, noseY, 15 * sc, 10 * sc, 0, 0, Math.PI * 2);
      ctx.fill();

      // ── MOUTH ────────────────────────────────────────────────────────────
      const mouthY   = FY + FH * 0.4;
      const mouthW   = (isFemale ? 52 : 60) * sc;
      const mouthOpen = status === 'speaking' ? mouthOpenAmount : 0;
      const openH    = mouthOpen * 22 * sc;

      // Upper lip
      const lipTopY = mouthY - 4 * sc;
      const lipBotY = mouthY + 4 * sc;
      ctx.fillStyle = lipColor;

      // Cupid's bow upper lip
      ctx.beginPath();
      ctx.moveTo(FX - mouthW * 0.5, lipTopY + openH * 0.15);
      ctx.bezierCurveTo(
        FX - mouthW * 0.3, lipTopY - 6 * sc,
        FX - mouthW * 0.1, lipTopY - 8 * sc,
        FX,                lipTopY - 5 * sc
      );
      ctx.bezierCurveTo(
        FX + mouthW * 0.1, lipTopY - 8 * sc,
        FX + mouthW * 0.3, lipTopY - 6 * sc,
        FX + mouthW * 0.5, lipTopY + openH * 0.15
      );
      // Close back
      ctx.bezierCurveTo(FX + mouthW * 0.3, lipBotY - openH * 0.2, FX, lipBotY + 2 * sc - openH * 0.3, FX, lipBotY + 2 * sc - openH * 0.3);
      ctx.bezierCurveTo(FX, lipBotY + 2 * sc - openH * 0.3, FX - mouthW * 0.3, lipBotY - openH * 0.2, FX - mouthW * 0.5, lipTopY + openH * 0.15);
      ctx.fillStyle = lipColor;
      ctx.fill();

      // Lower lip
      const lowerLipY = mouthY + 4 * sc + openH;
      ctx.beginPath();
      ctx.moveTo(FX - mouthW * 0.5, lipBotY - openH * 0.2 + openH * 0.15);
      ctx.bezierCurveTo(
        FX - mouthW * 0.3, lowerLipY + 10 * sc,
        FX + mouthW * 0.3, lowerLipY + 10 * sc,
        FX + mouthW * 0.5, lipBotY - openH * 0.2 + openH * 0.15
      );
      ctx.bezierCurveTo(FX + mouthW * 0.35, lowerLipY + 4 * sc, FX - mouthW * 0.35, lowerLipY + 4 * sc, FX - mouthW * 0.5, lipBotY - openH * 0.2 + openH * 0.15);
      ctx.fillStyle = isFemale ? '#D07080' : '#B06060';
      ctx.fill();

      // Inner mouth (when open)
      if (openH > 4 * sc) {
        const innerY  = lipBotY - openH * 0.15;
        const innerH  = openH * 0.75;
        ctx.beginPath();
        ctx.ellipse(FX, innerY + innerH * 0.5, mouthW * 0.4, innerH * 0.55, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#1A0808';
        ctx.fill();
        // Teeth
        if (openH > 8 * sc) {
          const teethGrad = ctx.createLinearGradient(FX, innerY, FX, innerY + innerH * 0.3);
          teethGrad.addColorStop(0, 'rgba(245,242,235,0.92)');
          teethGrad.addColorStop(1, 'rgba(220,218,210,0.7)');
          ctx.fillStyle = teethGrad;
          ctx.beginPath();
          ctx.ellipse(FX, innerY + innerH * 0.18, mouthW * 0.38, innerH * 0.32, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Lip highlight
      const lipHigh = ctx.createRadialGradient(FX, lipTopY - 3 * sc, 0, FX, lipTopY, mouthW * 0.3);
      lipHigh.addColorStop(0, 'rgba(255,235,235,0.30)');
      lipHigh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lipHigh;
      ctx.beginPath();
      ctx.ellipse(FX, lipTopY, mouthW * 0.3, 6 * sc, 0, 0, Math.PI * 2);
      ctx.fill();

      // Mouth corners
      ctx.fillStyle = `rgba(${isFemale ? '140,60,50' : '100,50,35'},0.35)`;
      ctx.beginPath();
      ctx.ellipse(FX - mouthW * 0.5, mouthY, 4 * sc, 4 * sc, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(FX + mouthW * 0.5, mouthY, 4 * sc, 4 * sc, 0, 0, Math.PI * 2);
      ctx.fill();

      // Chin dimple (female)
      if (isFemale) {
        const dimple = ctx.createRadialGradient(FX, FY + FH * 0.72, 0, FX, FY + FH * 0.72, 10 * sc);
        dimple.addColorStop(0, 'rgba(120,60,40,0.18)');
        dimple.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = dimple;
        ctx.beginPath();
        ctx.ellipse(FX, FY + FH * 0.72, 12 * sc, 8 * sc, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Status rings ─────────────────────────────────────────────────────
      const ringAlpha = status === 'speaking'  ? 0.50
                      : status === 'listening' ? 0.60
                      : status === 'thinking'  ? 0.38 : 0.20;
      const ringColor = `rgba(${pr},${pg},${pb},${ringAlpha})`;

      ctx.save();
      ctx.strokeStyle = ringColor;
      ctx.lineWidth   = 1.2 * sc;
      ctx.setLineDash([5, 10]);
      ctx.lineDashOffset = -t * 35;
      ctx.beginPath();
      ctx.ellipse(CX, CY, FW * 1.65, FH * 1.45, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([2.5, 16]);
      ctx.lineDashOffset = t * 22;
      ctx.strokeStyle = `rgba(${pr},${pg},${pb},${ringAlpha * 0.5})`;
      ctx.lineWidth   = 0.8 * sc;
      ctx.beginPath();
      ctx.ellipse(CX, CY, FW * 1.88, FH * 1.65, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      ctx.restore(); // end head sway transform

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas ref={canvasRef} className="absolute inset-0" style={{ imageRendering: 'auto' }} />
    </div>
  );
}
