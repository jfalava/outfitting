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
        echo "❖❖"
        echo "❖ Installing APT package: $package"
        echo "❖❖"
        sudo apt install -y "$package"
    fi
done < /tmp/apt-packages.txt
## add hashicorp repos
echo "🏗️ Adding HashiCorp repository and installing packages..."
if ! grep -q hashicorp /etc/apt/sources.list.d/hashicorp.list; then
    wget -qO- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
fi
sudo apt update -qq && sudo apt install -y terraform packer
## install homebrew
echo "🍺 Installing Homebrew"
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
(echo; echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"') >> ~/.bashrc
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
    # Trim whitespace and skip empty lines or comments
    package=$(echo "$package" | tr -d '[:space:]')
    if [[ -n "$package" && ! "$package" =~ ^# ]]; then
        echo "❖❖"
        echo "❖ Installing Brew package: $package"
        echo "❖❖"
        brew install "$package"
    fi
done < /tmp/brew-packages.txt
## install ohmyposh
sudo chsh -s $(which zsh) $USER
echo "💻 Installing OhMyPosh"
curl -s https://ohmyposh.dev/install.sh | bash -s
brew install zsh-syntax-highlighting
brew install zsh-autosuggestions
## end message
echo "✅ All installations complete."
