{ config, pkgs, ... }:

let
  # Repository path - customize if your outfitting repo is in a different location
  # Default location set by installation scripts: ~/.config/outfitting/repo
  # To customize: change this path AND update ~/.config/outfitting/repo-path (or run set_outfitting_repo)
  outfittingRepo = "${config.home.homeDirectory}/.config/outfitting/repo";

in
{
  imports = [ ./programs.nix ];

  # Home Manager needs a bit of information about you and the paths it should manage
  home.username = "jfalava";
  home.homeDirectory = "/Users/jfalava";
  home.stateVersion = "26.05";

  # Nix-managed and exclusive packages
  home.packages = with pkgs; [
    # never trust homebrew
    nixd
    nil
    nixfmt
    powershell
    python3
    terraform-ls
    terraform
    restic
    zig
    zsh-autosuggestions
    zsh-syntax-highlighting
    nodejs_26
    # unavailable on homebrew
    ani-cli
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

  };

  # This is a per-user preference. Home Manager applies it as the logged-in
  # user, so F1–F12 are function keys instead of media shortcuts by default.
  targets.darwin.defaults.NSGlobalDomain."com.apple.keyboard.fnState" = true;

  # Dotfiles management - symlink your dotfiles to home directory
  home.file = {
    ".zshrc-base".source = config.lib.file.mkOutOfStoreSymlink "${outfittingRepo}/dotfiles/.zshrc-base";
  };

}
