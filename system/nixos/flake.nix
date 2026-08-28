{
  description = "NixOS configurations for server (headless) and desktop (GUI)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    home-manager = {
      url = "github:nix-community/home-manager/release-26.05";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      home-manager,
    }:
    let
      system = "x86_64-linux";
      baseModules = [
        ./configuration.nix
        ./hardware-configuration.nix
        home-manager.nixosModules.home-manager
        {
          home-manager.useGlobalPkgs = true;
          home-manager.useUserPackages = true;
          home-manager.backupFileExtension = "backup";
          home-manager.users.jfalava = import ./home.nix;
        }
      ];
    in
    {
      nixosConfigurations = {
        server = nixpkgs.lib.nixosSystem {
          inherit system;
          modules = baseModules ++ [ ./server.nix ];
        };
        desktop = nixpkgs.lib.nixosSystem {
          inherit system;
          modules = baseModules ++ [ ./desktop.nix ];
        };
        # alias so `nixos-install --flake nixos` and generic hostname work
        nixos = self.nixosConfigurations.server;
      };
    };
}
