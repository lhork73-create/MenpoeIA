const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../artifacts/magic-mirror/dist/public');
const targetPublic = path.resolve(__dirname, '../public');
const targetDist = path.resolve(__dirname, '../dist');
const serverEntry = path.resolve(__dirname, 'server-entry.cjs');

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

  // Copy entrypoints for any Node/Express/Serverless preset
  if (fs.existsSync(serverEntry)) {
    ['index.js', 'app.js', 'server.js'].forEach(name => {
      fs.copyFileSync(serverEntry, path.join(src, name));
      fs.copyFileSync(serverEntry, path.join(targetPublic, name));
      fs.copyFileSync(serverEntry, path.join(targetDist, name));
    });
    console.log('Copied entrypoints (index.js, app.js, server.js) to all target dirs');
  }

  console.log('Successfully copied build output to /public and /dist');
} else {
  console.error('Source directory does not exist:', src);
  process.exit(1);
}
