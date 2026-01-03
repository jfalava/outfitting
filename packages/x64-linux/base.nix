# Base (personal) Home Manager configuration using flake composition
# This serves as the foundation that work configuration extends

{ config, pkgs, ... }:

let
  # Repository path - used for dotfile symlinks
  # Default location set by installation scripts: ~/.config/outfitting/repo
  # To customize: change this path AND update ~/.config/outfitting/repo-path (or run set_outfitting_repo)
  outfittingRepo = "${config.home.homeDirectory}/.config/outfitting/repo";

in
{
  # Basic home manager settings
  home.username = "jfalava";
  home.homeDirectory = "/home/jfalava";
  home.stateVersion = "25.11";

  # Nixpkgs configuration
  nixpkgs.config.allowUnfree = true;

  # Core personal packages
  home.packages = with pkgs; [
    # Core utilities
    bat
    eza
    fastfetch
    fzf
    ripgrep
    starship
    tree
    zoxide
    zsh
    zsh-autosuggestions
    zsh-syntax-highlighting
    deno
    go
    lazygit
    nodejs_latest
    python3
    zig
    zellij
    neovim
    fd
    jq
    less
    shellcheck
    zip
    _7zz
    p7zip
    nixd
    nil
    pnpm
    github-cli
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
    "${config.home.homeDirectory}/.local/bin"
    "${config.home.homeDirectory}/go/bin"
    "${config.home.homeDirectory}/.local/share/pnpm"
    "${config.home.homeDirectory}/.bun/bin"
    "${config.home.homeDirectory}/.deno/bin"
    "${config.home.homeDirectory}/.local/share/uv/bin"
    "${config.home.homeDirectory}/.opencode/bin"
    "${config.home.homeDirectory}/.cargo/bin"
  ];

  # Dotfiles management - symlink to home directory
  # Using absolute paths with --impure flag for installation
  home.file = {
    ".zshrc".source = "${outfittingRepo}/dotfiles/.zshrc-wsl";
    ".zshrc-base".source = "${outfittingRepo}/dotfiles/.zshrc-base";
  };

  # Git configuration (personal)
  programs.git = {
    enable = true;

    signing = {
      key = "${config.home.homeDirectory}/.ssh/jfalava-gitSign-elliptic";
      signByDefault = true;
    };

    settings = {
      user = {
        name = "Jorge Fernando Álava";
        email = "git@jfa.dev";
      };

      color.ui = "auto";
      gpg.format = "ssh";
      commit.gpgsign = true;
      tag.gpgsign = true;

      filter.lfs = {
        required = true;
        clean = "git-lfs clean -- %f";
        smudge = "git-lfs smudge -- %f";
        process = "git-lfs filter-process";
      };

      alias = {
        undo = "reset --soft HEAD^";
      };
    };
  };

  # Program configurations
  programs.home-manager.enable = true;

  programs.bat = {
    enable = true;
    config = {
      theme = "Dracula";
      style = "auto";
    };
  };

  programs.eza = {
    enable = true;
    enableZshIntegration = true;
    git = true;
    icons = "always";
  };

  programs.ripgrep = {
    enable = true;
    arguments = [
      "--hidden"
      "--follow"
      "--smart-case"
      "--line-number"
      "--column"
      "--max-columns=500"
      "--max-filesize=10M"

      # Color configuration
      "--colors=line:fg:yellow"
      "--colors=line:style:bold"
      "--colors=path:fg:green"
      "--colors=path:style:bold"
      "--colors=match:fg:black"
      "--colors=match:bg:yellow"
      "--colors=match:style:bold"

      # Exclusions
      "--glob=!.git/"
      "--glob=!node_modules/"
      "--glob=!.venv/"
      "--glob=!__pycache__/"
      "--glob=!*.pyc"
      "--glob=!.DS_Store"
      "--glob=!.pytest_cache/"
      "--glob=!.mypy_cache/"
      "--glob=!.tox/"
      "--glob=!dist/"
      "--glob=!build/"
      "--glob=!*.egg-info/"
      "--glob=!.next/"
      "--glob=!.nuxt/"
      "--glob=!.cache/"
      "--glob=!*.min.js"
      "--glob=!*.min.css"
      "--glob=!package-lock.json"
      "--glob=!pnpm-lock.yaml"
      "--glob=!yarn.lock"
      "--glob=!Cargo.lock"
      "--glob=!go.sum"
      "--glob=!*.log"
      "--glob=!*.swp"
      "--glob=!*.swo"
      "--glob=!*~"
      "--glob=!.terraform/"
      "--glob=!.terragrunt-cache/"
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
