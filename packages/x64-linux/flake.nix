{
  description = "Home Manager configuration with flake composition for WSL/Linux";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      home-manager,
      ...
    }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      # Personal configuration (base)
      homeConfigurations."jfalava-personal" = home-manager.lib.homeManagerConfiguration {
        inherit pkgs;
        modules = [ ./base.nix ];
      };

      # Work configuration (extends base)
      homeConfigurations."jfalava-work" = home-manager.lib.homeManagerConfiguration {
        inherit pkgs;
        modules = [
          ./base.nix
          ./work.nix
        ];
      };

      # Default configuration (personal)
      homeConfigurations."jfalava" = self.homeConfigurations."jfalava-personal";
    };
}
