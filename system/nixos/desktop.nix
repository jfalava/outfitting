{ pkgs, ... }:
{
  networking.hostName = "nixos";

  services.xserver.enable = true;
  services.displayManager.gdm.enable = true;
  services.desktopManager.gnome.enable = true;

  # Audio
  services.pulseaudio.enable = false;
  security.rtkit.enable = true;
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    alsa.support32Bit = true;
    pulse.enable = true;
  };

  # Printing
  services.printing.enable = true;

  # Extra GUI packages for workstation
  environment.systemPackages = with pkgs; [
    firefox
    vscode
  ];
}
