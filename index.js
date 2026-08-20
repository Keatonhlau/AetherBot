const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distPath = path.join(__dirname, 'dist', 'index.js');
const tsconfigPath = path.join(__dirname, 'tsconfig.json');

// Auto-compile TypeScript if dist/ index file is missing but tsconfig.json exists
if (!fs.existsSync(distPath)) {
  if (fs.existsSync(tsconfigPath)) {
    console.log('[AetherBot] dist/index.js not found. Building TypeScript files...');
    try {
      execSync(`npx tsc -p "${tsconfigPath}"`, { stdio: 'inherit', cwd: __dirname });
    } catch (err) {
      console.error('[AetherBot] Failed to build TypeScript files:', err);
      process.exit(1);
    }
  } else {
    console.error('[AetherBot] Error: Neither dist/index.js nor tsconfig.json was found in ' + __dirname);
    console.error('[AetherBot] Please run `git push -u origin master` from your local machine to upload all files to GitHub.');
    process.exit(1);
  }
}

// Load and run the compiled bot entry point
require('./dist/index.js');
