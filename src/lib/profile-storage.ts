export const STORAGE_KEY_PROFILE_YAML = 'profileYaml';
export const STORAGE_KEY_ENTRY_DATE = 'lastEntryDate';
export const STORAGE_KEY_STAY_DAYS = 'profileStayDays';

export async function loadProfileYaml(): Promise<string> {
  const stored = await chrome.storage.local.get(STORAGE_KEY_PROFILE_YAML);
  if (typeof stored[STORAGE_KEY_PROFILE_YAML] === 'string' && stored[STORAGE_KEY_PROFILE_YAML].trim()) {
    return stored[STORAGE_KEY_PROFILE_YAML];
  }

  const url = chrome.runtime.getURL('profile.form.yaml');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load profile template (${response.status})`);
  }
  return response.text();
}

export async function saveProfileYaml(yaml: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_PROFILE_YAML]: yaml });
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

export function parseStayDaysFromYaml(yaml: string): number | null {
  const match = yaml.match(/length_of_stay_days:\s*"?(\d+)"?/);
  return match ? Number(match[1]) || null : null;
}
