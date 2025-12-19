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
      # Generic darwin configuration that works for any hostname
      darwinConfigurations = {
        # Generic name that works on any Mac
        macos = nix-darwin.lib.darwinSystem {
          system = "aarch64-darwin";
          modules = [ configuration ];
        };
        # Alias for convenience
        default = self.darwinConfigurations.macos;
      };

      # Standalone home-manager configuration
      homeConfigurations = {
        # Generic name
        macos = home-manager.lib.homeManagerConfiguration {
          pkgs = nixpkgs.legacyPackages.aarch64-darwin;
          modules = [ 
            ./home.nix
            {
              nix.package = nixpkgs.legacyPackages.aarch64-darwin.nix;
            }
          ];
        };
        # Alias for convenience
        default = self.homeConfigurations.macos;
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