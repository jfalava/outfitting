{
  config,
  lib,
  pkgs,
  ...
}:

let
  home = config.home.homeDirectory;
  codeRoot = "${home}/code";
  servicePath = lib.concatStringsSep ":" [
    "${home}/.local/bin"
    "${home}/.amp/bin"
    "${home}/.bun/bin"
    "${home}/.opencode/bin"
    "${home}/.nix-profile/bin"
    "/usr/local/bin"
    "/usr/bin"
    "/bin"
  ];
  machineGuidance = builtins.readFile ./agent-guidance.md;
in
{
  home.sessionPath = [
    "${home}/.local/bin"
    "${home}/.amp/bin"
  ];

  # Amp and OpenCode each have their own global instruction path. Keep their
  # content identical so the three harnesses receive the same host policy.
  # T3 reads AGENTS.md from the working tree; point its global path here too.
  home.file = {
    ".config/amp/AGENTS.md".text = machineGuidance;
    ".config/opencode/AGENTS.md".text = machineGuidance;
    ".config/t3/AGENTS.md".text = machineGuidance;
  };

  xdg.configFile."amp/settings.json".text = builtins.toJSON {
    "amp.runner.autoUpdate.enabled" = true;
    "amp.remoteThreadCreation.enabled" = false;
    "amp.notifications.enabled" = false;
    "amp.showCosts" = true;
    "amp.terminal.detailsExpandedByDefault" = false;
  };

  # Keep OpenCode's configuration in Home Manager, but do not put even a
  # wrapper for its upstream-installed binary in the Nix profile. The web
  # service below launches ~/.opencode/bin/opencode directly. The pinned Home
  # Manager module requires a non-null package, so use an empty placeholder
  # that contributes no executable to the profile.
  programs.opencode.package = lib.mkForce (
    pkgs.runCommand "opencode-external" { } "mkdir -p $out"
  );
  programs.opencode.web.enable = lib.mkForce false;

  home.activation.ensureOpenCodeServiceEnv = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    env_file="${config.xdg.configHome}/opencode/service.env"
    if [ -L "$env_file" ]; then
      rm -f "$env_file"
    fi
    if [ ! -f "$env_file" ]; then
      mkdir -p "$(dirname "$env_file")"
      umask 077
      printf 'OPENCODE_SERVER_PASSWORD=%s\n' \
        "$(${pkgs.openssl}/bin/openssl rand -hex 32)" > "$env_file"
      chmod 600 "$env_file"
    fi
  '';

  # systemd --user does not import a login environment. OpenCode reads $SHELL
  # for summoned PTYs (`$SHELL -l`) and inherits PATH for `/bin/bash -c` tools.
  # Without these, the web UI gets /bin/bash and a distro PATH.
  systemd.user.services.opencode-web = {
    Unit = {
      Description = "OpenCode Web Service";
      After = [ "network.target" ];
    };
    Service = {
      WorkingDirectory = codeRoot;
      ExecStart = "${home}/.opencode/bin/opencode serve --hostname 0.0.0.0 --port 4096";
      EnvironmentFile = "${config.xdg.configHome}/opencode/service.env";
      Environment = [
        "HOME=${home}"
        "PATH=${servicePath}"
        "SHELL=${config.home.profileDirectory}/bin/zsh"
      ];
      Restart = "always";
      RestartSec = 5;
    };
    Install.WantedBy = [ "default.target" ];
  };

  systemd.user.services.amp-runner = {
    Unit = {
      Description = "Amp runner for oci-agents";
      After = [ "network-online.target" ];
      Wants = [ "network-online.target" ];
      ConditionFileIsExecutable = "${home}/.amp/bin/amp";
    };
    Service = {
      Type = "simple";
      WorkingDirectory = codeRoot;
      ExecStart = "${home}/.amp/bin/amp --no-tui --runner-id oci-agents --discover-dirs --remote-control-terminal";
      Environment = [
        "HOME=${home}"
        "PATH=${servicePath}"
      ];
      Restart = "on-failure";
      RestartSec = "15s";
    };
    Install.WantedBy = [ "default.target" ];
  };

  # T3's own service installer would create a second, unmanaged unit. Keep
  # this service in Home Manager so the Tailscale-only endpoint and PATH are
  # explicit and reproducible.
  systemd.user.services.t3code = {
    Unit = {
      Description = "T3 Code headless server for oci-agents";
      After = [ "network-online.target" ];
      Wants = [ "network-online.target" ];
      ConditionFileIsExecutable = "${home}/.local/bin/t3";
    };
    Service = {
      Type = "simple";
      WorkingDirectory = codeRoot;
      ExecStart = "${home}/.local/bin/t3 serve --tailscale-serve";
      Environment = [
        "HOME=${home}"
        "PATH=${servicePath}"
      ];
      Restart = "on-failure";
      RestartSec = "15s";
    };
    Install.WantedBy = [ "default.target" ];
  };
}
