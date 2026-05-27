#!/usr/bin/env node

import fs from 'node:fs';

const url = process.argv[2];
const readmePath = process.argv[3] ?? 'README.md';

if (!url || !url.includes('user-attachments/assets/')) {
  console.error('Usage: node patch-readme-video.js <user-attachments-url> [README.md]');
  process.exit(1);
}

const readme = fs.readFileSync(readmePath, 'utf8');
const block = `## Introduction\n\n${url}\n`;

const updated = readme.replace(/## Introduction\n[\s\S]*?(?=\n## )/, `${block}\n`);

if (updated === readme) {
  console.error('Could not find ## Introduction section in README.');
  process.exit(1);
}

fs.writeFileSync(readmePath, updated);
console.log('Updated Introduction section with GitHub CDN video URL.');
