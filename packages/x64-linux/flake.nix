{
  description = "Home Manager configuration for jfalava";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { nixpkgs, home-manager, ... }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      homeConfigurations = {
        jfalava = home-manager.lib.homeManagerConfiguration {
          inherit pkgs;

          # Specify your home configuration modules here.
          # For example, the path to your home.nix.
          modules = [
            ./home.nix
          ];

          # Optionally use extraSpecialArgs to pass through arguments to home.nix
          extraSpecialArgs = {
            # You can add extra arguments here if needed
          };
        };

        jfalava-work = home-manager.lib.homeManagerConfiguration {
          inherit pkgs;

          # Work environment configuration with additional packages
          modules = [
            ./work.nix
          ];

          extraSpecialArgs = {
            # You can add extra arguments here if needed
          };
        };
      };
    };
}
