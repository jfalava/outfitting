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
  gnome-keyring
  libsecret
  # Headless libsecret consumers need a session bus; dbus is the transport.
  dbus
]
