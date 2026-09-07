const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../artifacts/magic-mirror/dist/public');
const targetPublic = path.resolve(__dirname, '../public');
const targetDist = path.resolve(__dirname, '../dist');

function copyRecursive(srcDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(src)) {
  copyRecursive(src, targetPublic);
  copyRecursive(src, targetDist);
  console.log('Successfully copied build output to /public and /dist');
} else {
  console.error('Source directory does not exist:', src);
  process.exit(1);
}
