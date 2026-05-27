#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIDEO="$ROOT/media/vietnam-e-visa-autofiller.mp4"
README="$ROOT/README.md"
SESSION="${GITHUB_UPLOAD_SESSION:-github-readme-upload}"
REPO="gssisaac/vietnam-e-visa"
ISSUE="${GITHUB_UPLOAD_ISSUE:-2}"

if [[ ! -f "$VIDEO" ]]; then
  echo "Missing demo video: $VIDEO" >&2
  exit 1
fi

if ! command -v gh >/dev/null; then
  echo "gh CLI is required." >&2
  exit 1
fi

if ! command -v playwright-cli >/dev/null; then
  echo "Install playwright-cli: npm install -g @playwright/cli" >&2
  exit 1
fi

if ! gh extension list 2>/dev/null | grep -q 'gh-attach'; then
  gh extension install atani/gh-attach
fi

upload_video() {
  gh attach \
    --session "$SESSION" \
    --keep-session \
    --issue "$ISSUE" \
    --image "$VIDEO" \
    --url-only \
    --repo "$REPO" \
    --browser \
    --headed
}

echo "Uploading demo video to GitHub CDN (user-attachments)…"
echo "A browser window opens on issue #$ISSUE — log in if prompted."
echo ""

set +e
URL="$(upload_video 2>&1 | tee /dev/stderr | grep -oE 'https://github.com/user-attachments/assets/[a-f0-9-]+' | head -1)"
set -e

if [[ -z "$URL" ]]; then
  echo ""
  echo "Upload failed. Complete GitHub login, then retry:"
  echo "  playwright-cli --session $SESSION open --persistent https://github.com/login"
  echo "  pnpm upload-readme-video"
  exit 1
fi

echo ""
echo "Uploaded: $URL"
echo "Patching README.md…"

node "$ROOT/scripts/patch-readme-video.js" "$URL" "$README"

echo ""
echo "Done. Review README.md, then commit and push:"
echo "  git add README.md && git commit -m 'Embed demo video in README' && git push"
