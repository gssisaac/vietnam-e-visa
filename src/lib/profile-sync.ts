/**
 * Optional Chrome Sync vault for visa applicants.
 * Only AES-256-GCM ciphertext goes to chrome.storage.sync.
 * The derived key is kept in chrome.storage.session (not synced), never the passphrase.
 */
import {
  loadProfiles, STORAGE_KEY_PROFILES, STORAGE_KEY_DELETED_PROFILES,
  type StoredProfile,
} from './profile-storage';

const HEAD = 'visaEvisaSyncHeadV1';
const SESSION_KEY = 'visaEvisaSyncSessionKeyV1';
const PREFIX = 'visaEvisaSyncPartV1_';
const PART_SIZE = 6800;
const MAX_PARTS = 12;
const ITERATIONS = 310000;

type SyncHead = { version: 1; salt: string; nonce: string; snapshot: string; parts: number; timestamp: number };
type Snapshot = { profiles: StoredProfile[]; deleted: Record<string, number> };
type SyncResult = { total: number; downloaded: number; uploaded: boolean };

function toB64(input: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < input.length; i += 8192)
    binary += String.fromCharCode(...input.subarray(i, i + 8192));
  return btoa(binary);
}

function fromB64(value: string): Uint8Array {
  const bytes = atob(value);
  return Uint8Array.from(bytes, (char) => char.charCodeAt(0));
}

function bytesBuffer(value: Uint8Array): ArrayBuffer {
  const result = new ArrayBuffer(value.byteLength);
  new Uint8Array(result).set(value);
  return result;
}

function freshBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', bytesBuffer(new TextEncoder().encode(password)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bytesBuffer(fromB64(salt)), iterations: ITERATIONS, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );
}

async function saveKey(key: CryptoKey): Promise<void> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  await chrome.storage.session.set({ [SESSION_KEY]: toB64(raw) });
  raw.fill(0);
}

async function activeKey(): Promise<CryptoKey | null> {
  const saved = await chrome.storage.session.get(SESSION_KEY);
  if (typeof saved[SESSION_KEY] !== 'string') return null;
  return crypto.subtle.importKey('raw', bytesBuffer(fromB64(saved[SESSION_KEY])), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function readHead(): Promise<SyncHead | null> {
  const data = await chrome.storage.sync.get(HEAD);
  const head = data[HEAD] as SyncHead | undefined;
  if (!head) return null;
  if (head.version !== 1 || !head.salt || !head.nonce || !head.snapshot ||
      !Number.isInteger(head.parts) || head.parts < 1 || head.parts > MAX_PARTS) {
    throw new Error('Unsupported or incomplete Chrome Sync vault.');
  }
  return head;
}

function partKey(head: SyncHead, index: number): string {
  return PREFIX + head.snapshot + '_' + index;
}

async function readRemote(key: CryptoKey, head: SyncHead): Promise<Snapshot> {
  const names = Array.from({ length: head.parts }, (_, index) => partKey(head, index));
  const values = await chrome.storage.sync.get(names);
  if (!names.every((name) => typeof values[name] === 'string'))
    throw new Error('Chrome Sync has not downloaded all encrypted parts yet. Try again shortly.');
  const ciphertext = fromB64(names.map((name) => values[name] as string).join(''));
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytesBuffer(fromB64(head.nonce)) },
      key, bytesBuffer(ciphertext)
    );
  } catch {
    throw new Error('Incorrect sync password, or the encrypted sync data is damaged.');
  }
  const snapshot = JSON.parse(new TextDecoder().decode(plain)) as Snapshot;
  if (!snapshot || !Array.isArray(snapshot.profiles) || !snapshot.deleted ||
      typeof snapshot.deleted !== 'object') throw new Error('Invalid encrypted profile snapshot.');
  if (!snapshot.profiles.every((p) =>
    p && typeof p.id === 'string' && typeof p.label === 'string' &&
    typeof p.yaml === 'string' && p.yaml.length < 100000 &&
    (!p.updatedAt || Number.isFinite(p.updatedAt))
  )) throw new Error('Invalid applicant data received from Chrome Sync.');
  return snapshot;
}

async function readLocal(): Promise<Snapshot> {
  const profiles = await loadProfiles();
  const record = await chrome.storage.local.get(STORAGE_KEY_DELETED_PROFILES);
  return { profiles, deleted: record[STORAGE_KEY_DELETED_PROFILES] || {} };
}

function placeholder(profile: StoredProfile): boolean {
  // Fresh installations create an empty 'Applicant 1'. Do not upload this
  // placeholder alongside real applicants downloaded from another browser.
  if (profile.label !== 'Applicant 1') return false;
  try {
    const yaml = profile.yaml;
    return !/^\s*(?:surname|given_name|number):\s*"[^"]+"/m.test(yaml);
  } catch {
    return false;
  }
}

function canonical(snapshot: Snapshot): Snapshot {
  return {
    profiles: [...snapshot.profiles].sort((a, b) => a.id.localeCompare(b.id)),
    deleted: Object.fromEntries(Object.entries(snapshot.deleted).sort(([a], [b]) => a.localeCompare(b))),
  };
}

export function mergeSnapshots(local: Snapshot, remote: Snapshot): Snapshot {
  const deleted = { ...remote.deleted };
  for (const [id, time] of Object.entries(local.deleted))
    if (Number.isFinite(time)) deleted[id] = Math.max(deleted[id] || 0, time);
  const profiles = new Map<string, StoredProfile>();
  for (const item of remote.profiles) profiles.set(item.id, item);
  const hasActualRemote = remote.profiles.some((p) => !placeholder(p));
  for (const item of local.profiles) {
    if (hasActualRemote && placeholder(item) && !remote.profiles.some((p) => p.id === item.id)) continue;
    const old = profiles.get(item.id);
    if (!old || (item.updatedAt ?? 0) > (old.updatedAt ?? 0)) profiles.set(item.id, item);
    else if ((item.updatedAt ?? 0) === (old.updatedAt ?? 0) &&
             (item.yaml !== old.yaml || item.label !== old.label)) {
      // Two copies modified at the same revision: preserve both, rather than discard local data.
      const conflictId = crypto.randomUUID();
      profiles.set(conflictId, { ...item, id: conflictId, updatedAt: Date.now() });
    }
  }
  const alive = [...profiles.values()].filter((p) => (p.updatedAt ?? 0) > (deleted[p.id] || 0));
  return canonical({ profiles: alive, deleted });
}

async function publish(key: CryptoKey, salt: string, snapshot: Snapshot, old: SyncHead | null) {
  const iv = freshBytes(12);
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(snapshot)));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bytesBuffer(iv) }, key, bytesBuffer(bytes));
  const encoded = toB64(new Uint8Array(encrypted));
  const parts = encoded.match(new RegExp('.{1,' + PART_SIZE + '}', 'g')) || [];
  if (!parts.length || parts.length > MAX_PARTS)
    throw new Error('Chrome Sync 100 KB quota exceeded. Export a YAML backup instead.');

  const head: SyncHead = {
    version: 1, salt, nonce: toB64(iv), snapshot: crypto.randomUUID().replace(/-/g, ''),
    parts: parts.length, timestamp: Date.now(),
  };
  const entries = Object.fromEntries(parts.map((piece, index) => [partKey(head, index), piece]));
  // Write ciphertext before publishing the head pointer so remote devices
  // cannot observe a partly written new snapshot.
  await chrome.storage.sync.set(entries);
  const current = await readHead();
  if ((current?.snapshot ?? null) !== (old?.snapshot ?? null)) {
    await chrome.storage.sync.remove(Object.keys(entries));
    throw new Error('A second browser updated the vault. Sync again to merge changes.');
  }
  await chrome.storage.sync.set({ [HEAD]: head });
  if (old) {
    const oldKeys = Array.from({ length: old.parts }, (_, index) => partKey(old, index));
    await chrome.storage.sync.remove(oldKeys).catch(() => {});
  }
}

let running: Promise<SyncResult> | null = null;

/** Sync changes in both directions; doesn't touch local storage on a bad passphrase. */
export function syncNow(): Promise<SyncResult> {
  if (running) return running;
  running = (async () => {
    const key = await activeKey();
    if (!key) throw new Error('Unlock Chrome Sync in Manage applicants first.');
    const head = await readHead();
    if (!head) throw new Error('No Chrome Sync vault exists. Create it on your first browser.');
    const remote = await readRemote(key, head);
    const local = await readLocal();
    const merged = mergeSnapshots(local, remote);
    const localDifferent = JSON.stringify(canonical(local)) !== JSON.stringify(merged);
    const remoteDifferent = JSON.stringify(canonical(remote)) !== JSON.stringify(merged);
    if (remoteDifferent) await publish(key, head.salt, merged, head);
    if (localDifferent) {
      const selected = await chrome.storage.local.get('activeVisaProfileId');
      const writes: Record<string, unknown> = {
        [STORAGE_KEY_PROFILES]: merged.profiles,
        [STORAGE_KEY_DELETED_PROFILES]: merged.deleted,
      };
      if (!merged.profiles.some((p) => p.id === selected.activeVisaProfileId) && merged.profiles.length)
        writes.activeVisaProfileId = merged.profiles[0].id;
      await chrome.storage.local.set(writes);
    }
    return { total: merged.profiles.length, downloaded: localDifferent ? 1 : 0, uploaded: remoteDifferent };
  })().finally(() => { running = null; });
  return running;
}

export async function getSyncState(): Promise<{ hasVault: boolean; unlocked: boolean }> {
  const [head, key] = await Promise.all([readHead(), activeKey()]);
  return { hasVault: !!head, unlocked: !!key };
}

export async function enableOrUnlockSync(password: string): Promise<SyncResult> {
  if (password.length < 12) throw new Error('Choose a sync password with at least 12 characters.');
  // Prevent content scripts on the visa webpage from accessing sync payloads.
  await chrome.storage.sync.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const head = await readHead();
  const salt = head?.salt ?? toB64(freshBytes(16));
  const key = await deriveKey(password, salt);
  if (head) {
    await readRemote(key, head); // Authenticate before storing an unlock key.
    await saveKey(key);
    return syncNow();
  }
  const snapshot = await readLocal();
  await publish(key, salt, snapshot, null);
  await saveKey(key);
  return { total: snapshot.profiles.length, downloaded: 0, uploaded: true };
}

export async function lockSync(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY);
}
