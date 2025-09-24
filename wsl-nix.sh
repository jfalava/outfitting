#!/bin/bash

## init
sudo apt update -y && sudo apt upgrade -y && sudo apt install curl

#####
## install apt packages
#####
APT_LIST_URL="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/apt.txt"
curl -fsSL "$APT_LIST_URL" -o /tmp/apt-packages.txt || {
    echo "Failed to fetch APT package list. Exiting..."
    exit 1
}
while IFS= read -r package || [ -n "$package" ]; do
    # trim whitespace and skip empty lines or comments (thank you claude)
    package=$(echo "$package" | tr -d '[:space:]')
    if [[ -n "$package" && ! "$package" =~ ^# ]]; then
        echo "Installing apt package: $package"
        sudo apt install -y "$package"
    fi
done </tmp/apt-packages.txt

#####
## add hashicorp repo
#####
if ! grep -q hashicorp /etc/apt/sources.list.d/hashicorp.list; then
    wget -qO- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
fi
## install terraform and packer
sudo apt update -qq && sudo apt install -y terraform packer

## cleanup
sudo apt autoremove -y

#####
## nix
#####
## install nix
curl -L https://nixos.org/nix/install | sh
source ~/.nix-profile/etc/profile.d/nix.sh || true
(
    echo
    echo 'source ~/.nix-profile/etc/profile.d/nix.sh'
) >> ~/.bashrc
echo ". /home/$USER/.nix-profile/etc/profile.d/nix.sh" >> ~/.bashrc
# Create nix configuration before running nix commands
sudo mkdir -p /etc/nix
sudo tee /etc/nix/nix.conf > /dev/null << 'EOF'
experimental-features = nix-command flakes
substituters = https://cache.nixos.org/ https://nix-community.cachix.org
trusted-public-keys = cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY= nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs=
auto-optimise-store = true
max-jobs = auto
EOF
source ~/.bashrc
## install packages from flake
if command -v nix &> /dev/null; then
    if ! nix profile add --extra-experimental-features 'nix-command flakes' --no-write-lock-file "github:jfalava/outfitting/main?dir=packages"; then
        echo "Warning: Flake installation failed."
        echo "After script completion, you can try: nix profile install 'git+https://github.com/jfalava/outfitting?dir=packages'"
    fi
else
    echo "Nix not found, skipping flake installation"
fi

#####
## runtimes
#####
curl -fsSL https://bun.sh/install | bash
# Install Deno without modifying shell configuration by exiting the script before interactive prompts
curl -fsSL https://deno.land/install.sh | sed '/Deno was installed successfully/a exit 0' | sh
# deno jupyter --install # not working
curl -fsSL https://get.pnpm.io/install.sh | sh -

#####
## terminal
#####
sudo chsh -s $(which zsh) $USER
curl -o ~/.gitconfig "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/.gitconfig" # copy .gitconfig profile to local

#####
## docker
#####
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do sudo apt remove -y $pkg; done
sudo apt install ca-certificates
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" |
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y

#####
## update bash profile for pnpm and deno, so LLM CLIs can be installed
#####
(
echo
echo 'export PNPM_HOME="$HOME/.local/share/pnpm"'
echo 'export DENO_INSTALL="$HOME/.deno"'
echo 'export PATH="$PNPM_HOME:$DENO_INSTALL/bin:$PATH"'
) >> ~/.bashrc
source ~/.bashrc
#####

#####
## LLM CLIs
#####
source ~/.bashrc || true
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"
# Verify pnpm is available before installing packages
if command -v pnpm &> /dev/null; then
    pnpm install -g @google/gemini-cli
    pnpm install -g @qwen-code/qwen-code@latest
    pnpm install -g @anthropic-ai/claude-code
    pnpm install -g @openai/codex
else
    echo "warning: pnpm not found in PATH. it may not be available until after opening a new terminal."
fi
curl -fsSL https://opencode.ai/install | bash
echo "run pnpm approve-builds -g to finish"

## end message
echo "installation complete"
