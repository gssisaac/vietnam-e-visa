function isForeignersUrl(url) {
  if (!url) return false;
  try {
    const { hostname, pathname } = new URL(url);
    return hostname.endsWith('evisa.gov.vn') && pathname.includes('/e-visa/foreigners');
  } catch {
    return url.includes('evisa.gov.vn') && url.includes('/e-visa/foreigners');
  }
}

function getTabUrl(tab) {
  return tab?.url || tab?.pendingUrl || '';
}

const statusEl = document.getElementById('status');
const fillBtn = document.getElementById('fillBtn');
const resultEl = document.getElementById('result');

function setStatus(text, className = '') {
  statusEl.textContent = text;
  statusEl.className = `status ${className}`.trim();
}

function showResult(data) {
  resultEl.classList.remove('hidden', 'success', 'partial', 'error');

  if (!data.ok) {
    resultEl.classList.add('error');
    resultEl.textContent = data.error;
    return;
  }

  const { filled, skipped, errors } = data.result;
  const lines = [`Filled ${filled} field groups.`];

  if (skipped.length) {
    lines.push('', 'Skipped:', ...skipped.map((s) => `• ${s}`));
  }
  if (errors.length) {
    lines.push('', 'Errors:', ...errors.map((e) => `• ${e}`));
  }

  resultEl.textContent = lines.join('\n');
  resultEl.classList.add(errors.length ? 'partial' : 'success');
}

async function connectToTab(tabId) {
  const response = await chrome.runtime.sendMessage({
    action: 'ensureContentScripts',
    tabId,
  });

  if (response?.error) {
    throw new Error(response.error);
  }

  if (!response?.ok) {
    throw new Error('Could not connect to the page.');
  }

  return response;
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabUrl = getTabUrl(tab);

  if (!isForeignersUrl(tabUrl)) {
    setStatus('Open the e-Visa foreigners form page first.', 'error');
    fillBtn.disabled = true;
    return;
  }

  try {
    setStatus('Connecting to page...', 'ready');
    const ping = await connectToTab(tab.id);

    if (!ping.onTargetPage) {
      setStatus('Not on the foreigners application page.', 'error');
      fillBtn.disabled = true;
      return;
    }

    if (ping.depsOk === false) {
      console.warn('[Vietnam e-Visa popup] Missing dependencies:', ping.depsError);
      setStatus(`Script error: ${ping.depsError}. Try reloading the extension.`, 'error');
      fillBtn.disabled = false;
      return;
    }

    if (!ping.formReady) {
      setStatus(
        'Connected. Waiting for form — finish login/instructions if the form is not visible yet.',
        'ready'
      );
      fillBtn.disabled = false;
      return;
    }

    setStatus('Form detected. Ready to fill.', 'ready');
    fillBtn.disabled = false;
  } catch (err) {
    setStatus(`Could not connect: ${err.message}`, 'error');
    fillBtn.disabled = false;
  }
}

fillBtn.addEventListener('click', async () => {
  fillBtn.disabled = true;
  setStatus('Filling form...', 'ready');
  resultEl.classList.add('hidden');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    await connectToTab(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'fillForm' });
    console.log('[Vietnam e-Visa popup] fillForm response', response);
    showResult(response);
    setStatus(response.ok ? 'Done.' : 'Fill failed.', response.ok ? 'ready' : 'error');
  } catch (err) {
    console.error('[Vietnam e-Visa popup] fillForm failed', err);
    showResult({ ok: false, error: err.message });
    setStatus(`Could not fill form: ${err.message}`, 'error');
  }

  fillBtn.disabled = false;
});

init();
