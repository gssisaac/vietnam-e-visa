import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Download, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { LLM_PROFILE_PROMPT, PROFILE_SETUP_STEPS } from '@/lib/llm-prompt';
import {
  downloadProfileYaml,
  loadProfileYaml,
  saveProfileYaml,
} from '@/lib/profile-storage';
import { parseYaml } from '@/lib/yaml';

export function EditorApp() {
  const [yaml, setYaml] = useState('');
  const [initialYaml, setInitialYaml] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'success' | 'error'>('success');
  const [copied, setCopied] = useState(false);

  const isDirty = yaml !== initialYaml;

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const text = await loadProfileYaml();
      setYaml(text);
      setInitialYaml(text);
      setStatus(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(message);
      setStatusTone('error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function handleSave() {
    try {
      parseYaml(yaml);
      await saveProfileYaml(yaml);
      setInitialYaml(yaml);
      setStatus('Profile saved to extension storage.');
      setStatusTone('success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`Could not save: ${message}`);
      setStatusTone('error');
    }
  }

  function handleDownload() {
    downloadProfileYaml(yaml);
    setStatus('Downloaded profile.yaml');
    setStatusTone('success');
  }

  async function handleResetTemplate() {
    const url = chrome.runtime.getURL('profile.form.yaml');
    const response = await fetch(url);
    const text = await response.text();
    setYaml(text);
    setStatus('Loaded blank template. Save when ready.');
    setStatusTone('success');
  }

  async function handleCopyPrompt() {
    await navigator.clipboard.writeText(LLM_PROFILE_PROMPT);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const statusClass =
    statusTone === 'error' ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400';

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Vietnam e-Visa Profile Editor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit your YAML profile, save it in the extension, then use the popup to autofill the form.
          </p>
        </div>

        <Tabs defaultValue="editor" className="space-y-4">
          <TabsList>
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="instructions">Instructions</TabsTrigger>
            <TabsTrigger value="llm-prompt">LLM Q&amp;A Prompt</TabsTrigger>
          </TabsList>

          <TabsContent value="editor">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle>profile.yaml</CardTitle>
                  <CardDescription>
                    Dates use DD/MM/YYYY. Dropdown values must match exact English labels from the e-Visa site.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => void handleResetTemplate()}>
                    <RotateCcw />
                    Reset template
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download />
                    Download
                  </Button>
                  <Button size="sm" onClick={() => void handleSave()} disabled={loading || !isDirty}>
                    <Save />
                    Save
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading profile...</p>
                ) : (
                  <Textarea
                    value={yaml}
                    onChange={(e) => setYaml(e.target.value)}
                    className="min-h-[520px] font-mono text-sm leading-relaxed"
                    spellCheck={false}
                  />
                )}
                {status ? <p className={`text-sm ${statusClass}`}>{status}</p> : null}
                {isDirty ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</p>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="instructions">
            <Card>
              <CardHeader>
                <CardTitle>How to set up your profile</CardTitle>
                <CardDescription>
                  Three ways to create your profile: edit YAML directly, use the LLM prompt, or copy from the example file.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ol className="space-y-4">
                  {PROFILE_SETUP_STEPS.map((step, index) => (
                    <li key={step.title} className="flex gap-4">
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

                <Separator />

                <div className="space-y-2">
                  <h3 className="font-medium">Using ChatGPT or another LLM</h3>
                  <p className="text-sm text-muted-foreground">
                    Open the <strong>LLM Q&amp;A Prompt</strong> tab, copy the prompt, and paste it into ChatGPT, Claude, or
                    similar. Answer each question one at a time. When finished, copy the generated YAML into the Editor tab
                    and click Save.
                  </p>
                </div>

                <div className="space-y-2">
                  <h3 className="font-medium">Dropdown reference</h3>
                  <p className="text-sm text-muted-foreground">
                    Run <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run fetch-options</code> in the project
                    folder to refresh <code className="rounded bg-muted px-1 py-0.5 text-xs">data/select-options.yaml</code>{' '}
                    with exact nationality, province, ward, and border gate labels.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="llm-prompt">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle>Q&amp;A prompt for LLMs</CardTitle>
                  <CardDescription>
                    Copy this into ChatGPT or Claude. The model asks one question at a time, then outputs your profile YAML.
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => void handleCopyPrompt()}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? 'Copied' : 'Copy prompt'}
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[560px] rounded-lg border bg-muted/30 p-4">
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{LLM_PROFILE_PROMPT}</pre>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
