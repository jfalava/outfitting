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
  # Both UIs bind loopback only. Ingress is Tailscale Serve (HM-owned), not
  # 0.0.0.0 and not the raw Tailscale IP. Hostname-per-app via HTTPS ports:
  #   :3773 → T3      (https://oci-agents.<tailnet>.ts.net:3773/)
  #   :8443 → OpenCode (https://oci-agents.<tailnet>.ts.net:8443/)
  # Nothing is mounted on default :443. Path mounts are avoided: neither SPA
  # has a reliable base-path mode.
  tailscaleBin = "${pkgs.tailscale}/bin/tailscale";
  tailscaleServeScript = pkgs.writeShellScript "oci-agents-tailscale-serve" ''
    set -euo pipefail
    # Wait until tailscaled can answer; boot order alone is not enough after
    # a restart of the daemon.
    for _ in $(seq 1 30); do
      if ${tailscaleBin} status --self >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    ${tailscaleBin} serve reset || true
    ${tailscaleBin} serve --bg --yes --https=3773 http://127.0.0.1:3773
    ${tailscaleBin} serve --bg --yes --https=8443 http://127.0.0.1:4096
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

  # OpenCode on loopback. Do not use 0.0.0.0 or the Tailscale IP — Serve is
  # the only ingress (see tailscale-serve below).
  systemd.user.services.opencode-web = {
    Unit = {
      Description = "OpenCode Web Service";
      After = [ "network-online.target" ];
      Wants = [ "network-online.target" ];
    };
    Service = {
      WorkingDirectory = codeRoot;
      ExecStart = "${home}/.opencode/bin/opencode serve --hostname 127.0.0.1 --port 4096";
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

  # T3 on loopback only. Do not pass --tailscale-serve: that would fight the
  # HM-owned serve map (and reclaim / on every T3 restart).
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
      ExecStart = "${home}/.local/bin/t3 serve --host 127.0.0.1 --port 3773";
      Environment = serviceEnvironment;
      Restart = "on-failure";
      RestartSec = "15s";
    };
    Install.WantedBy = [ "default.target" ];
  };

  # Single owner of `tailscale serve` for this host. Runs after both backends
  # so a cold boot does not publish empty handlers first.
  systemd.user.services.tailscale-serve = {
    Unit = {
      Description = "Tailscale Serve map for oci-agents (T3 :3773, OpenCode :8443)";
      After = [
        "network-online.target"
        "tailscaled.service"
        "t3code.service"
        "opencode-web.service"
      ];
      Wants = [
        "network-online.target"
        "t3code.service"
        "opencode-web.service"
      ];
    };
    Service = {
      Type = "oneshot";
      RemainAfterExit = true;
      ExecStart = "${tailscaleServeScript}";
      # Clear handlers on stop so a disabled host does not keep advertising.
      ExecStop = "${tailscaleBin} serve reset";
      Environment = serviceEnvironment;
    };
    Install.WantedBy = [ "default.target" ];
  };
}
