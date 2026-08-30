{ pkgs }:
with pkgs;
(import ../common/packages.nix { inherit pkgs; })
++ [
  nixfmt
  terraform-ls
  terraform
  restic
  rustic
  llama-cpp
  switchaudio-osx
  qbittorrent # GUI: Qt-based desktop client (macOS has display server). For headless see qbittorrent-nox on server/WSL
]
