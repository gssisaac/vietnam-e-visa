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

execSync(`cd "${DIST}" && zip -r "${OUT}" .`, { stdio: 'inherit' });
console.log(`\nPackaged ${path.relative(ROOT, OUT)}`);
