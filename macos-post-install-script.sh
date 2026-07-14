#!/usr/bin/env bash

# macOS Outfitting  Post Installation Script

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
  # Skip blank lines and comments
  [[ -z "$font" || "$font" == \#* ]] && continue
  echo "Installing font: $font"
  fontget install "$font"
done < "$FONTGET_LIST"
############################################

###################### Install private fonts
if ! command -v cloudflared &>/dev/null; then # is cloudflared in PATH?
  brew install cloudflared
fi

FONT_DIR="$HOME/Library/Fonts"
TMP=$(mktemp -d)

cloudflared access login https://mac.jfa.dev/fonts
cloudflared access curl https://mac.jfa.dev/fonts -o "$TMP/fonts.tar.gz"

mkdir -p "$FONT_DIR"
tar -xzf "$TMP/fonts.tar.gz" -C "$FONT_DIR"
rm -rf "$TMP"
############################################
