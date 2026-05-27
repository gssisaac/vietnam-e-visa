#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const OUT = path.join(ROOT, `vietnam-e-visa-v${version}.zip`);

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found. Run pnpm build first.');
  process.exit(1);
}

if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

// Exclude macOS junk and hidden files from the extension zip.
execSync(
  `cd "${DIST}" && zip -r "${OUT}" . -x "*.DS_Store" -x "**/.DS_Store" -x "__MACOSX/*" -x "**/__MACOSX/*" -x "*.mp4" -x "**/*.mp4"`,
  { stdio: 'inherit' }
);

const { size } = fs.statSync(OUT);
console.log(`\nPackaged ${path.basename(OUT)} (${(size / 1024).toFixed(1)} KB)`);
console.log(`Version: ${version} → tag v${version}`);
