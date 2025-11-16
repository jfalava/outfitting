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
                              deno
                              eza
                              fastfetch
                              ffmpeg
                              lazygit
                              nodejs_latest
                              python3
                              ripgrep
                              starship
                              zenith
                              zig
                              zoxide
                              zsh
                              zsh-autosuggestions
                              zsh-syntax-highlighting
      ];
    };
  };
}
