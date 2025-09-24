{ pkgs ? import <nixpkgs> {} }:

pkgs.buildEnv {
  name = "my-packages";
  paths = with pkgs; [
    zsh-autosuggestions
  ];
}