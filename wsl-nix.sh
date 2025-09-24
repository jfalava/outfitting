#!/bin/bash
## update packages
sudo apt update -y && sudo apt upgrade -y && sudo apt install curl

#####
## install apt packages
#####
APT_LIST_URL="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/apt.txt"
echo "📝 Fetching APT package list from $APT_LIST_URL..."
curl -fsSL "$APT_LIST_URL" -o /tmp/apt-packages.txt || {
    echo "❌ Failed to fetch APT package list. Exiting..."
    exit 1
}
while IFS= read -r package || [ -n "$package" ]; do
    # trim whitespace and skip empty lines or comments (thank you claude)
    package=$(echo "$package" | tr -d '[:space:]')
    if [[ -n "$package" && ! "$package" =~ ^# ]]; then
        echo "❖ Installing apt package: $package ❖"
        sudo apt install -y "$package"
    fi
done </tmp/apt-packages.txt
echo "APT Done"

#####
## add hashicorp repo
#####
if ! grep -q hashicorp /etc/apt/sources.list.d/hashicorp.list; then
    wget -qO- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
fi
sudo apt update -qq && sudo apt install -y terraform packer
echo "HashiCorp Done"

#####
## install nix
#####
curl -L https://nixos.org/nix/install | sh
source ~/.nix-profile/etc/profile.d/nix.sh
(
    echo
    echo 'source ~/.nix-profile/etc/profile.d/nix.sh'
) >> ~/.bashrc
echo "Nix Done"

#####
## runtimes
#####
curl -fsSL https://bun.sh/install | bash
curl -fsSL https://deno.land/install.sh | sh
source .bashrc # for the jupyter installation
deno jupyter --install
curl -fsSL https://get.pnpm.io/install.sh | sh -
echo "Runtimes Done"

#####
## terminal
#####
sudo chsh -s $(which zsh) $USER
curl -sS https://starship.rs/install.sh | sh # install starship
curl -o ~/.gitconfig "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/.gitconfig" # copy .gitconfig profile to local
echo "Terminal Done"

#####
## docker
#####
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do sudo apt-get remove $pkg; done
sudo apt-get install ca-certificates
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" |
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y
echo "Docker Done"

#####
## update bash profile for pnpm, so LLM CLIs can be installed
#####
(
export PNPM_HOME="$HOME/.local/share/pnpm"
case ":$PATH:" in
*":$PNPM_HOME:"*) ;;
*) export PATH="$PNPM_HOME:$PATH" ;;
esac
) >>~/.bashrc
source ~/.bashrc
#####

#####
## LLM CLIs
#####
pnpm install -g @google/gemini-cli
pnpm install -g @qwen-code/qwen-code@latest
pnpm install -g @anthropic-ai/claude-code
pnpm install -g @openai/codex
curl -fsSL https://opencode.ai/install | bash
## end message
echo "✅ All installations complete. You may now open a new terminal tab or window."
