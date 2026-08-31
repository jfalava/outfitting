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
  # Outputs in priority order: the guard always promotes the highest entry
  # that is currently available.
  preferredAudioOutputUids = [
    "2C-76-00-D3-DE-A4:output" # AirPods Pro
    "AppleUSBAudioEngine:Topping:E30:1112000:1" # Topping E30
    "BuiltInSpeakerDevice" # Mac mini Speakers
  ];
  fallbackAudioOutputUid = "BuiltInSpeakerDevice";
  preferredAudioOutputPattern = lib.concatStringsSep "\n" preferredAudioOutputUids;
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
      preferred="${preferredAudioOutputPattern}"
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

      promote_preferred() {
        local candidate current
        current="$(get_current_uid)"
        # UID list is newline-separated with no spaces, so word splitting is safe.
        for candidate in $preferred; do
          if is_available "$candidate"; then
            if [ "$candidate" = "$current" ]; then
              return 0
            fi
            if select_uid "$candidate"; then
              save_preferred "$candidate"
              log "selected preferred output $candidate"
              return 0
            fi
          fi
        done
        return 1
      }

      restore_after_wake() {
        local attempt preferred
        preferred="$(read_preferred)"

        if [ -z "$preferred" ]; then
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
        mkdir -p "$(dirname "$state")"
        promote_preferred || use_fallback "no preferred output at guard startup"
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
          promote_preferred || use_fallback "no preferred output available"
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

  # macOS has no declarative audio-output priority. The guard polls CoreAudio
  # and always promotes the highest available UID from preferredAudioOutputUids
  # (E30 first, built-in speakers second), so replugging the E30 takes over
  # automatically and unplugging it falls back to the speakers.
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

  # Logitech G515 TKL (1133-50008) and its Lightspeed USB Receiver (1133-50495).
  # Left cluster Mac positions: Win→Option, Alt→Command.
  # AltGr: do not swap Right Option↔Command. The right-of-space key often
  # emits Right Command (Mac firmware / tester shows ⌘); map that one-way to
  # Right Option so AltGr character input works. Function (0xFF00000003) is
  # not AltGr and is not remapped here — G515 Fn is firmware-side.
  targets.darwin.currentHostDefaults.NSGlobalDomain = {
    "com.apple.keyboard.modifiermapping.1133-50008-0" = [
      {
        HIDKeyboardModifierMappingSrc = 30064771299; # Left Command (Win)
        HIDKeyboardModifierMappingDst = 30064771298; # Left Option
      }
      {
        HIDKeyboardModifierMappingSrc = 30064771298; # Left Option (Alt)
        HIDKeyboardModifierMappingDst = 30064771299; # Left Command
      }
      {
        HIDKeyboardModifierMappingSrc = 30064771303; # Right Command
        HIDKeyboardModifierMappingDst = 30064771302; # Right Option (AltGr)
      }
    ];
    "com.apple.keyboard.modifiermapping.1133-50495-0" = [
      {
        HIDKeyboardModifierMappingSrc = 30064771299; # Left Command (Win)
        HIDKeyboardModifierMappingDst = 30064771298; # Left Option
      }
      {
        HIDKeyboardModifierMappingSrc = 30064771298; # Left Option (Alt)
        HIDKeyboardModifierMappingDst = 30064771299; # Left Command
      }
      {
        HIDKeyboardModifierMappingSrc = 30064771303; # Right Command
        HIDKeyboardModifierMappingDst = 30064771302; # Right Option (AltGr)
      }
    ];
  };

}
