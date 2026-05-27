# Vietnam e-Visa Autofill

Local Chrome extension that fills the Vietnam e-Visa application form at `https://evisa.gov.vn/e-visa/foreigners` from a YAML profile.

Built with **TypeScript**, **React**, **Tailwind CSS**, and **shadcn/ui**.  
Licensed under the [MIT License](LICENSE) — free to use, modify, and share.

## Introduction

https://github.com/user-attachments/assets/b2c6c722-96b1-4644-b7ee-b675ce845e49

**[▶ Watch demo video](https://isaaclee.xyz/2026-05-27-vietnam-e-visa-autofill/vietnam-e-visa-autofiller.mp4)**

## Install (recommended — GitHub Release)

The easiest way to install without building from source:

1. Open the [Releases](https://github.com/gssisaac/vietnam-e-visa/releases) page
2. Download the latest **`vietnam-e-visa-v*.zip`** asset
3. Unzip the file — you should see `manifest.json`, `icons/`, `assets/`, etc. at the top level
4. Open Chrome → `chrome://extensions`
5. Enable **Developer mode** (top right)
6. Click **Load unpacked**
7. Select the **unzipped folder** (the one that contains `manifest.json`)

To update later, download the new release zip, remove the old unpacked folder, and load the new one (or replace files and click **Reload** on the extension card).

> **Version note:** Release zip names follow `package.json` version (e.g. `vietnam-e-visa-v1.0.0.zip`). Bump `"version"` in `package.json` before pushing to main to publish a new release tag. Pushes to `main` automatically build and upload the zip via GitHub Actions.

## Install from source (developers)

```bash
git clone https://github.com/gssisaac/vietnam-e-visa.git
cd vietnam-e-visa
pnpm install
pnpm build
```

Then in Chrome → `chrome://extensions` → **Load unpacked** → select the **`dist`** folder inside the project.

**Important:** Do not load the project root. Only the unzipped release folder or `dist/` after a build contains the compiled extension. Loading the wrong folder causes a blank popup or manifest errors.

After code changes:

```bash
pnpm build
```

Click **Reload** on the extension in `chrome://extensions`.

### Publish a new release (maintainers)

```bash
# 1. Bump version in package.json (e.g. 1.0.0 → 1.0.1)
# 2. Push to main — GitHub Actions builds the zip and creates/updates the release
git push origin main

# Or manually:
pnpm release   # builds zip + gh release create/upload
```

## Development

```bash
pnpm dev
```

Vite watches source files and hot-reloads the extension. Load **`dist`** once in Chrome; after code changes, click **Reload** on the extension card.

Source layout:

| Path | Purpose |
|------|---------|
| `src/popup/` | Extension popup (entry date + Fill Form) |
| `src/editor/` | Profile YAML editor + instructions + LLM prompt |
| `src/content/` | Content script on evisa.gov.vn |
| `src/background/` | Service worker (script injection, dev reload) |
| `src/lib/` | YAML parser, form filler, profile storage |
| `public/` | Static assets (`profile.form.yaml`, icons, demo video) |

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

## License

MIT © [Isaac Chaneel Lee](https://github.com/gssisaac). See [LICENSE](LICENSE).
