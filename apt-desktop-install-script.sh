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
echo "🖊 Installing Zed..."
curl -f https://zed.dev/install.sh | sh
curl -o ~/.config/zed/settings.json "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/.zed_settings.jsonc"
## ghostty
echo "🖊 Installing Ghostty..."
curl -f https://raw.githubusercontent.com/mkasberg/ghostty-ubuntu/HEAD/install.sh | bash
echo "📎 Copying Ghostty .config file to local..."
curl -o ~/.config/ghostty "https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/.ghostty"
gsettings set org.gnome.desktop.default-applications.terminal exec 'ghostty'
## bun
echo "🐇 Installing Bun..."
curl -fsSL https://bun.sh/install | bash
## deno
echo "🦕 Installing Deno..."
curl -fsSL https://deno.land/install.sh | sh
deno jupyter --install
## docker (why haven't i done this earlier lmao)
echo "🚢 Installing Docker..."
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do sudo apt-get remove $pkg; done
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
