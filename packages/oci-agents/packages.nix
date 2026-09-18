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
  # secret-tool plus the store path Bun.secrets dlopens via LD_LIBRARY_PATH.
  # The daemon itself is Ubuntu gnome-keyring from oci-agents.txt.
  libsecret
]
