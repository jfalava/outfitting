{
  config,
  lib,
  pkgs,
  ...
}:

let
  repoFromEnvironment = builtins.getEnv "OUTFITTING_REPO";
  outfittingRepo =
    if repoFromEnvironment != "" then repoFromEnvironment else "/home/jfalava/.config/outfitting/repo";
in
{
  imports = [ (builtins.toPath "${outfittingRepo}/packages/common/programs.nix") ];

  # Basic home manager settings
  home.username = "jfalava";
  home.homeDirectory = "/home/jfalava";
  home.stateVersion = "26.05";

  # Nixpkgs configuration
  nixpkgs.config.allowUnfree = true;

  # Core personal packages
  home.packages = with pkgs; [
    # Core utilities
    tree
    deno
    lazygit
    nodejs_latest
    python3
    zig
    zellij
    neovim
    less
    shellcheck
    zip
    _7zz
    p7zip
    nixd
    nil
    pnpm
    powershell
    tailspin # log viewer
    ranger
  ];

  # Session variables
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

    # Runtime paths
    PNPM_HOME = "${config.home.homeDirectory}/.local/share/pnpm";
    BUN_INSTALL = "${config.home.homeDirectory}/.bun";
    DENO_INSTALL = "${config.home.homeDirectory}/.deno";
  };

  # PATH additions
  home.sessionPath = [
    "${config.home.homeDirectory}/go/bin"
    "${config.home.homeDirectory}/.local/share/uv/bin"
    "${config.home.homeDirectory}/.cargo/bin"
    "${config.home.homeDirectory}/.amp/bin"
    "${config.home.homeDirectory}/.git-ai/bin"
    "${config.home.homeDirectory}/.vite-plus/bin"
  ];

  programs.zsh = {
    shellAliases = {
      explorer = "/mnt/c/WINDOWS/explorer.exe";
      lazyotp = "/mnt/c/bin/lazyotp.exe";
      cloudops-tools = "/mnt/c/Users/jalava/.bun/bin/cloudops-tools.exe";
    };

    plugins = lib.mkAfter [
      {
        name = "outfitting-wsl";
        src = ./zsh;
        file = "wsl.plugin.zsh";
      }
    ];
  };

  # Nix configuration for the user
  nix = {
    package = pkgs.nix;
    settings = {
      experimental-features = [
        "nix-command"
        "flakes"
      ];
      substituters = [
        "https://cache.nixos.org/"
        "https://nix-community.cachix.org"
      ];
      trusted-public-keys = [
        "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
        "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
      ];
      auto-optimise-store = true;
      max-jobs = "auto";
    };
  };
}
