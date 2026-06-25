import React, { Suspense, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { AvatarStatus } from '../hooks/useAvatarState';
import { ThemeColors } from '../hooks/useTheme';

export type AvatarGender = 'female' | 'male';

// ── CDN Models ──────────────────────────────────────────────────────────────
// facecap.glb: realistic face with 52 ARKit blend shapes (jaw, blink, smile…)
const FACECAP_URL = 'https://threejs.org/examples/models/gltf/facecap.glb';
// LeePerrySmith: photorealistic male scan
const LEE_URL = 'https://threejs.org/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb';

useGLTF.preload(FACECAP_URL);
useGLTF.preload(LEE_URL);

// ── Types ────────────────────────────────────────────────────────────────────
interface FaceProps {
  status: AvatarStatus;
  mouthOpenAmount: number;
  micLevel?: number;
  theme?: ThemeColors;
}

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

// ── Camera mouse tracking ────────────────────────────────────────────────────
function CameraLookAt({ gender }: { gender: AvatarGender }) {
  const { camera } = useThree();
  const mouse = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.tx = (e.clientX / window.innerWidth  - 0.5) * 0.5;
      mouse.current.ty = (e.clientY / window.innerHeight - 0.5) * 0.3;
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useFrame(() => {
    mouse.current.x += (mouse.current.tx - mouse.current.x) * 0.04;
    mouse.current.y += (mouse.current.ty - mouse.current.y) * 0.04;
    camera.position.x += (mouse.current.x - camera.position.x) * 0.06;
    camera.position.y += (-mouse.current.y - camera.position.y) * 0.06;
    camera.lookAt(0, gender === 'female' ? 0 : 0, 0);
  });

  return null;
}

// ── Hair for female ───────────────────────────────────────────────────────────
function FemaleHair() {
  const hairColor = '#1A0C06';
  const hairHover = '#231208';
  return (
    <group>
      {/* Skull coverage */}
      <mesh position={[0, 0.068, -0.008]} scale={[1.04, 0.9, 1.04]}>
        <sphereGeometry args={[0.094, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
        <meshStandardMaterial color={hairColor} roughness={0.88} metalness={0.03} side={THREE.DoubleSide} />
      </mesh>
      {/* Top section — slightly lighter for depth */}
      <mesh position={[0, 0.115, 0.012]}>
        <sphereGeometry args={[0.081, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.38]} />
        <meshStandardMaterial color={hairHover} roughness={0.82} metalness={0.04} />
      </mesh>
      {/* Bangs (fringe) */}
      {[-0.045, -0.015, 0.015, 0.045].map((x, i) => (
        <mesh key={i} position={[x, 0.038, 0.09]} rotation={[0.35, x * 0.5, 0]}>
          <capsuleGeometry args={[0.009, 0.03, 4, 8]} />
          <meshStandardMaterial color={hairColor} roughness={0.9} />
        </mesh>
      ))}
      {/* Left side strands */}
      <mesh position={[-0.092, 0.0, 0.04]} rotation={[0.1, 0.4, -0.3]}>
        <capsuleGeometry args={[0.018, 0.075, 8, 12]} />
        <meshStandardMaterial color={hairColor} roughness={0.88} side={THREE.DoubleSide} />
      </mesh>
      {/* Right side strands */}
      <mesh position={[0.092, 0.0, 0.04]} rotation={[0.1, -0.4, 0.3]}>
        <capsuleGeometry args={[0.018, 0.075, 8, 12]} />
        <meshStandardMaterial color={hairColor} roughness={0.88} side={THREE.DoubleSide} />
      </mesh>
      {/* Back hair */}
      <mesh position={[0, -0.02, -0.085]} rotation={[-0.1, 0, 0]}>
        <capsuleGeometry args={[0.052, 0.06, 8, 16]} />
        <meshStandardMaterial color={hairColor} roughness={0.88} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ── Female face (facecap.glb with morph targets) ─────────────────────────────
function FemaleHead({ status, mouthOpenAmount, micLevel = 0, theme }: FaceProps) {
  const { scene } = useGLTF(FACECAP_URL);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const blink = useRef({ v: 0, timer: 3 + Math.random() * 4, phase: false });
  const lipsRef = useRef({ open: 0 });

  useEffect(() => {
    const cloned = scene.clone(true);
    // Traverse the scene to find the face mesh and apply skin material
    cloned.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        if (node.morphTargetDictionary) {
          meshRef.current = node;
        }
        // Realistic warm female skin tone
        if (node.material instanceof THREE.MeshStandardMaterial) {
          node.material = node.material.clone();
          const mat = node.material as THREE.MeshStandardMaterial;
          mat.color.setHex(0xC4845A);
          mat.roughness = 0.62;
          mat.metalness = 0.0;
          mat.needsUpdate = true;
        }
      }
    });
    if (groupRef.current) {
      groupRef.current.clear();
      groupRef.current.add(cloned);
    }
  }, [scene]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    const group = groupRef.current;
    const mesh  = meshRef.current;

    // Gentle idle head sway
    if (group) {
      group.rotation.y = Math.sin(t * 0.22) * 0.04 + Math.sin(t * 0.09) * 0.015;
      group.rotation.x = Math.sin(t * 0.16) * 0.012;
      // Status-based head tilt
      if (status === 'listening') group.rotation.z = Math.sin(t * 0.4) * 0.025;
      else group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, 0, 0.03);
    }

    if (!mesh?.morphTargetInfluences || !mesh.morphTargetDictionary) return;
    const infl = mesh.morphTargetInfluences;
    const dict = mesh.morphTargetDictionary;

    // ── Jaw / speaking ──────────────────────────────────────────────────────
    const jawTarget = status === 'speaking' ? Math.max(0, mouthOpenAmount * 0.85) : 0;
    lerpMorph(infl, dict, 'jawOpen', jawTarget, 0.18);
    lerpMorph(infl, dict, 'mouthClose', status === 'speaking' && mouthOpenAmount < 0.15 ? 0.3 : 0, 0.12);

    // ── Smile ───────────────────────────────────────────────────────────────
    const smileAmt = status === 'idle' ? 0.14 : status === 'speaking' ? 0.06 : 0.04;
    lerpMorph(infl, dict, 'mouthSmileLeft',  smileAmt, 0.04);
    lerpMorph(infl, dict, 'mouthSmileRight', smileAmt, 0.04);

    // ── Blink ───────────────────────────────────────────────────────────────
    blink.current.timer -= delta;
    if (!blink.current.phase && blink.current.timer < 0) {
      blink.current.phase = true;
      blink.current.v = 1;
      blink.current.timer = 3 + Math.random() * 5;
    }
    if (blink.current.phase) {
      blink.current.v = Math.max(0, blink.current.v - delta * 9);
      if (blink.current.v === 0) blink.current.phase = false;
    }
    lerpMorph(infl, dict, 'eyeBlinkLeft',  blink.current.v, 1);
    lerpMorph(infl, dict, 'eyeBlinkRight', blink.current.v, 1);

    // ── Thinking: brow raise + inner pinch ──────────────────────────────────
    lerpMorph(infl, dict, 'browInnerUp',     status === 'thinking' ? 0.45 : 0, 0.04);
    lerpMorph(infl, dict, 'browDownLeft',    status === 'thinking' ? 0.2  : 0, 0.04);
    lerpMorph(infl, dict, 'browDownRight',   status === 'thinking' ? 0.2  : 0, 0.04);

    // ── Listening: raised outer brows ───────────────────────────────────────
    lerpMorph(infl, dict, 'browOuterUpLeft',  status === 'listening' ? 0.28 : 0, 0.04);
    lerpMorph(infl, dict, 'browOuterUpRight', status === 'listening' ? 0.28 : 0, 0.04);

    // ── Cheek puff (listening — slightly inflated) ──────────────────────────
    lerpMorph(infl, dict, 'cheekPuff', status === 'listening' ? 0.1 : 0, 0.03);

    // ── Eye look — subtle movement ──────────────────────────────────────────
    const lookAmt = Math.sin(t * 0.7) * 0.08;
    lerpMorph(infl, dict, 'eyeLookUpLeft',    Math.max(0,  lookAmt), 0.05);
    lerpMorph(infl, dict, 'eyeLookDownLeft',  Math.max(0, -lookAmt), 0.05);
    lerpMorph(infl, dict, 'eyeLookUpRight',   Math.max(0,  lookAmt), 0.05);
    lerpMorph(infl, dict, 'eyeLookDownRight', Math.max(0, -lookAmt), 0.05);
  });

  return (
    <group position={[0, -0.02, 0]} scale={10}>
      <group ref={groupRef} />
      <FemaleHair />
    </group>
  );
}

// ── Male face (Lee Perry Smith photorealistic scan) ──────────────────────────
function MaleHead({ status, mouthOpenAmount, micLevel = 0, theme }: FaceProps) {
  const { scene } = useGLTF(LEE_URL);
  const groupRef  = useRef<THREE.Group>(null);

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
      if (status === 'thinking') {
        groupRef.current.rotation.z = Math.sin(t * 0.3) * 0.02;
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.9, 0]} scale={1}>
      <primitive object={scene} />
    </group>
  );
}

// ── Floating particles ring ───────────────────────────────────────────────────
function StatusRing({ status, theme }: { status: AvatarStatus; theme?: ThemeColors }) {
  const ringRef  = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const pr = theme?.particleR ?? 0, pg = theme?.particleG ?? 175, pb = theme?.particleB ?? 255;

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (ringRef.current) {
      ringRef.current.rotation.z = t * (status === 'speaking' ? 0.7 : 0.25);
      ringRef.current.rotation.x = Math.PI / 2 + Math.sin(t * 0.4) * 0.1;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z = -t * 0.35;
      ring2Ref.current.rotation.y = Math.sin(t * 0.3) * 0.15;
    }
  });

  const color  = new THREE.Color(`rgb(${pr},${pg},${pb})`);
  const alpha  = status === 'speaking' ? 0.45 : status === 'listening' ? 0.5 : status === 'thinking' ? 0.35 : 0.18;
  const alpha2 = alpha * 0.5;

  return (
    <>
      <mesh ref={ringRef}>
        <torusGeometry args={[1.55, 0.007, 8, 96]} />
        <meshBasicMaterial color={color} transparent opacity={alpha} />
      </mesh>
      <mesh ref={ring2Ref} rotation={[0.4, 0, 0]}>
        <torusGeometry args={[1.75, 0.004, 6, 80]} />
        <meshBasicMaterial color={color} transparent opacity={alpha2} />
      </mesh>
    </>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────
function LoadingFace({ theme }: { theme?: ThemeColors }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const pr = theme?.particleR ?? 0, pg = theme?.particleG ?? 175, pb = theme?.particleB ?? 255;

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (meshRef.current) {
      meshRef.current.material instanceof THREE.MeshBasicMaterial
        && (meshRef.current.material.opacity = 0.3 + Math.sin(t * 2.5) * 0.2);
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.8, 32, 32]} />
      <meshBasicMaterial
        color={new THREE.Color(`rgb(${pr},${pg},${pb})`)}
        transparent
        opacity={0.3}
        wireframe
      />
    </mesh>
  );
}

// ── Main exported component ───────────────────────────────────────────────────
interface RealisticFaceAvatarProps extends FaceProps {
  gender?: AvatarGender;
}

export function RealisticFaceAvatar({
  status, mouthOpenAmount, micLevel = 0, gender = 'female', theme,
}: RealisticFaceAvatarProps) {
  const camZ = gender === 'female' ? 0.7 : 2.8;

  return (
    <Canvas
      camera={{ position: [0, 0, camZ], fov: 42 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
      dpr={[1, 2]}
    >
      {/* Camera follows mouse */}
      <CameraLookAt gender={gender} />

      {/* ── Three-point studio lighting ── */}
      <ambientLight intensity={0.35} />
      {/* Key: warm upper-left */}
      <directionalLight position={[-2.5, 4, 5]} intensity={2.8} color="#FFF4E0" castShadow />
      {/* Fill: cool right */}
      <directionalLight position={[3.5, 1.5, 2]} intensity={0.9} color="#C0D0FF" />
      {/* Rim: back rim for hair/edge */}
      <directionalLight position={[0, -1, -5]} intensity={0.6} color="#FFE0C0" />
      {/* Top fill */}
      <directionalLight position={[0, 6, 0]} intensity={0.4} color="#FFFFFF" />
      {/* Theme-tinted accent */}
      <pointLight
        position={[0, 2, 3]}
        intensity={0.4}
        color={`rgb(${theme?.particleR ?? 0},${theme?.particleG ?? 175},${theme?.particleB ?? 255})`}
      />

      <Suspense fallback={<LoadingFace theme={theme} />}>
        {gender === 'female' ? (
          <FemaleHead
            status={status}
            mouthOpenAmount={mouthOpenAmount}
            micLevel={micLevel}
            theme={theme}
          />
        ) : (
          <MaleHead
            status={status}
            mouthOpenAmount={mouthOpenAmount}
            micLevel={micLevel}
            theme={theme}
          />
        )}
        {/* Studio environment for realistic reflections */}
        <Environment preset="studio" background={false} />
      </Suspense>

      {/* Orbiting tech rings */}
      <StatusRing status={status} theme={theme} />
    </Canvas>
  );
}
