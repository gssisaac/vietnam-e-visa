import { VietnamVisaLog } from '@/lib/logger';
import { parseYaml } from '@/lib/yaml';
import { fillForm } from '@/lib/form-filler';
import { loadProfileYaml } from '@/lib/profile-storage';

const FORM_MARKER_ID = 'basic_ttcnHo';
const TARGET_PATH = '/e-visa/foreigners';

(function initVietnamEvisaAutofill() {
  const log = () => VietnamVisaLog;

  if (globalThis.__VIETNAM_EVISA_AUTOFILL__) {
    log().info('content script re-activated');
    globalThis.__VIETNAM_EVISA_AUTOFILL__.activate();
    return;
  }

  let formObserver: MutationObserver | null = null;
  let routeObserver: number | null = null;

  function isTargetPage() {
    return window.location.pathname.includes(TARGET_PATH);
  }

  function isFormPresent() {
    return Boolean(document.getElementById(FORM_MARKER_ID));
  }

  function watchForForm() {
    if (!isTargetPage()) return;

    if (isFormPresent()) {
      log().info('form detected and ready');
      return;
    }

    if (formObserver) return;

    formObserver = new MutationObserver(() => {
      if (isFormPresent()) {
        log().info('form detected and ready');
        formObserver?.disconnect();
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
        log().info('route changed to foreigners form', currentPath);
        watchForForm();
      }
    }, 500);
  }

  async function loadProfile() {
    log().debug('loading profile');
    const text = await loadProfileYaml();
    const profile = parseYaml(text);
    log().debug('profile loaded', Object.keys(profile));
    return profile;
  }

  function parseDdMmYyyy(value: string) {
    const [day, month, year] = value.split('/').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  function formatDdMmYyyy(date: Date) {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  function isoToDdMmYyyy(iso: string) {
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
  }

  function applyEntryDate(profile: ReturnType<typeof parseYaml>, entryDateIso: string) {
    const trip = (profile.trip_information || {}) as Record<string, unknown>;
    const requested = (profile.requested_information || {}) as Record<string, unknown>;

    const entryDdMmYyyy = isoToDdMmYyyy(entryDateIso);
    const stayDays = Number.parseInt(String(trip.length_of_stay_days || '90'), 10);
    const validToDate = parseDdMmYyyy(entryDdMmYyyy);
    validToDate.setUTCDate(validToDate.getUTCDate() + stayDays - 1);
    const validToDdMmYyyy = formatDdMmYyyy(validToDate);

    requested.valid_from = entryDdMmYyyy;
    requested.valid_to = validToDdMmYyyy;
    trip.intended_entry_date = entryDdMmYyyy;
    profile.requested_information = requested;
    profile.trip_information = trip;

    log().info('applied entry date override', {
      entry: entryDdMmYyyy,
      validFrom: entryDdMmYyyy,
      validTo: validToDdMmYyyy,
      stayDays,
    });

    return {
      entry: entryDdMmYyyy,
      validFrom: entryDdMmYyyy,
      validTo: validToDdMmYyyy,
      stayDays,
    };
  }

  async function handleFillForm(entryDateIso: string) {
    log().info('handleFillForm called', { entryDateIso });

    if (!entryDateIso) {
      return { ok: false, error: 'Entry date is required. Open the extension popup and select a date.' };
    }

    if (!isTargetPage()) {
      log().warn('fill aborted: not on foreigners page');
      return { ok: false, error: 'Not on the foreigners application page.' };
    }

    if (!isFormPresent()) {
      log().warn('fill aborted: form not present');
      return {
        ok: false,
        error: 'Application form not found. Complete login and open the form first.',
      };
    }

    try {
      const profile = await loadProfile();
      const appliedDates = applyEntryDate(profile, entryDateIso);
      const result = await fillForm(profile);
      return { ok: true, result: { ...result, appliedDates } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log().error('handleFillForm failed', message);
      return { ok: false, error: message };
    }
  }

  function activate() {
    if (isTargetPage()) {
      watchForForm();
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'ping') {
      sendResponse({
        ok: true,
        onTargetPage: isTargetPage(),
        formReady: isFormPresent(),
        depsOk: true,
        depsError: null,
      });
      return false;
    }

    if (message.action === 'fillForm') {
      handleFillForm(message.entryDate)
        .then(sendResponse)
        .catch((err) => {
          const messageText = err instanceof Error ? err.message : String(err);
          log().error('fillForm listener failed', messageText);
          sendResponse({ ok: false, error: messageText });
        });
      return true;
    }

    return false;
  });

  globalThis.__VIETNAM_EVISA_AUTOFILL__ = { activate };

  log().info('content script active', { path: window.location.pathname });
  watchRouteChanges();
  activate();
})();

export {};
