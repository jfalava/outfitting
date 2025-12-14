{ config, pkgs, ... }:

{
  # Import the base home.nix configuration
  imports = [
    ./home.nix
  ];

  # Add work-specific packages on top of the base configuration
  home.packages = with pkgs; [
    # AWS tools
    awscli2

    # Kubernetes tools
    eksctl
    kubernetes-helm
    k9s

    # Infrastructure as Code
    ansible
    tflint

    # Cloud management
    cloudlens
  ];

  # Override git configuration for work environment
  programs.git = {
    userEmail = "jorgefernando.alava@seidor.com";
  };

  # home.sessionVariables = {
  #   AWS_PROFILE = "work";
  # };
}
