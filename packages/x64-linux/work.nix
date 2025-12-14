#
# Usage
#
# nix run home-manager/master -- switch --flake "github:jfalava/outfitting?dir=packages/x64-linux#jfalava-work"
#

{ config, pkgs, lib, ... }:

{
  # Import the base home.nix configuration
  imports = [
    ./home.nix
  ];

  # Add work-specific packages on top of the base configuration
  home.packages = with pkgs; [
    awscli2
    eksctl
    kubernetes-helm
    k9s
    ansible
    tflint
    cloudlens
    opentofu
    azure-cli
  ];

  # Override git configuration for work environment
  programs.git.settings.user.email = lib.mkForce "jorgefernando.alava@seidor.com";
  programs.git.signing.key = lib.mkForce "${config.home.homeDirectory}/.ssh/jfalava-seidor-ed25519";

  # home.sessionVariables = {
  #   AWS_PROFILE = "work";
  # };
}
