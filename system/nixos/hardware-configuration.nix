# Placeholder - will be replaced by nixos-install-script.sh
# Generated via: sudo nixos-generate-config --show-hardware-config
{ config, lib, pkgs, modulesPath, ... }:
{
  imports = [ (modulesPath + "/installer/scan/not-detected.nix") ];
  boot.loader.systemd-boot.enable = lib.mkDefault true;
  boot.loader.efi.canTouchEfiVariables = lib.mkDefault true;
  fileSystems."/" = lib.mkDefault {
    device = "/dev/disk/by-label/nixos";
    fsType = "ext4";
  };
  # Add swap, additional filesystems, and hardware-specific modules after generation.
}
