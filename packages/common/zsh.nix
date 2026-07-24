{
  config,
  ...
}:

let
  outfittingRepo = "${config.home.homeDirectory}/.config/outfitting/repo";
  sharedPlugin = config.lib.file.mkOutOfStoreSymlink "${outfittingRepo}/packages/common/zsh";
in
{
  programs.zsh = {
    enable = true;
    enableCompletion = true;
    autocd = true;
    defaultKeymap = "emacs";

    completionInit = ''
      autoload -Uz compinit
      zcompdump=( ''${ZDOTDIR:-$HOME}/.zcompdump(Nmh+24) )
      if (( ''${#zcompdump} )); then
        compinit
      else
        compinit -C
      fi
    '';

    history = {
      path = "${config.home.homeDirectory}/.zsh_history";
      size = 50000;
      save = 50000;
      extended = true;
      share = true;
      expireDuplicatesFirst = true;
      ignoreDups = true;
      ignoreAllDups = true;
      findNoDups = true;
      ignoreSpace = true;
      saveNoDups = true;
    };

    setOptions = [
      "AUTO_PUSHD"
      "PUSHD_IGNORE_DUPS"
      "PUSHD_SILENT"
      "CDABLE_VARS"
      "EXTENDED_GLOB"
      "GLOB_DOTS"
      "NOMATCH"
      "INTERACTIVE_COMMENTS"
      "NOTIFY"
      "NO_BEEP"
      "INC_APPEND_HISTORY"
      "HIST_REDUCE_BLANKS"
      "HIST_VERIFY"
    ];

    autosuggestion = {
      enable = true;
      strategy = [
        "history"
        "completion"
      ];
    };

    localVariables.ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE = 20;
    sessionVariables.EDITOR = "zed";

    syntaxHighlighting = {
      enable = true;
      styles = {
        command = "fg=green,bold";
        alias = "fg=cyan,bold";
        builtin = "fg=yellow,bold";
        function = "fg=blue,bold";
      };
    };

    shellAliases = {
      cls = "clear";
      editor = "zed";
      reload = "source ~/.zshrc";
      zshconfig = "$EDITOR ~/.zshrc";
      vim = "nvim";

      ".." = "cd ..";
      "..." = "cd ../..";
      "...." = "cd ../../..";
      "....." = "cd ../../../..";
      "-" = "cd -";

      l = "eza --color=always --long --git --no-filesize --icons=always";
      ls = "eza --color=always --long --git --no-filesize --icons=always --all --color-scale-mode=gradient";
      la = "eza --color=always --long --git --icons=always --all --group-directories-first";
      ll = "eza --color=always --long --git --icons=always --header --group-directories-first";
      lt = "eza --color=always --long --git --icons=always --tree --level=2";
      lta = "eza --color=always --long --git --icons=always --tree --level=2 --all";

      wrangler = "bun wrangler";
      ff = "fastfetch";
      cat = "bat --style=auto";
      diff = "diff --color=auto";
    };

    plugins = [
      {
        name = "outfitting";
        src = sharedPlugin;
        file = "outfitting.plugin.zsh";
      }
    ];
  };
}
