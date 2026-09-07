const fs = require('fs');
const readline = require('readline');

async function findFacialFeatures() {
  const fileStream = fs.createReadStream('c:/Users/Usuario/Desktop/Magic-Mirror-AI/artifacts/magic-mirror/public/models/desktop_3d/44e7e5935e2630ce12c07169406ada3d.obj');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const vertices = [];
  for await (const line of rl) {
    if (line.startsWith('v ')) {
      const parts = line.trim().split(/\s+/).slice(1).map(Number);
      vertices.push(parts);
    }
  }

  // Bounds: X [-0.41, 0.41], Y [-0.45, 0.45], Z [-0.23, 0.24]
  // Nose tip is near max Z in upper half: [0.016, 0.161, 0.239]
  // Let's inspect points with Z > 0.15 (front of face) and Y between 0.0 and 0.35
  const frontFace = vertices.filter(([x, y, z]) => z > 0.15 && y > 0.0 && y < 0.35);

  console.log(`Front face vertices (Z > 0.15, Y in [0, 0.35]): ${frontFace.length}`);

  // Find Z profile along Y for X near 0 (midline of face)
  const midline = frontFace.filter(([x]) => Math.abs(x) < 0.02);
  // Sort by Y ascending (from chin to forehead)
  midline.sort((a, b) => a[1] - b[1]);

  console.log('\nMidline profile (Y from bottom to top, showing Y and Z):');
  for (let i = 0; i < midline.length; i += Math.max(1, Math.floor(midline.length / 25))) {
    console.log(`Y: ${midline[i][1].toFixed(4)}, Z: ${midline[i][2].toFixed(4)}, X: ${midline[i][0].toFixed(4)}`);
  }
}

findFacialFeatures();
