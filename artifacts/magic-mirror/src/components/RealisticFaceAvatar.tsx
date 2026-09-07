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
  onReady?: () => void;
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
      onReady?.();
    }).catch(console.error);

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <group ref={groupRef} />;
}



// ═══════════════════════════════════════════════════════════════════════════════
// MAIN AVATAR: OBJ model + 3D rig overlay + head animation
// ═══════════════════════════════════════════════════════════════════════════════
interface PristineDesktopAvatarProps {
  status: AvatarStatus;
  mouthOpenAmount: number;
}

function PristineDesktopAvatar({ status }: PristineDesktopAvatarProps) {
  const rootGroupRef  = useRef<THREE.Group>(null!);
  const neckPivotRef  = useRef<THREE.Group>(null!);

  const mouseGaze = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const headRot   = useRef({ yaw: 0, pitch: 0, roll: 0 });

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
      const targetScale = isMobile ? 0.78 : 0.88;
      const targetY = (isMobile ? -0.06 : -0.14) + breathY;
      rootGroupRef.current.position.set(0, targetY, 0);
      rootGroupRef.current.scale.setScalar(targetScale);
    }
  });

  return (
    <group ref={rootGroupRef} position={[0, -0.14, 0]} scale={0.88} dispose={null}>
      <group ref={neckPivotRef} position={[0, -0.05, 0]}>
        {/* ── Modelo fotográfico 3D original limpio y ultra-realista ── */}
        <ObjMesh />
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
        // Encuadre mediano ideal: cabeza nítida y destacada, con hombros y camisa visibles,
        // sin tocar los bordes laterales y dejando la mitad inferior libre para el micrófono.
        camera.position.set(0, 0.10, 2.15);
        camera.fov = 32;
      } else {
        // En pantallas horizontales (PC, laptops): encuadre cinematográfico cercano
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
