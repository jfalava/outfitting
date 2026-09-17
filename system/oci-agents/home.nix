{
  config,
  lib,
  pkgs,
  ...
}:

let
  repoFromEnvironment = builtins.getEnv "OUTFITTING_REPO";
  outfittingRepo =
    if repoFromEnvironment != "" then
      repoFromEnvironment
    else
      "${config.home.homeDirectory}/.config/outfitting/repo";
in
{
  imports = [
    (builtins.toPath "${outfittingRepo}/packages/common/programs.nix")
    ./agents.nix
  ];

  home.username = "jfalava";
  home.homeDirectory = "/home/jfalava";
  home.stateVersion = "26.05";

  home.packages = import (builtins.toPath "${outfittingRepo}/packages/oci-agents/packages.nix") {
    inherit pkgs;
  };

  home.sessionVariables = {
    EDITOR = "vim";
    VISUAL = "vim";
    PAGER = "less";
  };

  # The shared profile targets graphical developer machines. Override the
  # editor defaults for this headless host.
  programs.zsh = {
    sessionVariables.EDITOR = lib.mkForce "vim";
    shellAliases.editor = lib.mkForce "vim";
  };

  # The shared configuration assumes the user's signing key is present. The
  # Pulumi stack provisions only a login public key, so signing is opt-in here
  # until the private signing key is provisioned separately.
  programs.git = {
    signing.signByDefault = lib.mkForce false;
    settings.commit.gpgsign = lib.mkForce false;
    settings.tag.gpgsign = lib.mkForce false;
  };
}
