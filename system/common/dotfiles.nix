{ config, lib, ... }:

{
  # Keep the shared SSH host policy consistent across every Home Manager
  # profile without taking ownership of the user's editable ~/.ssh/config.
  home.file.".config/outfitting/ssh.config" = {
    source = ../../dotfiles/ssh.config;
    force = true;
  };

  # Add the shared fragment once and preserve all user-managed SSH settings.
  # The main config remains a regular, editable file; the fragment is the
  # fixed repository policy included by it.
  home.activation.ensureOutfittingSshInclude = lib.hm.dag.entryAfter [ "linkGeneration" ] ''
    ssh_dir="${config.home.homeDirectory}/.ssh"
    ssh_config="$ssh_dir/config"
    include_line="Include ${config.home.homeDirectory}/.config/outfitting/ssh.config"

    mkdir -p "$ssh_dir"
    chmod 700 "$ssh_dir"

    # Replace a legacy Home Manager symlink with its contents before adding
    # the include, so this migration never edits a Nix store path.
    if [ -L "$ssh_config" ]; then
      temporary="$ssh_config.tmp.$$"
      if cat "$ssh_config" > "$temporary" 2>/dev/null; then
        rm -f "$ssh_config"
        mv "$temporary" "$ssh_config"
      else
        rm -f "$temporary" "$ssh_config"
      fi
    fi

    if [ ! -e "$ssh_config" ]; then
      printf '%s\n' "$include_line" > "$ssh_config"
    elif ! grep -Fqx "$include_line" "$ssh_config"; then
      temporary="$ssh_config.tmp.$$"
      {
        cat "$ssh_config"
        printf '%s\n' "$include_line"
      } > "$temporary"
      mv "$temporary" "$ssh_config"
    fi

    chmod 600 "$ssh_config"
  '';
}
