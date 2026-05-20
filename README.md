# Vietnam e-Visa Autofill

Local Chrome extension that fills the Vietnam e-Visa application form at `https://evisa.gov.vn/e-visa/foreigners` from a YAML profile file.

## Install

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder (`vietman-visa`)

## Dev watch (auto-reload on save)

While editing the extension or `profile.yaml`, run:

```bash
npm install
npm run dev
```

Source files live in `lib/` and `content/content.js`. They are bundled into `content/bundle.js` automatically (`npm run build` or via `npm run dev`).

This starts a local WebSocket server on port `9090`. When you save a file, the extension reloads automatically and any open `evisa.gov.vn` tabs refresh so content scripts pick up changes.

Keep `npm run dev` running in a terminal. Reload the extension once manually after the first `npm run dev` if it was already loaded before adding the background script.

After changing permissions in `manifest.json`, reload the extension once at `chrome://extensions`.

## Configure

1. Copy [`profile.form.yaml`](profile.form.yaml) to `profile.yaml`, or edit [`profile.yaml`](profile.yaml) directly
2. On the extension page (`chrome://extensions`), click **Reload** on this extension after editing the YAML

Use [`profile.example.yaml`](profile.example.yaml) for a filled example. See [`data/select-options.yaml`](data/select-options.yaml) for exact dropdown labels.

### Select field values

Dropdown values must match the **exact English labels** from the site API. Run this to generate a full reference list:

```bash
npm run fetch-options
```

This writes [`data/select-options.yaml`](data/select-options.yaml) with every nationality, purpose, border gate, province, and sample ward label.

Common examples (copy exactly):

| Field | Example value |
|-------|---------------|
| nationality | `Korea (South)` |
| purpose_of_entry | `Tourism` |
| province_city | `HO CHI MINH City` |
| ward_commune | `BEN THANH WARD` |
| border_gate_entry | `Tan Son Nhat Int Airport (Ho Chi Minh City)` |
| passport type | `Ordinary passport` |

Dates use **DD/MM/YYYY** format.

## Usage

1. Log in to [evisa.gov.vn](https://evisa.gov.vn) and navigate to the foreigners application form
2. Dismiss the instruction modal manually (first visit only)
3. Upload portrait and passport photos manually
4. Click the extension icon → pick **Intended entry date** → **Fill Form**
5. Review all fields, upload any remaining items, then click **Next** yourself

The popup entry date overrides `intended_entry_date`, `valid_from`, and `valid_to` (`valid_to` = entry + `length_of_stay_days` from profile).

## What is filled

- Sections 1–6: Personal, Requested, Passport, Contact, Occupation, Trip
- Section 7: Accompanying children (if listed in YAML; photo upload skipped)
- Section 8: Trip expenses and insurance
- Declaration checkbox at the bottom

## What is NOT filled

- Portrait photography upload
- Passport data page image upload
- Child portrait uploads
- Instruction modal checkboxes
- **Next** / **Cancel** buttons

## Troubleshooting

- **"Could not connect" / content script missing** — The site is a SPA; the extension now auto-injects on `/e-visa/foreigners`. Reload the extension at `chrome://extensions` once, then open the popup again (no page refresh required in most cases).
- **"Extension not loaded on this tab"** — Fixed in recent versions via programmatic injection. Reload the extension if you still see this.
- **Select option not found** — Check the label in `profile.yaml` matches the dropdown text on the site
- **Debugging** — Open DevTools on the e-visa tab → Console, filter by `[Vietnam e-Visa]` to see step-by-step fill logs and errors
- **Ward/commune fails** — Ensure `province_city` is correct; ward options load after province is selected
- **Next button still disabled** — Upload photos and verify required fields manually
