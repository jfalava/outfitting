# Work configuration extension for Home Manager
# This extends the base (personal) configuration with work-specific settings

{
  config,
  pkgs,
  lib,
  ...
}:

{
  # Work-specific packages (appended to base packages)
  home.packages = with pkgs; [
    # Cloud and infrastructure tools
    awscli2
    opentofu
    tofu-ls
    tenv
    azure-cli
    tflint
    kubectl
    kubectx
    k9s
    kubernetes-helm
    eksctl
    ansible
    cloudlens
  ];

  # Override git settings for work
  programs.git = {
    enable = true;

    settings = {
      user = {
        email = lib.mkForce "jorgefernando.alava@seidor.com";
      };
    };

    signing = {
      key = lib.mkForce "${config.home.homeDirectory}/.ssh/jfalava-seidor-ed25519";
      signByDefault = true;
    };
  };

  # Work-specific session variables
  home.sessionVariables = {
    AWS_PROFILE = "default";
    AWS_REGION = "eu-west-1";
  };
}
