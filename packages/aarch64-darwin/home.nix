{ config, pkgs, ... }:

let
  # Repository path - customize if your outfitting repo is in a different location
  # Default location set by installation scripts: ~/.config/outfitting/repo
  # To customize: change this path AND update ~/.config/outfitting/repo-path (or run set_outfitting_repo)
  outfittingRepo = "${config.home.homeDirectory}/.config/outfitting/repo";

in
{
  # Home Manager needs a bit of information about you and the paths it should manage
  home.username = "jfalava";
  home.homeDirectory = "/Users/jfalava";
  home.stateVersion = "25.11";

  # The home.packages option allows you to install Nix packages into your environment
  home.packages = with pkgs; [
    bat
    eza
    fastfetch
    fzf
    ripgrep
    starship
    tree
    btop
    zoxide
    zsh
    zsh-autosuggestions
    zsh-syntax-highlighting
    deno
    go
    lazygit
    nodejs_24
    python3
    zig
    zellij
    neovim
    fd
    jq
    less
    shellcheck
    zip
    p7zip
    nixd
    nil
    pnpm
    git
    ffmpeg_7-headless
    cloudflared
    github-cli
    ani-cli
    sherlock
  ];

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

    # Runtime paths
    PNPM_HOME = "${config.home.homeDirectory}/.local/share/pnpm";
    BUN_INSTALL = "${config.home.homeDirectory}/.bun";
    DENO_INSTALL = "${config.home.homeDirectory}/.deno";
  };

  # Add directories to PATH
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

  # Dotfiles management - symlink your dotfiles to home directory
  home.file = {
    ".zshrc".source = "${outfittingRepo}/dotfiles/.zshrc-macos";
    ".zshrc-base".source = "${outfittingRepo}/dotfiles/.zshrc-base";
  };

  # Program-specific configurations using Home Manager modules
  programs.home-manager.enable = true;

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
}
