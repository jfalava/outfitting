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
  # systemd --user does not import a login environment. Harnesses read $SHELL
  # for summoned PTYs and inherit PATH for tool spawns.
  serviceEnvironment = [
    "HOME=${home}"
    "PATH=${servicePath}"
    "SHELL=${config.home.profileDirectory}/bin/zsh"
  ];
  machineGuidance = builtins.readFile ./agent-guidance.md;
  # Bind only the Tailscale IPv4 address. 0.0.0.0 would also listen on the
  # public OCI IPv6/IPv4 path; 127.0.0.1 would drop direct tailnet access.
  # tailscale ip -4 is resolved at start so the unit survives CGNAT renumbering.
  opencodeWebScript = pkgs.writeShellScript "opencode-web" ''
    set -euo pipefail
    host="$(${pkgs.tailscale}/bin/tailscale ip -4)"
    exec ${home}/.opencode/bin/opencode serve --hostname "$host" --port 4096
  '';
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

  systemd.user.services.opencode-web = {
    Unit = {
      Description = "OpenCode Web Service";
      After = [
        "network-online.target"
        "tailscaled.service"
      ];
      Wants = [ "network-online.target" ];
    };
    Service = {
      WorkingDirectory = codeRoot;
      ExecStart = "${opencodeWebScript}";
      EnvironmentFile = "${config.xdg.configHome}/opencode/service.env";
      Environment = serviceEnvironment;
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
      Environment = serviceEnvironment;
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
      Environment = serviceEnvironment;
      Restart = "on-failure";
      RestartSec = "15s";
    };
    Install.WantedBy = [ "default.target" ];
  };
}
