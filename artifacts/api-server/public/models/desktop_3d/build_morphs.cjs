const fs = require('fs');
const path = require('path');

async function buildRiggedAvatar() {
  console.log('Loading Three.js modules...');
  const threePath = 'C:/Users/Usuario/Desktop/Magic-Mirror-AI/node_modules/.pnpm/three@0.184.0/node_modules/three/src/Three.js';
  const objLoaderPath = 'C:/Users/Usuario/Desktop/Magic-Mirror-AI/node_modules/.pnpm/three@0.184.0/node_modules/three/examples/jsm/loaders/OBJLoader.js';
  const THREE = await import('file:///' + threePath);
  const { OBJLoader } = await import('file:///' + objLoaderPath);

  const objPath = 'artifacts/magic-mirror/public/models/desktop_3d/44e7e5935e2630ce12c07169406ada3d.obj';
  const objText = fs.readFileSync(objPath, 'utf8');

  console.log('Parsing OBJ...');
  const loader = new OBJLoader();
  const obj = loader.parse(objText);

  let mesh = null;
  obj.traverse((child) => {
    if (child.isMesh && !mesh) mesh = child;
  });

  if (!mesh) {
    throw new Error('No mesh found in OBJ');
  }

  const geometry = mesh.geometry;
  const posAttr = geometry.attributes.position;
  const vertexCount = posAttr.count;
  console.log(`Mesh has ${vertexCount} vertices`);

  // Facial feature centers based on analysis:
  const LEFT_EYE = [-0.050, 0.213, 0.165];
  const RIGHT_EYE = [0.048, 0.213, 0.175];
  const MOUTH_CENTER = [0.0, 0.105, 0.210];
  const JAW_PIVOT = [0.0, 0.15, 0.0];
  const LEFT_BROW = [-0.050, 0.240, 0.185];
  const RIGHT_BROW = [0.048, 0.240, 0.185];

  // Morph targets:
  // 1. mouthOpen (jaw opens down and lower lip drops)
  const mouthOpenDeltas = new Float32Array(vertexCount * 3);
  // 2. mouthSmile (mouth corners pull out and up)
  const mouthSmileDeltas = new Float32Array(vertexCount * 3);
  // 3. mouthPucker (lips round forward)
  const mouthPuckerDeltas = new Float32Array(vertexCount * 3);
  // 4. eyeBlinkLeft (left upper eyelid closes down)
  const eyeBlinkLeftDeltas = new Float32Array(vertexCount * 3);
  // 5. eyeBlinkRight (right upper eyelid closes down)
  const eyeBlinkRightDeltas = new Float32Array(vertexCount * 3);
  // 6. browsUp (both eyebrows raise)
  const browsUpDeltas = new Float32Array(vertexCount * 3);
  // 7. browFurrow (eyebrows pull together and down)
  const browFurrowDeltas = new Float32Array(vertexCount * 3);

  let affectedMouth = 0;
  let affectedLeftEye = 0;
  let affectedRightEye = 0;
  let affectedBrows = 0;

  for (let i = 0; i < vertexCount; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);

    // --- 1. MOUTH / JAW OPEN ---
    // Lower jaw & lower lip area: Y < 0.115 and Y > -0.05, Z > 0.10, |X| < 0.10
    if (y < 0.118 && y > -0.05 && z > 0.08 && Math.abs(x) < 0.10) {
      // Distance from jaw center
      const dy = 0.118 - y; // positive downwards
      const dx = Math.abs(x);
      const distFromMouthCenter = Math.hypot(x - MOUTH_CENTER[0], y - MOUTH_CENTER[1], z - MOUTH_CENTER[2]);
      
      // Weight falloff
      const weight = Math.max(0, 1 - distFromMouthCenter / 0.12) * Math.max(0, 1 - dx / 0.08);
      if (weight > 0.01) {
        affectedMouth++;
        // Drop jaw and lower lip down and slightly back
        mouthOpenDeltas[i * 3 + 0] = 0; // X
        mouthOpenDeltas[i * 3 + 1] = -0.025 * weight; // Y drops down
        mouthOpenDeltas[i * 3 + 2] = -0.008 * weight; // Z moves slightly back
      }
    }

    // --- 2. MOUTH SMILE ---
    // Lips corners: around Y in [0.09, 0.12], |X| in [0.015, 0.06], Z > 0.17
    if (y > 0.085 && y < 0.135 && z > 0.17 && Math.abs(x) < 0.07) {
      const distToCornerL = Math.hypot(x - (-0.035), y - 0.105);
      const distToCornerR = Math.hypot(x - 0.035, y - 0.105);
      const cornerWeight = Math.max(
        Math.max(0, 1 - distToCornerL / 0.04),
        Math.max(0, 1 - distToCornerR / 0.04)
      );
      if (cornerWeight > 0.01) {
        mouthSmileDeltas[i * 3 + 0] = Math.sign(x) * 0.008 * cornerWeight; // pull outward
        mouthSmileDeltas[i * 3 + 1] = 0.008 * cornerWeight; // pull upward
        mouthSmileDeltas[i * 3 + 2] = 0.002 * cornerWeight; // slightly forward
      }
    }

    // --- 3. MOUTH PUCKER (O shape) ---
    if (y > 0.085 && y < 0.130 && z > 0.18 && Math.abs(x) < 0.05) {
      const puckerWeight = Math.max(0, 1 - Math.hypot(x, y - 0.108) / 0.04);
      if (puckerWeight > 0.01) {
        mouthPuckerDeltas[i * 3 + 0] = -Math.sign(x) * 0.005 * puckerWeight; // pull inward
        mouthPuckerDeltas[i * 3 + 1] = (0.108 - y) * 0.2 * puckerWeight; // pull toward cleft
        mouthPuckerDeltas[i * 3 + 2] = 0.012 * puckerWeight; // protrude forward
      }
    }

    // --- 4. LEFT EYE BLINK ---
    // Left eye upper lid: X in [-0.075, -0.025], Y in [0.210, 0.230], Z in [0.150, 0.185]
    const dLeftEye = Math.hypot(x - LEFT_EYE[0], y - (LEFT_EYE[1] + 0.005), (z - LEFT_EYE[2]) * 0.8);
    if (dLeftEye < 0.028 && y >= LEFT_EYE[1] - 0.003) {
      const lidWeight = Math.max(0, 1 - dLeftEye / 0.028);
      if (lidWeight > 0.01) {
        affectedLeftEye++;
        eyeBlinkLeftDeltas[i * 3 + 0] = 0;
        eyeBlinkLeftDeltas[i * 3 + 1] = -0.014 * lidWeight; // drop upper lid down
        eyeBlinkLeftDeltas[i * 3 + 2] = 0.003 * lidWeight; // curve over eyeball
      }
    }

    // --- 5. RIGHT EYE BLINK ---
    const dRightEye = Math.hypot(x - RIGHT_EYE[0], y - (RIGHT_EYE[1] + 0.005), (z - RIGHT_EYE[2]) * 0.8);
    if (dRightEye < 0.028 && y >= RIGHT_EYE[1] - 0.003) {
      const lidWeight = Math.max(0, 1 - dRightEye / 0.028);
      if (lidWeight > 0.01) {
        affectedRightEye++;
        eyeBlinkRightDeltas[i * 3 + 0] = 0;
        eyeBlinkRightDeltas[i * 3 + 1] = -0.014 * lidWeight; // drop upper lid down
        eyeBlinkRightDeltas[i * 3 + 2] = 0.003 * lidWeight; // curve over eyeball
      }
    }

    // --- 6. EYEBROWS UP & FURROW ---
    const dLeftBrow = Math.hypot(x - LEFT_BROW[0], y - LEFT_BROW[1], (z - LEFT_BROW[2]) * 0.8);
    const dRightBrow = Math.hypot(x - RIGHT_BROW[0], y - RIGHT_BROW[1], (z - RIGHT_BROW[2]) * 0.8);
    const browWeight = Math.max(
      Math.max(0, 1 - dLeftBrow / 0.035),
      Math.max(0, 1 - dRightBrow / 0.035)
    );
    if (browWeight > 0.01) {
      affectedBrows++;
      // Brows up
      browsUpDeltas[i * 3 + 1] = 0.012 * browWeight;
      browsUpDeltas[i * 3 + 2] = 0.003 * browWeight;

      // Brow furrow (together and down)
      browFurrowDeltas[i * 3 + 0] = -Math.sign(x) * 0.005 * browWeight;
      browFurrowDeltas[i * 3 + 1] = -0.006 * browWeight;
    }
  }

  console.log(`Affected vertices:`);
  console.log(`- Mouth: ${affectedMouth}`);
  console.log(`- Left Eye: ${affectedLeftEye}`);
  console.log(`- Right Eye: ${affectedRightEye}`);
  console.log(`- Eyebrows: ${affectedBrows}`);

  // Save the morph deltas to a JSON / binary file for ultra-fast loading
  const morphData = {
    mouthOpen: Array.from(mouthOpenDeltas),
    mouthSmile: Array.from(mouthSmileDeltas),
    mouthPucker: Array.from(mouthPuckerDeltas),
    eyeBlinkLeft: Array.from(eyeBlinkLeftDeltas),
    eyeBlinkRight: Array.from(eyeBlinkRightDeltas),
    browsUp: Array.from(browsUpDeltas),
    browFurrow: Array.from(browFurrowDeltas),
  };

  // Also compress to Float32Array binary buffers for zero latency load
  const binDir = 'artifacts/magic-mirror/public/models/desktop_3d/morphs';
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

  fs.writeFileSync(path.join(binDir, 'mouthOpen.bin'), Buffer.from(mouthOpenDeltas.buffer));
  fs.writeFileSync(path.join(binDir, 'mouthSmile.bin'), Buffer.from(mouthSmileDeltas.buffer));
  fs.writeFileSync(path.join(binDir, 'mouthPucker.bin'), Buffer.from(mouthPuckerDeltas.buffer));
  fs.writeFileSync(path.join(binDir, 'eyeBlinkLeft.bin'), Buffer.from(eyeBlinkLeftDeltas.buffer));
  fs.writeFileSync(path.join(binDir, 'eyeBlinkRight.bin'), Buffer.from(eyeBlinkRightDeltas.buffer));
  fs.writeFileSync(path.join(binDir, 'browsUp.bin'), Buffer.from(browsUpDeltas.buffer));
  fs.writeFileSync(path.join(binDir, 'browFurrow.bin'), Buffer.from(browFurrowDeltas.buffer));

  console.log('Morph targets successfully computed and saved to binary files!');
}

buildRiggedAvatar().catch(console.error);
