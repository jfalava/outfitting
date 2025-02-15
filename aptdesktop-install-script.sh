#!/bin/bash
APT_DESKTOP_LIST_URL="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/apt-desktop.txt"
SNAP_LIST_URL="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/snap.txt"
# execute the WSL version first
curl -L https://wsl.jfa.dev | bash
# install desktop only packages
## add 1password repo
echo "🔑 Adding 1Password repository..."
curl -sS https://downloads.1password.com/linux/keys/1password.asc | sudo gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg
echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/amd64 stable main' | sudo tee /etc/apt/sources.list.d/1password.list
sudo mkdir -p /etc/debsig/policies/AC2D62742012EA22/
curl -sS https://downloads.1password.com/linux/debian/debsig/1password.pol | sudo tee /etc/debsig/policies/AC2D62742012EA22/1password.pol
sudo mkdir -p /usr/share/debsig/keyrings/AC2D62742012EA22
curl -sS https://downloads.1password.com/linux/keys/1password.asc | sudo gpg --dearmor --output /usr/share/debsig/keyrings/AC2D62742012EA22/debsig.gpg
## add vscode repo
echo "🧑‍💻️ Adding VSCode repository..."
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > packages.microsoft.gpg
sudo install -D -o root -g root -m 644 packages.microsoft.gpg /etc/apt/keyrings/packages.microsoft.gpg
echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" |sudo tee /etc/apt/sources.list.d/vscode.list > /dev/null
rm -f packages.microsoft.gpg
## update repos before installing desktop packages
sudo apt update
## apt install
echo "📝 Fetching APT package list from $APT_DESKTOP_LIST_URL..."
curl -fsSL "$APT_DESKTOP_LIST_URL" -o /tmp/apt-desktop-packages.txt || {
    echo "❌ Failed to fetch APT package list. Exiting..."
    exit 1
}
echo "📦 Installing APT packages..."
while IFS= read -r package || [ -n "$package" ]; do
    # trim whitespace and skip empty lines or comments (thank you claude)
    package=$(echo "$package" | tr -d '[:space:]')
    if [[ -n "$package" && ! "$package" =~ ^# ]]; then
        echo "❖ Installing apt package: $package ❖"
        sudo apt install -y "$package"
    fi
done </tmp/apt-desktop-packages.txt
## snap install
echo "📝 Fetching APT package list from $SNAP_LIST_URL..."
curl -fsSL "$SNAP_LIST_URL" -o /tmp/snap-packages.txt || {
    echo "❌ Failed to fetch APT package list. Exiting..."
    exit 1
}
echo "📦 Installing APT packages..."
while IFS= read -r package || [ -n "$package" ]; do
    # trim whitespace and skip empty lines or comments (thank you claude)
    package=$(echo "$package" | tr -d '[:space:]')
    if [[ -n "$package" && ! "$package" =~ ^# ]]; then
        echo "❖ Installing apt package: $package ❖"
        sudo apt install -y "$package"
    fi
done </tmp/snap-packages.txt
## zed
curl -f https://zed.dev/install.sh | sh
## ghostty
curl -f https://raw.githubusercontent.com/mkasberg/ghostty-ubuntu/HEAD/install.sh | bash
