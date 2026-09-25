{ pkgs }:
with pkgs;
[
  nixd
  nixfmt
  nil
  powershell
  python3
  zig
  nodejs_24
  git-lfs
  lazygit
  neovim
  p7zip
  pnpm
  shellcheck
  tree
]
++ lib.optionals stdenv.hostPlatform.isLinux [
  # Provides wl-copy for clipboard-aware commands in Linux SSH sessions.
  wl-clipboard
]
