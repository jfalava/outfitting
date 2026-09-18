#!/usr/bin/env bash
set -euo pipefail

PROFILE="generic-linux"
if [[ "${1:-}" == "--profile" ]]; then
    PROFILE="${2:-}"
    [[ -n "$PROFILE" ]] || { echo "--profile requires a value" >&2; exit 1; }
elif [[ "${1:-}" == "--oci-agents" ]]; then
    PROFILE="oci-agents"
elif [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    cat <<'EOF'
Generic Linux Outfitting Installer

Usage:
  curl -L linux.jfa.dev | bash
  curl -L linux.jfa.dev | bash -s -- --profile oci-agents
EOF
    exit 0
elif [[ $# -gt 0 ]]; then
    echo "Unknown option: $1" >&2
    exit 1
fi

case "$(uname -m)" in
    x86_64|amd64) ASSET="outfitting-manager-linux-x64.zip" ;;
    aarch64|arm64) ASSET="outfitting-manager-linux-arm64.zip" ;;
    *) echo "Unsupported Linux architecture: $(uname -m)" >&2; exit 1 ;;
esac

RELEASE_BASE="https://github.com/jfalava/outfitting/releases/latest/download"
INSTALL_DIR="$HOME/.local/bin"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/outfitting-manager.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT

curl -fL "$RELEASE_BASE/$ASSET" -o "$TEMP_DIR/$ASSET"
curl -fL "$RELEASE_BASE/$ASSET.sha256" -o "$TEMP_DIR/$ASSET.sha256"
if command -v sha256sum >/dev/null 2>&1; then
    (cd "$TEMP_DIR" && sha256sum -c "$ASSET.sha256")
else
    (cd "$TEMP_DIR" && shasum -a 256 -c "$ASSET.sha256")
fi

unzip -qo "$TEMP_DIR/$ASSET" -d "$TEMP_DIR"
[[ -f "$TEMP_DIR/outfitting-manager" ]] || {
    echo "Release archive does not contain outfitting-manager" >&2
    exit 1
}

mkdir -p "$INSTALL_DIR"
install -m 755 "$TEMP_DIR/outfitting-manager" "$INSTALL_DIR/outfitting-manager"
export PATH="$INSTALL_DIR:$PATH"

outfitting-manager init --profile "$PROFILE"
outfitting-manager setup --profile "$PROFILE" --no-fetch
