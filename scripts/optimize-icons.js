#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ICON = path.join(ROOT, 'public/icons/icon128.png');
const SIZE = 128;

if (!fs.existsSync(ICON)) {
  console.warn('No icon at public/icons/icon128.png — skipping');
  process.exit(0);
}

const tmp = `${ICON}.tmp.png`;

const probe = execSync(
  `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${ICON}"`,
  { encoding: 'utf8' }
).trim();
const [width, height] = probe.split(',').map(Number);

if (width <= SIZE && height <= SIZE) {
  const { size } = fs.statSync(ICON);
  console.log(`Icon already ${width}x${height} (${(size / 1024).toFixed(1)} KB) — skipping`);
  process.exit(0);
}

execSync(
  `ffmpeg -y -loglevel error -i "${ICON}" -vf scale=${SIZE}:${SIZE} "${tmp}" && mv "${tmp}" "${ICON}"`,
  { stdio: 'inherit', shell: true }
);

const { size } = fs.statSync(ICON);
console.log(`Optimized icon → ${SIZE}x${SIZE} (${(size / 1024).toFixed(1)} KB)`);
