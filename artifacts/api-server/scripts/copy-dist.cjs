const fs = require('fs');
const path = require('path');

function findMonorepoRoot(startDir) {
  let curr = startDir;
  while (curr && curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, 'pnpm-workspace.yaml'))) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return startDir;
}

const root = findMonorepoRoot(__dirname);
const cwd = process.cwd();

console.log('[copy-dist] Monorepo root:', root);
console.log('[copy-dist] Working directory:', cwd);

// Possible locations for Vite build output
const candidateSrcs = [
  path.join(root, 'artifacts/magic-mirror/dist/public'),
  path.join(root, 'artifacts/magic-mirror/dist'),
  path.resolve(cwd, '../magic-mirror/dist/public'),
  path.resolve(cwd, 'dist/public'),
];

let src = candidateSrcs.find(p => fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html')));

if (!src) {
  console.log('[copy-dist] Vite output not found in candidates, checking if magic-mirror exists...');
  src = candidateSrcs[0];
}

console.log('[copy-dist] Source directory:', src);

// Server entry file
let serverEntry = path.join(root, 'scripts/server-entry.cjs');
if (!fs.existsSync(serverEntry)) {
  serverEntry = path.join(__dirname, 'server-entry.cjs');
}

function copyRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
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

// All destination directories to satisfy ANY Vercel root or output directory setting
const destinations = new Set([
  path.join(root, 'public'),
  path.join(root, 'dist'),
  path.join(root, 'artifacts/api-server/public'),
  path.join(root, 'artifacts/api-server/dist'),
  path.join(root, 'artifacts/magic-mirror/dist/public'),
  path.resolve(cwd, 'public'),
  path.resolve(cwd, 'dist'),
]);

if (fs.existsSync(src)) {
  for (const dest of destinations) {
    if (dest === src) continue;
    try {
      copyRecursive(src, dest);
      console.log(`[copy-dist] Copied static assets to: ${dest}`);
    } catch (err) {
      console.warn(`[copy-dist] Warning copying to ${dest}:`, err.message);
    }
  }

  // Copy entrypoints for Node.js / Express / Vercel Serverless
  if (fs.existsSync(serverEntry)) {
    const entryNames = ['index.js', 'app.js', 'server.js'];
    for (const dest of destinations) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      for (const name of entryNames) {
        try {
          fs.copyFileSync(serverEntry, path.join(dest, name));
        } catch (_) {}
      }
    }
    console.log('[copy-dist] Copied entrypoints (index.js, app.js, server.js) to all destinations.');
  }

  console.log('[copy-dist] Build output successfully copied to all destinations!');
} else {
  console.error('[copy-dist] ERROR: Source directory does not exist:', src);
  process.exit(1);
}
