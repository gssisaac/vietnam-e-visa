#!/usr/bin/env node

/**
 * Fetches official dropdown labels from evisa API and writes data/select-options.yaml
 * Run: node scripts/fetch-options.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const API = 'https://api.evisa.gov.vn/client-service/public';
const OUT = path.join(__dirname, '..', 'data', 'select-options.yaml');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

function yamlQuote(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function listYaml(items, indent = 2) {
  const pad = ' '.repeat(indent);
  return items.map((item) => `${pad}- ${yamlQuote(item)}`).join('\n');
}

async function main() {
  const [qt, md, ckEntry, ckExit, tinh] = await Promise.all([
    fetchJson(`${API}/dm-qt/get-all`),
    fetchJson(`${API}/dm-md/get-all`),
    fetchJson(`${API}/dm-ck/get-all-nc`),
    fetchJson(`${API}/dm-ck/get-all`),
    fetchJson(`${API}/dm-tinh-tp/get-all`),
  ]);

  const nationalities = qt.data.map((x) => x.tenQTEn || x.TenQTEn).filter(Boolean).sort();
  const purposes = [...new Set(md.data.map((x) => x.TenMDEn).filter(Boolean))].sort();
  const borderGatesEntry = ckEntry.data.map((x) => x.tenCKEn).filter(Boolean).sort();
  const borderGatesExit = ckExit.data.map((x) => x.tenCKEn).filter(Boolean).sort();
  const provinces = tinh.data.map((x) => x.tenTTEn).filter(Boolean).sort();

  const hcm = tinh.data.find((x) => /ho chi minh/i.test(x.tenTTEn || ''));
  const hcmWards = (hcm?.dmPhuongXa || []).map((x) => x.tenPhuongXaEn).filter(Boolean).sort();

  const content = `# Official e-Visa dropdown labels (from api.evisa.gov.vn)
# Copy EXACT strings into profile.yaml — matching is case-insensitive but spelling must match.
# Regenerate: node scripts/fetch-options.js

nationality:
${listYaml(nationalities)}

purpose_of_entry:
${listYaml(purposes)}

border_gate_entry:
${listYaml(borderGatesEntry)}

border_gate_exit:
${listYaml(borderGatesExit)}

province_city:
${listYaml(provinces)}

# Wards depend on province. Example for HO CHI MINH City:
ho_chi_minh_city_wards:
${listYaml(hcmWards)}
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, content);
  console.log(`Wrote ${OUT}`);
  console.log(`  nationalities: ${nationalities.length}`);
  console.log(`  purposes: ${purposes.length}`);
  console.log(`  border gates (entry): ${borderGatesEntry.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
