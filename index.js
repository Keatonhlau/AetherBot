const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distPath = path.join(__dirname, 'dist', 'index.js');

// Auto-compile TypeScript if dist/ index file is missing
if (!fs.existsSync(distPath)) {
  console.log('[AetherBot] Building TypeScript files...');
  try {
    execSync('npx tsc', { stdio: 'inherit', cwd: __dirname });
  } catch (err) {
    console.error('[AetherBot] Failed to build TypeScript files:', err);
    process.exit(1);
  }
}

// Load and run the compiled bot entry point
require('./dist/index.js');
