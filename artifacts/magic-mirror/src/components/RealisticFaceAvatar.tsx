import React, { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { AvatarStatus } from '../hooks/useAvatarState';
import { ThemeColors } from '../hooks/useTheme';
import { WebGLErrorBoundary, isWebGLAvailable } from './WebGLErrorBoundary';
import { RealisticFace2D } from './RealisticFace2D';

export type AvatarGender = 'female' | 'male';

const FACECAP_URL = '/models/facecap.glb';
const LEE_URL     = '/models/LeePerrySmith.glb';

useGLTF.preload(FACECAP_URL);
useGLTF.preload(LEE_URL);

// ── Morph helper ─────────────────────────────────────────────────────────────
function lerpMorph(
  influences: number[],
  dict: { [key: string]: number },
  key: string,
  target: number,
  alpha = 0.12,
) {
  const idx = dict[key];
  if (idx === undefined) return;
  influences[idx] = THREE.MathUtils.lerp(influences[idx] ?? 0, target, alpha);
}

// ── Camera follows mouse ─────────────────────────────────────────────────────
function CameraLookAt() {
  const { camera } = useThree();
  const mouse = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.tx = (e.clientX / window.innerWidth  - 0.5) * 0.4;
      mouse.current.ty = (e.clientY / window.innerHeight - 0.5) * 0.25;
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useFrame(() => {
    mouse.current.x += (mouse.current.tx - mouse.current.x) * 0.04;
    mouse.current.y += (mouse.current.ty - mouse.current.y) * 0.04;
    camera.position.x += (mouse.current.x  - camera.position.x) * 0.06;
    camera.position.y += (-mouse.current.y - camera.position.y) * 0.06;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// ── Hair geometry (female) ────────────────────────────────────────────────────
function FemaleHair() {
  const dark = '#1A0C06';
  return (
    <group>
      <mesh position={[0, 0.068, -0.008]} scale={[1.04, 0.9, 1.04]}>
        <sphereGeometry args={[0.094, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
        <meshStandardMaterial color={dark} roughness={0.88} metalness={0.03} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.115, 0.012]}>
        <sphereGeometry args={[0.081, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.38]} />
        <meshStandardMaterial color="#231208" roughness={0.82} metalness={0.04} />
      </mesh>
      {[-0.045, -0.015, 0.015, 0.045].map((x, i) => (
        <mesh key={i} position={[x, 0.036, 0.089]} rotation={[0.35, x * 0.5, 0]}>
          <capsuleGeometry args={[0.009, 0.028, 4, 8]} />
          <meshStandardMaterial color={dark} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[-0.093, 0.0, 0.04]} rotation={[0.1, 0.4, -0.3]}>
        <capsuleGeometry args={[0.018, 0.075, 8, 12]} />
        <meshStandardMaterial color={dark} roughness={0.88} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.093, 0.0, 0.04]} rotation={[0.1, -0.4, 0.3]}>
        <capsuleGeometry args={[0.018, 0.075, 8, 12]} />
        <meshStandardMaterial color={dark} roughness={0.88} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.02, -0.086]} rotation={[-0.1, 0, 0]}>
        <capsuleGeometry args={[0.052, 0.06, 8, 16]} />
        <meshStandardMaterial color={dark} roughness={0.88} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ── Female face (facecap.glb with 52 ARKit morph targets) ───────────────────
interface FaceProps {
  status: AvatarStatus;
  mouthOpenAmount: number;
  theme?: ThemeColors;
}

function FemaleHead({ status, mouthOpenAmount }: FaceProps) {
  const { scene } = useGLTF(FACECAP_URL);
  const meshRef   = useRef<THREE.Mesh | null>(null);
  const groupRef  = useRef<THREE.Group>(null!);
  const blink     = useRef({ v: 0, timer: 3 + Math.random() * 4, phase: false });

  useEffect(() => {
    const clone = scene.clone(true);
    clone.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        if (node.morphTargetDictionary) meshRef.current = node;
        if (node.material instanceof THREE.MeshStandardMaterial) {
          node.material = node.material.clone();
          node.material.color.setHex(0xC08060);
          node.material.roughness = 0.65;
          node.material.metalness = 0.0;
          node.material.needsUpdate = true;
        }
      }
    });
    if (groupRef.current) {
      groupRef.current.clear();
      groupRef.current.add(clone);
    }
  }, [scene]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    const group = groupRef.current;
    const mesh  = meshRef.current;

    if (group) {
      group.rotation.y = Math.sin(t * 0.22) * 0.04 + Math.sin(t * 0.09) * 0.015;
      group.rotation.x = Math.sin(t * 0.16) * 0.012;
      group.rotation.z = status === 'listening'
        ? THREE.MathUtils.lerp(group.rotation.z, Math.sin(t * 0.4) * 0.025, 0.05)
        : THREE.MathUtils.lerp(group.rotation.z, 0, 0.03);
    }

    if (!mesh?.morphTargetInfluences || !mesh.morphTargetDictionary) return;
    const infl = mesh.morphTargetInfluences;
    const dict = mesh.morphTargetDictionary;

    lerpMorph(infl, dict, 'jawOpen',     status === 'speaking' ? Math.max(0, mouthOpenAmount * 0.85) : 0, 0.18);
    lerpMorph(infl, dict, 'mouthSmileLeft',  status === 'idle' ? 0.14 : 0.05, 0.04);
    lerpMorph(infl, dict, 'mouthSmileRight', status === 'idle' ? 0.14 : 0.05, 0.04);

    blink.current.timer -= delta;
    if (!blink.current.phase && blink.current.timer < 0) {
      blink.current.phase = true; blink.current.v = 1;
      blink.current.timer = 3 + Math.random() * 5;
    }
    if (blink.current.phase) {
      blink.current.v = Math.max(0, blink.current.v - delta * 9);
      if (blink.current.v === 0) blink.current.phase = false;
    }
    lerpMorph(infl, dict, 'eyeBlinkLeft',  blink.current.v, 1);
    lerpMorph(infl, dict, 'eyeBlinkRight', blink.current.v, 1);

    lerpMorph(infl, dict, 'browInnerUp',    status === 'thinking' ? 0.45 : 0, 0.04);
    lerpMorph(infl, dict, 'browDownLeft',   status === 'thinking' ? 0.20 : 0, 0.04);
    lerpMorph(infl, dict, 'browDownRight',  status === 'thinking' ? 0.20 : 0, 0.04);
    lerpMorph(infl, dict, 'browOuterUpLeft',  status === 'listening' ? 0.28 : 0, 0.04);
    lerpMorph(infl, dict, 'browOuterUpRight', status === 'listening' ? 0.28 : 0, 0.04);

    const look = Math.sin(t * 0.7) * 0.07;
    lerpMorph(infl, dict, 'eyeLookUpLeft',    Math.max(0,  look), 0.05);
    lerpMorph(infl, dict, 'eyeLookDownLeft',  Math.max(0, -look), 0.05);
    lerpMorph(infl, dict, 'eyeLookUpRight',   Math.max(0,  look), 0.05);
    lerpMorph(infl, dict, 'eyeLookDownRight', Math.max(0, -look), 0.05);
  });

  return (
    <group position={[0, -0.02, 0]} scale={10}>
      <group ref={groupRef} />
      <FemaleHair />
    </group>
  );
}

// ── Male face (Lee Perry Smith photorealistic scan) ──────────────────────────
function MaleHead({ status }: FaceProps) {
  const { scene }  = useGLTF(LEE_URL);
  const groupRef   = useRef<THREE.Group>(null!);

  useEffect(() => {
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshStandardMaterial) {
        node.material = node.material.clone();
        node.material.roughness = 0.55;
        node.material.metalness = 0.0;
        node.material.needsUpdate = true;
      }
    });
  }, [scene]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.22) * 0.05;
      groupRef.current.rotation.x = Math.sin(t * 0.15) * 0.018;
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.9, 0]}>
      <primitive object={scene} />
    </group>
  );
}

// ── Orbiting tech rings ───────────────────────────────────────────────────────
function StatusRings({ status, theme }: { status: AvatarStatus; theme?: ThemeColors }) {
  const r1 = useRef<THREE.Mesh>(null!);
  const r2 = useRef<THREE.Mesh>(null!);
  const pr = theme?.particleR ?? 0, pg = theme?.particleG ?? 175, pb = theme?.particleB ?? 255;

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (r1.current) {
      r1.current.rotation.z = t * (status === 'speaking' ? 0.7 : 0.28);
      r1.current.rotation.x = Math.PI / 2 + Math.sin(t * 0.4) * 0.1;
    }
    if (r2.current) {
      r2.current.rotation.z = -t * 0.38;
      r2.current.rotation.y = Math.sin(t * 0.3) * 0.15;
    }
  });

  const color  = new THREE.Color(`rgb(${pr},${pg},${pb})`);
  const a1 = status === 'speaking' ? 0.55 : status === 'listening' ? 0.62 : status === 'thinking' ? 0.38 : 0.22;

  return (
    <>
      <mesh ref={r1}>
        <torusGeometry args={[1.55, 0.008, 8, 96]} />
        <meshBasicMaterial color={color} transparent opacity={a1} />
      </mesh>
      <mesh ref={r2} rotation={[0.4, 0, 0]}>
        <torusGeometry args={[1.75, 0.004, 6, 80]} />
        <meshBasicMaterial color={color} transparent opacity={a1 * 0.5} />
      </mesh>
    </>
  );
}

// ── Loading skeleton (while GLB loads) ───────────────────────────────────────
function LoadingSkeleton({ theme }: { theme?: ThemeColors }) {
  const ref = useRef<THREE.Mesh>(null!);
  const pr = theme?.particleR ?? 0, pg = theme?.particleG ?? 175, pb = theme?.particleB ?? 255;

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (ref.current) {
      const mat = ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.12 + Math.sin(t * 2.5) * 0.08;
    }
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.85, 20, 20]} />
      <meshBasicMaterial color={new THREE.Color(`rgb(${pr},${pg},${pb})`)} transparent opacity={0.12} wireframe />
    </mesh>
  );
}

// ── 3D Canvas scene ───────────────────────────────────────────────────────────
interface SceneProps {
  status: AvatarStatus;
  mouthOpenAmount: number;
  gender: AvatarGender;
  theme?: ThemeColors;
}

function ThreeDScene({ status, mouthOpenAmount, gender, theme }: SceneProps) {
  const camZ = gender === 'female' ? 0.72 : 2.85;

  return (
    <Canvas
      camera={{ position: [0, 0, camZ], fov: 42 }}
      gl={{ antialias: true, alpha: true, failIfMajorPerformanceCaveat: false }}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
      dpr={[1, 1.5]}
    >
      <CameraLookAt />
      <ambientLight intensity={0.4} />
      <directionalLight position={[-2.5, 4, 5]}  intensity={2.8}  color="#FFF4E0" />
      <directionalLight position={[3.5, 1.5, 2]} intensity={0.9}  color="#C0D0FF" />
      <directionalLight position={[0, -1, -5]}   intensity={0.6}  color="#FFE0C0" />
      <directionalLight position={[0, 6, 0]}     intensity={0.35} />
      <pointLight
        position={[0, 2, 3]} intensity={0.4}
        color={`rgb(${theme?.particleR ?? 0},${theme?.particleG ?? 175},${theme?.particleB ?? 255})`}
      />
      <Suspense fallback={<LoadingSkeleton theme={theme} />}>
        {gender === 'female'
          ? <FemaleHead status={status} mouthOpenAmount={mouthOpenAmount} />
          : <MaleHead   status={status} mouthOpenAmount={mouthOpenAmount} />
        }
        <Environment preset="studio" background={false} />
      </Suspense>
      <StatusRings status={status} theme={theme} />
    </Canvas>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export interface RealisticFaceAvatarProps {
  status: AvatarStatus;
  mouthOpenAmount: number;
  micLevel?: number;
  gender?: AvatarGender;
  theme?: ThemeColors;
}

export function RealisticFaceAvatar({
  status, mouthOpenAmount, micLevel = 0, gender = 'female', theme,
}: RealisticFaceAvatarProps) {
  // Detect WebGL support upfront — avoids a flash of error before boundary catches
  const [webglOk] = useState(() => isWebGLAvailable());

  const fallback2D = (
    <RealisticFace2D
      status={status}
      mouthOpenAmount={mouthOpenAmount}
      micLevel={micLevel}
      gender={gender}
      theme={theme}
    />
  );

  if (!webglOk) return fallback2D;

  return (
    <WebGLErrorBoundary fallback={fallback2D}>
      <ThreeDScene
        status={status}
        mouthOpenAmount={mouthOpenAmount}
        gender={gender}
        theme={theme}
      />
    </WebGLErrorBoundary>
  );
}
