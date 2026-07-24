{ config, ... }:

{
  imports = [ ./zed.nix ];

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

  programs.gh = {
    enable = true;

    # Authentication remains in ~/.config/gh/hosts.yml and is intentionally
    # not copied into the Nix store.
    gitCredentialHelper.enable = false;

    settings = {
      git_protocol = "ssh";
    };
  };

  programs.ghostty = {
    enable = true;

    # Keep the application itself owned by the Homebrew cask.
    package = null;
    enableZshIntegration = false;

    settings = {
      "font-family" = "VictorMono Nerd Font Mono";
      "font-style" = "bold";
      "font-size" = 16;
      theme = "light:tokyonight day,dark:tokyonight storm";
    };
  };

  programs.bat = {
    enable = true;
    config = {
      theme = "Catppuccin Latte";
      style = "auto";
    };
  };

  programs.btop.enable = true;

  programs.eza = {
    enable = true;

    # Custom eza aliases already live in .zshrc-base.
    enableZshIntegration = false;
    git = true;
    icons = "always";
  };

  programs.fastfetch.enable = true;

  programs.fd.enable = true;

  programs.fzf = {
    enable = true;

    # The existing FZF environment and widgets are initialized in .zshrc-base.
    enableZshIntegration = false;
  };

  programs.go.enable = true;

  programs.jq.enable = true;

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

  programs.starship = {
    enable = true;
    enableZshIntegration = false; # Starship is initialized in the zshrc-base dotfile. Avoid adding a second initialization hook.
  };

  programs.tirith = {
    enable = true;
    enableZshIntegration = false; # Tirith is initialized in the zshrc-base dotfile. Avoid installing the shell hook twice.
  };

  programs.twitch-tui = {
    enable = true;
  };

  programs.vim.enable = true;

  programs.zoxide = {
    enable = true;
    enableZshIntegration = false; # Zoxide is already initialized with its current defaults in .zshrc-base.
  };

  programs.zsh = {
    enable = true;

    # Completion and all interactive behavior remain in the shared dotfile.
    enableCompletion = false;
    initContent = ''
      source ${config.home.homeDirectory}/.config/outfitting/repo/dotfiles/.zshrc-macos
    '';
  };

  # Ghostty loads its macOS Application Support config after its XDG config.
  # Keep a managed shim here so the native macOS path cannot override the
  # programs.ghostty settings generated above.
  home.file."Library/Application Support/com.mitchellh.ghostty/config.ghostty".text = ''
    config-file = ${config.xdg.configHome}/ghostty/config
  '';
}
