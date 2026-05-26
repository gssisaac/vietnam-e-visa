#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;
const zip = path.join(ROOT, `vietnam-e-visa-v${version}.zip`);

if (!fs.existsSync(zip)) {
  console.error(`Missing ${path.basename(zip)}. Run: pnpm package`);
  process.exit(1);
}

function releaseExists(releaseTag) {
  try {
    execSync(`gh release view "${releaseTag}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (releaseExists(tag)) {
  console.log(`Updating release ${tag}…`);
  execSync(`gh release upload "${tag}" "${zip}" --clobber`, { stdio: 'inherit' });
} else {
  console.log(`Creating release ${tag}…`);
  execSync(`gh release create "${tag}" "${zip}" --title "${tag}" --generate-notes`, {
    stdio: 'inherit',
  });
}

console.log(`\nRelease ready: https://github.com/gssisaac/vietnam-e-visa/releases/tag/${tag}`);
