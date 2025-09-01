#!/bin/bash
## update packages
sudo apt update -y && sudo apt upgrade -y && sudo apt install curl
# fetch the list of apt packages from GitHub
APT_LIST_URL="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/apt.txt"
echo "📝 Fetching APT package list from $APT_LIST_URL..."
curl -fsSL "$APT_LIST_URL" -o /tmp/apt-packages.txt || {
    echo "❌ Failed to fetch APT package list. Exiting..."
    exit 1
}
# install apt packages
echo "📦 Installing APT packages..."
while IFS= read -r package || [ -n "$package" ]; do
    # trim whitespace and skip empty lines or comments (thank you claude)
    package=$(echo "$package" | tr -d '[:space:]')
    if [[ -n "$package" && ! "$package" =~ ^# ]]; then
        echo "❖ Installing apt package: $package ❖"
        sudo apt install -y "$package"
    fi
done </tmp/apt-packages.txt
## add hashicorp repo
echo "🏗️ Adding HashiCorp repository and installing packages..."
if ! grep -q hashicorp /etc/apt/sources.list.d/hashicorp.list; then
    wget -qO- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
fi
sudo apt update -qq && sudo apt install -y terraform packer
## install homebrew
echo "🍺 Installing Homebrew"
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
(
    echo
    echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"'
) >>~/.bashrc
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
source ~/.bashrc
## install homebrew packages
echo "🍺 Installing Homebrew packages"
BREW_LIST_URL="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/brew.txt"
curl -fsSL "$BREW_LIST_URL" -o /tmp/brew-packages.txt || {
    echo "❌ Failed to fetch Brew package list. Exiting..."
    exit 1
}
# install each brew package
while IFS= read -r package || [ -n "$package" ]; do
    # trim whitespace and skip empty lines or comments (thank you claude)
    package=$(echo "$package" | tr -d '[:space:]')
    if [[ -n "$package" && ! "$package" =~ ^# ]]; then
        echo "❖ Installing Brew package: $package ❖"
        brew install "$package"
    fi
done </tmp/brew-packages.txt
# install ohmyposh
sudo chsh -s $(which zsh) $USER
echo "💻 Installing OhMyPosh"
curl -s https://ohmyposh.dev/install.sh | bash -s
brew install zsh-syntax-highlighting
brew install zsh-autosuggestions
# bun
curl -fsSL https://bun.sh/install | bash
## deno
curl -fsSL https://deno.land/install.sh | sh
source .bashrc
deno jupyter --install
## pnpm
curl -fsSL https://get.pnpm.io/install.sh | sh -
## eza colors
mkdir -p ~/.config/eza
touch ~/.config/light_mode-theme.yml
touch ~/.config/dark_mode-theme.yml
curl -sL https://raw.githubusercontent.com/eza-community/eza-themes/refs/heads/main/themes/rose-pine-dawn.yml >~/.config/eza/light_mode-theme.yml
curl -sL https://raw.githubusercontent.com/eza-community/eza-themes/refs/heads/main/themes/tokyonight.yml >~/.config/eza/dark_mode-theme.yml
# copy .gitconfig profile to local
echo "📎 Copying .gitconfig profile to local..."
curl -o ~/.gitconfig "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/.gitconfig"
# copy .zshrc profile to local
echo "📎 Copying .zshrc profile to local..."
curl -o ~/.zshrc "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/.zshrc"
# copy .zshrc profile to local
echo "📎 Copying OhMyPosh profile to local..."
mkdir -p ~/.config/ohmyposh
curl -sL https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/profile.omp.json >~/.config/ohmyposh/profile.omp.json
## docker (why haven't i done this earlier lmao)
echo "🚢 Installing Docker..."
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
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
##
pnpm install -g @google/gemini-cli
pnpm install -g @qwen-code/qwen-code@latest
pnpm install -g opencode-ai
## end message
echo "✅ All installations complete. You may now open a new terminal tab or window."
