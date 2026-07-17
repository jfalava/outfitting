#!/usr/bin/env bash

# macOS Outfitting Post Installation Script

set -euo pipefail

################## Install fonts via FontGet
export FONTGET_ACCEPT_DEFAULTS=1
export FONTGET_ACCEPT_AGREEMENTS=1

REPO_PATH="$HOME/.config/outfitting/repo"
FONTGET_LIST="$REPO_PATH/fonts/fontget.txt"

if [ ! -f "$FONTGET_LIST" ]; then
  echo "FontGet list not found: $FONTGET_LIST"
  exit 1
fi

while IFS= read -r font || [ -n "$font" ]; do
  [[ -z "$font" || "$font" == \#* ]] && continue
  echo "Installing font: $font"
  fontget install "$font"
done < "$FONTGET_LIST"
############################################

###################### Install private fonts
FONT_URL="https://mac.jfa.dev/fonts"
CHECKSUM_URL="https://mac.jfa.dev/fonts/checksum"
FONT_DIR="/Library/Fonts"
TMP=""

cleanup() {
  [ -n "$TMP" ] && rm -rf "$TMP"
}
trap cleanup EXIT

fail() {
  echo "Private font installation failed: $*" >&2
  exit 1
}

if ! command -v cloudflared >/dev/null 2>&1; then
  brew install cloudflared
fi
command -v cloudflared >/dev/null 2>&1 || fail "cloudflared is not available after installation"

# Prompt once before downloading any licensed assets, and keep the credential fresh for installs.
sudo -v || fail "administrator privileges are required to install fonts for all users"

TMP=$(mktemp -d)
ARCHIVE="$TMP/fonts.tar.gz"
CHECKSUM="$TMP/fonts.tar.gz.sha256"
STAGING="$TMP/staging"

echo "❖ Authenticating to fetch licensed fonts..."
cloudflared access login "$FONT_URL" || fail "Cloudflare Access login failed"
cloudflared access curl "$FONT_URL" --fail -o "$ARCHIVE" || fail "font archive download failed"
cloudflared access curl "$CHECKSUM_URL" --fail -o "$CHECKSUM" || fail "font checksum download failed"

# The sidecar must be exactly the standard sha256sum form for the archive we downloaded.
checksum_contents=$(cat "$CHECKSUM")
if [[ ! "$checksum_contents" =~ ^[[:xdigit:]]{64}\ \ fonts\.tar\.gz$ ]]; then
  fail "font checksum has an invalid format"
fi
(cd "$TMP" && shasum -a 256 -c "$(basename "$CHECKSUM")") || fail "font archive checksum mismatch"

# Reject traversal, absolute paths, links, and non-font payloads before extraction.
while IFS= read -r entry; do
  normalized=${entry//\\//}
  [[ "$normalized" == fonts/* ]] || fail "archive entry is outside fonts/: $entry"
  [[ "$normalized" != /* && "$normalized" != *"//"* ]] || fail "archive entry has an unsafe path: $entry"
  [[ "$normalized" == */ ]] && continue
  IFS='/' read -r -a parts <<< "$normalized"
  for part in "${parts[@]}"; do
    [[ "$part" != "." && "$part" != ".." && -n "$part" ]] || fail "archive entry has an unsafe path: $entry"
  done
  case "$normalized" in
    *.[oO][tT][fF]|*.[tT][tT][fF]|*.[tT][tT][cC]) ;;
    *) fail "archive contains a non-font payload: $entry" ;;
  esac
done < <(tar -tzf "$ARCHIVE")

if tar -tvzf "$ARCHIVE" | awk '$1 ~ /^[lh]/ { found = 1 } END { exit !found }'; then
  fail "archive contains a symbolic or hard link"
fi

mkdir -p "$STAGING"
tar -xzf "$ARCHIVE" -C "$STAGING" || fail "font archive extraction failed"

installed=0
skipped=0
failed=0
while IFS= read -r -d '' font_file; do
  relative=${font_file#"$STAGING/fonts/"}
  destination="$FONT_DIR/$relative"
  destination_dir=$(dirname "$destination")

  if [ -f "$destination" ] && cmp -s "$font_file" "$destination"; then
    echo "❖ Already installed: $relative"
    skipped=$((skipped + 1))
    continue
  fi

  if sudo mkdir -p "$destination_dir" && sudo install -m 0644 "$font_file" "$destination"; then
    sudo xattr -d com.apple.quarantine "$destination" 2>/dev/null || true
    echo "❖ Installed: $relative"
    installed=$((installed + 1))
  else
    echo "❖ Failed to install: $relative" >&2
    failed=$((failed + 1))
  fi
done < <(find "$STAGING/fonts" -type f \( -iname '*.otf' -o -iname '*.ttf' -o -iname '*.ttc' \) -print0)

if [ "$installed" -eq 0 ] && [ "$skipped" -eq 0 ]; then
  fail "archive did not contain any installable fonts"
fi

echo "❖ Private fonts: $installed installed, $skipped unchanged, $failed failed."
[ "$failed" -eq 0 ] || exit 1
############################################
