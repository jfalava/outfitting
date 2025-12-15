{
  pkgs,
  ...
}:

{
  # Import the base home.nix configuration
  imports = [
    ./home.nix
  ];

  # Add virtualization packages on top of the base configuration
  home.packages = with pkgs; [
    bridge-utils
    qemu
    qemu_kvm
  ];
}
