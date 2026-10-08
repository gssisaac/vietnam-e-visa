import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, FilePlus2, FileText, Plus, RotateCcw, Save, Trash2, Upload, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { YamlEditor } from '@/components/YamlEditor';
import { LLM_PROFILE_PROMPT, PROFILE_SETUP_STEPS } from '@/lib/llm-prompt';
import {
  createProfile, deleteProfile, downloadProfileYaml, duplicateProfile,
  exportProfileYaml, exportProfilesYaml, importProfilesYaml, isVisaCompleted, parseProfilesYaml,
  getProfileLabel, loadActiveProfileId, loadProfiles, saveProfileYaml,
  PROFILE_BLANK_TEMPLATE_FILE, PROFILE_EXAMPLE_FILE,
  setActiveProfileId, type StoredProfile,
} from '@/lib/profile-storage';
import { parseYaml, stringifyYaml, type VisaProfile } from '@/lib/yaml';
import { normalizePurposeOfEntry } from '@/lib/shared';
import { enableOrUnlockSync, getSyncState, lockSync, syncNow } from '@/lib/profile-sync';

type Kind = 'text' | 'date' | 'number' | 'check' | 'select' | 'area';
type Field = { path: string; label: string; kind?: Kind; options?: string[]; choices?: string };
type Section = { title: string; description: string; fields: Field[] };
type Repeater = { path: string; title: string; description: string; fields: Field[]; scalar?: boolean };
type DataMap = Record<string, unknown>;

const SELECT = 'select' as const;
const DATE = 'date' as const;
const CHECK = 'check' as const;

const SECTIONS: Section[] = [
  {
    title: 'Personal information',
    description: 'Enter names exactly as printed in the passport.',
    fields: [
      { path: 'personal_information.surname', label: 'Surname / family name' },
      { path: 'personal_information.given_name', label: 'Given name(s)' },
      { path: 'personal_information.date_of_birth', label: 'Date of birth', kind: DATE },
      { path: 'personal_information.date_of_birth_mode', label: 'Date precision', kind: SELECT, options: ['full', 'year_only'] },
      { path: 'personal_information.sex', label: 'Sex', kind: SELECT, options: ['Male', 'Female'] },
      { path: 'personal_information.nationality', label: 'Nationality', kind: SELECT, choices: 'nationality' },
      { path: 'personal_information.identity_card', label: 'Identity card (if applicable)' },
      { path: 'personal_information.email', label: 'Email' },
      { path: 'personal_information.religion', label: 'Religion' },
      { path: 'personal_information.place_of_birth', label: 'Place of birth' },
      { path: 'personal_information.agree_create_account', label: 'Agree to create account by email', kind: CHECK },
      { path: 'personal_information.used_other_passports', label: 'Previously used other passports', kind: CHECK },
      { path: 'personal_information.multiple_nationalities', label: 'Multiple nationalities', kind: CHECK },
      { path: 'personal_information.legal_violation', label: 'Violation of Vietnamese law', kind: CHECK },
    ],
  },
  {
    title: 'Passport',
    description: 'Check all passport numbers and issue dates carefully.',
    fields: [
      { path: 'passport_information.number', label: 'Passport number' },
      { path: 'passport_information.issuing_authority', label: 'Issuing authority' },
      { path: 'passport_information.type', label: 'Passport type', kind: SELECT, options: ['Ordinary passport', 'Diplomatic passport', 'Official passport', 'Other'] },
      { path: 'passport_information.date_of_issue', label: 'Date of issue', kind: DATE },
      { path: 'passport_information.expiry_date', label: 'Expiry date', kind: DATE },
      { path: 'passport_information.other_valid_passports', label: 'Other valid passports', kind: CHECK },
    ],
  },
  {
    title: 'Contact & emergency contact',
    description: 'Contact details for this applicant.',
    fields: [
      { path: 'contact_information.permanent_address', label: 'Permanent address', kind: 'area' },
      { path: 'contact_information.contact_address', label: 'Contact address', kind: 'area' },
      { path: 'contact_information.telephone', label: 'Telephone' },
      { path: 'contact_information.emergency_contact.full_name', label: 'Emergency contact name' },
      { path: 'contact_information.emergency_contact.address', label: 'Emergency contact address', kind: 'area' },
      { path: 'contact_information.emergency_contact.telephone', label: 'Emergency contact telephone' },
      { path: 'contact_information.emergency_contact.relationship', label: 'Relationship' },
    ],
  },
  {
    title: 'Occupation',
    description: 'Employment or other professional information.',
    fields: [
      { path: 'occupation.occupation', label: 'Occupation (exact English option on the visa website)' },
      { path: 'occupation.occupation_info', label: 'Occupation details' },
      { path: 'occupation.company_name', label: 'Company name' },
      { path: 'occupation.position', label: 'Position' },
      { path: 'occupation.company_address', label: 'Company address', kind: 'area' },
      { path: 'occupation.company_phone', label: 'Company phone' },
    ],
  },
  {
    title: 'Trip & visa',
    description: 'The popup reads the intended entry date from here. Validity dates update automatically.',
    fields: [
      { path: 'requested_information.entry_type', label: 'Entry type', kind: SELECT, options: ['single', 'multiple'] },
      { path: 'trip_information.purpose_of_entry', label: 'Purpose of entry', kind: SELECT, choices: 'purpose_of_entry' },
      { path: 'trip_information.intended_entry_date', label: 'Intended entry date', kind: DATE },
      { path: 'trip_information.length_of_stay_days', label: 'Length of stay (days)', kind: 'number' },
      { path: 'trip_information.phone_in_vietnam', label: 'Phone in Vietnam' },
      { path: 'trip_information.residential_address', label: 'Residential address / hotel in Vietnam', kind: 'area' },
      { path: 'trip_information.province_city', label: 'Province / city', kind: SELECT, choices: 'province_city' },
      { path: 'trip_information.ward_commune', label: 'Ward / commune' },
      { path: 'trip_information.border_gate_entry', label: 'Port of entry', kind: SELECT, choices: 'border_gate_entry' },
      { path: 'trip_information.border_gate_exit', label: 'Port of exit', kind: SELECT, choices: 'border_gate_exit' },
      { path: 'trip_information.temporary_residence_commitment', label: 'Temporary residence commitment', kind: CHECK },
      { path: 'trip_information.contact_agency_in_vietnam', label: 'Contact with an agency in Vietnam', kind: CHECK },
      { path: 'trip_information.visited_vietnam_last_year', label: 'Visited Vietnam in the last year', kind: CHECK },
      { path: 'trip_information.relatives_in_vietnam', label: 'Relatives in Vietnam', kind: CHECK },
    ],
  },
  {
    title: 'Trip expenses & insurance',
    description: 'Financing, insurance and payment method.',
    fields: [
      { path: 'trip_expenses.intended_expenses_usd', label: 'Intended expenses (USD)', kind: 'number' },
      { path: 'trip_expenses.bought_insurance', label: 'Travel insurance', kind: SELECT, options: ['Yes', 'No'] },
      { path: 'trip_expenses.insurance_specify', label: 'Insurance details' },
      { path: 'trip_expenses.expense_covered_by', label: 'Expenses covered by', kind: SELECT, options: ['Personal', 'Company'] },
      { path: 'trip_expenses.payment_method', label: 'Payment method', kind: SELECT, options: ['Cash', 'Credit card'] },
      { path: 'trip_expenses.cover_company.name', label: 'Paying company name' },
      { path: 'trip_expenses.cover_company.address', label: 'Paying company address' },
      { path: 'trip_expenses.cover_company.telephone', label: 'Paying company phone' },
      { path: 'declarations.final_declaration', label: 'Confirm accuracy of the application', kind: CHECK },
    ],
  },
];

const REPEATERS: Repeater[] = [
  {
    path: 'personal_information.used_passports', title: 'Previously used passports',
    description: 'Only if previously used other passports is enabled.',
    fields: [
      { path: 'number', label: 'Passport number' },
      { path: 'full_name', label: 'Full name' },
      { path: 'date_of_birth', label: 'Date of birth', kind: DATE },
      { path: 'nationality', label: 'Nationality', kind: SELECT, choices: 'nationality' },
    ],
  },
  {
    path: 'personal_information.other_nationalities', title: 'Additional nationalities',
    description: 'Only if multiple nationalities is enabled.',
    fields: [{ path: 'value', label: 'Additional nationality', kind: SELECT, choices: 'nationality' }], scalar: true,
  },
  {
    path: 'passport_information.other_passports', title: 'Other valid passport',
    description: 'The official form currently accepts one additional valid passport.',
    fields: [
      { path: 'type', label: 'Passport type', kind: SELECT, options: ['Ordinary passport', 'Diplomatic passport', 'Official passport', 'Other'] },
      { path: 'specify', label: 'Specify passport type' },
      { path: 'number', label: 'Number' },
      { path: 'issuing_authority', label: 'Issuing authority' },
      { path: 'date_of_issue', label: 'Date of issue', kind: DATE },
      { path: 'expiry_date', label: 'Expiry date', kind: DATE },
    ],
  },
  {
    path: 'vietnam_visits_last_year', title: 'Previous Vietnam visits',
    description: 'For visits in the last 12 months.',
    fields: [
      { path: 'from_date', label: 'From', kind: DATE },
      { path: 'to_date', label: 'To', kind: DATE },
      { path: 'purpose', label: 'Purpose' },
    ],
  },
  {
    path: 'accompanying_children', title: 'Accompanying children',
    description: 'Only children travelling on this same application, not separately applying children. Their photos are uploaded manually.',
    fields: [
      { path: 'full_name', label: 'Full name' },
      { path: 'sex', label: 'Sex', kind: SELECT, options: ['Male', 'Female'] },
      { path: 'date_of_birth', label: 'Date of birth', kind: DATE },
    ],
  },
];

function getAt(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    return current && typeof current === 'object' && !Array.isArray(current)
      ? (current as DataMap)[key] : undefined;
  }, obj);
}
function setAt(obj: DataMap, path: string, value: unknown) {
  const keys = path.split('.');
  let cursor = obj;
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) cursor[key] = {};
    cursor = cursor[key] as DataMap;
  }
  cursor[keys[keys.length - 1]] = value;
}
function toIso(value: unknown): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value ?? ''));
  return match ? match[3] + '-' + match[2] + '-' + match[1] : '';
}
function toVisaDate(value: string): string {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return day + '/' + month + '/' + year;
}
function choicesFor(field: Field, reference: DataMap, current: string): string[] {
  const stored = field.choices ? reference[field.choices] : undefined;
  const values = Array.isArray(stored) ? stored.map(String) : (field.options || []);
  return current && !values.includes(current) ? [current, ...values] : values;
}

export function EditorApp() {
  const [profiles, setProfiles] = useState<StoredProfile[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<VisaProfile>({});
  const [savedDraft, setSavedDraft] = useState('');
  const [reference, setReference] = useState<DataMap>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(false);
  const [importYaml, setImportYaml] = useState(''); // Advanced: edit the selected applicant
  const [bulkImportText, setBulkImportText] = useState('');
  const [importPanelOpen, setImportPanelOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [syncPassword, setSyncPassword] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncUnlocked, setSyncUnlocked] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [rawYamlDraft, setRawYamlDraft] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const currentYaml = stringifyYaml(draft);
  const isDirty = currentYaml !== savedDraft;
  const selectedProfile = profiles.find((profile) => profile.id === selectedId);

  function openProfile(profile: StoredProfile) {
    const parsed = parseYaml(profile.yaml);
    const original = stringifyYaml(parsed);
    const trip = parsed.trip_information as DataMap | undefined;
    if (trip && 'purpose_of_entry' in trip) {
      // Flag a legacy "Tourism" value as an unsaved edit so the user can
      // explicitly save the current "Tourist" value without losing data.
      trip.purpose_of_entry = normalizePurposeOfEntry(trip.purpose_of_entry);
    }
    setSelectedId(profile.id);
    setDraft(parsed);
    setSavedDraft(original);
    setStatus('');
    setImportYaml('');
    setRawYamlDraft(null);
  }

  useEffect(() => {
    async function init() {
      try {
        const list = await loadProfiles();
        setProfiles(list);
        const id = await loadActiveProfileId();
        openProfile(list.find((profile) => profile.id === id) || list[0]);
        const response = await fetch(chrome.runtime.getURL('data/select-options.yaml'));
        if (response.ok) setReference(parseYaml(await response.text()));
        const sync = await getSyncState();
        setSyncEnabled(sync.hasVault);
        setSyncUnlocked(sync.unlocked);
      } catch (err) {
        setStatus('Could not load applicants: ' + String(err));
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, []);

  async function unlockSync() {
    if (!syncPassword || syncBusy) return;
    if (isDirty && !(await saveCurrent())) return;
    setSyncBusy(true);
    try {
      const result = await enableOrUnlockSync(syncPassword);
      setSyncPassword('');
      setSyncEnabled(true);
      setSyncUnlocked(true);
      const list = await loadProfiles();
      setProfiles(list);
      openProfile(list.find((p) => p.id === selectedId) || list[0]);
      setSyncStatus('Encrypted Chrome Sync active: ' + result.total + ' applicant(s).');
    } catch (err) {
      setSyncStatus('Sync could not be enabled: ' + String(err));
    } finally { setSyncBusy(false); }
  }

  async function refreshSync() {
    if (isDirty && !(await saveCurrent())) return;
    setSyncBusy(true);
    try {
      const result = await syncNow();
      const list = await loadProfiles();
      setProfiles(list);
      openProfile(list.find((p) => p.id === selectedId) || list[0]);
      setSyncStatus('Sync complete: ' + result.total + ' applicant(s).');
    } catch (err) {
      setSyncStatus('Sync failed: ' + String(err));
    } finally { setSyncBusy(false); }
  }

  async function doLockSync() {
    await lockSync();
    setSyncUnlocked(false);
    setSyncPassword('');
    setSyncStatus('Sync locked. Local profiles remain available.');
  }

  async function saveCurrent(): Promise<boolean> {
    try {
      if (!selectedId) return false;
      const yaml = stringifyYaml(draft);
      parseYaml(yaml); // Verify that all edited fields can round-trip.
      await saveProfileYaml(yaml, selectedId);
      setProfiles((list) => list.map((profile) => profile.id === selectedId ? { ...profile, yaml } : profile));
      setSavedDraft(yaml);
      setError(false);
      setStatus('Applicant saved locally.');
      return true;
    } catch (err) {
      setError(true);
      setStatus('Save failed: ' + String(err));
      return false;
    }
  }

  async function switchProfile(id: string) {
    const next = profiles.find((profile) => profile.id === id);
    if (!next || id === selectedId) return;
    if (isDirty && !(await saveCurrent())) return;
    await setActiveProfileId(id);
    openProfile(next);
  }

  async function addNew() {
    if (isDirty && !(await saveCurrent())) return;
    try {
      const profile = await createProfile();
      setProfiles(await loadProfiles());
      openProfile(profile);
    } catch (err) { setStatus(String(err)); setError(true); }
  }

  async function duplicate() {
    if (isDirty && !(await saveCurrent())) return;
    try {
      const profile = await duplicateProfile(currentYaml);
      setProfiles(await loadProfiles());
      openProfile(profile);
      setStatus('Copy created. Enter the new person’s name, birth date and passport details, then verify all other fields.');
      setError(false);
    } catch (err) { setStatus(String(err)); setError(true); }
  }

  async function removeCurrent() {
    if (!selectedId || profiles.length < 2) return;
    if (!window.confirm('Delete this applicant and their locally stored data?')) return;
    try {
      await deleteProfile(selectedId);
      const list = await loadProfiles();
      setProfiles(list);
      openProfile(list[0]);
    } catch (err) { setStatus(String(err)); setError(true); }
  }

  async function exportAll() {
    if (isDirty && !(await saveCurrent())) return;
    try {
      const latest = await loadProfiles();
      downloadProfileYaml(exportProfilesYaml(latest), 'vietnam-evisa-all-applicants.yaml');
      setStatus('Exported ' + latest.length + ' applicants to one YAML file.');
      setError(false);
    } catch (err) { setStatus('Export failed: ' + String(err)); setError(true); }
  }

  async function addImportedApplicants(yaml: string) {
    // Validate the complete input before making any storage changes.
    parseProfilesYaml(yaml);
    if (isDirty && !(await saveCurrent())) {
      throw new Error('Save the current applicant before importing.');
    }

    const added = await importProfilesYaml(yaml);
    setProfiles(await loadProfiles());
    openProfile(added[0]);
    setBulkImportText('');
    setImportPanelOpen(false);
    setStatus('Imported ' + added.length + ' applicant(s). Existing profiles were preserved.');
    setError(false);
  }

  async function importPastedYaml() {
    if (!bulkImportText.trim() || importing) return;
    setImporting(true);
    try {
      await addImportedApplicants(bulkImportText);
    } catch (err) {
      setStatus('Import failed: ' + String(err) + ' No applicants were added.');
      setError(true);
    } finally {
      setImporting(false);
    }
  }

  async function importFiles(files: FileList | null) {
    if (!files?.length || importing) return;
    setImporting(true);
    try {
      const contents = await Promise.all(Array.from(files).map(async (file) => {
        if (file.size > 2_000_000) throw new Error(file.name + ' is too large (maximum 2 MB).');
        return file.text();
      }));
      // Individual files and multi-document YAML files use the same importer
      // as pasted text. Validate every file before adding any applicants.
      const documents = contents.flatMap((yaml) => parseProfilesYaml(yaml));
      await addImportedApplicants(documents.map((data) => stringifyYaml(data)).join('\n---\n'));
    } catch (err) {
      setStatus('Import failed: ' + String(err) + ' No applicants were added.');
      setError(true);
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  }

  function changeField(path: string, value: unknown) {
    setDraft((previous) => {
      const next = structuredClone(previous);
      setAt(next, path, value);
      return next;
    });
  }

  function changeEntryDate(value: string) {
    setDraft((previous) => {
      const next = structuredClone(previous);
      setAt(next, 'trip_information.intended_entry_date', toVisaDate(value));
      const days = Number(getAt(next, 'trip_information.length_of_stay_days'));
      if (!value) {
        setAt(next, 'requested_information.valid_from', '');
        setAt(next, 'requested_information.valid_to', '');
      } else if (Number.isInteger(days) && days > 0) {
        const date = new Date(value + 'T00:00:00Z');
        date.setUTCDate(date.getUTCDate() + days - 1);
        setAt(next, 'requested_information.valid_from', toVisaDate(value));
        setAt(next, 'requested_information.valid_to', toVisaDate(date.toISOString().slice(0, 10)));
      }
      return next;
    });
  }

  function changeDays(value: string) {
    setDraft((previous) => {
      const next = structuredClone(previous);
      setAt(next, 'trip_information.length_of_stay_days', value);
      const entry = toIso(getAt(next, 'trip_information.intended_entry_date'));
      const days = Number(value);
      if (!value || !Number.isInteger(days) || days <= 0) {
        setAt(next, 'requested_information.valid_to', '');
      } else if (entry) {
        const date = new Date(entry + 'T00:00:00Z');
        date.setUTCDate(date.getUTCDate() + days - 1);
        setAt(next, 'requested_information.valid_from', toVisaDate(entry));
        setAt(next, 'requested_information.valid_to', toVisaDate(date.toISOString().slice(0, 10)));
      }
      return next;
    });
  }

  function changeRepeater(path: string, index: number, field: string, value: unknown, scalar = false) {
    setDraft((previous) => {
      const next = structuredClone(previous);
      const rows = [...((getAt(next, path) as unknown[]) || [])];
      if (scalar) rows[index] = value;
      else rows[index] = { ...(rows[index] as DataMap), [field]: value };
      setAt(next, path, rows);
      return next;
    });
  }

  function addRepeater(repeater: Repeater) {
    setDraft((previous) => {
      const next = structuredClone(previous);
      const rows = [...((getAt(next, repeater.path) as unknown[]) || [])];
      const row: unknown = repeater.scalar
        ? ''
        : Object.fromEntries(repeater.fields.map((field) => [field.path, '']));
      rows.push(row);
      setAt(next, repeater.path, rows);
      return next;
    });
  }

  function removeRepeater(path: string, index: number) {
    setDraft((previous) => {
      const next = structuredClone(previous);
      const rows = [...((getAt(next, path) as unknown[]) || [])];
      rows.splice(index, 1);
      setAt(next, path, rows);
      return next;
    });
  }

  function fieldInput(field: Field, value: unknown, onChange: (value: unknown) => void) {
    const current = value == null ? '' : String(value);
    const id = field.path;
    if (field.kind === CHECK) {
      return (
        <label className="flex items-center gap-3 rounded-md border p-3 text-sm" key={id}>
          <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} className="size-4" />
          <span>{field.label}</span>
        </label>
      );
    }
    if (field.kind === SELECT) {
      return (
        <div className="space-y-1.5" key={id}>
          <Label>{field.label}</Label>
          <select value={current} onChange={(event) => onChange(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">— Select —</option>
            {choicesFor(field, reference, current).map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
      );
    }
    return (
      <div className="space-y-1.5" key={id}>
        <Label>{field.label}</Label>
        {field.kind === 'area'
          ? <textarea rows={2} value={current} onChange={(event) => onChange(event.target.value)}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm" />
          : <Input type={field.kind === DATE ? 'date' : field.kind === 'number' ? 'number' : 'text'}
              value={field.kind === DATE ? toIso(current) : current}
              min={field.kind === 'number' ? 0 : undefined}
              onChange={(event) => onChange(field.kind === DATE ? toVisaDate(event.target.value) : event.target.value)} />}
      </div>
    );
  }

  function renderSection(section: Section, index: number) {
    return (
      <details key={section.title} open={index < 2} className="group rounded-xl border bg-card">
        <summary className="cursor-pointer select-none px-5 py-4 font-semibold">{section.title}</summary>
        <div className="space-y-4 border-t px-5 py-5">
          <p className="text-sm text-muted-foreground">{section.description}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {section.fields.map((field) => fieldInput(field, getAt(draft, field.path), (value) => {
              if (field.path === 'trip_information.intended_entry_date') changeEntryDate(toIso(value));
              else if (field.path === 'trip_information.length_of_stay_days') changeDays(String(value));
              else changeField(field.path, value);
            }))}
          </div>
        </div>
      </details>
    );
  }

  function renderRepeater(repeater: Repeater) {
    const rows = (getAt(draft, repeater.path) as unknown[]) || [];
    return (
      <details key={repeater.path} className="rounded-xl border bg-card">
        <summary className="cursor-pointer px-5 py-4 font-semibold">{repeater.title} ({rows.length})</summary>
        <div className="space-y-4 border-t px-5 py-5">
          <p className="text-sm text-muted-foreground">{repeater.description}</p>
          {rows.map((row, index) => (
            <div key={index} className="rounded-lg border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between text-sm font-medium">
                <span>Entry {index + 1}</span>
                <Button variant="outline" size="sm" onClick={() => removeRepeater(repeater.path, index)}><Trash2 />Remove</Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {repeater.fields.map((field) => fieldInput(field, repeater.scalar ? row : (row as DataMap)?.[field.path],
                  (value) => changeRepeater(repeater.path, index, field.path, value, repeater.scalar)))}
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => addRepeater(repeater)}
            disabled={repeater.path === 'passport_information.other_passports' && rows.length >= 1}>
            <Plus />Add entry
          </Button>
        </div>
      </details>
    );
  }

  async function loadYamlTemplate(fileName: string, description: string) {
    if (!window.confirm('Load ' + description + ' into the selected applicant? The current unsaved form edits will be replaced.')) return;
    try {
      const response = await fetch(chrome.runtime.getURL(fileName));
      if (!response.ok) throw new Error('Could not load ' + fileName);
      const documents = parseProfilesYaml(await response.text());
      if (documents.length !== 1) throw new Error('Expected a single YAML template.');
      setDraft(documents[0]);
      setRawYamlDraft(null);
      setStatus(description + ' loaded into the form. Review it and click Save applicant.');
      setError(false);
    } catch (err) { setStatus('Template failed: ' + String(err)); setError(true); }
  }

  function applyRawYaml() {
    try {
      const documents = parseProfilesYaml(rawYamlDraft ?? currentYaml);
      if (documents.length !== 1) throw new Error('Edit one applicant here; use Import YAML for multiple people.');
      setDraft(documents[0]);
      setRawYamlDraft(null);
      setStatus('Raw YAML applied to the form. Review and click Save applicant.');
      setError(false);
    } catch (err) { setStatus('YAML is invalid: ' + String(err)); setError(true); }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(LLM_PROFILE_PROMPT);
      setPromptCopied(true);
    } catch (err) { setStatus('Could not copy prompt: ' + String(err)); setError(true); }
  }

  function importProfile() {
    try {
      const documents = parseProfilesYaml(importYaml);
      if (documents.length !== 1) throw new Error('This action edits one applicant. Use Import YAML at the top to add multiple profiles.');
      setDraft(documents[0]);
      setStatus('YAML imported into the form. Review it and click Save.');
      setError(false);
    } catch (err) { setStatus('Import failed: ' + String(err)); setError(true); }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vietnam e-Visa applicants</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage each traveller separately. The extension stores one YAML document per applicant locally in Chrome.
          </p>
        </div>
        <Tabs defaultValue="applicants" className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="applicants">Applicant profiles</TabsTrigger>
            <TabsTrigger value="instructions">Instructions</TabsTrigger>
            <TabsTrigger value="llm-prompt">LLM Q&amp;A Prompt</TabsTrigger>
            <TabsTrigger value="sync">Sync</TabsTrigger>
          </TabsList>
          <TabsContent value="applicants" className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="size-5" />Applicant profiles</CardTitle>
            <CardDescription>Duplicate an existing applicant to reuse the itinerary, addresses and shared contact details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-52 flex-1 space-y-1.5">
                <Label htmlFor="person">Selected applicant</Label>
                <select id="person" disabled={loading} value={selectedId}
                  onChange={(event) => void switchProfile(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{isVisaCompleted(profile.yaml) ? '✓ ' : ''}{getProfileLabel(profile)}</option>)}
                </select>
              </div>
              <Button variant="outline" onClick={() => void addNew()} disabled={loading}><FilePlus2 />New person</Button>
              <Button variant="outline" onClick={() => void duplicate()} disabled={loading || !selectedId}><Copy />Duplicate</Button>
              <Button variant="outline" onClick={() => void removeCurrent()} disabled={loading || profiles.length < 2}><Trash2 />Delete</Button>
              <Button variant="outline" disabled={loading || importing}
                onClick={() => setImportPanelOpen((open) => !open)}>
                <Upload />Import YAML
              </Button>
              <Button variant="outline" disabled={loading || !profiles.length} onClick={() => void exportAll()}>
                <Download />Export all
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Duplicate clears personal/passport details and resets the completion status.
              Imported applicants are added without overwriting existing profiles.
            </p>
            {importPanelOpen ? (
              <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                <div>
                  <h3 className="text-sm font-semibold">Import applicant YAML</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Paste YAML below or choose one or more files. A single applicant and
                    multiple applicants separated by a line containing --- are both supported.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bulk-yaml-import">Paste YAML</Label>
                  <textarea id="bulk-yaml-import" rows={9} spellCheck={false}
                    value={bulkImportText} onChange={(event) => setBulkImportText(event.target.value)}
                    placeholder={'---\npersonal_information:\n  surname: "DOE"\n  given_name: "JANE"\npassport_information:\n  number: "A12345678"'}
                    className="w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-xs"
                    disabled={importing} />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void importPastedYaml()}
                      disabled={importing || !bulkImportText.trim()}>
                      <Upload />{importing ? 'Importing…' : 'Import pasted YAML'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setBulkImportText('')}
                      disabled={importing || !bulkImportText}>
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <div>
                    <Label htmlFor="yaml-files">Or import YAML files</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Select .yaml, .yml or .txt files (multiple selection allowed).
                    </p>
                  </div>
                  <input ref={importFileRef} id="yaml-files" type="file" className="sr-only"
                    accept=".yaml,.yml,.txt,text/yaml" multiple
                    onChange={(event) => void importFiles(event.target.files)} />
                  <Button variant="outline" size="sm" disabled={importing}
                    onClick={() => importFileRef.current?.click()}>
                    <Upload />Choose files
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>


        {status && <p role="status" className={error ? 'text-sm text-destructive' : 'text-sm text-emerald-700 dark:text-emerald-400'}>{status}</p>}
        {loading ? <p>Loading applicant profiles…</p> : selectedProfile ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{getProfileLabel({ ...selectedProfile, yaml: currentYaml })}</h2>
                <p className="text-xs text-muted-foreground">{isDirty ? 'Unsaved changes' : 'All changes saved'}</p>
              </div>
              <Button onClick={() => void saveCurrent()} disabled={!isDirty}><Save />Save applicant</Button>
            </div>
            <div className="space-y-3">
              {SECTIONS.map(renderSection)}
              <h2 className="pt-4 text-lg font-semibold">Additional information</h2>
              {REPEATERS.map(renderRepeater)}
            </div>
            <div className="flex justify-end"><Button onClick={() => void saveCurrent()} disabled={!isDirty}><Save />Save applicant</Button></div>
            <details className="rounded-xl border bg-card">
              <summary className="cursor-pointer px-5 py-4 font-semibold">Advanced: YAML import / export</summary>
              <div className="space-y-4 border-t p-5">
                <p className="text-sm text-muted-foreground">
                  The form above edits YAML internally. Use these tools only when importing a previous YAML profile or creating a backup.
                  Never upload passport information to a public GitHub repository.
                </p>
                <Button variant="outline" onClick={() => downloadProfileYaml(exportProfileYaml({ ...selectedProfile, yaml: currentYaml }), 'evisa-' + selectedId + '.yaml')}>
                  <Download />Export this person's YAML
                </Button>
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Raw YAML editor (selected applicant)</summary>
                  <div className="mt-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Original YAML editor with syntax highlighting. Apply changes to the form,
                      then click Save applicant. This only edits the currently selected person.
                    </p>
                    <YamlEditor value={rawYamlDraft ?? currentYaml} onChange={setRawYamlDraft} height="400px" />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={applyRawYaml} disabled={rawYamlDraft === null}>
                        <Save />Apply YAML to form
                      </Button>
                      <Button variant="outline" size="sm"
                        onClick={() => void loadYamlTemplate(PROFILE_EXAMPLE_FILE, 'Example profile')}>
                        <FileText />Load example
                      </Button>
                      <Button variant="outline" size="sm"
                        onClick={() => void loadYamlTemplate(PROFILE_BLANK_TEMPLATE_FILE, 'Blank template')}>
                        <RotateCcw />Reset template
                      </Button>
                    </div>
                  </div>
                </details>
                <div className="space-y-2">
                  <Label>Import YAML into selected applicant (not saved until you click Save)</Label>
                  <textarea value={importYaml} onChange={(event) => setImportYaml(event.target.value)} rows={6}
                    placeholder="Paste a YAML profile here…" className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs" />
                  <Button variant="outline" onClick={importProfile} disabled={!importYaml.trim()}><Upload />Import YAML</Button>
                </div>
              </div>
            </details>
          </>
        ) : null}
          </TabsContent>

          <TabsContent value="instructions">
            <Card>
              <CardHeader>
                <CardTitle>How to set up your e-Visa profiles</CardTitle>
                <CardDescription>The original instructions, updated for multiple applicants.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <ol className="space-y-4">
                  {PROFILE_SETUP_STEPS.map((step, index) => (
                    <li key={step.title} className="flex gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium">{step.title}</p>
                        <p className="text-sm text-muted-foreground">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="space-y-2 border-t pt-4">
                  <h3 className="font-medium">YAML &amp; official dropdown labels</h3>
                  <p className="text-sm text-muted-foreground">
                    Dates use DD/MM/YYYY. Values for nationality, province, ward and border gate must
                    match the official English choices. The reference file is data/select-options.yaml.
                    Use the raw YAML editor under Advanced to manually adjust a single applicant.
                  </p>
                </div>
                <div className="space-y-2">
                  <h3 className="font-medium">Working with ChatGPT</h3>
                  <p className="text-sm text-muted-foreground">
                    Open the LLM Q&amp;A Prompt tab, copy the prompt and paste it into ChatGPT or Claude.
                    Answer questions one at a time and paste the resulting YAML into Applicant profiles → Import YAML.
                    Multiple people can be imported together with the --- YAML document separator.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="llm-prompt">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Q&amp;A prompt for ChatGPT or Claude</CardTitle>
                  <CardDescription className="mt-1">
                    Copy the prompt to generate complete YAML for one or more family members.
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => void copyPrompt()}>
                  {promptCopied ? <Check /> : <Copy />}{promptCopied ? 'Copied' : 'Copy prompt'}
                </Button>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-4 font-mono text-xs leading-relaxed">
                  {LLM_PROFILE_PROMPT}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sync" className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Encrypted Chrome Sync</CardTitle>
            <CardDescription>
              Optional sync between Chrome installations using the same Google account,
              Chrome Sync enabled, and the same extension ID.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Visa and passport details are encrypted with your own password before
              entering Chrome Sync. Your password is not saved. Unlock once per Chrome session.
              The existing local profiles remain on this computer.
            </p>
            {syncUnlocked ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Sync unlocked — changes sync automatically.</span>
                <Button variant="outline" size="sm" disabled={syncBusy} onClick={() => void refreshSync()}>
                  Sync now
                </Button>
                <Button variant="outline" size="sm" disabled={syncBusy} onClick={() => void doLockSync()}>
                  Lock
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-56 flex-1 space-y-1">
                  <Label htmlFor="chrome-sync-password">Sync password (at least 12 characters)</Label>
                  <Input id="chrome-sync-password" type="password"
                    autoComplete="new-password" value={syncPassword}
                    onChange={(event) => setSyncPassword(event.target.value)}
                    placeholder={syncEnabled ? 'Enter your existing sync password' : 'Create a new sync password'} />
                </div>
                <Button disabled={syncBusy || syncPassword.length < 12}
                  onClick={() => void unlockSync()}>
                  {syncBusy ? 'Connecting…' : syncEnabled ? 'Unlock and sync' : 'Enable encrypted sync'}
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Important: unpacked extensions can have different IDs depending on the
              installation path. Check the extension ID in chrome://extensions on both browsers.
              Different IDs cannot share Chrome Sync data. No server or password recovery is provided.
              Keep an exported YAML backup.
            </p>
            {syncStatus ? <p role="status" className="text-sm">{syncStatus}</p> : null}
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
