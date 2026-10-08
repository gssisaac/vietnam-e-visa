import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getProfileEntryDate,
  getProfileLabel,
  isVisaCompleted,
  loadActiveProfileId,
  loadProfileYaml,
  loadProfiles,
  parseStayDaysFromYaml,
  saveProfileYaml,
  setActiveProfileId,
  withEntryDate,
  withVisaCompleted,
  type StoredProfile,
} from '@/lib/profile-storage';
import { formatVisaRange, isEvisaSiteUrl, isForeignersUrl } from '@/lib/shared';

interface FillResponse {
  ok: boolean;
  error?: string;
  result?: {
    filled: number;
    skipped: string[];
    errors: string[];
    appliedDates?: {
      entry: string;
      validFrom: string;
      validTo: string;
      stayDays: number;
    };
  };
}

export function PopupApp() {
  const [profiles, setProfiles] = useState<StoredProfile[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [stayDays, setStayDays] = useState(90);
  const [status, setStatus] = useState('Checking page...');
  const [statusTone, setStatusTone] = useState<'default' | 'ready' | 'error'>('default');
  const [fillDisabled, setFillDisabled] = useState(true);
  const [pageState, setPageState] = useState<'checking' | 'outside' | 'inside'>('checking');
  const [result, setResult] = useState<string | null>(null);
  const [completionSaving, setCompletionSaving] = useState(false);
  const [resultTone, setResultTone] = useState<'success' | 'partial' | 'error'>('success');

  useEffect(() => { void init(); }, []);

  async function connectToTab(tabId: number) {
    const response = await chrome.runtime.sendMessage({ action: 'ensureContentScripts', tabId });
    if (response?.error) throw new Error(response.error);
    if (!response?.ok) throw new Error('Could not connect to the page.');
    return response;
  }

  function selectLocalProfile(profile: StoredProfile) {
    setSelectedId(profile.id);
    setEntryDate(getProfileEntryDate(profile.yaml));
    setStayDays(parseStayDaysFromYaml(profile.yaml) ?? 90);
    setResult(null);
  }

  async function init() {
    let tab: chrome.tabs.Tab | undefined;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch {
      setPageState('outside');
      setFillDisabled(true);
      return;
    }

    // Do not even load sensitive applicant profiles while browsing other sites.
    if (!tab?.id || !isEvisaSiteUrl(tab.url || tab.pendingUrl)) {
      setPageState('outside');
      setFillDisabled(true);
      return;
    }

    setPageState('inside');
    try {
      const available = await loadProfiles();
      setProfiles(available);
      const id = await loadActiveProfileId();
      selectLocalProfile(available.find((item) => item.id === id) || available[0]);
    } catch (err) {
      setStatus('Could not load applicants: ' + String(err));
      setStatusTone('error');
      return;
    }

    if (!isForeignersUrl(tab.url || tab.pendingUrl)) {
      setStatus('You are on the official website. Open the foreigners application form to fill an e-Visa.');
      setFillDisabled(true);
      return;
    }

    try {
      const ping = await connectToTab(tab.id);
      if (!ping.onTargetPage) throw new Error('Not on the foreigners application page.');
      if (ping.depsOk === false) throw new Error(String(ping.depsError));
      setStatus(ping.formReady ? 'Choose an applicant and fill the form.' : 'Connected. Open the application form first.');
      setStatusTone('ready');
      setFillDisabled(!ping.formReady);
    } catch (err) {
      setStatus('Could not connect: ' + String(err));
      setStatusTone('error');
      setFillDisabled(true);
    }
  }

  async function handleSelect(id: string) {
    const profile = profiles.find((item) => item.id === id);
    if (!profile) return;
    selectLocalProfile(profile);
    await setActiveProfileId(id);
  }

  async function handleDateChange(value: string) {
    setEntryDate(value);
    if (!value) return;
    const profile = profiles.find((item) => item.id === selectedId);
    if (!profile) return;
    try {
      const nextYaml = withEntryDate(profile.yaml, value);
      await saveProfileYaml(nextYaml, selectedId);
      setProfiles((previous) => previous.map((p) => p.id === selectedId ? { ...p, yaml: nextYaml } : p));
    } catch (err) {
      setStatus('Could not save entry date: ' + String(err));
      setStatusTone('error');
    }
  }

  async function handleVisaCompleted(checked: boolean) {
    const profile = profiles.find((item) => item.id === selectedId);
    if (!profile) return;
    setCompletionSaving(true);
    try {
      const yaml = withVisaCompleted(await loadProfileYaml(selectedId), checked);
      await saveProfileYaml(yaml, selectedId);
      setProfiles((previous) => previous.map((person) => person.id === selectedId ? { ...person, yaml } : person));
      setStatus(checked ? 'Visa application marked as done.' : 'Visa application marked as not done.');
      setStatusTone('ready');
    } catch (err) {
      setStatus('Could not save visa status: ' + String(err));
      setStatusTone('error');
    } finally {
      setCompletionSaving(false);
    }
  }

  function showResult(data: FillResponse) {
    if (!data.ok) {
      setResult(data.error || 'Fill failed.');
      setResultTone('error');
      return;
    }
    const { filled, skipped, errors, appliedDates } = data.result!;
    const lines = ['Filled ' + filled + ' field groups.'];
    if (appliedDates) {
      lines.push('', 'Entry: ' + appliedDates.entry, 'e-Visa: ' + appliedDates.validFrom + ' → ' + appliedDates.validTo);
    }
    if (skipped.length) lines.push('', 'Skipped:', ...skipped.map((s) => '• ' + s));
    if (errors.length) lines.push('', 'Errors:', ...errors.map((e) => '• ' + e));
    setResult(lines.join('\n'));
    setResultTone(errors.length ? 'partial' : 'success');
  }

  async function handleFill() {
    if (!selectedId || !entryDate) {
      setStatus('Choose an applicant and an entry date first.');
      setStatusTone('error');
      return;
    }
    setFillDisabled(true);
    setStatus('Filling form...');
    setStatusTone('ready');
    setResult(null);

    try {
      const profile = profiles.find((item) => item.id === selectedId);
      if (!profile) throw new Error('Applicant not found.');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !isForeignersUrl(tab.url || tab.pendingUrl)) {
        throw new Error('Open the official foreigners e-Visa application page first.');
      }
      // Await this write to avoid sending a stale YAML profile to the content script.
      await saveProfileYaml(withEntryDate(profile.yaml, entryDate), selectedId);
      await connectToTab(tab.id);
      const response = (await chrome.tabs.sendMessage(tab.id, {
        action: 'fillForm', profileId: selectedId, entryDate,
      })) as FillResponse;
      showResult(response);
      setStatus(response.ok ? 'Review all fields before submission.' : 'Fill failed.');
      setStatusTone(response.ok ? 'ready' : 'error');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showResult({ ok: false, error: message });
      setStatus('Could not fill form: ' + message);
      setStatusTone('error');
    } finally {
      setFillDisabled(false);
    }
  }

  const statusClass = statusTone === 'error'
    ? 'text-destructive'
    : statusTone === 'ready' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground';
  const resultClass = resultTone === 'error'
    ? 'border-destructive/30 bg-destructive/5 text-destructive'
    : resultTone === 'partial'
      ? 'border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-100'
      : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100';

  return (
    <div className="w-[360px] p-4">
      <Card className="border-0 shadow-none">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="flex items-center gap-2 text-lg"><Users className="size-5" />Vietnam e-Visa Autofill</CardTitle>
          {pageState === 'inside' ? (
            <CardDescription className={statusClass}>{status}</CardDescription>
          ) : null}
        </CardHeader>
        {pageState === 'checking' ? (
          <CardContent className="px-0 pb-0">
            <p className="text-sm text-muted-foreground">Checking the active tab…</p>
          </CardContent>
        ) : pageState === 'outside' ? (
          <CardContent className="space-y-4 px-0 pb-0">
            <p className="text-sm text-muted-foreground">
              To use Vietnam e-Visa Autofill, first visit the official e-Visa website.
            </p>
            <Button className="w-full" onClick={() => void chrome.tabs.create({ url: 'https://evisa.gov.vn/' })}>
              <ExternalLink />Open e-Visa website
            </Button>
          </CardContent>
        ) : (
        <CardContent className="space-y-4 px-0 pb-0">
          <div className="space-y-2">
            <Label htmlFor="applicant">Applicant</Label>
            <select id="applicant" value={selectedId} onChange={(event) => void handleSelect(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{isVisaCompleted(profile.yaml) ? '✓ ' : ''}{getProfileLabel(profile)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="entryDate">Intended entry date</Label>
            <Input id="entryDate" type="date" value={entryDate} onChange={(event) => void handleDateChange(event.target.value)} />
            <p className="text-xs text-muted-foreground">Stored separately in the selected applicant's YAML profile.</p>
            {entryDate ? <p className="text-xs font-medium">{formatVisaRange(entryDate, stayDays)}</p> : null}
          </div>
          {selectedId ? (
            <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm">
              <input type="checkbox" className="size-4" disabled={completionSaving}
                checked={isVisaCompleted(profiles.find((profile) => profile.id === selectedId)?.yaml || '')}
                onChange={(event) => void handleVisaCompleted(event.target.checked)} />
              <span>
                <span className="font-medium">Visa application done</span>
                <span className="block text-xs text-muted-foreground">Your checklist only — not a visa approval confirmation.</span>
              </span>
            </label>
          ) : null}
          <div className="flex flex-col gap-2">
            <Button onClick={() => void handleFill()} disabled={fillDisabled || !selectedId || !entryDate}>Fill Form</Button>
            <Button variant="outline" onClick={() => chrome.runtime.openOptionsPage()}><FileText />Manage applicants</Button>
          </div>
          {result ? <pre className={`whitespace-pre-wrap rounded-lg border p-3 text-xs ${resultClass}`}>{result}</pre> : null}
          <p className="text-xs text-muted-foreground">
            Photos and final submission remain manual.{' '}
            <button type="button" className="inline-flex items-center gap-1 underline" onClick={() => chrome.runtime.openOptionsPage()}>
              Edit applicants <ExternalLink className="size-3" />
            </button>
          </p>
        </CardContent>
        )}
      </Card>
    </div>
  );
}
