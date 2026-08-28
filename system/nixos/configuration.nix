{ config, pkgs, ... }:
{
  imports = [ ./hardware-configuration.nix ];

  # Bootloader - works for both UEFI and legacy; systemd-boot preferred
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  networking.hostName = "nixos";
  networking.networkmanager.enable = true;
  time.timeZone = "UTC";
  i18n.defaultLocale = "en_US.UTF-8";

  users.users.jfalava = {
    isNormalUser = true;
    description = "Jorge Fernando Álava";
    extraGroups = [
      "wheel"
      "networkmanager"
      "docker"
    ];
    shell = pkgs.zsh;
    # Add SSH keys here or pass --ssh-key to the installer (writes /tmp/outfitting-ssh-key).
    # The server/desktop modules also read /tmp/outfitting-ssh-key if present at build time.
    openssh.authorizedKeys.keys =
      let
        extraKeyFile = "/tmp/outfitting-ssh-key";
        extraKeys = if builtins.pathExists extraKeyFile then
          builtins.filter (k: k != "") (pkgs.lib.splitString "\n" (builtins.readFile extraKeyFile))
        else
          [ ];
      in
      extraKeys;
  };

  programs.zsh.enable = true;

  nix.settings.experimental-features = [
    "nix-command"
    "flakes"
  ];
  nix.settings.substituters = [
    "https://cache.nixos.org/"
    "https://nix-community.cachix.org"
  ];
  nix.settings.trusted-public-keys = [
    "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
    "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
  ];
  nixpkgs.config.allowUnfree = true;
  nix.gc.automatic = false;

  # Common services
  services.openssh.enable = true;
  services.openssh.settings.PasswordAuthentication = false;
  networking.firewall.allowedTCPPorts = [
    22
    80
    443
  ];
  virtualisation.docker.enable = true;

  # Common packages - base CLI
  environment.systemPackages = with pkgs; [
    git
    curl
    wget
    vim
    htop
    btop
  ];

  system.stateVersion = "26.05";
}
