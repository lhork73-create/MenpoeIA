const fs = require('fs');
const path = require('path');

async function buildRiggedAvatar() {
  console.log('Loading Three.js modules...');
  const threePath = 'C:/Users/Usuario/Desktop/Magic-Mirror-AI/node_modules/.pnpm/three@0.184.0/node_modules/three/src/Three.js';
  const objLoaderPath = 'C:/Users/Usuario/Desktop/Magic-Mirror-AI/node_modules/.pnpm/three@0.184.0/node_modules/three/examples/jsm/loaders/OBJLoader.js';
  const { GLTFExporter } = await import('file:///C:/Users/Usuario/Desktop/Magic-Mirror-AI/node_modules/.pnpm/three@0.184.0/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
  const THREE = await import('file:///' + threePath);
  const { OBJLoader } = await import('file:///' + objLoaderPath);

  const objPath = 'C:/Users/Usuario/Desktop/3D/44e7e5935e2630ce12c07169406ada3d.obj';
  console.log('Parsing OBJ from', objPath);
  const objText = fs.readFileSync(objPath, 'utf8');
  const loader = new OBJLoader();
  const obj = loader.parse(objText);

  let sourceMesh = null;
  obj.traverse((child) => {
    if (child.isMesh && !sourceMesh) sourceMesh = child;
  });

  if (!sourceMesh) throw new Error('No mesh found in OBJ');

  const geometry = sourceMesh.geometry.clone();
  geometry.computeVertexNormals();

  const posAttr = geometry.attributes.position;
  const vertexCount = posAttr.count;
  console.log(`Geometry has ${vertexCount} vertices`);

  // Landmarks
  const LEFT_EYE = [-0.050, 0.213, 0.165];
  const RIGHT_EYE = [0.048, 0.213, 0.175];
  const MOUTH_CENTER = [0.0, 0.105, 0.210];
  const TMJ_HINGE = [0.0, 0.130, 0.060];
  const THROAT_CENTER = [0.0, -0.010, 0.110];
  const LEFT_BROW = [-0.050, 0.240, 0.185];
  const RIGHT_BROW = [0.048, 0.240, 0.185];

  // Morph targets (blendshapes)
  const eyeBlinkLeft = new Float32Array(vertexCount * 3);
  const eyeBlinkRight = new Float32Array(vertexCount * 3);
  const jawOpen = new Float32Array(vertexCount * 3);
  const mouthSmile = new Float32Array(vertexCount * 3);
  const mouthPucker = new Float32Array(vertexCount * 3);
  const throatPulse = new Float32Array(vertexCount * 3);
  const browsUp = new Float32Array(vertexCount * 3);
  const browFurrow = new Float32Array(vertexCount * 3);

  let affectedEyeL = 0, affectedEyeR = 0, affectedJaw = 0, affectedThroat = 0;

  for (let i = 0; i < vertexCount; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);

    // ── 1. REAL 3D EYELID RIG: LEFT EYE ──────────────────────────────────
    // Left eye center: [-0.050, 0.213, 0.165]
    const dLeftEye = Math.hypot(x - LEFT_EYE[0], y - LEFT_EYE[1], (z - LEFT_EYE[2]) * 1.1);
    if (dLeftEye < 0.024) {
      affectedEyeL++;
      const dy = y - LEFT_EYE[1]; // positive for upper lid, negative for lower lid
      const falloff = Math.cos((dLeftEye / 0.024) * Math.PI * 0.5); // smooth cosine falloff

      if (dy > 0.001) {
        // UPPER EYELID: slides down over the eyeball to meet fissure (y -> LEFT_EYE[1])
        // Moves downward in Y and curves outward in Z over cornea
        const closureY = -(dy + 0.002) * falloff;
        const curveZ = 0.0035 * Math.sin(Math.min(1.0, dy / 0.018) * Math.PI) * falloff;
        eyeBlinkLeft[i * 3 + 1] = closureY;
        eyeBlinkLeft[i * 3 + 2] = curveZ;
      } else if (dy < -0.001) {
        // LOWER EYELID: raises slightly (15% of movement) to meet upper lid
        const liftY = 0.0025 * falloff;
        eyeBlinkLeft[i * 3 + 1] = liftY;
      } else {
        // EYEBALL / FISSURE: sinks slightly backward into socket (-Z) under descending lid
        eyeBlinkLeft[i * 3 + 2] = -0.0025 * falloff;
      }
    }

    // ── 2. REAL 3D EYELID RIG: RIGHT EYE ─────────────────────────────────
    const dRightEye = Math.hypot(x - RIGHT_EYE[0], y - RIGHT_EYE[1], (z - RIGHT_EYE[2]) * 1.1);
    if (dRightEye < 0.024) {
      affectedEyeR++;
      const dy = y - RIGHT_EYE[1];
      const falloff = Math.cos((dRightEye / 0.024) * Math.PI * 0.5);

      if (dy > 0.001) {
        const closureY = -(dy + 0.002) * falloff;
        const curveZ = 0.0035 * Math.sin(Math.min(1.0, dy / 0.018) * Math.PI) * falloff;
        eyeBlinkRight[i * 3 + 1] = closureY;
        eyeBlinkRight[i * 3 + 2] = curveZ;
      } else if (dy < -0.001) {
        const liftY = 0.0025 * falloff;
        eyeBlinkRight[i * 3 + 1] = liftY;
      } else {
        eyeBlinkRight[i * 3 + 2] = -0.0025 * falloff;
      }
    }

    // ── 3. REAL 3D JAW & MOUTH RIG ───────────────────────────────────────
    // Lower jaw rotates around TMJ hinge [0, 0.130, 0.060]
    if (y < 0.120 && y > -0.06 && z > 0.07 && Math.abs(x) < 0.10) {
      const distFromMouth = Math.hypot(x - MOUTH_CENTER[0], y - MOUTH_CENTER[1], z - MOUTH_CENTER[2]);
      const dx = Math.abs(x);
      const jawWeight = Math.max(0, 1 - distFromMouth / 0.13) * Math.max(0, 1 - dx / 0.085);
      if (jawWeight > 0.01) {
        affectedJaw++;
        // TMJ arc: downward (-Y) and slightly back (-Z)
        jawOpen[i * 3 + 1] = -0.028 * jawWeight;
        jawOpen[i * 3 + 2] = -0.009 * jawWeight;
      }
    }

    // Mouth Smile
    if (y > 0.085 && y < 0.135 && z > 0.17 && Math.abs(x) < 0.07) {
      const distL = Math.hypot(x - (-0.035), y - 0.105);
      const distR = Math.hypot(x - 0.035, y - 0.105);
      const cornerWeight = Math.max(
        Math.max(0, 1 - distL / 0.04),
        Math.max(0, 1 - distR / 0.04)
      );
      if (cornerWeight > 0.01) {
        mouthSmile[i * 3 + 0] = Math.sign(x) * 0.008 * cornerWeight;
        mouthSmile[i * 3 + 1] = 0.008 * cornerWeight;
        mouthSmile[i * 3 + 2] = 0.002 * cornerWeight;
      }
    }

    // Mouth Pucker (O shape)
    if (y > 0.085 && y < 0.130 && z > 0.18 && Math.abs(x) < 0.05) {
      const puckerWeight = Math.max(0, 1 - Math.hypot(x, y - 0.108) / 0.04);
      if (puckerWeight > 0.01) {
        mouthPucker[i * 3 + 0] = -Math.sign(x) * 0.005 * puckerWeight;
        mouthPucker[i * 3 + 1] = (0.108 - y) * 0.2 * puckerWeight;
        mouthPucker[i * 3 + 2] = 0.012 * puckerWeight;
      }
    }

    // ── 4. REAL 3D THROAT & LARYNX RIG (Adam's apple articulation) ────────
    // Throat center around Y: [-0.06, 0.04], Z > 0.08, |X| < 0.045
    const dThroat = Math.hypot(x - THROAT_CENTER[0], y - THROAT_CENTER[1], (z - THROAT_CENTER[2]) * 1.2);
    if (dThroat < 0.055) {
      const throatWeight = Math.cos((dThroat / 0.055) * Math.PI * 0.5);
      if (throatWeight > 0.01) {
        affectedThroat++;
        // Larynx lifts upward (+Y) and projects forward (+Z) during swallow / speech
        throatPulse[i * 3 + 1] = 0.007 * throatWeight;
        throatPulse[i * 3 + 2] = 0.006 * throatWeight;
      }
    }

    // ── 5. EYEBROWS ──────────────────────────────────────────────────────
    const dLeftBrow = Math.hypot(x - LEFT_BROW[0], y - LEFT_BROW[1], (z - LEFT_BROW[2]) * 0.8);
    const dRightBrow = Math.hypot(x - RIGHT_BROW[0], y - RIGHT_BROW[1], (z - RIGHT_BROW[2]) * 0.8);
    const browWeight = Math.max(
      Math.max(0, 1 - dLeftBrow / 0.035),
      Math.max(0, 1 - dRightBrow / 0.035)
    );
    if (browWeight > 0.01) {
      browsUp[i * 3 + 1] = 0.012 * browWeight;
      browsUp[i * 3 + 2] = 0.003 * browWeight;
      browFurrow[i * 3 + 0] = -Math.sign(x) * 0.005 * browWeight;
      browFurrow[i * 3 + 1] = -0.006 * browWeight;
    }
  }

  console.log(`Anatomical vertex coverage:`);
  console.log(`- Left Eye: ${affectedEyeL} verts`);
  console.log(`- Right Eye: ${affectedEyeR} verts`);
  console.log(`- Jaw/Mouth: ${affectedJaw} verts`);
  console.log(`- Throat/Larynx: ${affectedThroat} verts`);

  // Attach morph attributes to geometry
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [
    new THREE.BufferAttribute(eyeBlinkLeft, 3),
    new THREE.BufferAttribute(eyeBlinkRight, 3),
    new THREE.BufferAttribute(jawOpen, 3),
    new THREE.BufferAttribute(mouthSmile, 3),
    new THREE.BufferAttribute(mouthPucker, 3),
    new THREE.BufferAttribute(throatPulse, 3),
    new THREE.BufferAttribute(browsUp, 3),
    new THREE.BufferAttribute(browFurrow, 3)
  ];

  // ── SKELETAL RIG: SKELETON WITH BONES ─────────────────────────────────
  // Hierarchy: Root -> Chest -> Throat -> Neck -> Head -> Jaw
  const rootBone = new THREE.Bone();
  rootBone.name = 'Root';
  rootBone.position.set(0, -0.45, 0);

  const chestBone = new THREE.Bone();
  chestBone.name = 'Chest';
  chestBone.position.set(0, 0.28, 0);
  rootBone.add(chestBone);

  const throatBone = new THREE.Bone();
  throatBone.name = 'Throat';
  throatBone.position.set(0, 0.16, 0.06);
  chestBone.add(throatBone);

  const neckBone = new THREE.Bone();
  neckBone.name = 'Neck';
  neckBone.position.set(0, 0.04, -0.06);
  throatBone.add(neckBone);

  const headBone = new THREE.Bone();
  headBone.name = 'Head';
  headBone.position.set(0, 0.10, 0.02);
  neckBone.add(headBone);

  const jawBone = new THREE.Bone();
  jawBone.name = 'Jaw';
  jawBone.position.set(0, 0.01, 0.04);
  headBone.add(jawBone);

  const bones = [rootBone, chestBone, throatBone, neckBone, headBone, jawBone];
  const skeleton = new THREE.Skeleton(bones);

  // Compute skinning weights
  const skinIndices = new Float32Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);

  for (let i = 0; i < vertexCount; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);

    let wRoot = 0, wChest = 0, wThroat = 0, wNeck = 0, wHead = 0, wJaw = 0;

    // Is it in the jaw region?
    const isJaw = y < 0.12 && y > 0.01 && z > 0.09 && Math.abs(x) < 0.08;
    if (isJaw) {
      const jawDist = Math.hypot(x, y - 0.08, z - 0.17);
      wJaw = Math.max(0, 1 - jawDist / 0.10);
      wHead = 1 - wJaw;
    } else if (y > 0.12) {
      // Cranium, eyes, nose, hair, upper face
      wHead = 1.0;
    } else if (y > 0.00) {
      // Throat / upper neck
      const isFrontThroat = z > 0.06 && Math.abs(x) < 0.06;
      if (isFrontThroat) {
        wThroat = 0.7;
        wNeck = 0.3;
      } else {
        wNeck = 0.8;
        wHead = 0.2;
      }
    } else if (y > -0.15) {
      // Lower neck / upper chest
      const t = (y - (-0.15)) / (0.00 - (-0.15));
      wNeck = t * 0.7;
      wChest = (1 - t) * 0.8;
      wThroat = t * 0.3;
    } else if (y > -0.32) {
      // Clavicle & chest
      const t = (y - (-0.32)) / (-0.15 - (-0.32));
      wChest = t;
      wRoot = 1 - t;
    } else {
      // Base
      wRoot = 1.0;
    }

    // Normalize top 4 weights
    const influences = [
      { idx: 4, w: wHead },
      { idx: 3, w: wNeck },
      { idx: 2, w: wThroat },
      { idx: 1, w: wChest },
      { idx: 5, w: wJaw },
      { idx: 0, w: wRoot }
    ].sort((a, b) => b.w - a.w).slice(0, 4);

    const sumW = influences.reduce((s, item) => s + item.w, 0) || 1.0;
    for (let j = 0; j < 4; j++) {
      skinIndices[i * 4 + j] = influences[j].idx;
      skinWeights[i * 4 + j] = influences[j].w / sumW;
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  console.log('Geometry successfully rigged with skeleton and 8 morph targets!');

  // Save the precomputed binary morph targets for instant high-speed hydration
  const binDir = 'artifacts/magic-mirror/public/models/desktop_3d/morphs';
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

  fs.writeFileSync(path.join(binDir, 'eyeBlinkLeft.bin'), Buffer.from(eyeBlinkLeft.buffer));
  fs.writeFileSync(path.join(binDir, 'eyeBlinkRight.bin'), Buffer.from(eyeBlinkRight.buffer));
  fs.writeFileSync(path.join(binDir, 'jawOpen.bin'), Buffer.from(jawOpen.buffer));
  fs.writeFileSync(path.join(binDir, 'mouthSmile.bin'), Buffer.from(mouthSmile.buffer));
  fs.writeFileSync(path.join(binDir, 'mouthPucker.bin'), Buffer.from(mouthPucker.buffer));
  fs.writeFileSync(path.join(binDir, 'throatPulse.bin'), Buffer.from(throatPulse.buffer));
  fs.writeFileSync(path.join(binDir, 'browsUp.bin'), Buffer.from(browsUp.buffer));
  fs.writeFileSync(path.join(binDir, 'browFurrow.bin'), Buffer.from(browFurrow.buffer));

  // Save skin weights and indices
  fs.writeFileSync(path.join(binDir, 'skinIndices.bin'), Buffer.from(skinIndices.buffer));
  fs.writeFileSync(path.join(binDir, 'skinWeights.bin'), Buffer.from(skinWeights.buffer));

  console.log('All binary morph targets and skin weights saved to', binDir);
}

buildRiggedAvatar().catch(console.error);
