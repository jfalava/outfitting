{
  description = "jfalava WSL - Home Manager Configuration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, home-manager }: {
    # Legacy package output for backwards compatibility
    # Can be removed after confirming home-manager works
    packages.x86_64-linux.default = nixpkgs.legacyPackages.x86_64-linux.buildEnv {
      name = "jfalava-wsl-legacy";
      paths = with nixpkgs.legacyPackages.x86_64-linux; [
       _7zz  # 7zip
       bat
       curl
       deno
       eza
       fastfetch
       fd
       fzf
       git
       go
       jq
       lazygit
       less
       nano
       nodejs_latest
       p7zip
       packer
       python3
       ripgrep
       shellcheck
       starship
       terraform
       tree
       unrar
       unzip
       wget
       zenith
       zig
       zip
       zoxide
       zsh
       zsh-autosuggestions
       zsh-syntax-highlighting
      ];
    };

    # Home Manager configuration
    homeConfigurations = {
      # Default configuration - username will be set in home.nix
      "jfalava" = home-manager.lib.homeManagerConfiguration {
        pkgs = nixpkgs.legacyPackages.x86_64-linux;
        
        modules = [
          ./home.nix
        ];
      };
      
      # Generic configuration for any user
      # Usage: home-manager switch --flake .#default
      "default" = home-manager.lib.homeManagerConfiguration {
        pkgs = nixpkgs.legacyPackages.x86_64-linux;
        
        modules = [
          ./home.nix
          {
            # Override username/homeDirectory at runtime
            home.username = builtins.getEnv "USER";
            home.homeDirectory = builtins.getEnv "HOME";
          }
        ];
      };
    };
  };
}
