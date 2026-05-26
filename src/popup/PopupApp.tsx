import { useEffect, useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  STORAGE_KEY_ENTRY_DATE,
  STORAGE_KEY_STAY_DAYS,
  loadProfileYaml,
  parseStayDaysFromYaml,
} from '@/lib/profile-storage';
import { formatVisaRange, isForeignersUrl } from '@/lib/shared';

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

function getTabUrl(tab: chrome.tabs.Tab) {
  return tab.url || tab.pendingUrl || '';
}

export function PopupApp() {
  const [status, setStatus] = useState('Checking page...');
  const [statusTone, setStatusTone] = useState<'default' | 'ready' | 'error'>('default');
  const [entryDate, setEntryDate] = useState('');
  const [stayDays, setStayDays] = useState(90);
  const [fillDisabled, setFillDisabled] = useState(true);
  const [inputsDisabled, setInputsDisabled] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultTone, setResultTone] = useState<'success' | 'partial' | 'error'>('success');

  const visaRange = entryDate ? formatVisaRange(entryDate, stayDays) : '';

  useEffect(() => {
    void init();
  }, []);

  async function connectToTab(tabId: number) {
    const response = await chrome.runtime.sendMessage({
      action: 'ensureContentScripts',
      tabId,
    });

    if (response?.error) throw new Error(response.error);
    if (!response?.ok) throw new Error('Could not connect to the page.');
    return response;
  }

  async function init() {
    try {
      const yaml = await loadProfileYaml();
      const days = parseStayDaysFromYaml(yaml);
      if (days) {
        setStayDays(days);
        await chrome.storage.local.set({ [STORAGE_KEY_STAY_DAYS]: days });
      }
    } catch (err) {
      console.warn('[Vietnam e-Visa popup] Could not read stay days from profile', err);
    }

    const stored = await chrome.storage.local.get([STORAGE_KEY_ENTRY_DATE, STORAGE_KEY_STAY_DAYS]);
    if (stored[STORAGE_KEY_ENTRY_DATE]) setEntryDate(stored[STORAGE_KEY_ENTRY_DATE]);
    if (stored[STORAGE_KEY_STAY_DAYS]) setStayDays(stored[STORAGE_KEY_STAY_DAYS]);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabUrl = getTabUrl(tab);

    if (!isForeignersUrl(tabUrl)) {
      setStatus('Open the e-Visa foreigners form page first.');
      setStatusTone('error');
      setFillDisabled(true);
      setInputsDisabled(true);
      return;
    }

    try {
      setStatus('Connecting to page...');
      setStatusTone('ready');
      const ping = await connectToTab(tab.id!);

      if (!ping.onTargetPage) {
        setStatus('Not on the foreigners application page.');
        setStatusTone('error');
        setFillDisabled(true);
        return;
      }

      if (ping.depsOk === false) {
        setStatus(`Script error: ${ping.depsError}. Try reloading the extension.`);
        setStatusTone('error');
        setFillDisabled(false);
        return;
      }

      if (!ping.formReady) {
        setStatus('Connected. Pick entry date, then fill when the form is visible.');
      } else {
        setStatus('Pick entry date, then Fill Form.');
      }
      setStatusTone('ready');
      setFillDisabled(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`Could not connect: ${message}`);
      setStatusTone('error');
      setFillDisabled(false);
    }
  }

  async function handleEntryDateChange(value: string) {
    setEntryDate(value);
    if (value) {
      await chrome.storage.local.set({ [STORAGE_KEY_ENTRY_DATE]: value });
    }
  }

  function showResult(data: FillResponse) {
    if (!data.ok) {
      setResult(data.error || 'Fill failed.');
      setResultTone('error');
      return;
    }

    const { filled, skipped, errors, appliedDates } = data.result!;
    const lines = [`Filled ${filled} field groups.`];

    if (appliedDates) {
      lines.push('', `Entry: ${appliedDates.entry}`, `e-Visa: ${appliedDates.validFrom} → ${appliedDates.validTo}`);
    }
    if (skipped.length) {
      lines.push('', 'Skipped:', ...skipped.map((s) => `• ${s}`));
    }
    if (errors.length) {
      lines.push('', 'Errors:', ...errors.map((e) => `• ${e}`));
    }

    setResult(lines.join('\n'));
    setResultTone(errors.length ? 'partial' : 'success');
  }

  async function handleFill() {
    if (!entryDate) {
      setStatus('Select an intended entry date first.');
      setStatusTone('error');
      return;
    }

    setFillDisabled(true);
    setStatus('Filling form...');
    setStatusTone('ready');
    setResult(null);

    await chrome.storage.local.set({ [STORAGE_KEY_ENTRY_DATE]: entryDate });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    try {
      await connectToTab(tab.id!);
      const response = (await chrome.tabs.sendMessage(tab.id!, {
        action: 'fillForm',
        entryDate,
      })) as FillResponse;
      showResult(response);
      setStatus(response.ok ? 'Done.' : 'Fill failed.');
      setStatusTone(response.ok ? 'ready' : 'error');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showResult({ ok: false, error: message });
      setStatus(`Could not fill form: ${message}`);
      setStatusTone('error');
    }

    setFillDisabled(false);
  }

  function openEditor() {
    chrome.runtime.openOptionsPage();
  }

  const statusClass =
    statusTone === 'error'
      ? 'text-destructive'
      : statusTone === 'ready'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-muted-foreground';

  const resultClass =
    resultTone === 'error'
      ? 'border-destructive/30 bg-destructive/5 text-destructive'
      : resultTone === 'partial'
        ? 'border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-100'
        : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100';

  return (
    <div className="w-[360px] p-4">
      <Card className="border-0 shadow-none">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="text-lg">Vietnam e-Visa Autofill</CardTitle>
          <CardDescription className={statusClass}>{status}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-0 pb-0">
          <div className="space-y-2">
            <Label htmlFor="entryDate">Intended entry date</Label>
            <Input
              id="entryDate"
              type="date"
              value={entryDate}
              disabled={inputsDisabled}
              onChange={(e) => void handleEntryDateChange(e.target.value)}
              required
            />
            {visaRange ? <p className="text-xs text-muted-foreground">{visaRange}</p> : null}
          </div>

          <div className="flex flex-col gap-2">
            <Button onClick={() => void handleFill()} disabled={fillDisabled}>
              Fill Form
            </Button>
            <Button variant="outline" onClick={openEditor}>
              <FileText />
              Edit profile
            </Button>
          </div>

          {result ? (
            <pre className={`whitespace-pre-wrap rounded-lg border p-3 text-xs ${resultClass}`}>{result}</pre>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Profile is saved in the extension editor.{' '}
            <button type="button" className="inline-flex items-center gap-1 underline" onClick={openEditor}>
              Open editor
              <ExternalLink className="size-3" />
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
