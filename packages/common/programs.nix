{
  config,
  lib,
  options,
  ...
}:

{
  imports = [ ./zsh.nix ];

  home.sessionPath = [
    "${config.home.homeDirectory}/.opencode/bin"
    "${config.home.homeDirectory}/.deno/bin"
    "${config.home.homeDirectory}/.bun/bin"
    "${config.home.homeDirectory}/.local/share/pnpm"
    "${config.home.homeDirectory}/.local/bin"
  ];

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

      alias.undo = "reset --soft HEAD^";
    };
  };

  programs.gh = {
    enable = true;

    # Authentication remains in ~/.config/gh/hosts.yml and is intentionally
    # not copied into the Nix store.
    gitCredentialHelper.enable = false;
    settings.git_protocol = "ssh";
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
    # Custom aliases are declared in the shared Zsh module.
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
  }
  // lib.optionalAttrs (options.programs.fzf ? fileWidget) {
    fileWidget.command = "fd --type f --hidden --follow --exclude .git";
    changeDirWidget.command = "fd --type d --hidden --follow --exclude .git";
  }
  // lib.optionalAttrs (!(options.programs.fzf ? fileWidget)) {
    fileWidgetCommand = "fd --type f --hidden --follow --exclude .git";
    changeDirWidgetCommand = "fd --type d --hidden --follow --exclude .git";
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
      "--colors=line:fg:yellow"
      "--colors=line:style:bold"
      "--colors=path:fg:green"
      "--colors=path:style:bold"
      "--colors=match:fg:black"
      "--colors=match:bg:yellow"
      "--colors=match:style:bold"
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
    # Home Manager still uses deprecated initExtra for its integration.
    enableZshIntegration = false;
  };

  programs.vim.enable = true;

  programs.zoxide = {
    enable = true;
    enableZshIntegration = true;
  };

  programs.zsh = {
    sessionVariables = {
      PNPM_HOME = "${config.home.homeDirectory}/.local/share/pnpm";
      BUN_INSTALL = "${config.home.homeDirectory}/.bun";
      DENO_INSTALL = "${config.home.homeDirectory}/.deno";
    };

    # Initialize Tirith directly until its Home Manager module stops using
    # programs.zsh.initExtra.
    initContent = ''
      eval "$(${config.programs.tirith.package}/bin/tirith init --shell zsh)"
    '';
  };
}
