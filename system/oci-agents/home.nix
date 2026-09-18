{
  config,
  lib,
  pkgs,
  ...
}:

let
  repoFromEnvironment = builtins.getEnv "OUTFITTING_REPO";
  outfittingRepo =
    if repoFromEnvironment != "" then
      repoFromEnvironment
    else
      "${config.home.homeDirectory}/.config/outfitting/source";
in
{
  imports = [
    (builtins.toPath "${outfittingRepo}/packages/common/programs.nix")
    ./agents.nix
  ];

  home.username = "jfalava";
  home.homeDirectory = "/home/jfalava";
  home.stateVersion = "26.05";

  home.packages = import (builtins.toPath "${outfittingRepo}/packages/oci-agents/packages.nix") {
    inherit pkgs;
  };

  home.sessionVariables = {
    EDITOR = "vim";
    VISUAL = "vim";
    PAGER = "less";
  };

  # Headless Ubuntu has no graphical session to unlock GNOME Keyring. Start
  # the secrets component on SSH login so libsecret-backed CLIs can use it.
  # Do not request the SSH component: it would replace SSH_AUTH_SOCK and break
  # forwarded SSH agents.
  home.file = {
    ".profile" = {
      force = true;
      text = ''
        # Load Home Manager session env so home.sessionPath entries are applied.
        for hm_session_file in "$HOME/.nix-profile/etc/profile.d/hm-session-vars.sh" "/nix/var/nix/profiles/default/etc/profile.d/hm-session-vars.sh"; do
          if [ -r "$hm_session_file" ]; then
            . "$hm_session_file"
            break
          fi
        done

        # SSH sessions on oci-agents are headless, so unlock a passwordless
        # login keyring. The secrets component is activated through D-Bus;
        # deliberately do not request the ssh component.
        if [ -n "''${SSH_CONNECTION:-}" ] \
          && command -v gnome-keyring-daemon >/dev/null 2>&1; then
          printf '\n' | gnome-keyring-daemon --unlock >/dev/null 2>&1 || true
        fi
      '';
    };
    ".zprofile" = {
      force = true;
      text = ''
        # Zsh login shells source .zprofile before .zshrc.
        if [ -r "$HOME/.profile" ]; then
          . "$HOME/.profile"
        fi
      '';
    };
  };

  # The shared profile targets graphical developer machines. Override the
  # editor defaults for this headless host.
  programs.zsh = {
    sessionVariables.EDITOR = lib.mkForce "vim";
    shellAliases.editor = lib.mkForce "vim";
  };

  # The shared configuration assumes the user's signing key is present. The
  # Pulumi stack provisions only a login public key, so signing is opt-in here
  # until the private signing key is provisioned separately.
  programs.git = {
    signing.signByDefault = lib.mkForce false;
    settings.commit.gpgsign = lib.mkForce false;
    settings.tag.gpgsign = lib.mkForce false;
  };
}
