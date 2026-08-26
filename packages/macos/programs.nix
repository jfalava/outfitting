{ config, lib, pkgs, ... }:

let
  repoFromEnvironment = builtins.getEnv "OUTFITTING_REPO";
  outfittingRepo =
    if repoFromEnvironment != "" then repoFromEnvironment else "/Users/jfalava/.config/outfitting/repo";
in
{
  imports = [
    (builtins.toPath "${outfittingRepo}/packages/common/programs.nix")
    ./zed.nix
  ];

  # Cask-backed GUI application: Homebrew owns the package, Home Manager owns
  # its declarative configuration.
  programs.ghostty = {
    enable = true;
    package = null;
    enableZshIntegration = false;

    settings = {
      "font-family" = "VictorMono Nerd Font Mono";
      "font-style" = "bold";
      "font-size" = 16;
      theme = "light:tokyonight day,dark:tokyonight storm";
    };
  };

  home.sessionPath = [ "/Applications" ];

  # twitch-tui reads its OAuth token from $TWT_TOKEN, which overrides the token
  # key in config.toml. Home Manager owns config.toml (a read-only symlink into
  # the Nix store), so the token lives in a user-editable, chmod-600 env file
  # next to it that is never copied into the Nix store. The wrapper injects it
  # so `twt` works regardless of the shell that launches it.
  programs.twitch-tui = {
    enable = true;
    package = pkgs.writeShellApplication {
      name = "twt";
      runtimeInputs = [ pkgs.twitch-tui ];
      text = ''
        token_file="${config.xdg.configHome}/twt/token.env"
        if [ -r "$token_file" ]; then
          TWT_TOKEN="$(cat "$token_file")"
          export TWT_TOKEN
        else
          printf '%s\n' "twitch-tui: missing $token_file" \
            "Create it with: echo 'oauth:YOUR_TOKEN' > $token_file && chmod 600 $token_file" >&2
        fi
        exec "${pkgs.twitch-tui}/bin/twt" "$@"
      '';
    };
    settings = {
      twitch = {
        username = "criccadamus";
        channel = "criccadamus";
        server = "irc.chat.twitch.tv";
      };
    };
  };

  # Create the token env file only if missing; never overwrite user edits.
  home.activation.createTwitchTokenEnv = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    token_env="${config.xdg.configHome}/twt/token.env"
    if [ ! -f "$token_env" ]; then
      mkdir -p "$(dirname "$token_env")"
      umask 177
      cat > "$token_env" <<'EOF'
oauth:REPLACE_WITH_YOUR_TWITCH_TOKEN
EOF
      chmod 600 "$token_env"
      echo "twitch-tui: created $token_env — set TWT_TOKEN to your Twitch OAuth token."
    fi
  '';

  programs.zsh = {
    shellAliases = {
      show = "open";
      finder = "open .";
      nix-clean = "sudo nix-collect-garbage -d";
      nix-search = "nix search nixpkgs";
      nix-shell = "nix shell nixpkgs#";
      zed = "/Applications/Zed.app/Contents/MacOS/cli -n";
      o = "outfit";
    };

    plugins = lib.mkAfter [
      {
        name = "outfitting-macos";
        src = ../../system/macos/zsh;
        file = "macos.plugin.zsh";
      }
    ];
  };

  # Ghostty loads this macOS-specific path after its XDG configuration.
  home.file."Library/Application Support/com.mitchellh.ghostty/config.ghostty".text = ''
    config-file = ${config.xdg.configHome}/ghostty/config
  '';
}
