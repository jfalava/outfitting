{ pkgs }:
with pkgs;

(import ../common/packages.nix { inherit pkgs; })
++ [
  less
  zip
  _7zz
  tmux
  openssl
  openssh
  # Keep secret-tool available for validating the Ubuntu Secret Service.
  # Bun.secrets uses Ubuntu's system libsecret; do not override LD_LIBRARY_PATH
  # with Nix GLib/libsecret libraries.
  libsecret
  ffmpeg
]
