#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf '[ubuntu-wsl] error: %s\n' "$*" >&2
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
elif [[ -r "/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh" ]]; then
  # shellcheck disable=SC1091
  . "/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh"
fi

command -v nix >/dev/null 2>&1 || fail "Nix is missing; install Nix with the WSL installer first"

home_manager_link="$HOME/.config/home-manager"
home_manager_target="$repo_root/system/ubuntu-wsl"
mkdir -p "$HOME/.config"
if [[ -e "$home_manager_link" && ! -L "$home_manager_link" ]]; then
  fail "$home_manager_link exists and is not a symlink; move it before retrying"
fi
ln -sfn "$home_manager_target" "$home_manager_link"

export OUTFITTING_REPO="$repo_root"
nix run github:nix-community/home-manager/release-26.05 -- \
  switch --impure --flake "path:$repo_root/system/ubuntu-wsl#jfalava"

# Ubuntu ships GSSAPIAuthentication yes; Nix OpenSSH has no GSSAPI and warns on
# every ssh/git call. Comment it out when sudo is available.
if [[ -r /etc/ssh/ssh_config ]] &&
  grep -Eq '^[[:space:]]*GSSAPIAuthentication[[:space:]]+yes[[:space:]]*$' /etc/ssh/ssh_config &&
  command -v sudo >/dev/null 2>&1; then
  sudo sed -i \
    's/^[[:space:]]*GSSAPIAuthentication[[:space:]]\+yes[[:space:]]*$/    # GSSAPIAuthentication yes  # disabled: Nix OpenSSH has no GSSAPI/' \
    /etc/ssh/ssh_config || true
fi
