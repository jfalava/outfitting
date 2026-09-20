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

# Prefer the per-user profile, then the multi-user daemon profile (Pulumi
# cloud-init may install either layout).
if [[ -r "$HOME/.nix-profile/etc/profile.d/nix.sh" ]]; then
  # shellcheck disable=SC1091
  . "$HOME/.nix-profile/etc/profile.d/nix.sh"
elif [[ -r "/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh" ]]; then
  # shellcheck disable=SC1091
  . "/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh"
fi

command -v nix >/dev/null 2>&1 || fail "Nix is missing; finish the Pulumi cloud-init bootstrap first"
command -v curl >/dev/null 2>&1 || fail "curl is missing"

mkdir -p "$HOME/.config/nix" "$HOME/code" "$HOME/.ssh"
chmod 700 "$HOME/.ssh" 2>/dev/null || true
nix_config="$HOME/.config/nix/nix.conf"
touch "$nix_config"

ensure_nix_setting() {
  local setting="$1"
  grep -Fqx "$setting" "$nix_config" 2>/dev/null || printf '%s\n' "$setting" >> "$nix_config"
}

ensure_nix_setting 'experimental-features = nix-command flakes'
ensure_nix_setting 'auto-optimise-store = true'

export PATH="$HOME/.local/bin:$HOME/.amp/bin:$HOME/.opencode/bin:$HOME/.nix-profile/bin:$PATH"

if ! command -v t3 >/dev/null 2>&1; then
  log "installing T3 Code"
  curl -fsSL https://t3.codes/install.sh | sh
fi

if ! command -v amp >/dev/null 2>&1; then
  log "installing Amp"
  curl -fsSL https://ampcode.com/install.sh | bash
fi

# Official OpenCode only (https://opencode.ai/v2/install → ~/.opencode/bin).
# Never pkgs.opencode — Home Manager owns config/service; the binary is upstream.
if [[ ! -x "$HOME/.opencode/bin/opencode" ]]; then
  log "installing OpenCode (official v2 installer)"
  curl -fsSL https://opencode.ai/v2/install | bash
fi

# Official Bun only (https://bun.com/install). Never pkgs.bun — Nix ships a
# different Zig-based build that is not the upstream runtime.
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"
if [[ ! -x "$BUN_INSTALL/bin/bun" ]]; then
  log "installing Bun (official installer)"
  curl -fsSL https://bun.com/install | bash
fi

export PATH="$HOME/.local/bin:$HOME/.amp/bin:$HOME/.opencode/bin:$BUN_INSTALL/bin:$HOME/.nix-profile/bin:$PATH"
command -v t3 >/dev/null 2>&1 || fail "T3 Code did not install on $(uname -m)"
command -v amp >/dev/null 2>&1 || fail "Amp did not install on $(uname -m)"
command -v bun >/dev/null 2>&1 || fail "Bun did not install on $(uname -m)"
[[ -x "$HOME/.opencode/bin/opencode" ]] || fail "OpenCode did not install on $(uname -m)"
# Refuse a Nix-store Bun if it somehow still wins PATH.
case "$(command -v bun)" in
  /nix/store/*)
    fail "Bun resolved to Nix store path $(command -v bun); remove pkgs.bun and use $BUN_INSTALL/bin/bun"
    ;;
esac
# Refuse a Nixpkgs OpenCode binary if it somehow still wins over ~/.opencode/bin.
case "$(command -v opencode 2>/dev/null || true)" in
  /nix/store/*-opencode-*/bin/opencode)
    fail "OpenCode resolved to Nixpkgs package $(command -v opencode); remove pkgs.opencode and use $HOME/.opencode/bin/opencode"
    ;;
esac

home_manager_link="$HOME/.config/home-manager"
home_manager_target="$repo_root/system/oci-agents"
mkdir -p "$HOME/.config"
if [[ -e "$home_manager_link" && ! -L "$home_manager_link" ]]; then
  fail "$home_manager_link exists and is not a symlink; move it before retrying"
fi
ln -sfn "$home_manager_target" "$home_manager_link"

log "activating Home Manager profile"
export OUTFITTING_REPO="$repo_root"
nix run github:nix-community/home-manager/release-26.05 -- \
  switch --impure --flake "$repo_root/system/oci-agents#oci-agents"

# Ubuntu ships GSSAPIAuthentication yes in /etc/ssh/ssh_config. Nix OpenSSH is
# built without GSSAPI, so every ssh/git call prints:
#   /etc/ssh/ssh_config line N: Unsupported option "gssapiauthentication"
# Comment the option out; package upgrades may restore it and need a re-run.
ensure_system_ssh_no_gssapi() {
  local ssh_config="/etc/ssh/ssh_config"
  if [[ ! -r "$ssh_config" ]]; then
    return 0
  fi
  if ! grep -Eq '^[[:space:]]*GSSAPIAuthentication[[:space:]]+yes[[:space:]]*$' "$ssh_config"; then
    return 0
  fi
  if ! command -v sudo >/dev/null 2>&1; then
    log "cannot silence GSSAPIAuthentication in $ssh_config without sudo"
    return 0
  fi
  log "disabling GSSAPIAuthentication in $ssh_config (Nix OpenSSH has no GSSAPI)"
  sudo sed -i \
    's/^[[:space:]]*GSSAPIAuthentication[[:space:]]\+yes[[:space:]]*$/    # GSSAPIAuthentication yes  # disabled: Nix OpenSSH has no GSSAPI/' \
    "$ssh_config" || log "could not edit $ssh_config"
}

ensure_system_ssh_no_gssapi

# Home Manager installs zsh but does not change the login shell on Ubuntu.
# Without this, SSH sessions stay on bash and never load programs.zsh.
ensure_login_shell_zsh() {
  local zsh_path current_shell shells_file
  shells_file="/etc/shells"

  if ! command -v zsh >/dev/null 2>&1; then
    log "zsh is not on PATH after Home Manager switch; skip login-shell change"
    return 0
  fi

  zsh_path="$(command -v zsh)"
  current_shell="$(getent passwd "$USER" 2>/dev/null | awk -F: '{print $NF}')"
  if [[ "$current_shell" == "$zsh_path" ]]; then
    return 0
  fi

  if [[ -r "$shells_file" ]] && ! grep -Fqx "$zsh_path" "$shells_file"; then
    if command -v sudo >/dev/null 2>&1; then
      log "registering $zsh_path in $shells_file"
      printf '%s\n' "$zsh_path" | sudo tee -a "$shells_file" >/dev/null
    else
      log "cannot update $shells_file without sudo; run: echo $zsh_path | sudo tee -a $shells_file"
    fi
  fi

  log "setting login shell to zsh ($zsh_path)"
  if command -v sudo >/dev/null 2>&1; then
    sudo chsh -s "$zsh_path" "$USER" 2>/dev/null || \
      log "could not set zsh as login shell (run: chsh -s $zsh_path)"
  else
    chsh -s "$zsh_path" 2>/dev/null || \
      log "could not set zsh as login shell (run: chsh -s $zsh_path)"
  fi
}

ensure_login_shell_zsh

# User services need lingering and a live user manager. A fresh SSH session
# often has no XDG_RUNTIME_DIR until the user@uid slice is running.
ensure_user_systemd() {
  local uid runtime_dir
  uid="$(id -u)"
  runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$uid}"

  if command -v sudo >/dev/null 2>&1 && command -v loginctl >/dev/null 2>&1; then
    if [[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null || true)" != "yes" ]]; then
      log "enabling user lingering for persistent services"
      sudo loginctl enable-linger "$USER" || \
        log "could not enable linger (run: sudo loginctl enable-linger $USER)"
    fi

    # Start the user manager so systemctl --user works in this non-login shell.
    if [[ ! -S "${runtime_dir}/bus" ]]; then
      log "starting user@$uid.service for the session bus"
      sudo systemctl start "user@$uid.service" 2>/dev/null || true
    fi
  fi

  if [[ -d "$runtime_dir" ]]; then
    export XDG_RUNTIME_DIR="$runtime_dir"
  fi
  if [[ -S "${runtime_dir}/bus" ]]; then
    export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${runtime_dir}/bus}"
  fi
}

ensure_user_systemd

if ! command -v systemctl >/dev/null 2>&1; then
  log "systemctl missing; skip user service start"
else
  if ! systemctl --user daemon-reload 2>/dev/null; then
    log "systemctl --user unavailable in this session; services start on next login"
  else
    for service in gnome-keyring-secrets.service amp-runner.service t3code.service opencode-web.service tailscale-serve.service manifold-anilist-drain.service; do
      if systemctl --user cat "$service" >/dev/null 2>&1; then
        if systemctl --user enable --now "$service" 2>/dev/null; then
          log "started $service"
        else
          log "could not start $service (check: systemctl --user status $service)"
        fi
      fi
    done
  fi
fi

log "installed harnesses: $(amp version 2>/dev/null || true), $(t3 --version 2>/dev/null || true), $(opencode --version 2>/dev/null || true)"
log "next: open a new SSH session (or exec zsh) so the Home Manager zsh profile loads"
log "then: ssh-add ~/.ssh/jfalava-gitAuth-elliptic  # once per machine"
log "then: authenticate with 'amp login' and 'opencode auth login'; pair T3 with 't3 pair --tailscale'"
log "UIs (tailnet only): T3 on MagicDNS :3773, OpenCode on MagicDNS :8443 (tailscale serve; nothing on :443)"
