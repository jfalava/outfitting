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

  # home.sessionVariables = {
  #   AWS_PROFILE = "work";
  # };
}
