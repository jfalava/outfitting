{
  config,
  lib,
  options,
  pkgs,
  ...
}:

{
  imports = [
    ../../system/common/dotfiles.nix
    ../../system/common/zsh.nix
  ];

  nixpkgs.config.allowUnfree = true;

  home.sessionPath = [
    "${config.home.homeDirectory}/.opencode/bin"
    "${config.home.homeDirectory}/.deno/bin"
    "${config.home.homeDirectory}/.bun/bin"
    "${config.home.homeDirectory}/.cargo/bin"
    "${config.home.homeDirectory}/.local/share/pnpm"
    "${config.home.homeDirectory}/.local/bin"
  ];

  home.packages = with pkgs; [
    clippy
    rust-analyzer
    rustc
    rustfmt
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

  # git filter.lfs.required needs the binary on PATH; install global LFS hooks once.
  home.activation.installGitLfs = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    if [ -x "${pkgs.git-lfs}/bin/git-lfs" ]; then
      "${pkgs.git-lfs}/bin/git-lfs" install --skip-repo >/dev/null 2>&1 || true
    fi
  '';

  programs.gh = {
    enable = true;

    # Authentication remains in ~/.config/gh/hosts.yml and is intentionally not copied into the Nix store.
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

  programs.cargo.enable = true;

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
    allowlist = [ "jfa.dev" ];
    policy = {
      allowlist_rules = [
        {
          rule_id = "lookalike_tld";
          patterns = [ "*.dev" ];
        }
      ];
    };
  };

  xdg.configFile = {
    "tirith/allowlist".force = true;
    "tirith/policy.yaml".force = true;
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

    # Initialize Tirith directly until its Home Manager module stops using programs.zsh.initExtra.
    initContent = ''
      eval "$(${config.programs.tirith.package}/bin/tirith init --shell zsh)"
    '';
  };

  # Official OpenCode binary only (https://opencode.ai/v2/install → ~/.opencode/bin).
  # Never pkgs.opencode — Nix lags upstream and blocks installing V2. Home Manager still
  # owns opencode.json, MCP settings, AGENTS.md, and the web unit; the package is a thin
  # wrapper so systemd/getExe resolve without putting the real binary in the store.
  programs.opencode = {
    enable = true;
    package = pkgs.writeShellApplication {
      name = "opencode";
      text = ''
        bin="${config.home.homeDirectory}/.opencode/bin/opencode"
        if [ ! -x "$bin" ]; then
          printf '%s\n' "opencode: missing $bin" \
            "Install with: curl -fsSL https://opencode.ai/v2/install | bash" >&2
          exit 127
        fi
        exec "$bin" "$@"
      '';
    };
    settings = {
      lsp = true;
      small_model = "opencode/nemotron-3.5-lightning-free";
      mcp = import ./opencode-mcp.nix;
    };
    web = {
      enable = true;
      extraArgs = [
        "--hostname"
        "0.0.0.0"
        "--port"
        "4096"
      ];
      # Password migrated from service.json to service.env (chmod 600) to avoid Nix store leak.
      environmentFile = "${config.xdg.configHome}/opencode/service.env";
    };
  };

  # Back up legacy opencode.jsonc (pre-Nix) once, since Nix now manages opencode.json.
  home.activation.migrateOpencodeJsonc = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    if [ -f "${config.xdg.configHome}/opencode/opencode.jsonc" ] && [ ! -f "${config.xdg.configHome}/opencode/opencode.jsonc.migrated" ]; then
      mv "${config.xdg.configHome}/opencode/opencode.jsonc" "${config.xdg.configHome}/opencode/opencode.jsonc.migrated"
      echo "Backed up legacy opencode.jsonc to opencode.jsonc.migrated (Nix now manages opencode.json)"
    fi
  '';

  # Tirith 0.3.3+ loads the user policy with O_NOFOLLOW (read_text_no_follow_capped)
  # and refuses a symlinked final component as NotRegularFile. Home Manager's
  # xdg.configFile always creates a symlink into the Nix store, so the check
  # fails for the user-level policy at ~/.config/tirith/policy.yaml. Replace
  # the symlink with a regular file containing the same content after
  # linkGeneration (not merely writeBoundary: both share that predecessor, and
  # alphabetical DAG order would otherwise run this before the symlinks exist),
  # so both the Nix and Homebrew tirith binaries can read it.
  home.activation.fixTirithPolicy = lib.hm.dag.entryAfter [ "linkGeneration" ] ''
    for name in "policy.yaml" "policy.yml" "allowlist" "blocklist"; do
      target="${config.xdg.configHome}/tirith/$name"
      if [ -L "$target" ]; then
        tmp="$target.tmp.$$"
        if cat "$target" > "$tmp" 2>/dev/null; then
          mv -f "$tmp" "$target"
          chmod 600 "$target" 2>/dev/null || chmod 644 "$target"
          # linkGeneration may have moved the previous regular file to
          # $target.backup before recreating the symlink; drop that leftover.
          rm -f "$target.backup"
        else
          rm -f "$tmp"
          echo "tirith: warning: could not dereference $target" >&2
        fi
      fi
    done
  '';
}
