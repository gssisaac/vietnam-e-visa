const FORM_MARKER_ID = 'basic_ttcnHo';
const TARGET_PATH = '/e-visa/foreigners';

(function initVietnamEvisaAutofill() {
  const log = () => globalThis.VietnamVisaLog || console;

  function ensureDependencies() {
    const missing = ['YamlParser', 'FieldHelpers', 'FormFiller'].filter(
      (name) => !globalThis[name]
    );
    if (missing.length) {
      throw new Error(`Missing modules: ${missing.join(', ')}`);
    }
  }

  if (globalThis.__VIETNAM_EVISA_AUTOFILL__) {
    log().info?.('content script re-activated');
    try {
      ensureDependencies();
    } catch (err) {
      log().error?.('dependency check failed on re-activate', err);
    }
    globalThis.__VIETNAM_EVISA_AUTOFILL__.activate();
    return;
  }

  let formObserver = null;
  let routeObserver = null;

  function isTargetPage() {
    return window.location.pathname.includes(TARGET_PATH);
  }

  function isFormPresent() {
    return Boolean(document.getElementById(FORM_MARKER_ID));
  }

  function watchForForm() {
    if (!isTargetPage()) return;

    if (isFormPresent()) {
      log().info?.('form detected and ready');
      return;
    }

    if (formObserver) return;

    formObserver = new MutationObserver(() => {
      if (isFormPresent()) {
        log().info?.('form detected and ready');
        formObserver.disconnect();
        formObserver = null;
      }
    });

    formObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function watchRouteChanges() {
    if (routeObserver) return;

    let lastPath = `${window.location.pathname}${window.location.search}`;

    routeObserver = window.setInterval(() => {
      const currentPath = `${window.location.pathname}${window.location.search}`;
      if (currentPath === lastPath) return;

      lastPath = currentPath;

      if (formObserver) {
        formObserver.disconnect();
        formObserver = null;
      }

      if (isTargetPage()) {
        log().info?.('route changed to foreigners form', currentPath);
        watchForForm();
      }
    }, 500);
  }

  async function loadProfile() {
    log().debug?.('loading profile.yaml');
    const url = chrome.runtime.getURL('profile.yaml');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load profile.yaml (${response.status})`);
    }
    const text = await response.text();
    ensureDependencies();
    const profile = globalThis.YamlParser.parse(text);
    log().debug?.('profile loaded', Object.keys(profile));
    return profile;
  }

  async function handleFillForm() {
    log().info?.('handleFillForm called');

    if (!isTargetPage()) {
      log().warn?.('fill aborted: not on foreigners page');
      return { ok: false, error: 'Not on the foreigners application page.' };
    }

    if (!isFormPresent()) {
      log().warn?.('fill aborted: form not present');
      return {
        ok: false,
        error: 'Application form not found. Complete login and open the form first.',
      };
    }

    try {
      ensureDependencies();
      const profile = await loadProfile();
      const result = await globalThis.FormFiller.fillForm(profile);
      return { ok: true, result };
    } catch (err) {
      log().error?.('handleFillForm failed', err.message, err.stack);
      return { ok: false, error: err.message };
    }
  }

  function activate() {
    if (isTargetPage()) {
      watchForForm();
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'ping') {
      let depsOk = true;
      let depsError = null;
      try {
        ensureDependencies();
      } catch (err) {
        depsOk = false;
        depsError = err.message;
        log().warn?.('ping: dependencies missing', depsError);
      }

      sendResponse({
        ok: true,
        onTargetPage: isTargetPage(),
        formReady: isFormPresent(),
        depsOk,
        depsError,
      });
      return false;
    }

    if (message.action === 'fillForm') {
      handleFillForm()
        .then(sendResponse)
        .catch((err) => {
          log().error?.('fillForm listener failed', err.message, err.stack);
          sendResponse({ ok: false, error: err.message });
        });
      return true;
    }

    return false;
  });

  globalThis.__VIETNAM_EVISA_AUTOFILL__ = { activate };

  try {
    ensureDependencies();
    log().info?.('content script active', {
      path: window.location.pathname,
      deps: ['YamlParser', 'FieldHelpers', 'FormFiller'].filter((n) => Boolean(globalThis[n])),
    });
  } catch (err) {
    log().error?.('content script started with missing dependencies', err.message);
  }

  watchRouteChanges();
  activate();
})();
