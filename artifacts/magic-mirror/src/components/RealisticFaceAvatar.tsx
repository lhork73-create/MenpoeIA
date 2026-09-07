import React, { Suspense, useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { AvatarStatus } from '../hooks/useAvatarState';
import { ThemeColors } from '../hooks/useTheme';
import { WebGLErrorBoundary, isWebGLAvailable } from './WebGLErrorBoundary';
import { RealisticFace2D } from './RealisticFace2D';

// Original 3D avatar model
const OBJ_URL = '/models/desktop_3d/44e7e5935e2630ce12c07169406ada3d.obj';
const TEXTURE_URL = '/models/desktop_3d/texture.jpg';

// ── Status accent colors ──────────────────────────────────────────────────────
function statusAccentColor(status: AvatarStatus): THREE.Color {
  switch (status) {
    case 'listening': return new THREE.Color('#00F0C0');
    case 'speaking':  return new THREE.Color('#38BDF8');
    case 'thinking':  return new THREE.Color('#C084FC');
    default:          return new THREE.Color('#10B981');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OBJ MESH LOADER — imperative mesh management in its own group
// ═══════════════════════════════════════════════════════════════════════════════
interface ObjMeshProps {
  onReady: () => void;
}

function ObjMesh({ onReady }: ObjMeshProps) {
  const groupRef = useRef<THREE.Group>(null!);

  useEffect(() => {
    let cancelled = false;
    const loader = new OBJLoader();
    const texLoader = new THREE.TextureLoader();

    Promise.all([
      new Promise<THREE.Group>((res, rej) => loader.load(OBJ_URL, res, undefined, rej)),
      new Promise<THREE.Texture>((res, rej) => texLoader.load(TEXTURE_URL, res, undefined, rej)),
    ]).then(([obj, tex]) => {
      if (cancelled || !groupRef.current) return;

      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter  = THREE.LinearFilter;

      let baseMesh: THREE.Mesh | null = null;
      obj.traverse(c => { if ((c as THREE.Mesh).isMesh && !baseMesh) baseMesh = c as THREE.Mesh; });
      if (!baseMesh) return;

      const geo = (baseMesh as THREE.Mesh).geometry.clone();
      geo.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.65,
        metalness: 0.02,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      // The mesh Y-offset of 0.05 keeps the face centered in view
      mesh.position.set(0, 0.05, 0);
      groupRef.current.add(mesh);
      onReady();
    }).catch(console.error);

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <group ref={groupRef} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EYELID RIG — independent 3D geometry animated on top of the face
// Eye coords (in neckPivot space, accounting for rootGroup Y-offset and mesh Y+0.05):
//   The face mesh sits at neckPivot.y=0 + mesh.y=0.05 → face center at y≈0
//   Based on model analysis (Y range -0.45 to +0.45, eye region above center):
//   Eyes are approx at world-y = 0.175, x = ±0.095, z = 0.19 (front of face)
// ═══════════════════════════════════════════════════════════════════════════════
interface EyelidRigProps {
  side: 'left' | 'right';
  blinkState: React.MutableRefObject<BlinkState>;
  gazeRef: React.MutableRefObject<{ x: number; y: number }>;
}

interface BlinkState {
  phase: number;
  blinking: boolean;
  nextBlink: number;
  closeness: number; // 0 = open, 1 = fully closed
}

function EyelidRig({ side, blinkState, gazeRef }: EyelidRigProps) {
  const upperLidRef  = useRef<THREE.Mesh>(null!);
  const lowerLidRef  = useRef<THREE.Mesh>(null!);
  const eyeballRef   = useRef<THREE.Mesh>(null!);
  const pupilRef     = useRef<THREE.Mesh>(null!);
  const catchlightRef = useRef<THREE.Mesh>(null!);

  // Eye anchor positions in scene space
  const xSign = side === 'left' ? -1 : 1;
  const EYE_X  =  xSign * 0.095;
  const EYE_Y  =  0.230; // eye center Y (within neckPivot space)
  const EYE_Z  =  0.190; // forward

  // Upper lid: half-ellipse arc
  const upperGeo = useMemo(() => {
    const s = new THREE.Shape();
    const W = 0.044, H = 0.024;
    s.moveTo(-W, 0);
    s.bezierCurveTo(-W * 0.9, H * 1.5, W * 0.9, H * 1.5, W, 0);
    s.lineTo(-W, 0);
    return new THREE.ShapeGeometry(s, 24);
  }, []);

  // Lower lid: gentle downward curve
  const lowerGeo = useMemo(() => {
    const s = new THREE.Shape();
    const W = 0.044, H = 0.012;
    s.moveTo(-W, 0);
    s.bezierCurveTo(-W * 0.7, -H, W * 0.7, -H, W, 0);
    s.lineTo(-W, 0);
    return new THREE.ShapeGeometry(s, 24);
  }, []);

  const eyeballGeo   = useMemo(() => new THREE.SphereGeometry(0.030, 24, 18), []);
  const pupilGeo     = useMemo(() => new THREE.CircleGeometry(0.016, 24), []);
  const catchlightGeo = useMemo(() => new THREE.CircleGeometry(0.004, 12), []);

  // Skin-tone lid material (matches model texture tone)
  const lidMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#C48B6A',
    roughness: 0.8,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
  }), []);

  const scleraMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#F5F0EA',
    roughness: 0.5,
    metalness: 0.02,
  }), []);

  const pupilMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#100800',
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.FrontSide,
    depthTest: true,
    depthWrite: false,
  }), []);

  const catchlightMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    emissive: '#AAAAAA',
    roughness: 0.1,
    metalness: 0.2,
    side: THREE.FrontSide,
    depthTest: true,
    depthWrite: false,
  }), []);

  useFrame((state) => {
    const t   = state.clock.getElapsedTime();
    const blink = blinkState.current;

    // ── Blink state machine ──
    if (!blink.blinking && t > blink.nextBlink) {
      blink.blinking = true;
      blink.phase = 0;
    }
    if (blink.blinking) {
      blink.phase += 0.20;
      // One full sine wave = one blink cycle
      blink.closeness = Math.max(0, Math.sin(blink.phase));
      if (blink.phase >= Math.PI) {
        blink.blinking = false;
        blink.closeness = 0;
        // Random interval 2.5–6s
        blink.nextBlink = t + 2.5 + Math.random() * 3.5;
      }
    } else {
      blink.closeness = THREE.MathUtils.lerp(blink.closeness, 0, 0.15);
    }

    // ── Smooth gaze offset for eyeballs ──
    const gx = gazeRef.current.x * 0.010;
    const gy = gazeRef.current.y * 0.006;

    // ── Micro flutter for organic feel ──
    const micro = Math.sin(t * 0.9) * 0.001 + Math.cos(t * 2.3) * 0.0005;

    const openAmount = 1.0 - blink.closeness;

    // Upper lid: scaleY controls closing (pivot from top = position adjusts)
    if (upperLidRef.current) {
      upperLidRef.current.scale.y = Math.max(0.04, openAmount);
      // When closed, the lid descends; keep anchor at top of eye
      upperLidRef.current.position.set(
        EYE_X + gx * 0.1,
        EYE_Y + 0.014 + micro,
        EYE_Z + 0.028
      );
    }

    // Lower lid: slight rise on blink
    if (lowerLidRef.current) {
      lowerLidRef.current.position.set(
        EYE_X + gx * 0.1,
        EYE_Y - 0.016 + blink.closeness * 0.006 + micro,
        EYE_Z + 0.026
      );
    }

    // Eyeball + pupil follow gaze
    const eyeVisible = blink.closeness < 0.85;
    if (eyeballRef.current) {
      eyeballRef.current.visible = eyeVisible;
      eyeballRef.current.position.set(EYE_X + gx, EYE_Y + gy, EYE_Z - 0.002);
    }
    if (pupilRef.current) {
      pupilRef.current.visible = eyeVisible;
      pupilRef.current.position.set(EYE_X + gx, EYE_Y + gy, EYE_Z + 0.025);
    }
    if (catchlightRef.current) {
      catchlightRef.current.visible = eyeVisible;
      catchlightRef.current.position.set(EYE_X + gx + 0.007, EYE_Y + gy + 0.007, EYE_Z + 0.026);
    }
  });

  return (
    <group>
      {/* White sclera eyeball */}
      <mesh ref={eyeballRef} position={[EYE_X, EYE_Y, EYE_Z - 0.002]}
        geometry={eyeballGeo} material={scleraMat} renderOrder={0} />

      {/* Dark pupil/iris disc */}
      <mesh ref={pupilRef} position={[EYE_X, EYE_Y, EYE_Z + 0.025]}
        geometry={pupilGeo} material={pupilMat} renderOrder={1} />

      {/* Catch-light specular dot */}
      <mesh ref={catchlightRef} position={[EYE_X + 0.007, EYE_Y + 0.007, EYE_Z + 0.026]}
        geometry={catchlightGeo} material={catchlightMat} renderOrder={2} />

      {/* Upper eyelid */}
      <mesh ref={upperLidRef} position={[EYE_X, EYE_Y + 0.014, EYE_Z + 0.028]}
        geometry={upperGeo} material={lidMat} renderOrder={3} />

      {/* Lower eyelid */}
      <mesh ref={lowerLidRef} position={[EYE_X, EYE_Y - 0.016, EYE_Z + 0.026]}
        geometry={lowerGeo} material={lidMat} renderOrder={3} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOUTH RIG — 3D animated lips that open when speaking
// Mouth position: below nose, approx EYE_Y - 0.24 → Y ≈ -0.01, Z = 0.200
// ═══════════════════════════════════════════════════════════════════════════════
interface MouthRigProps {
  status: AvatarStatus;
  mouthOpenAmount: number;
}

function MouthRig({ status, mouthOpenAmount }: MouthRigProps) {
  const upperLipRef    = useRef<THREE.Mesh>(null!);
  const lowerLipRef    = useRef<THREE.Mesh>(null!);
  const mouthOpenRef   = useRef<THREE.Mesh>(null!);

  // Mouth open target with smoothing
  const smoothOpen = useRef(0);

  const MOUTH_Y = -0.015;
  const MOUTH_Z = 0.200;

  // Upper lip M-shape (Cupid's bow)
  const upperLipGeo = useMemo(() => {
    const s = new THREE.Shape();
    const W = 0.048, H = 0.016;
    s.moveTo(-W, 0);
    // Left peak
    s.bezierCurveTo(-W * 0.7, H * 0.8, -W * 0.3, H * 1.2, 0, H * 0.5);
    // Right peak
    s.bezierCurveTo(W * 0.3, H * 1.2, W * 0.7, H * 0.8, W, 0);
    // Bottom curve back
    s.bezierCurveTo(W * 0.5, -H * 0.4, -W * 0.5, -H * 0.4, -W, 0);
    return new THREE.ShapeGeometry(s, 28);
  }, []);

  // Lower lip (fuller)
  const lowerLipGeo = useMemo(() => {
    const s = new THREE.Shape();
    const W = 0.050, H = 0.020;
    s.moveTo(-W, 0);
    s.bezierCurveTo(-W * 0.6, -H * 1.2, W * 0.6, -H * 1.2, W, 0);
    s.bezierCurveTo(W * 0.4, H * 0.5, -W * 0.4, H * 0.5, -W, 0);
    return new THREE.ShapeGeometry(s, 28);
  }, []);

  // Mouth interior (dark gap when open)
  const mouthOpenGeo = useMemo(() => new THREE.PlaneGeometry(0.072, 0.030), []);

  const lipMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#B5675E',
    roughness: 0.55,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: true,
  }), []);

  const mouthDarkMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#0D0304',
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: true,
  }), []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    // Target openness
    let target = mouthOpenAmount;
    if (status === 'speaking') {
      // Organic speech: two overlapping sine waves
      const w1 = Math.abs(Math.sin(t * 9.2)) * 0.5;
      const w2 = Math.abs(Math.sin(t * 5.7 + 0.8)) * 0.4;
      const speechWave = Math.min(1.0, w1 + w2);
      target = Math.max(mouthOpenAmount, speechWave * 0.9);
    } else if (status === 'idle' || status === 'thinking' || status === 'listening') {
      target = 0;
    }

    // Smooth transition
    smoothOpen.current = THREE.MathUtils.lerp(smoothOpen.current, target, 0.18);
    const open = smoothOpen.current;

    if (upperLipRef.current) {
      upperLipRef.current.position.y = MOUTH_Y + open * 0.020;
    }
    if (lowerLipRef.current) {
      lowerLipRef.current.position.y = MOUTH_Y - 0.018 - open * 0.026;
    }
    if (mouthOpenRef.current) {
      const showing = open > 0.04;
      mouthOpenRef.current.visible = showing;
      if (showing) {
        mouthOpenRef.current.scale.y = open;
        mouthOpenRef.current.scale.x = 0.4 + open * 0.6;
        mouthOpenRef.current.position.y = MOUTH_Y - 0.009 - open * 0.006;
      }
    }
  });

  return (
    <group>
      {/* Dark interior (behind lips) */}
      <mesh ref={mouthOpenRef}
        position={[0, MOUTH_Y - 0.009, MOUTH_Z - 0.003]}
        geometry={mouthOpenGeo} material={mouthDarkMat} renderOrder={1} />

      {/* Upper lip */}
      <mesh ref={upperLipRef}
        position={[0, MOUTH_Y, MOUTH_Z + 0.006]}
        geometry={upperLipGeo} material={lipMat} renderOrder={2} />

      {/* Lower lip */}
      <mesh ref={lowerLipRef}
        position={[0, MOUTH_Y - 0.018, MOUTH_Z + 0.004]}
        geometry={lowerLipGeo} material={lipMat} renderOrder={2} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN AVATAR: OBJ model + 3D rig overlay + head animation
// ═══════════════════════════════════════════════════════════════════════════════
interface PristineDesktopAvatarProps {
  status: AvatarStatus;
  mouthOpenAmount: number;
}

function PristineDesktopAvatar({ status, mouthOpenAmount }: PristineDesktopAvatarProps) {
  const rootGroupRef  = useRef<THREE.Group>(null!);
  const neckPivotRef  = useRef<THREE.Group>(null!);

  const mouseGaze = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const headRot   = useRef({ yaw: 0, pitch: 0, roll: 0 });
  const gazeRef   = useRef({ x: 0, y: 0 });

  // Shared blink state for both eyes (they blink together)
  const blinkState = useRef<BlinkState>({
    phase: 0,
    blinking: false,
    nextBlink: 2.0,
    closeness: 0,
  });

  const [meshReady, setMeshReady] = useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseGaze.current.targetX = THREE.MathUtils.clamp((e.clientX / window.innerWidth  - 0.5) * 2, -1, 1);
      mouseGaze.current.targetY = THREE.MathUtils.clamp((e.clientY / window.innerHeight - 0.5) * 2, -1, 1);
    };
    const onLeave = () => { mouseGaze.current.targetX = 0; mouseGaze.current.targetY = 0; };
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  useFrame((state) => {
    if (!neckPivotRef.current) return;
    const t = state.clock.getElapsedTime();

    mouseGaze.current.x = THREE.MathUtils.lerp(mouseGaze.current.x, mouseGaze.current.targetX, 0.07);
    mouseGaze.current.y = THREE.MathUtils.lerp(mouseGaze.current.y, mouseGaze.current.targetY, 0.07);
    gazeRef.current.x   = THREE.MathUtils.lerp(gazeRef.current.x,   mouseGaze.current.x,       0.10);
    gazeRef.current.y   = THREE.MathUtils.lerp(gazeRef.current.y,   mouseGaze.current.y,       0.10);

    const gazeYaw   = THREE.MathUtils.clamp(mouseGaze.current.x *  0.18, -0.20,  0.20);
    const gazePitch = THREE.MathUtils.clamp(mouseGaze.current.y * -0.09, -0.09,  0.09);
    const gazeRoll  = -gazeYaw * 0.08;

    const breathCycle = Math.sin(t * 1.55);
    const breathY     = breathCycle * 0.003;
    const breathPitch = breathCycle * 0.004;

    const idleYaw   = Math.sin(t * 0.52) * 0.011 + Math.cos(t * 0.93) * 0.005;
    const idlePitch = Math.cos(t * 0.43) * 0.007 + Math.sin(t * 0.82) * 0.003;
    const idleRoll  = Math.sin(t * 0.37) * 0.004;

    let stateYaw = 0, statePitch = 0, stateRoll = 0;
    if (status === 'speaking') {
      statePitch = Math.sin(t * 5.0) * 0.008;
    } else if (status === 'thinking') {
      statePitch = 0.020; stateRoll = -0.018; stateYaw = 0.022;
    } else if (status === 'listening') {
      statePitch = -0.010; stateRoll = 0.010;
    }

    headRot.current.yaw   = THREE.MathUtils.lerp(headRot.current.yaw,
      THREE.MathUtils.clamp(gazeYaw + idleYaw + stateYaw, -0.24, 0.24), 0.09);
    headRot.current.pitch = THREE.MathUtils.lerp(headRot.current.pitch,
      THREE.MathUtils.clamp(gazePitch + idlePitch + statePitch + breathPitch, -0.15, 0.15), 0.09);
    headRot.current.roll  = THREE.MathUtils.lerp(headRot.current.roll,
      THREE.MathUtils.clamp(gazeRoll + idleRoll + stateRoll, -0.05, 0.05), 0.09);

    neckPivotRef.current.rotation.set(headRot.current.pitch, headRot.current.yaw, headRot.current.roll);
    if (rootGroupRef.current) {
      const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || window.innerWidth < window.innerHeight);
      const targetScale = isMobile ? 0.60 : 0.88;
      const targetY = (isMobile ? 0.05 : -0.14) + breathY;
      rootGroupRef.current.position.set(0, targetY, 0);
      rootGroupRef.current.scale.setScalar(targetScale);
    }
  });

  return (
    <group ref={rootGroupRef} position={[0, -0.14, 0]} scale={0.88} dispose={null}>
      <group ref={neckPivotRef} position={[0, -0.05, 0]}>

        {/* ── Original OBJ mesh (separate group, no imperative children cleared) ── */}
        <ObjMesh onReady={() => setMeshReady(true)} />

        {/* ── 3D Rig overlays: appear after mesh loads ── */}
        {meshReady && (
          <>
            <EyelidRig side="left"  blinkState={blinkState} gazeRef={gazeRef} />
            <EyelidRig side="right" blinkState={blinkState} gazeRef={gazeRef} />
            <MouthRig status={status} mouthOpenAmount={mouthOpenAmount} />
          </>
        )}
      </group>
    </group>
  );
}

// ── Dynamic status glow ───────────────────────────────────────────────────────
function StatusAccentLight({ status }: { status: AvatarStatus }) {
  const lightRef = useRef<THREE.PointLight>(null!);
  useFrame(() => {
    if (!lightRef.current) return;
    lightRef.current.color.lerp(statusAccentColor(status), 0.06);
    const ti = status === 'idle' ? 0.35 : status === 'speaking' ? 1.2 : 0.8;
    lightRef.current.intensity = THREE.MathUtils.lerp(lightRef.current.intensity, ti, 0.06);
  });
  return <pointLight ref={lightRef} position={[0, 0.15, 0.8]} distance={2.5} decay={2} />;
}

// ── Three.js scene ────────────────────────────────────────────────────────────
interface ThreeDSceneProps {
  status: AvatarStatus;
  mouthOpenAmount: number;
  micLevel?: number;
}

// ── Responsive Camera Controller for Mobile & Desktop ─────────────────────────
function ResponsiveCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      const isMobile = size.width < 768 || size.width < size.height;
      if (isMobile) {
        // En móviles verticales (smartphones):
        // Con la relación de aspecto vertical de smartphones (~9:20), la cámara se aleja
        // a Z=3.10 y sube a Y=0.22 con fov=36. Junto con targetScale=0.60, el avatar
        // queda perfectamente proporcionado, con hombros y cuello visibles, en el tercio
        // superior de la pantalla y sin invadir los controles de voz inferiores.
        camera.position.set(0, 0.22, 3.10);
        camera.fov = 36;
      } else {
        // En pantallas horizontales (PC, laptops): encuadre nítido y cercano
        camera.position.set(0, 0.06, 1.35);
        camera.fov = 30;
      }
      camera.aspect = size.width / Math.max(1, size.height);
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width, size.height]);
  return null;
}

function ThreeDScene({ status, mouthOpenAmount }: ThreeDSceneProps) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        camera={{ position: [0, 0.06, 1.35], fov: 30 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
        }}
        style={{ background: 'transparent', width: '100%', height: '100%' }}
        dpr={[1, 2]}
      >
        <ResponsiveCamera />
        <ambientLight intensity={0.95} />
        <directionalLight position={[1.2, 1.6, 1.8]}  intensity={2.0}  color="#FFF8F0" />
        <directionalLight position={[-1.8, 1.4, -0.8]} intensity={1.6}  color="#38BDF8" />
        <directionalLight position={[-1.0, 0.3, 1.2]}  intensity={1.0}  color="#F1F5F9" />
        <directionalLight position={[0, 2.2, 0.3]}     intensity={0.7}  color="#FFFFFF" />
        <pointLight       position={[0, 0.08, 0.65]}   intensity={0.4}  color="#FFFFFF" />
        <StatusAccentLight status={status} />

        <Suspense fallback={null}>
          <PristineDesktopAvatar status={status} mouthOpenAmount={mouthOpenAmount} />
        </Suspense>
      </Canvas>
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
interface RealisticFaceAvatarProps {
  status: AvatarStatus;
  theme?: ThemeColors;
  mouthOpenAmount?: number;
  micLevel?: number;
}

export function RealisticFaceAvatar({
  status, theme, mouthOpenAmount = 0, micLevel = 0,
}: RealisticFaceAvatarProps) {
  const [webGLOk, setWebGLOk] = useState(true);
  useEffect(() => { setWebGLOk(isWebGLAvailable()); }, []);

  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <WebGLErrorBoundary fallback={
        <RealisticFace2D status={status} theme={theme} mouthOpenAmount={mouthOpenAmount} />
      }>
        {webGLOk
          ? <ThreeDScene status={status} mouthOpenAmount={mouthOpenAmount} micLevel={micLevel} />
          : <RealisticFace2D status={status} theme={theme} mouthOpenAmount={mouthOpenAmount} />
        }
      </WebGLErrorBoundary>
    </div>
  );
}
