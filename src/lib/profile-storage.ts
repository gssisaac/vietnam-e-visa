import { addDaysIso, isoToDdMmYyyy, normalizePurposeOfEntry } from './shared';
import { parseYaml, stringifyYaml, type VisaProfile } from './yaml';

export const STORAGE_KEY_PROFILE_YAML = 'profileYaml'; // legacy single-profile backup
export const STORAGE_KEY_ENTRY_DATE = 'lastEntryDate'; // legacy popup preference
export const STORAGE_KEY_STAY_DAYS = 'profileStayDays'; // legacy popup preference
export const STORAGE_KEY_PROFILES = 'visaProfilesV2';
export const STORAGE_KEY_ACTIVE_PROFILE = 'activeVisaProfileId';
export const STORAGE_KEY_DELETED_PROFILES = 'deletedVisaProfileIdsV1';

export const PROFILE_BLANK_TEMPLATE_FILE = 'profile.form.yaml';
export const PROFILE_EXAMPLE_FILE = 'profile.example.yaml';

export interface StoredProfile {
  id: string;
  label: string;
  yaml: string;
  updatedAt?: number;
}

async function blankYaml(): Promise<string> {
  const response = await fetch(chrome.runtime.getURL(PROFILE_BLANK_TEMPLATE_FILE));
  if (!response.ok) throw new Error('Could not load the blank profile template.');
  return response.text();
}

function newId(): string {
  return crypto.randomUUID();
}

/** On first use, migrate the old single YAML profile without deleting its backup. */
export async function loadProfiles(): Promise<StoredProfile[]> {
  const stored = await chrome.storage.local.get([STORAGE_KEY_PROFILES, STORAGE_KEY_PROFILE_YAML]);
  const existing = stored[STORAGE_KEY_PROFILES];
  if (Array.isArray(existing) && existing.length) {
    return existing as StoredProfile[];
  }

  const legacy = stored[STORAGE_KEY_PROFILE_YAML];
  const yaml = typeof legacy === 'string' && legacy.trim() ? legacy : await blankYaml();
  const profiles: StoredProfile[] = [{ id: newId(), label: 'Applicant 1', yaml, updatedAt: Date.now() }];
  await chrome.storage.local.set({
    [STORAGE_KEY_PROFILES]: profiles,
    [STORAGE_KEY_ACTIVE_PROFILE]: profiles[0].id,
  });
  return profiles;
}

export function getProfileLabel(profile: StoredProfile): string {
  try {
    const data = parseYaml(profile.yaml).personal_information as Record<string, unknown> | undefined;
    const surname = String(data?.surname || '').trim();
    const givenName = String(data?.given_name || '').trim();
    if (surname && givenName) return surname + ', ' + givenName;
  } catch {
    // Keep the custom label when parsing a profile fails.
  }
  return profile.label;
}

export async function loadActiveProfileId(): Promise<string> {
  const profiles = await loadProfiles();
  const saved = await chrome.storage.local.get(STORAGE_KEY_ACTIVE_PROFILE);
  const id = saved[STORAGE_KEY_ACTIVE_PROFILE];
  return profiles.some((profile) => profile.id === id) ? id : profiles[0].id;
}

export async function setActiveProfileId(id: string): Promise<void> {
  if (!(await loadProfiles()).some((profile) => profile.id === id)) {
    throw new Error('Applicant not found.');
  }
  await chrome.storage.local.set({ [STORAGE_KEY_ACTIVE_PROFILE]: id });
}

export async function loadProfileYaml(profileId?: string): Promise<string> {
  const profiles = await loadProfiles();
  const id = profileId || (await loadActiveProfileId());
  const profile = profiles.find((item) => item.id === id);
  if (!profile) throw new Error('Selected applicant no longer exists.');
  return profile.yaml;
}

export async function saveProfileYaml(yaml: string, profileId?: string): Promise<void> {
  parseYaml(yaml);
  const profiles = await loadProfiles();
  const id = profileId || (await loadActiveProfileId());
  const index = profiles.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Selected applicant no longer exists.');
  profiles[index] = { ...profiles[index], yaml, updatedAt: Date.now() };
  await chrome.storage.local.set({ [STORAGE_KEY_PROFILES]: profiles });
}

export async function createProfile(yaml?: string, label = 'New applicant'): Promise<StoredProfile> {
  const profiles = await loadProfiles();
  const profile = { id: newId(), label, yaml: yaml ?? (await blankYaml()), updatedAt: Date.now() };
  parseYaml(profile.yaml);
  await chrome.storage.local.set({
    [STORAGE_KEY_PROFILES]: [...profiles, profile],
    [STORAGE_KEY_ACTIVE_PROFILE]: profile.id,
  });
  return profile;
}

export async function duplicateProfile(sourceYaml: string): Promise<StoredProfile> {
  const data = parseYaml(sourceYaml);
  const personal = (data.personal_information || {}) as Record<string, unknown>;
  const passport = (data.passport_information || {}) as Record<string, unknown>;

  // Keep shared addresses, dates, contact details and itinerary. Explicitly blank
  // identity and passport fields so the copy is not accidentally submitted as the source.
  for (const field of ['given_name', 'date_of_birth', 'identity_card']) personal[field] = '';
  for (const field of ['number', 'date_of_issue', 'expiry_date', 'issuing_authority']) passport[field] = '';
  personal.sex = '';
  personal.used_other_passports = false;
  personal.used_passports = [];
  passport.other_valid_passports = false;
  passport.other_passports = [];
  data.personal_information = personal;
  data.passport_information = passport;
  data.accompanying_children = []; // Never reuse children across separate visa applications.
  data.applicant_metadata = { ...(data.applicant_metadata as Record<string, unknown> || {}), visa_completed: false, label: 'New applicant (copy)' };
  return createProfile(stringifyYaml(data), 'New applicant (copy)');
}

export async function deleteProfile(profileId: string): Promise<void> {
  const profiles = await loadProfiles();
  const remaining = profiles.filter((profile) => profile.id !== profileId);
  if (remaining.length === profiles.length) throw new Error('Applicant not found.');
  if (remaining.length === 0) throw new Error('Keep at least one applicant. Create another before deleting this one.');
  const result = await chrome.storage.local.get(STORAGE_KEY_DELETED_PROFILES);
  const deleted = (result[STORAGE_KEY_DELETED_PROFILES] || {}) as Record<string, number>;
  const deletedProfile = profiles.find((profile) => profile.id === profileId)!;
  const deletedAt = Math.max(Date.now(), (deletedProfile.updatedAt ?? 0) + 1);
  await chrome.storage.local.set({
    [STORAGE_KEY_PROFILES]: remaining,
    [STORAGE_KEY_DELETED_PROFILES]: { ...deleted, [profileId]: deletedAt },
    [STORAGE_KEY_ACTIVE_PROFILE]: remaining[0].id,
  });
}

export function getProfileEntryDate(yaml: string): string {
  const profile = parseYaml(yaml);
  const trip = (profile.trip_information || {}) as Record<string, unknown>;
  const requested = (profile.requested_information || {}) as Record<string, unknown>;
  const date = String(trip.intended_entry_date || requested.valid_from || '');
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!match) return '';
  const iso = match[3] + '-' + match[2] + '-' + match[1];
  const test = new Date(iso + 'T00:00:00Z');
  return !Number.isNaN(test.valueOf()) && test.toISOString().startsWith(iso) ? iso : '';
}

export function parseStayDaysFromYaml(yaml: string): number | null {
  const trip = (parseYaml(yaml).trip_information || {}) as Record<string, unknown>;
  const parsed = Number(trip.length_of_stay_days);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Updating the date from the popup persists it back into this applicant's YAML. */
export function withEntryDate(yaml: string, entryIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryIso)) throw new Error('Invalid entry date.');
  const profile: VisaProfile = parseYaml(yaml);
  const trip = (profile.trip_information || {}) as Record<string, unknown>;
  const requested = (profile.requested_information || {}) as Record<string, unknown>;
  const stayDays = parseStayDaysFromYaml(yaml) ?? 90;
  trip.intended_entry_date = isoToDdMmYyyy(entryIso);
  requested.valid_from = isoToDdMmYyyy(entryIso);
  requested.valid_to = isoToDdMmYyyy(addDaysIso(entryIso, stayDays - 1));
  profile.trip_information = trip;
  profile.requested_information = requested;
  return stringifyYaml(profile);
}

export function downloadProfileYaml(yaml: string, filename = 'profile.yaml'): void {
  const blob = new Blob([yaml], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}


/**
 * Completion is an applicant's own checklist status; it is not confirmation
 * from the Vietnamese government that an e-Visa was issued.
 */
export function isVisaCompleted(yaml: string): boolean {
  const profile = parseYaml(yaml);
  const metadata = profile.applicant_metadata;
  return Boolean(metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>).visa_completed === true);
}

export function withVisaCompleted(yaml: string, completed: boolean): string {
  const data = parseYaml(yaml);
  const meta = data.applicant_metadata;
  data.applicant_metadata = {
    ...(meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {}),
    visa_completed: completed,
  };
  return stringifyYaml(data);
}

/** Include human-readable profile labels and a status flag in every backup. */
export function exportProfileYaml(profile: StoredProfile): string {
  const data = parseYaml(profile.yaml);
  const meta = data.applicant_metadata;
  data.applicant_metadata = {
    ...(meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {}),
    label: profile.label,
    visa_completed: isVisaCompleted(profile.yaml),
  };
  return stringifyYaml(data);
}

/**
 * Standard YAML document stream: each applicant is one complete YAML document
 * separated by a standalone "---" marker. Never split on personal_information:
 * (that key may appear in nested text or be reordered).
 */
export function exportProfilesYaml(profiles: StoredProfile[]): string {
  if (!profiles.length) throw new Error('No applicant profiles to export.');
  return profiles.map((profile) => '---\n' + exportProfileYaml(profile).trimEnd() + '\n').join('');
}

function splitProfileDocuments(text: string): string[] {
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const docs: string[] = [];
  let current: string[] = [];

  function commit() {
    const contents = current.join('\n').trim();
    if (contents && contents.split('\n').some((line) => line.trim() && !line.trim().startsWith('#'))) {
      docs.push(contents);
    }
    current = [];
  }

  for (const line of source.split('\n')) {
    if (/^---(?:[ \t]*#.*)?[ \t]*$/.test(line)) {
      commit();
    } else if (/^\.\.\.(?:[ \t]*#.*)?[ \t]*$/.test(line)) {
      commit();
    } else {
      current.push(line);
    }
  }
  commit();
  return docs;
}

/** Parse and validate the entire stream before mutating Chrome storage. */
export function parseProfilesYaml(text: string): VisaProfile[] {
  const documents = splitProfileDocuments(text);
  if (!documents.length) throw new Error('No applicant profiles found in the YAML file.');

  return documents.map((document, index) => {
    const data = parseYaml(document);
    for (const section of ['personal_information', 'passport_information']) {
      const block = data[section];
      if (!block || typeof block !== 'object' || Array.isArray(block)) {
        throw new Error(`Applicant ${index + 1}: missing or invalid ${section}.`);
      }
    }
    return data;
  });
}

/** Append all imported applicants in one atomic storage update; never overwrite. */
export async function importProfilesYaml(text: string): Promise<StoredProfile[]> {
  const entries = parseProfilesYaml(text);
  const profiles = await loadProfiles();
  const additions = entries.map((data, index) => {
    const trip = data.trip_information as Record<string, unknown> | undefined;
    if (trip && 'purpose_of_entry' in trip) {
      trip.purpose_of_entry = normalizePurposeOfEntry(trip.purpose_of_entry);
    }
    const meta = data.applicant_metadata;
    const label = meta && typeof meta === 'object' && !Array.isArray(meta)
      ? String((meta as Record<string, unknown>).label || '').trim() : '';
    return {
      id: newId(),
      label: label || `Imported applicant ${index + 1}`,
      yaml: stringifyYaml(data),
      updatedAt: Date.now(),
    };
  });
  await chrome.storage.local.set({
    [STORAGE_KEY_PROFILES]: [...profiles, ...additions],
    [STORAGE_KEY_ACTIVE_PROFILE]: additions[0].id,
  });
  return additions;
}
