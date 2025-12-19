{
  description = "macOS nix-darwin + Home Manager configuration using flakes";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nix-darwin.url = "github:LnL7/nix-darwin";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nix-darwin, nixpkgs, home-manager }:
    let
      configuration = { pkgs, ... }: {
        # Import the existing darwin.nix and home.nix files
        imports = [
          ./darwin.nix
          home-manager.darwinModules.home-manager
          {
            home-manager.useGlobalPkgs = true;
            home-manager.useUserPackages = true;
            home-manager.users.jfalava = import ./home.nix;
          }
        ];
      };
    in
    {
      darwinConfigurations."Mac-mini-de-Jorge" = nix-darwin.lib.darwinSystem {
        system = "aarch64-darwin";
        modules = [ configuration ];
      };

      # Standalone home-manager configuration for testing
      homeConfigurations."Mac-mini-de-Jorge" = home-manager.lib.homeManagerConfiguration {
        pkgs = nixpkgs.legacyPackages.aarch64-darwin;
        modules = [ 
          ./home.nix
          {
            nix.package = nixpkgs.legacyPackages.aarch64-darwin.nix;
          }
        ];
      };

      # For development/testing
      devShells.aarch64-darwin.default = nixpkgs.legacyPackages.aarch64-darwin.mkShell {
        buildInputs = with nixpkgs.legacyPackages.aarch64-darwin; [
          nix-darwin
          home-manager
        ];
      };
    };
}