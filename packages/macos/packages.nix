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
]
