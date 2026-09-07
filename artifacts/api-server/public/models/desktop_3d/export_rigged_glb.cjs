const fs = require('fs');
const path = require('path');

async function exportRiggedGLB() {
  console.log('Loading Three.js modules...');
  const THREE = await import('file:///C:/Users/Usuario/Desktop/Magic-Mirror-AI/node_modules/.pnpm/three@0.184.0/node_modules/three/src/Three.js');
  const { OBJLoader } = await import('file:///C:/Users/Usuario/Desktop/Magic-Mirror-AI/node_modules/.pnpm/three@0.184.0/node_modules/three/examples/jsm/loaders/OBJLoader.js');
  const { GLTFExporter } = await import('file:///C:/Users/Usuario/Desktop/Magic-Mirror-AI/node_modules/.pnpm/three@0.184.0/node_modules/three/examples/jsm/exporters/GLTFExporter.js');

  const objPath = 'artifacts/magic-mirror/public/models/desktop_3d/44e7e5935e2630ce12c07169406ada3d.obj';
  const objText = fs.readFileSync(objPath, 'utf8');

  console.log('Parsing OBJ...');
  const loader = new OBJLoader();
  const obj = loader.parse(objText);

  let mesh = null;
  obj.traverse((child) => {
    if (child.isMesh && !mesh) mesh = child;
  });

  const geometry = mesh.geometry;
  geometry.computeVertexNormals();

  const binDir = 'artifacts/magic-mirror/public/models/desktop_3d/morphs';
  const morphNames = [
    'mouthOpen',
    'mouthSmile',
    'mouthPucker',
    'eyeBlinkLeft',
    'eyeBlinkRight',
    'browsUp',
    'browFurrow'
  ];

  geometry.morphAttributes.position = [];
  mesh.morphTargetDictionary = {};
  mesh.morphTargetInfluences = [];

  morphNames.forEach((name, index) => {
    const buf = fs.readFileSync(path.join(binDir, `${name}.bin`));
    const floatArr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const attr = new THREE.BufferAttribute(floatArr, 3);
    attr.name = name;
    geometry.morphAttributes.position.push(attr);
    mesh.morphTargetDictionary[name] = index;
    mesh.morphTargetInfluences.push(0);
  });

  console.log('Geometry morph attributes count:', geometry.morphAttributes.position.length);

  // Material
  const material = new THREE.MeshStandardMaterial({
    name: 'AvatarMaterial',
    roughness: 0.65,
    metalness: 0.05
  });
  mesh.material = material;

  console.log('Exporting GLB without embedded image first to verify structure...');
  const exporter = new GLTFExporter();
  exporter.parse(
    mesh,
    (gltf) => {
      const glbBuf = Buffer.from(gltf);
      fs.writeFileSync('artifacts/magic-mirror/public/models/desktop_3d/avatar_rigged_mesh.glb', glbBuf);
      console.log('GLB exported successfully! Size:', glbBuf.length, 'bytes');
    },
    (err) => {
      console.error('Export error:', err);
    },
    { binary: true }
  );
}

exportRiggedGLB().catch(console.error);
