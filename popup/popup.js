const STORAGE_KEY_ENTRY_DATE = 'lastEntryDate';
const STORAGE_KEY_STAY_DAYS = 'profileStayDays';

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

function isoToDdMmYyyy(iso) {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function addDaysIso(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatVisaRange(entryIso, stayDays) {
  const validFrom = isoToDdMmYyyy(entryIso);
  const validTo = isoToDdMmYyyy(addDaysIso(entryIso, stayDays - 1));
  return `e-Visa valid: ${validFrom} → ${validTo} (${stayDays} days)`;
}

const statusEl = document.getElementById('status');
const entryDateEl = document.getElementById('entryDate');
const visaRangeEl = document.getElementById('visaRange');
const fillBtn = document.getElementById('fillBtn');
const resultEl = document.getElementById('result');

let stayDays = 90;

function setStatus(text, className = '') {
  statusEl.textContent = text;
  statusEl.className = `status ${className}`.trim();
}

function updateVisaRangePreview() {
  const entryIso = entryDateEl.value;
  if (!entryIso) {
    visaRangeEl.classList.add('hidden');
    return;
  }

  visaRangeEl.textContent = formatVisaRange(entryIso, stayDays);
  visaRangeEl.classList.remove('hidden');
}

function showResult(data) {
  resultEl.classList.remove('hidden', 'success', 'partial', 'error');

  if (!data.ok) {
    resultEl.classList.add('error');
    resultEl.textContent = data.error;
    return;
  }

  const { filled, skipped, errors, appliedDates } = data.result;
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

async function loadSavedEntryDate() {
  const stored = await chrome.storage.local.get([STORAGE_KEY_ENTRY_DATE, STORAGE_KEY_STAY_DAYS]);
  if (stored[STORAGE_KEY_ENTRY_DATE]) {
    entryDateEl.value = stored[STORAGE_KEY_ENTRY_DATE];
  }
  if (stored[STORAGE_KEY_STAY_DAYS]) {
    stayDays = stored[STORAGE_KEY_STAY_DAYS];
  }
  updateVisaRangePreview();
}

async function loadStayDaysFromProfile() {
  try {
    const url = chrome.runtime.getURL('profile.yaml');
    const response = await fetch(url);
    if (!response.ok) return;

    const text = await response.text();
    const match = text.match(/length_of_stay_days:\s*"?(\d+)"?/);
    if (match) {
      stayDays = Number(match[1]) || stayDays;
      await chrome.storage.local.set({ [STORAGE_KEY_STAY_DAYS]: stayDays });
      updateVisaRangePreview();
    }
  } catch (err) {
    console.warn('[Vietnam e-Visa popup] Could not read stay days from profile.yaml', err);
  }
}

async function init() {
  await loadStayDaysFromProfile();
  await loadSavedEntryDate();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabUrl = getTabUrl(tab);

  if (!isForeignersUrl(tabUrl)) {
    setStatus('Open the e-Visa foreigners form page first.', 'error');
    fillBtn.disabled = true;
    entryDateEl.disabled = true;
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
        'Connected. Pick entry date, then fill when the form is visible.',
        'ready'
      );
      fillBtn.disabled = false;
      return;
    }

    setStatus('Pick entry date, then Fill Form.', 'ready');
    fillBtn.disabled = false;
  } catch (err) {
    setStatus(`Could not connect: ${err.message}`, 'error');
    fillBtn.disabled = false;
  }
}

entryDateEl.addEventListener('change', async () => {
  updateVisaRangePreview();
  if (entryDateEl.value) {
    await chrome.storage.local.set({ [STORAGE_KEY_ENTRY_DATE]: entryDateEl.value });
  }
});

fillBtn.addEventListener('click', async () => {
  const entryDate = entryDateEl.value;
  if (!entryDate) {
    setStatus('Select an intended entry date first.', 'error');
    entryDateEl.focus();
    return;
  }

  fillBtn.disabled = true;
  setStatus('Filling form...', 'ready');
  resultEl.classList.add('hidden');

  await chrome.storage.local.set({ [STORAGE_KEY_ENTRY_DATE]: entryDate });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    await connectToTab(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'fillForm',
      entryDate,
    });
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
