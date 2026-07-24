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

    # Custom eza aliases are declared in the shared common/zsh.nix module.
    enableZshIntegration = false;
    git = true;
    icons = "always";
  };

  programs.fastfetch.enable = true;

  programs.fd.enable = true;

  programs.fzf = {
    enable = true;
    enableZshIntegration = true;
    defaultCommand = "fd --type f --hidden --follow --exclude .git";
    fileWidgetCommand = "fd --type f --hidden --follow --exclude .git";
    changeDirWidgetCommand = "fd --type d --hidden --follow --exclude .git";
    defaultOptions = [
      "--height 40%"
      "--layout=reverse"
      "--border"
      "--inline-info"
    ];
    colors = {
      fg = "#f8f8f2";
      bg = "#282a36";
      hl = "#bd93f9";
      "fg+" = "#f8f8f2";
      "bg+" = "#44475a";
      "hl+" = "#bd93f9";
      info = "#ffb86c";
      prompt = "#50fa7b";
      pointer = "#ff79c6";
      marker = "#ff79c6";
      spinner = "#ffb86c";
      header = "#6272a4";
    };
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
    enableZshIntegration = true;
  };

  programs.tirith = {
    enable = true;
    # Home Manager 26.05 still implements this integration through the
    # deprecated programs.zsh.initExtra option. Initialize it below instead.
    enableZshIntegration = false;
  };

  programs.twitch-tui = {
    enable = true;
  };

  programs.vim.enable = true;

  programs.zoxide = {
    enable = true;
    enableZshIntegration = true;
  };

  programs.zsh = {
    # common/zsh.nix owns the base settings; this adds the macOS startup file.
    initContent = ''
      eval "$(${config.programs.tirith.package}/bin/tirith init --shell zsh)"
      source ${config.home.homeDirectory}/.config/outfitting/repo/dotfiles/.zshrc-macos
    '';
  };

  # Ghostty loads its macOS Application Support config after its XDG config. We keep a managed shim here so the native macOS path cannot override the programs.ghostty settings generated above.
  home.file."Library/Application Support/com.mitchellh.ghostty/config.ghostty".text = ''
    config-file = ${config.xdg.configHome}/ghostty/config
  '';
}
