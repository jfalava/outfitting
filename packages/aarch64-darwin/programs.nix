{ config, lib, ... }:

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

  programs.twitch-tui.enable = true;

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
        src = ./zsh;
        file = "macos.plugin.zsh";
      }
    ];
  };

  # Ghostty loads this macOS-specific path after its XDG configuration.
  home.file."Library/Application Support/com.mitchellh.ghostty/config.ghostty".text = ''
    config-file = ${config.xdg.configHome}/ghostty/config
  '';
}
