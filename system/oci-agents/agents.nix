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

  # OpenCode's real binary lives at ~/.opencode/bin (official installer). The
  # shared programs.opencode module still owns config + the web unit (wrapper
  # package → that binary) and binds 0.0.0.0:4096. Keep the password in the
  # user-owned file rather than putting it in the Nix store.
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
