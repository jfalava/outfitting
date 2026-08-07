{ pkgs }:
with pkgs;
(import ../common/packages.nix { inherit pkgs; })
++ [
  less
  zip
  _7zz
  tailspin
]
