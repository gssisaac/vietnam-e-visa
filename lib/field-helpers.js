/**
 * DOM helpers for Ant Design Vue form fields on evisa.gov.vn
 */
(() => {
  if (globalThis.FieldHelpers) return;

  globalThis.FieldHelpers = (() => {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(fn, timeout = 3000, interval = 100) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = fn();
      if (result) return result;
      await sleep(interval);
    }
    return null;
  }

  function dispatchInputEvents(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setInputValue(el, value) {
    nativeInputValueSetter.call(el, value);
    dispatchInputEvents(el);
  }

  async function fillInput(id, value) {
    if (value === undefined || value === null || value === '') return;
    const el = document.getElementById(id);
    if (!el) throw new Error(`Input not found: #${id}`);
    el.focus();
    setInputValue(el, String(value));
    await sleep(50);
  }

  async function fillAntDate(id, value) {
    if (!value) return;
    const el = document.getElementById(id);
    if (!el) throw new Error(`Date input not found: #${id}`);

    el.click();
    await sleep(100);
    el.removeAttribute('readonly');
    setInputValue(el, String(value));
    await sleep(50);

    document.body.click();
    await sleep(50);
  }

  function getVisibleDropdowns() {
    return [...document.querySelectorAll('.ant-select-dropdown')].filter((dd) => {
      if (dd.classList.contains('ant-select-dropdown-hidden')) return false;
      const style = window.getComputedStyle(dd);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function findDropdownForSelect(inputId) {
    const listId = `${inputId}_list`;
    const listbox = document.getElementById(listId);
    if (listbox) {
      const dropdown = listbox.closest('.ant-select-dropdown');
      if (dropdown) return dropdown;
    }
    const visible = getVisibleDropdowns();
    return visible.length === 1 ? visible[0] : visible[visible.length - 1] || null;
  }

  function normalizeLabel(value) {
    return String(value)
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\.$/, '')
      .toLowerCase();
  }

  function getOptionLabel(option) {
    return (
      option.getAttribute('title') ||
      option.querySelector('.ant-select-item-option-content')?.textContent ||
      option.textContent ||
      ''
    ).trim();
  }

  function findBestOption(options, label) {
    const target = normalizeLabel(label);
    if (!target) return null;

    const scored = options
      .map((opt) => {
        const text = getOptionLabel(opt);
        const norm = normalizeLabel(text);
        let score = 0;

        if (norm === target) score = 100;
        else if (text === label.trim()) score = 95;
        else if (norm.includes(target)) score = 80;
        else if (target.includes(norm) && norm.length > 3) score = 70;
        else {
          const targetWords = target.split(/[\s,()]+/).filter(Boolean);
          const optionWords = norm.split(/[\s,()]+/).filter(Boolean);
          const overlap = targetWords.filter((word) =>
            optionWords.some((ow) => ow === word || ow.includes(word) || word.includes(ow))
          ).length;
          score = overlap * 5;
        }

        return { opt, text, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0] || null;
  }

  async function collectSelectOptions(dropdown) {
    const seen = new Map();
    const holder = dropdown.querySelector('.rc-virtual-list-holder');

    async function snapshot() {
      for (const opt of dropdown.querySelectorAll('.ant-select-item-option')) {
        const text = getOptionLabel(opt);
        if (text) seen.set(text, opt);
      }
    }

    await snapshot();

    if (holder && holder.scrollHeight > holder.clientHeight) {
      const step = Math.max(80, Math.floor(holder.clientHeight * 0.8));
      for (let scrollTop = 0; scrollTop <= holder.scrollHeight; scrollTop += step) {
        holder.scrollTop = scrollTop;
        await sleep(80);
        await snapshot();
      }
      holder.scrollTop = 0;
      await sleep(50);
    }

    return [...seen.entries()].map(([text, opt]) => ({ text, opt }));
  }

  async function typeSelectSearch(input, text) {
    input.focus();
    input.click();
    await sleep(50);

    nativeInputValueSetter.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(50);

    const value = String(text);
    for (let i = 0; i < value.length; i += 1) {
      const next = value.slice(0, i + 1);
      nativeInputValueSetter.call(input, next);
      input.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          data: value[i],
          inputType: 'insertText',
        })
      );
      await sleep(15);
    }

    await sleep(400);
  }

  function clickOption(option) {
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    option.click();
  }

  async function closeDropdowns() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(100);
    document.body.click();
    await sleep(100);
  }

  async function fillAntSelect(inputId, label, { searchable = true } = {}) {
    if (!label) return;

    globalThis.VietnamVisaLog?.debug(`select: opening #${inputId} for "${label}"`);
    await closeDropdowns();

    const input = document.getElementById(inputId);
    if (!input) throw new Error(`Select input not found: #${inputId}`);

    const select = input.closest('.ant-select');
    if (!select) throw new Error(`Select wrapper not found for #${inputId}`);

    if (select.classList.contains('ant-select-disabled')) {
      throw new Error(`Select is disabled: #${inputId}`);
    }

    const selector = select.querySelector('.ant-select-selector');
    selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selector.click();
    await sleep(250);

    const searchTerms = searchable
      ? [String(label), String(label).split(/[,(]/)[0].trim()].filter(
          (term, index, arr) => term && arr.indexOf(term) === index
        )
      : [String(label)];

    let chosen = null;
    let lastOptions = [];

    for (const term of searchTerms) {
      if (searchable) {
        await typeSelectSearch(input, term);
      }

      const dropdown = await waitFor(() => findDropdownForSelect(inputId), 3000);
      if (!dropdown) {
        globalThis.VietnamVisaLog?.warn(`select: dropdown not open for #${inputId}, term="${term}"`);
        continue;
      }

      lastOptions = await collectSelectOptions(dropdown);
      const match = findBestOption(
        lastOptions.map((item) => item.opt),
        label
      );

      if (match) {
        chosen = match;
        globalThis.VietnamVisaLog?.debug(`select: matched #${inputId}`, match.text, `(search: "${term}")`);
        clickOption(match.opt);
        break;
      }

      globalThis.VietnamVisaLog?.debug(
        `select: no match for #${inputId} with term "${term}", options:`,
        lastOptions.slice(0, 8).map((item) => item.text)
      );
      await closeDropdowns();
      selector.click();
      await sleep(200);
    }

    if (!chosen) {
      const sample = lastOptions.slice(0, 12).map((item) => item.text);
      globalThis.VietnamVisaLog?.error(`select: option not found for #${inputId}`, {
        wanted: label,
        sample,
      });
      throw new Error(
        `Option "${label}" not found for #${inputId}. Sample options: ${sample.join(', ')}`
      );
    }

    await sleep(200);
    await closeDropdowns();

    const selectedItem = select.querySelector('.ant-select-selection-item')?.textContent?.trim();
    const selectedText =
      selectedItem || (normalizeLabel(input.value) === normalizeLabel(label) ? label : '');

    if (!selectedText && !select.classList.contains('ant-select-auto-complete')) {
      throw new Error(`Selection not applied for #${inputId} (wanted "${label}")`);
    }

    globalThis.VietnamVisaLog?.debug(`select: applied #${inputId}`, selectedText || label);
  }

  async function fillAntAutoComplete(inputId, value) {
    if (!value) return;
    const input = document.getElementById(inputId);
    if (!input) throw new Error(`Autocomplete not found: #${inputId}`);

    input.focus();
    setInputValue(input, String(value));
    await sleep(400);

    const dropdown = findDropdownForSelect(inputId);
    if (dropdown) {
      const option = dropdown.querySelector('.ant-select-item-option');
      if (option) {
        option.click();
        await sleep(100);
        return;
      }
    }
  }

  async function fillRadioByContainer(containerSelector, value) {
    const container = document.querySelector(containerSelector);
    if (!container) throw new Error(`Radio container not found: ${containerSelector}`);

    const radioValue = value ? '1' : '0';
    const radio = container.querySelector(`.ant-radio-input[value="${radioValue}"]`);
    if (!radio) throw new Error(`Radio value ${radioValue} not found in ${containerSelector}`);

    radio.closest('label')?.click() || radio.click();
    await sleep(50);
  }

  async function fillRadioByQuestion(questionText, value) {
    const containers = [...document.querySelectorAll('.ant-col.flex.justify-between, .flex.justify-between')];
    const row = containers.find((el) => el.textContent.includes(questionText));
    if (!row) throw new Error(`Radio question not found: ${questionText}`);

    const group = row.querySelector('.ant-radio-group');
    if (!group) throw new Error(`Radio group not found for: ${questionText}`);

    const radioValue = value ? '1' : '0';
    const radio = group.querySelector(`.ant-radio-input[value="${radioValue}"]`);
    if (!radio) throw new Error(`Radio not found for: ${questionText}`);

    radio.closest('label')?.click() || radio.click();
    await sleep(50);
  }

  async function fillRadioByName(nameSelector, value) {
    const map = { single: '0', multiple: '1', full: 'D', year_only: 'Y' };
    const radioValue = map[value] ?? (value ? '1' : '0');
    const container = document.querySelector(nameSelector);
    if (!container) throw new Error(`Radio container not found: ${nameSelector}`);

    const radio = container.querySelector(`.ant-radio-input[value="${radioValue}"]`);
    if (!radio) throw new Error(`Radio value ${radioValue} not found in ${nameSelector}`);

    radio.closest('label')?.click() || radio.click();
    await sleep(50);
  }

  async function fillCheckboxById(id, checked) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Checkbox not found: #${id}`);
    await fillCheckbox(el, checked);
  }

  async function fillCheckbox(inputEl, checked) {
    const el = typeof inputEl === 'string' ? document.querySelector(inputEl) : inputEl;
    if (!el) throw new Error('Checkbox not found');

    const checkbox = el.classList?.contains('ant-checkbox-input')
      ? el
      : el.querySelector?.('.ant-checkbox-input') || el;

    const isChecked = checkbox.checked;
    if (Boolean(checked) !== isChecked) {
      checkbox.closest('label')?.click() || checkbox.click();
      await sleep(50);
    }
  }

  async function fillCheckboxByText(text, checked) {
    const labels = [...document.querySelectorAll('.ant-checkbox-wrapper')];
    const label = labels.find((l) => l.textContent.includes(text));
    if (!label) throw new Error(`Checkbox not found for text: ${text}`);

    const checkbox = label.querySelector('.ant-checkbox-input');
    await fillCheckbox(checkbox, checked);
  }

  async function clickPlusChildRow() {
    const plus = document.querySelector('.ant-table-summary img[alt="PlusCircle"]');
    if (!plus) throw new Error('Child row plus button not found');
    plus.click();
    await sleep(300);
  }

  return {
    sleep,
    waitFor,
    fillInput,
    fillAntDate,
    fillAntSelect,
    fillAntAutoComplete,
    fillRadioByContainer,
    fillRadioByQuestion,
    fillRadioByName,
    fillCheckboxById,
    fillCheckboxByText,
    clickPlusChildRow,
  };
  })();
})();
