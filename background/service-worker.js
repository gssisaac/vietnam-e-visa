const CONTENT_SCRIPT_FILES = ['content/bundle.js'];

const DEV_RELOAD_URL = 'ws://127.0.0.1:9090';
const RECONNECT_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isForeignersUrl(url) {
  if (!url) return false;
  try {
    const { hostname, pathname } = new URL(url);
    return hostname.endsWith('evisa.gov.vn') && pathname.includes('/e-visa/foreigners');
  } catch {
    return url.includes('evisa.gov.vn') && url.includes('/e-visa/foreigners');
  }
}

async function pingTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { action: 'ping' });
  } catch {
    return null;
  }
}

async function injectContentScripts(tabId) {
  console.log('[Vietnam e-Visa Autofill] Injecting content scripts into tab', tabId);
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    files: CONTENT_SCRIPT_FILES,
  });
  await sleep(200);
}

function isPingReady(ping) {
  return Boolean(ping?.ok && ping.depsOk !== false);
}

async function ensureContentScripts(tabId) {
  let ping = await pingTab(tabId);
  if (isPingReady(ping)) return ping;

  if (!tabId) {
    throw new Error('No active tab.');
  }

  await injectContentScripts(tabId);

  ping = await pingTab(tabId);
  if (isPingReady(ping)) return ping;

  const detail = ping?.depsError ? `: ${ping.depsError}` : '';
  throw new Error(`Could not connect to the page after injecting scripts${detail}`);
}

function connectDevReload() {
  let ws;

  try {
    ws = new WebSocket(DEV_RELOAD_URL);
  } catch {
    setTimeout(connectDevReload, RECONNECT_MS);
    return;
  }

  ws.onopen = () => {
    console.log('[Vietnam e-Visa Autofill] Dev reload connected');
  };

  ws.onmessage = async (event) => {
    if (event.data !== 'reload') return;

    console.log('[Vietnam e-Visa Autofill] Reloading extension...');

    try {
      const tabs = await chrome.tabs.query({ url: 'https://evisa.gov.vn/*' });
      await Promise.all(
        tabs.map((tab) => (tab.id ? chrome.tabs.reload(tab.id) : Promise.resolve()))
      );
    } catch (err) {
      console.warn('[Vietnam e-Visa Autofill] Tab reload failed:', err);
    }

    chrome.runtime.reload();
  };

  ws.onclose = () => {
    setTimeout(connectDevReload, RECONNECT_MS);
  };

  ws.onerror = () => {
    ws.close();
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'ensureContentScripts') {
    ensureContentScripts(message.tabId)
      .then((ping) => sendResponse(ping))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  return false;
});

chrome.webNavigation.onHistoryStateUpdated.addListener(
  (details) => {
    if (details.frameId !== 0) return;
    if (!isForeignersUrl(details.url)) return;
    ensureContentScripts(details.tabId).catch(() => {});
  },
  { url: [{ hostSuffix: 'evisa.gov.vn' }] }
);

chrome.webNavigation.onCompleted.addListener(
  (details) => {
    if (details.frameId !== 0) return;
    if (!isForeignersUrl(details.url)) return;
    ensureContentScripts(details.tabId).catch(() => {});
  },
  { url: [{ hostSuffix: 'evisa.gov.vn' }] }
);

connectDevReload();
