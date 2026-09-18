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

        # Prefer multi-user Nix when the per-user profile is absent.
        if ! command -v nix >/dev/null 2>&1; then
          if [ -r "/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh" ]; then
            . "/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh"
          elif [ -r "$HOME/.nix-profile/etc/profile.d/nix.sh" ]; then
            . "$HOME/.nix-profile/etc/profile.d/nix.sh"
          fi
        fi

        # User systemd / libsecret need a session bus address in SSH sessions.
        if [ -z "''${XDG_RUNTIME_DIR:-}" ] && [ -d "/run/user/$(id -u)" ]; then
          export XDG_RUNTIME_DIR="/run/user/$(id -u)"
        fi
        if [ -z "''${DBUS_SESSION_BUS_ADDRESS:-}" ] && [ -n "''${XDG_RUNTIME_DIR:-}" ] \
          && [ -S "$XDG_RUNTIME_DIR/bus" ]; then
          export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
        fi

        # SSH sessions on oci-agents are headless, so unlock a passwordless
        # login keyring. The secrets component is activated through D-Bus;
        # deliberately do not request the ssh component.
        if [ -n "''${SSH_CONNECTION:-}" ] \
          && command -v gnome-keyring-daemon >/dev/null 2>&1; then
          if [ -n "''${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
            printf '\n' | gnome-keyring-daemon --unlock --components=secrets >/dev/null 2>&1 || true
          fi
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
  # editor defaults for this headless host and load oci-agents shell helpers
  # (hm-* and a local ssh-agent when forwarding is absent).
  programs.zsh = {
    sessionVariables.EDITOR = lib.mkForce "vim";
    shellAliases.editor = lib.mkForce "vim";

    plugins = lib.mkAfter [
      {
        name = "outfitting-oci-agents";
        src = ./zsh;
        file = "oci-agents.plugin.zsh";
      }
    ];
  };

  # The shared configuration assumes the user's signing key is present. The
  # Pulumi stack provisions only a login public key, so signing is opt-in here
  # until the private signing key is provisioned separately.
  programs.git = {
    signing.signByDefault = lib.mkForce false;
    settings.commit.gpgsign = lib.mkForce false;
    settings.tag.gpgsign = lib.mkForce false;
  };

  # Headless host: drop the Chrome DevTools MCP that needs a local browser.
  programs.opencode.settings.mcp = lib.mkForce {
    "Cloudflare" = {
      type = "remote";
      url = "https://mcp.cloudflare.com/mcp";
      oauth = { };
    };
    "Cloudflare Bindings" = {
      type = "remote";
      url = "https://bindings.mcp.cloudflare.com/mcp";
      oauth = { };
    };
    "Cloudflare Builds" = {
      type = "remote";
      url = "https://builds.mcp.cloudflare.com/mcp";
      oauth = { };
    };
    "Cloudflare Docs" = {
      type = "remote";
      url = "https://docs.mcp.cloudflare.com/mcp";
      oauth = { };
    };
    "Cloudflare Observability" = {
      type = "remote";
      url = "https://observability.mcp.cloudflare.com/mcp";
      oauth = { };
    };
    "Machine Memory" = {
      type = "remote";
      url = "https://machine-memory.jfa.dev/mcp";
      oauth = { };
    };
  };
}
