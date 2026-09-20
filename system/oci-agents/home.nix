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
  # Headless Ubuntu has no graphical session to unlock GNOME Keyring. The
  # secrets daemon is started unlocked with an empty password. Do not request
  # the SSH component: it would replace SSH_AUTH_SOCK and break forwarded
  # SSH agents.
  maskUserUnit =
    name: pkgs.runCommand "masked-${name}" { } "ln -s /dev/null $out";
  # Passwordless login keyring. A leftover locked login.keyring (from PAM or
  # from --unlock spawning a second daemon) must be removed once; the service
  # then creates an empty-password keyring on first start.
  emptyKeyringPassword = pkgs.writeText "oci-agents-empty-keyring-password" "\n";
in
{
  imports = [
    (builtins.toPath "${outfittingRepo}/packages/common/programs.nix")
    (builtins.toPath "${outfittingRepo}/system/common/dotfiles.nix")
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

  # Ubuntu gnome-keyring enables a graphical-session daemon plus gcr-ssh-agent.
  # The vendor socket steals %t/keyring/control so --unlock cannot talk to the
  # running daemon; gcr-ssh-agent would replace SSH_AUTH_SOCK.
  xdg.configFile."systemd/user/gcr-ssh-agent.socket".source = maskUserUnit "gcr-ssh-agent.socket";
  xdg.configFile."systemd/user/gcr-ssh-agent.service".source = maskUserUnit "gcr-ssh-agent.service";
  xdg.configFile."systemd/user/gnome-keyring-daemon.socket".source =
    maskUserUnit "gnome-keyring-daemon.socket";
  xdg.configFile."systemd/user/gnome-keyring-daemon.service".source =
    maskUserUnit "gnome-keyring-daemon.service";

  systemd.user.services.gnome-keyring-secrets = {
    Unit = {
      Description = "GNOME Keyring secrets component";
      After = [ "dbus.service" ];
    };
    Service = {
      Type = "simple";
      Environment = [ "GNOME_KEYRING_CONTROL=%t/keyring" ];
      StandardInput = "file:${emptyKeyringPassword}";
      ExecStart = "/usr/bin/gnome-keyring-daemon --foreground --components=secrets --control-directory=%t/keyring --unlock";
      Restart = "on-failure";
      RestartSec = "2s";
    };
    Install.WantedBy = [ "default.target" ];
  };

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
        # gnome-keyring-secrets.service owns the unlocked Secret Service.
        if [ -z "''${XDG_RUNTIME_DIR:-}" ] && [ -d "/run/user/$(id -u)" ]; then
          export XDG_RUNTIME_DIR="/run/user/$(id -u)"
        fi
        if [ -z "''${DBUS_SESSION_BUS_ADDRESS:-}" ] && [ -n "''${XDG_RUNTIME_DIR:-}" ] \
          && [ -S "$XDG_RUNTIME_DIR/bus" ]; then
          export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
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
    shellAliases.outfit = "outfitting-manager";

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
  programs.opencode.settings.mcp = lib.mkForce (
    builtins.removeAttrs (import "${outfittingRepo}/packages/common/opencode-mcp.nix") [
      "Chrome DevTools"
    ]
  );
}
