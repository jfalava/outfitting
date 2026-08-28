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
  imports = [ (builtins.toPath "${outfittingRepo}/packages/common/programs.nix") ];

  home.username = "jfalava";
  home.homeDirectory = "/home/jfalava";
  home.stateVersion = "26.05";

  home.packages = import (builtins.toPath "${outfittingRepo}/packages/common/packages.nix") {
    inherit pkgs;
  };

  home.sessionVariables = {
    EDITOR = "vim";
    VISUAL = "zed";
    PAGER = "less";
    LESS = "-R -M -i -j10";
  };
}
