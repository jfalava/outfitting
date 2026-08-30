{ ... }:
{
  networking.hostName = "nixos";

  # Headless server: no display manager, no desktop environment
  services.xserver.enable = false;

  services.qbittorrent = {
    enable = true;
    openFirewall = true;
    webuiPort = 8080;
  };

  # Harden SSH a bit more for server profile
  services.openssh.settings.PermitRootLogin = "no";
}
