const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = function loadTypeScript(module, fileName) {
  const source = fs.readFileSync(fileName, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName,
  }).outputText;
  module._compile(output, fileName);
};

const state = {};
const synced = {};
const session = {};
function storageArea(target, quota = 0) {
  const area = {
    async get(keys) {
      const names = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys || target);
      return Object.fromEntries(names.map((key) => [key, target[key]]));
    },
    async set(values) {
      if (quota) {
        const merged = { ...target, ...values };
        for (const [key, value] of Object.entries(merged))
          if (Buffer.byteLength(JSON.stringify(value)) + key.length > 8192)
            throw new Error('QUOTA_BYTES_PER_ITEM');
        const total = Object.entries(merged).reduce((sum, [key, value]) =>
          sum + key.length + Buffer.byteLength(JSON.stringify(value)), 0);
        if (total > quota) throw new Error('QUOTA_BYTES');
      }
      Object.assign(target, values);
    },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete target[key]; },
    async setAccessLevel() {},
  };
  return area;
}
global.chrome = {
  runtime: { getURL: (file) => 'test-extension://' + file },
  storage: {
    local: storageArea(state),
    sync: storageArea(synced, 102400),
    session: storageArea(session),
  },

};
global.fetch = async (url) => ({
  ok: true,
  text: async () => fs.readFileSync(path.join(__dirname, '..', 'public', url.split('://')[1]), 'utf8'),
});
global.crypto = require('node:crypto').webcrypto;

const { isEvisaSiteUrl, isForeignersUrl, normalizePurposeOfEntry } = require('../src/lib/shared.ts');
const { parseYaml, stringifyYaml } = require('../src/lib/yaml.ts');
const { LLM_PROFILE_PROMPT, PROFILE_SETUP_STEPS } = require('../src/lib/llm-prompt.ts');
const {
  enableOrUnlockSync, lockSync, syncNow, getSyncState, mergeSnapshots,
} = require('../src/lib/profile-sync.ts');
const {
  loadProfiles, saveProfileYaml, loadProfileYaml, createProfile, duplicateProfile,
  getProfileEntryDate, withEntryDate, parseStayDaysFromYaml, deleteProfile, setActiveProfileId,
  isVisaCompleted, withVisaCompleted, exportProfileYaml, exportProfilesYaml, parseProfilesYaml, importProfilesYaml,
} = require('../src/lib/profile-storage.ts');

async function run() {
  // Historical YAML must not attempt to select the obsolete "Tourism" option.
  assert.equal(normalizePurposeOfEntry('Tourism'), 'Tourist');
  assert.equal(normalizePurposeOfEntry(' tourism '), 'Tourist');
  assert.equal(normalizePurposeOfEntry('Tourist'), 'Tourist');
  assert.equal(normalizePurposeOfEntry('Tourism, visiting relatives'), 'Tourism, visiting relatives');
  assert.equal(normalizePurposeOfEntry('Business'), 'Business');
  for (const file of ['data/select-options.yaml', 'public/data/select-options.yaml']) {
    const contents = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const purposes = contents.split('purpose_of_entry:\n')[1].split('\nborder_gate_entry:')[0];
    assert.ok(purposes.includes('  - "Tourist"\n'), file + ' includes Tourist');
    assert.ok(!purposes.includes('  - "Tourism"\n'), file + ' omits obsolete Tourism');
  }
  assert.equal(parseYaml(fs.readFileSync(path.join(__dirname, '..', 'public/profile.example.yaml'), 'utf8')).trip_information.purpose_of_entry, 'Tourist');
  assert.ok(LLM_PROFILE_PROMPT.includes('purpose_of_entry: "Tourist"'), 'Prompt must use Tourist');
  // Applicant controls must only show on the official secure e-Visa origin.
  const officialUrls = ['https://evisa.gov.vn/', 'https://evisa.gov.vn/e-visa/foreigners', 'https://evisa.gov.vn/e-visa/foreigners?lang=en'];
  for (const url of officialUrls) assert.equal(isEvisaSiteUrl(url), true, url);
  const outsideUrls = ['https://example.com/', 'https://evisa.gov.vn.evil.example/', 'https://fake-evisa.gov.vn/', 'http://evisa.gov.vn/', 'chrome://extensions', 'about:blank', undefined, 'not a url'];
  for (const url of outsideUrls) {
    assert.equal(isEvisaSiteUrl(url), false, String(url));
    assert.equal(isForeignersUrl(url), false, String(url));
  }
  assert.equal(isForeignersUrl('https://evisa.gov.vn/'), false);
  assert.equal(isForeignersUrl('https://evisa.gov.vn/e-visa/foreigners'), true);
  assert.equal(isForeignersUrl('https://evisa.gov.vn/e-visa/foreigners/new'), true);
  assert.equal(isForeignersUrl('https://evisa.gov.vn/e-visa/foreigners-fake'), false);
  console.log('Official e-Visa page detection and lookalike-domain rejection: PASS');
  // Keep the copyable LLM prompt in sync with the actual YAML import schema.
  const example = LLM_PROFILE_PROMPT.match(/\x60\x60\x60yaml\n([\s\S]*?)\n\x60\x60\x60/);
  assert.ok(example, 'Prompt includes a copyable YAML schema');
  const schema = parseYaml(example[1]);
  const template = parseYaml(fs.readFileSync(path.join(__dirname, '..', 'public/profile.form.yaml'), 'utf8'));
  for (const [section, values] of Object.entries(template)) {
    assert.ok(Object.hasOwn(schema, section), 'Prompt missing section ' + section);
    if (values && typeof values === 'object' && !Array.isArray(values)) {
      for (const key of Object.keys(values)) {
        assert.ok(Object.hasOwn(schema[section], key), 'Prompt missing field ' + section + '.' + key);
      }
    }
  }
  assert.equal(schema.applicant_metadata.visa_completed, false);
  assert.equal(schema.applicant_metadata.label, '');
  const twoApplicants = ['TEST ONE', 'TEST TWO'].map((name) => (
    stringifyYaml({ ...schema,
      applicant_metadata: { label: name, visa_completed: false },
      personal_information: { ...schema.personal_information, given_name: name },
      passport_information: { ...schema.passport_information, number: 'PASSPORT-' + name },
    })
  )).map((text) => '---\n' + text).join('');
  const importedFromPrompt = parseProfilesYaml(twoApplicants);
  assert.equal(importedFromPrompt.length, 2, 'Multi-profile prompt output can be imported');
  assert.notEqual(importedFromPrompt[0].passport_information.number, importedFromPrompt[1].passport_information.number);
  assert.equal(importedFromPrompt[1].applicant_metadata.visa_completed, false);
  assert.ok(LLM_PROFILE_PROMPT.includes('ONE question at a time') ||
            LLM_PROFILE_PROMPT.includes('ONE question per message'));
  assert.ok(LLM_PROFILE_PROMPT.includes('shared') && LLM_PROFILE_PROMPT.includes('BEFORE') === false);
  assert.ok(PROFILE_SETUP_STEPS.some((step) => step.body.includes('Sync tab')));
  console.log('LLM prompt matches profile schema, produces importable multi-person YAML, and documents Sync tab: PASS');
  const sample = {
    personal_information: { surname: 'TEST', given_name: 'ONE', date_of_birth: '12/05/1988', sex: 'Female' },
    passport_information: { number: 'A0001234', date_of_issue: '12/03/2023' },
    trip_information: { intended_entry_date: '10/01/2027', length_of_stay_days: '20', residential_address: 'Hotel: "Test" #1' },
    requested_information: { entry_type: 'single' },
    accompanying_children: [{ full_name: 'CHILD ONE', sex: 'Female', date_of_birth: '12/01/2021' }],
    vietnam_visits_last_year: [
      { from_date: '01/01/2026', to_date: '02/01/2026', purpose: 'Holiday' },
    ],
    personal_flags: ['Long text: with a colon', 'quoted "text"', 'hash # symbol'],
  };
  const yaml = stringifyYaml(sample);
  assert.deepEqual(parseYaml(yaml), sample, 'YAML round trip with arrays and special characters');

  state.profileYaml = yaml; // existing installations migrate the single-profile record
  let list = await loadProfiles();
  assert.equal(list.length, 1);
  assert.equal(list[0].yaml, yaml, 'Original YAML is migrated intact');
  assert.equal(state.profileYaml, yaml, 'Legacy profile remains as backup');
  const originalId = list[0].id;

  assert.equal(getProfileEntryDate(yaml), '2027-01-10');
  assert.equal(parseStayDaysFromYaml(yaml), 20);
  const shifted = withEntryDate(yaml, '2027-01-12');
  const updated = parseYaml(shifted);
  assert.equal(updated.trip_information.intended_entry_date, '12/01/2027');
  assert.equal(updated.requested_information.valid_to, '31/01/2027');

  const second = await duplicateProfile(yaml);
  list = await loadProfiles();
  assert.equal(list.length, 2);
  assert.equal(parseYaml(second.yaml).personal_information.surname, 'TEST');
  assert.equal(parseYaml(second.yaml).personal_information.given_name, '');
  assert.equal(parseYaml(second.yaml).passport_information.number, '');
  assert.deepEqual(parseYaml(second.yaml).accompanying_children, []);
  assert.equal(parseYaml(second.yaml).trip_information.residential_address, 'Hotel: "Test" #1');

  await saveProfileYaml(shifted, second.id);
  assert.equal(await loadProfileYaml(originalId), yaml, 'Editing one person does not overwrite another');
  assert.equal(await loadProfileYaml(second.id), shifted);
  await setActiveProfileId(originalId);
  assert.equal(await loadProfileYaml(), yaml, 'Active person selects the default YAML');

  const blank = await createProfile();
  assert.equal((await loadProfiles()).length, 3);
  assert.equal(parseYaml(blank.yaml).personal_information.surname, '');
  await deleteProfile(second.id);
  assert.equal((await loadProfiles()).length, 2);

  assert.equal(isVisaCompleted(yaml), false, 'Old profiles without a flag default to not done');
  const done = withVisaCompleted(yaml, true);
  assert.equal(isVisaCompleted(done), true);
  assert.equal(parseYaml(done).passport_information.number, 'A0001234');
  assert.equal(isVisaCompleted(withVisaCompleted(done, false)), false);
  await saveProfileYaml(done, originalId);

  const freshDuplicate = await duplicateProfile(done);
  assert.equal(isVisaCompleted(freshDuplicate.yaml), false, 'Duplicating a completed visa resets its checklist');
  await deleteProfile(freshDuplicate.id);

  const backup = exportProfilesYaml(await loadProfiles());
  assert.equal((backup.match(/^---$/gm) || []).length, 2, 'One YAML document per applicant');
  assert.equal(parseProfilesYaml(backup).length, 2);
  assert.equal(isVisaCompleted(exportProfileYaml({ id: 'test', label: 'Saved label', yaml: done })), true);
  const backupContents = parseProfilesYaml(backup);
  assert.equal(backupContents[0].applicant_metadata.visa_completed, true);
  assert.equal(backupContents[0].applicant_metadata.label, 'Applicant 1');

  const importResult = await importProfilesYaml(backup);
  assert.equal(importResult.length, 2);
  assert.equal((await loadProfiles()).length, 4, 'Import appends and preserves existing profiles');
  assert.equal(isVisaCompleted(importResult[0].yaml), true, 'Completion survives export/import');
  assert.equal((await loadProfiles())[0].id, originalId, 'Old profile not overwritten');
  assert.equal(importResult[0].label, 'Applicant 1', 'Original internal label survives backup');

  // Neither a nested key nor a quoted substring is a document boundary.
  const extra = { ...sample, occupation: { occupation_info: 'Text mentioning personal_information: in a value' } };
  const customYaml = stringifyYaml(extra);
  const mixed = customYaml + '\n---\n' + stringifyYaml({ ...extra, personal_information: { surname: 'SECOND' }, applicant_metadata: { visa_completed: false } });
  assert.equal(parseProfilesYaml(mixed).length, 2);

  const importedLegacy = await importProfilesYaml(stringifyYaml({
    personal_information: { surname: 'LEGACY', given_name: 'TOURIST' },
    passport_information: { number: 'L0000001' },
    trip_information: { purpose_of_entry: 'Tourism' },
  }));
  assert.equal(parseYaml(importedLegacy[0].yaml).trip_information.purpose_of_entry, 'Tourist',
    'Old YAML is normalized on import');
  const previous = (await loadProfiles()).length;
  await assert.rejects(
    () => importProfilesYaml(backup + '\n---\npassport_information:\n  number: "MISSING_PERSONAL"'),
    /Applicant 3/,
  );
  assert.equal((await loadProfiles()).length, previous, 'Invalid batch leaves storage unchanged');
  assert.equal(parseProfilesYaml('\uFEFF' + backup).length, 2, 'UTF-8 BOM is supported');
  // Sync vault stores ciphertext only, and the encryption key is session-only.
  const originalCount = (await loadProfiles()).length;
  const enabled = await enableOrUnlockSync('strong sync password 12345');
  assert.equal(enabled.total, originalCount);
  assert.equal((await getSyncState()).unlocked, true);
  const vaultData = JSON.stringify(synced);
  assert.equal(vaultData.includes('A0001234'), false, 'Passport numbers cannot leak to Chrome Sync');
  assert.equal(vaultData.includes('personal_information'), false, 'YAML must be encrypted');

  // On another browser, the local profile set is different.
  const originalProfiles = await loadProfiles();
  state.visaProfilesV2 = [{
    id: 'other-browser-applicant', label: 'Second browser',
    yaml: stringifyYaml({ ...sample, personal_information: { surname: 'OTHER', given_name: 'BROWSER' } }),
    updatedAt: Date.now() + 100,
  }];
  await lockSync();
  assert.equal((await getSyncState()).unlocked, false);
  const beforeWrongPassword = JSON.stringify(state.visaProfilesV2);
  await assert.rejects(() => enableOrUnlockSync('this is a wrong password 123'), /Incorrect sync password/);
  assert.equal(JSON.stringify(state.visaProfilesV2), beforeWrongPassword, 'Wrong password never modifies local profiles');
  const reunited = await enableOrUnlockSync('strong sync password 12345');
  assert.equal(reunited.total, originalCount + 1, 'Union of people from two browsers');
  assert.equal((await loadProfiles()).length, originalCount + 1);
  assert.equal(JSON.stringify(synced).includes('A0001234'), false);

  // Tombstones from Chrome browser A must prevent old copies reappearing.
  await deleteProfile('other-browser-applicant');
  const deletionResult = await syncNow();
  assert.equal(deletionResult.total, originalCount);
  assert.equal((await loadProfiles()).length, originalCount);
  const syncedHead = synced.visaEvisaSyncHeadV1;
  assert.ok(syncedHead && syncedHead.parts >= 1);

  // Syncing unchanged records must not continuously republish the vault.
  await syncNow();
  assert.equal(synced.visaEvisaSyncHeadV1.snapshot, syncedHead.snapshot);

  // Test a large profile whose ciphertext cannot fit in Chrome's 8KB/item limit.
  const large = stringifyYaml({
    ...sample, occupation: { company_address: 'Long details: ' + Array.from({length:5000},(_,i)=>i.toString(36)).join('-') },
  });
  await saveProfileYaml(large, originalProfiles[0].id);
  await syncNow();
  assert.ok(synced.visaEvisaSyncHeadV1.parts > 1, 'Large snapshots are split into parts');
  const syncValues = Object.entries(synced).filter(([name]) => name.startsWith('visaEvisaSyncPartV1_'));
  assert.ok(syncValues.every(([name,value]) => Buffer.byteLength(JSON.stringify(value)) + name.length <= 8192));
  console.log('Encrypted Chrome Sync, merge, password rejection, deletions, chunking, unchanged-sync: PASS');
    console.log('Profile migration, YAML multi-document import/export, atomic rollback and completion flags: PASS');
}
run().catch((err) => { console.error(err); process.exitCode = 1; });
