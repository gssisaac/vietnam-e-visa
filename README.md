# Vietnam e-Visa Autofill

Local Chrome extension that fills the Vietnam e-Visa application form at `https://evisa.gov.vn/e-visa/foreigners` from a YAML profile.

Built with **TypeScript**, **React**, **Tailwind CSS**, and **shadcn/ui**.

## Install

1. Build the extension:

   ```bash
   pnpm install
   pnpm build
   ```

2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. **Remove** any old copy of this extension (especially if it pointed at the project root)
5. Click **Load unpacked**
6. Select the **`dist`** folder inside this project (`vietman-visa/dist`)

   **Important:** Do not load the project root folder. The root contains TypeScript source; only `dist/` is the built extension. Loading the wrong folder causes a **blank popup**.

7. After each `pnpm build`, click **Reload** on the extension card in `chrome://extensions`

## Development

```bash
pnpm dev
```

Vite watches source files and hot-reloads the extension. Load **`dist`** once in Chrome; after code changes, click **Reload** on the extension card (or use the CRX dev tools refresh).

Source layout:

| Path | Purpose |
|------|---------|
| `src/popup/` | Extension popup (entry date + Fill Form) |
| `src/editor/` | Profile YAML editor + instructions + LLM prompt |
| `src/content/` | Content script on evisa.gov.vn |
| `src/background/` | Service worker (script injection, dev reload) |
| `src/lib/` | YAML parser, form filler, profile storage |
| `public/` | Static assets (`profile.form.yaml`, icons, select options) |

## Configure your profile

### Option A — Profile editor (recommended)

1. Click the extension icon → **Edit profile**, or right-click the extension → **Options**
2. Edit YAML in the **Editor** tab
3. Click **Save** (stored in extension storage)

### Option B — LLM Q&A prompt

1. Open the profile editor → **LLM Q&A Prompt** tab
2. Copy the prompt into ChatGPT, Claude, or similar
3. Answer one question at a time; paste the generated YAML into the editor and save

### Option C — Manual YAML file

- Template: [`profile.form.yaml`](profile.form.yaml)
- Example: [`profile.example.yaml`](profile.example.yaml)
- Use **Download** in the editor to export `profile.yaml` for backup

Dropdown values must match **exact English labels** from the site. Refresh the reference list:

```bash
pnpm run fetch-options
```

This updates [`data/select-options.yaml`](data/select-options.yaml) (and the copy in `public/data/`).

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

1. Log in to [evisa.gov.vn](https://evisa.gov.vn) and open the foreigners application form
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

- **"Could not connect"** — Reload the extension at `chrome://extensions`, then reopen the popup on the foreigners form page
- **Select option not found** — Check the label in your profile matches the dropdown text on the site
- **Debugging** — DevTools on the e-visa tab → Console, filter by `[Vietnam e-Visa]`
- **Ward/commune fails** — Ensure `province_city` is correct; ward options load after province is selected
- **Next button still disabled** — Upload photos and verify required fields manually
