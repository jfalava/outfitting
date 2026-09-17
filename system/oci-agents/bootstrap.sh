#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[oci-agents] %s\n' "$*"
}

fail() {
  printf '[oci-agents] error: %s\n' "$*" >&2
  exit 1
}

if [[ "$(id -un)" != "jfalava" ]]; then
  fail "run this script as jfalava"
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"

if [[ -r "$HOME/.nix-profile/etc/profile.d/nix.sh" ]]; then
  # shellcheck disable=SC1091
  . "$HOME/.nix-profile/etc/profile.d/nix.sh"
fi

command -v nix >/dev/null 2>&1 || fail "Nix is missing; finish the Pulumi cloud-init bootstrap first"
command -v curl >/dev/null 2>&1 || fail "curl is missing"

mkdir -p "$HOME/.config/nix" "$HOME/code"
nix_config="$HOME/.config/nix/nix.conf"
touch "$nix_config"

ensure_nix_setting() {
  local setting="$1"
  grep -Fqx "$setting" "$nix_config" 2>/dev/null || printf '%s\n' "$setting" >> "$nix_config"
}

ensure_nix_setting 'experimental-features = nix-command flakes'
ensure_nix_setting 'auto-optimise-store = true'

export PATH="$HOME/.local/bin:$HOME/.amp/bin:$HOME/.nix-profile/bin:$PATH"

if ! command -v t3 >/dev/null 2>&1; then
  log "installing T3 Code"
  curl -fsSL https://t3.codes/install.sh | sh
fi

if ! command -v amp >/dev/null 2>&1; then
  log "installing Amp"
  curl -fsSL https://ampcode.com/install.sh | bash
fi

export PATH="$HOME/.local/bin:$HOME/.amp/bin:$HOME/.nix-profile/bin:$PATH"
command -v t3 >/dev/null 2>&1 || fail "T3 Code did not install on $(uname -m)"
command -v amp >/dev/null 2>&1 || fail "Amp did not install on $(uname -m)"

log "activating Home Manager profile"
export OUTFITTING_REPO="$repo_root"
nix run github:nix-community/home-manager/release-26.05 -- \
  switch --impure --flake "$repo_root/system/oci-agents#oci-agents"

if command -v sudo >/dev/null 2>&1 && command -v loginctl >/dev/null 2>&1; then
  if [[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null || true)" != "yes" ]]; then
    log "enabling user lingering for persistent services"
    sudo loginctl enable-linger "$USER"
  fi
fi

systemctl --user daemon-reload
for service in amp-runner.service t3code.service opencode-web.service; do
  if systemctl --user cat "$service" >/dev/null 2>&1; then
    systemctl --user enable --now "$service"
  fi
done

log "installed harnesses: $(amp version 2>/dev/null || true), $(t3 --version 2>/dev/null || true), $(opencode --version 2>/dev/null || true)"
log "next: authenticate with 'amp login' and 'opencode auth login'; pair T3 with 't3 pair --tailscale'"
