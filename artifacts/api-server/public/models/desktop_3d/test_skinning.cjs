const fs = require('fs');

async function testSkinnedMeshCreation() {
  const THREE = await import('file:///C:/Users/Usuario/Desktop/Magic-Mirror-AI/node_modules/.pnpm/three@0.184.0/node_modules/three/src/Three.js');
  const { OBJLoader } = await import('file:///C:/Users/Usuario/Desktop/Magic-Mirror-AI/node_modules/.pnpm/three@0.184.0/node_modules/three/examples/jsm/loaders/OBJLoader.js');

  const objText = fs.readFileSync('artifacts/magic-mirror/public/models/desktop_3d/44e7e5935e2630ce12c07169406ada3d.obj', 'utf8');
  const loader = new OBJLoader();
  const obj = loader.parse(objText);

  let sourceMesh = null;
  obj.traverse((child) => {
    if (child.isMesh && !sourceMesh) sourceMesh = child;
  });

  const geometry = sourceMesh.geometry;
  const vertexCount = geometry.attributes.position.count;
  console.log(`Geometry has ${vertexCount} vertices`);

  // Create Bones hierarchy:
  // Root -> Spine (Chest) -> Neck -> Head
  const rootBone = new THREE.Bone();
  rootBone.name = 'Root';
  rootBone.position.set(0, -0.45, 0);

  const chestBone = new THREE.Bone();
  chestBone.name = 'Chest';
  chestBone.position.set(0, 0.30, 0); // local to Root: Y = -0.15 in world
  rootBone.add(chestBone);

  const neckBone = new THREE.Bone();
  neckBone.name = 'Neck';
  neckBone.position.set(0, 0.15, 0); // local to Chest: Y = 0.0 in world
  chestBone.add(neckBone);

  const headBone = new THREE.Bone();
  headBone.name = 'Head';
  headBone.position.set(0, 0.12, 0); // local to Neck: Y = 0.12 in world
  neckBone.add(headBone);

  const bones = [rootBone, chestBone, neckBone, headBone];
  const skeleton = new THREE.Skeleton(bones);

  // Compute skinIndices and skinWeights for each vertex based on Y height
  // Bone indices: 0: Root, 1: Chest, 2: Neck, 3: Head
  const skinIndices = new Float32Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);

  const pos = geometry.attributes.position;
  for (let i = 0; i < vertexCount; i++) {
    const y = pos.getY(i);
    // Y ranges from -0.45 to +0.45
    // World levels:
    // Y < -0.20: Torso / Root & Chest
    // Y in [-0.20, 0.05]: Chest to Neck transition
    // Y in [0.00, 0.12]: Neck to Head transition
    // Y > 0.12: Pure Head (face, hair, eyes, mouth)
    let wRoot = 0, wChest = 0, wNeck = 0, wHead = 0;

    if (y > 0.14) {
      // Upper head, eyes, mouth, nose, hair
      wHead = 1.0;
    } else if (y > 0.02) {
      // Transition from neck to head (lower jaw / neck crease)
      const t = (y - 0.02) / (0.14 - 0.02);
      wHead = t;
      wNeck = 1 - t;
    } else if (y > -0.12) {
      // Neck to chest
      const t = (y - (-0.12)) / (0.02 - (-0.12));
      wNeck = t;
      wChest = 1 - t;
    } else if (y > -0.28) {
      // Chest
      const t = (y - (-0.28)) / (-0.12 - (-0.28));
      wChest = t;
      wRoot = 1 - t;
    } else {
      // Lower torso / base
      wRoot = 1.0;
    }

    // Set 4 bone influences per vertex
    skinIndices[i * 4 + 0] = 3; // Head
    skinWeights[i * 4 + 0] = wHead;

    skinIndices[i * 4 + 1] = 2; // Neck
    skinWeights[i * 4 + 1] = wNeck;

    skinIndices[i * 4 + 2] = 1; // Chest
    skinWeights[i * 4 + 2] = wChest;

    skinIndices[i * 4 + 3] = 0; // Root
    skinWeights[i * 4 + 3] = wRoot;
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const skinnedMesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  skinnedMesh.add(rootBone);
  skinnedMesh.bind(skeleton);

  console.log('SkinnedMesh created successfully!');
  console.log('Bones bound:', skeleton.bones.length);
  console.log('Bone inverse matrices computed:', skeleton.boneInverses.length);

  // Test rotating the head bone
  headBone.rotation.y = 0.2;
  skinnedMesh.skeleton.update();
  console.log('Skeleton test update passed!');
}

testSkinnedMeshCreation().catch(console.error);
