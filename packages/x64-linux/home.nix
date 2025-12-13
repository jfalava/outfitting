{ config, pkgs, ... }:

{
  nixpkgs.config.allowUnfree = true;

  # Home Manager needs a bit of information about you and the paths it should manage
  home.username = "jfalava";
  home.homeDirectory = "/home/jfalava";

  # This value determines the Home Manager release that your configuration is
  # compatible with. This helps avoid breakage when a new Home Manager release
  # introduces backwards incompatible changes.
  home.stateVersion = "24.05";

  # The home.packages option allows you to install Nix packages into your environment
  home.packages = with pkgs; [
    bat
    eza
    fastfetch
    fzf
    ripgrep
    starship
    tree
    zenith
    zoxide
    zsh
    zsh-autosuggestions
    zsh-syntax-highlighting
    deno
    git
    go
    lazygit
    nodejs_latest
    python3
    zig
    packer
    terraform
    curl
    fd
    jq
    less
    nano
    shellcheck
    unzip
    wget
    zip
    _7zz  # 7zip
    p7zip
    unrar
    nixd
  ];

  # Home Manager can also manage your environment variables through
  # 'home.sessionVariables'. These will be explicitly sourced when using a
  # shell provided by Home Manager.
  home.sessionVariables = {
    EDITOR = "nano";
    VISUAL = "zed --wait";
    PAGER = "less";
    RIPGREP_CONFIG_PATH = "${config.home.homeDirectory}/.ripgreprc";

    # Better colors for less/man pages
    LESS = "-R -M -i -j10";
    LESS_TERMCAP_mb = "\\e[1;31m";     # begin bold
    LESS_TERMCAP_md = "\\e[1;36m";     # begin blink
    LESS_TERMCAP_me = "\\e[0m";        # reset bold/blink
    LESS_TERMCAP_so = "\\e[01;44;33m"; # begin reverse video
    LESS_TERMCAP_se = "\\e[0m";        # reset reverse video
    LESS_TERMCAP_us = "\\e[1;32m";     # begin underline
    LESS_TERMCAP_ue = "\\e[0m";        # reset underline

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
    ".zshrc".source = ../../dotfiles/.zshrc-wsl;
    ".ripgreprc".source = ../../dotfiles/.ripgreprc;
  };

  # Program-specific configurations using Home Manager modules
  programs.home-manager.enable = true;

  programs.git = {
    enable = true;
    userName = "Jorge Fernando Álava";
    userEmail = "git@jfa.dev";

    signing = {
      key = "${config.home.homeDirectory}/.ssh/jfalava-gitSign-elliptic.pem";
      signByDefault = true;
    };

    extraConfig = {
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
    };

    aliases = {
      undo = "reset --soft HEAD^";
    };
  };

  programs.zsh = {
    enable = true;
    enableCompletion = true;
    autosuggestion.enable = true;
    syntaxHighlighting.enable = true;

    # Zsh will source .zshrc from home.file, but we set the default shell here
    initExtra = ''
      # Home Manager will source ~/.zshrc automatically
      # This ensures zsh is properly configured
    '';
  };

  programs.starship = {
    enable = true;
    enableZshIntegration = true;
  };

  programs.zoxide = {
    enable = true;
    enableZshIntegration = true;
  };

  programs.fzf = {
    enable = true;
    enableZshIntegration = true;

    defaultCommand = "fd --type f --hidden --follow --exclude .git";
    defaultOptions = [
      "--height 40%"
      "--layout=reverse"
      "--border"
      "--inline-info"
      "--color=fg:#f8f8f2,bg:#282a36,hl:#bd93f9"
      "--color=fg+:#f8f8f2,bg+:#44475a,hl+:#bd93f9"
      "--color=info:#ffb86c,prompt:#50fa7b,pointer:#ff79c6"
      "--color=marker:#ff79c6,spinner:#ffb86c,header:#6272a4"
    ];

    changeDirWidgetCommand = "fd --type d --hidden --follow --exclude .git";
    fileWidgetCommand = "fd --type f --hidden --follow --exclude .git";
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

  # Nix configuration for the user
  nix = {
    package = pkgs.nix;
    settings = {
      experimental-features = [ "nix-command" "flakes" ];
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
