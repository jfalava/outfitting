{
  description = "jfalava WSL";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }: {
    packages.x86_64-linux.default = nixpkgs.legacyPackages.x86_64-linux.buildEnv {
      name = "jfalava-wsl";
      paths = with nixpkgs.legacyPackages.x86_64-linux; [
        bat
        eza
        nodejs_latest
        python3
        fastfetch
        lazygit
        ffmpeg
        starship
        ripgrep
        zig
        zsh
        zenith
        zsh-autosuggestions
        zsh-syntax-highlighting
        zoxide
      ];
    };
  };
}
