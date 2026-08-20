{
  config,
  lib,
  pkgs,
  ...
}:

let
  repoFromEnvironment = builtins.getEnv "OUTFITTING_REPO";
  outfittingRepo =
    if repoFromEnvironment != "" then repoFromEnvironment else "/Users/jfalava/.config/outfitting/repo";
  audioOutputState = "${config.xdg.stateHome}/outfitting/audio-output-uid";
  fallbackAudioOutputUid = "BuiltInSpeakerDevice";
  deniedAudioOutputUids = [
    "1E6DBC77-0000-0000-0122-010380462778" # LG ULTRAGEAR+
    "3669B03C-0000-0000-0D1E-0104B53C2278" # MSI G27CQ4
  ];
  deniedAudioOutputPattern = lib.concatStringsSep "|" deniedAudioOutputUids;
  audioOutputGuard = pkgs.writeShellApplication {
    name = "audio-output-guard";
    runtimeInputs = [
      pkgs.coreutils
      pkgs.jq
      pkgs.switchaudio-osx
    ];
    text = ''
      state="${audioOutputState}"
      fallback="${fallbackAudioOutputUid}"
      denied_pattern="${deniedAudioOutputPattern}"
      poll_interval=3
      wake_gap=5
      reconnect_attempts=15

      log() {
        printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
      }

      get_current_uid() {
        SwitchAudioSource -c -t output -f json 2>/dev/null \
          | jq -r '.uid // empty' 2>/dev/null \
          || true
      }

      is_available() {
        local devices
        devices="$(SwitchAudioSource -a -t output -f json 2>/dev/null || true)"
        [ -n "$devices" ] \
          && printf '%s\n' "$devices" \
            | jq -e -s --arg uid "$1" 'any(.[]; .uid == $uid)' >/dev/null 2>&1
      }

      is_denied() {
        [[ "$1" =~ ^($denied_pattern)$ ]]
      }

      read_preferred() {
        if [ -r "$state" ]; then
          cat "$state"
        fi
      }

      save_preferred() {
        local existing uid temporary
        uid="$1"
        existing="$(read_preferred)"
        [ "$uid" = "$existing" ] && return

        mkdir -p "$(dirname "$state")"
        temporary="$state.tmp.$$"
        printf '%s\n' "$uid" > "$temporary"
        mv "$temporary" "$state"
      }

      select_uid() {
        SwitchAudioSource -t output -u "$1" >/dev/null 2>&1
      }

      use_fallback() {
        local reason
        reason="$1"
        if select_uid "$fallback"; then
          save_preferred "$fallback"
          log "selected built-in speakers: $reason"
        else
          log "could not select built-in speakers: $reason"
        fi
      }

      reconcile_output() {
        local current
        current="$(get_current_uid)"

        if [ -z "$current" ]; then
          use_fallback "no current output"
        elif is_denied "$current"; then
          use_fallback "blocked HDMI output $current"
        elif ! is_available "$current"; then
          use_fallback "current output disappeared"
        else
          save_preferred "$current"
        fi
      }

      restore_after_wake() {
        local attempt preferred
        preferred="$(read_preferred)"

        if [ -z "$preferred" ] || is_denied "$preferred"; then
          use_fallback "no valid saved output after wake"
          return
        fi

        if select_uid "$preferred"; then
          save_preferred "$preferred"
          log "restored saved output $preferred after wake"
          return
        fi

        if select_uid "$fallback"; then
          log "using built-in speakers while $preferred reconnects"
        else
          log "could not select built-in speakers after wake"
        fi

        attempt=0
        while [ "$attempt" -lt "$reconnect_attempts" ]; do
          sleep 1
          if select_uid "$preferred"; then
            save_preferred "$preferred"
            log "restored $preferred after $((attempt + 1)) seconds"
            return
          fi
          attempt=$((attempt + 1))
        done

        save_preferred "$fallback"
        log "$preferred remained unavailable; keeping built-in speakers"
      }

      initialize() {
        local current
        mkdir -p "$(dirname "$state")"
        current="$(get_current_uid)"

        if [ -n "$current" ] && ! is_denied "$current" && is_available "$current"; then
          save_preferred "$current"
        elif [ -n "$(read_preferred)" ]; then
          restore_after_wake
        else
          use_fallback "invalid output at guard startup"
        fi
      }

      initialize
      last_tick="$(date +%s)"

      while true; do
        sleep "$poll_interval"
        now="$(date +%s)"
        elapsed=$((now - last_tick))

        if [ "$elapsed" -ge "$wake_gap" ]; then
          restore_after_wake
        else
          reconcile_output
        fi

        last_tick="$(date +%s)"
      done
    '';
  };
in
{
  imports = [
    (builtins.toPath "${outfittingRepo}/packages/macos/programs.nix")
  ];

  # Home Manager needs a bit of information about you and the paths it should manage
  home.username = "jfalava";
  home.homeDirectory = "/Users/jfalava";
  home.stateVersion = "26.05";

  # Nix-managed and exclusive packages
  home.packages = import (builtins.toPath "${outfittingRepo}/packages/macos/packages.nix") {
    inherit pkgs;
  };

  # Keep the launchd log path valid before Home Manager loads the agent.
  home.activation.createAudioOutputStateDirectory = lib.hm.dag.entryBefore [ "setupLaunchAgents" ] ''
    mkdir -p "${config.xdg.stateHome}/outfitting"
  '';

  # CoreAudio exposes display audio devices whenever a monitor reconnects, but
  # macOS has no declarative setting to remove those devices. Keep the selected
  # non-display output by UID and immediately replace either monitor with the
  # built-in speakers when the preferred device disappears.
  launchd.agents.restore-audio-output = {
    enable = true;
    config = {
      ProgramArguments = [ "${audioOutputGuard}/bin/audio-output-guard" ];
      RunAtLoad = true;
      KeepAlive = true;
      ProcessType = "Background";
      ThrottleInterval = 5;
      StandardOutPath = "${config.xdg.stateHome}/outfitting/audio-output.log";
      StandardErrorPath = "${config.xdg.stateHome}/outfitting/audio-output.log";
    };
  };

  # Home Manager can also manage your environment variables through
  # 'home.sessionVariables'. These will be explicitly sourced when using a
  # shell provided by Home Manager.
  home.sessionVariables = {
    EDITOR = "vim";
    VISUAL = "zed";
    PAGER = "less";

    # Better colors for less/man pages
    LESS = "-R -M -i -j10";
    LESS_TERMCAP_mb = "\\e[1;31m"; # begin bold
    LESS_TERMCAP_md = "\\e[1;36m"; # begin blink
    LESS_TERMCAP_me = "\\e[0m"; # reset bold/blink
    LESS_TERMCAP_so = "\\e[01;44;33m"; # begin reverse video
    LESS_TERMCAP_se = "\\e[0m"; # reset reverse video
    LESS_TERMCAP_us = "\\e[1;32m"; # begin underline
    LESS_TERMCAP_ue = "\\e[0m"; # reset underline

  };

  # This is a per-user preference. Home Manager applies it as the logged-in
  # user, so F1–F12 are function keys instead of media shortcuts by default.
  targets.darwin.defaults.NSGlobalDomain."com.apple.keyboard.fnState" = true;

}
