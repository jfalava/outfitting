# Home Manager configuration using Nix channels instead of flakes
# This file extends the base home.nix for work environment

{ config, pkgs, lib, ... }:

{
  # Import the base home.nix configuration
  imports = [
    ./home.nix
  ];

  # Add work-specific packages on top of the base configuration
  # These will float with nixpkgs-unstable channel
  home.packages = with pkgs; [
    # Cloud & DevOps tools
    awscli2
    azure-cli
    terraform
    terragrunt
    opentofu
    tflint
    
    # Kubernetes tools
    kubectl
    kubectx
    k9s
    kubernetes-helm
    eksctl
    
    # Infrastructure tools
    ansible
    cloudlens
    
    # Development databases
    postgresql
    redis
    
    # Communication tools
    slack
    zoom-us
  ];

  # Override git configuration for work environment
  programs.git.settings.user.email = lib.mkForce "jorgefernando.alava@seidor.com";
  programs.git.signing.key = lib.mkForce "${config.home.homeDirectory}/.ssh/jfalava-seidor-ed25519";

  # Work-specific environment variables
  home.sessionVariables = {
    AWS_PROFILE = "default";
    AWS_REGION = "us-east-1";
  };
}