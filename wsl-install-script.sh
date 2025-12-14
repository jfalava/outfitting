#!/bin/bash

UPDATE_ONLY=false
if [[ "$1" == "--update-only" ]]; then
    UPDATE_ONLY=true
fi

if [[ "$UPDATE_ONLY" == "false" ]]; then
    echo "Running full WSL setup..."
else
    echo "Running update-only mode..."
fi

## init
sudo apt update -y && sudo apt upgrade -y && sudo apt install -y curl

#####
## install apt packages
#####
APT_LIST_URL="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/x64-linux/apt.txt"
curl -fsSL "$APT_LIST_URL" -o /tmp/apt-packages.txt || {
    echo "Failed to fetch APT package list. Exiting..."
    exit 1
}
while IFS= read -r package || [ -n "$package" ]; do
    package=$(echo "$package" | tr -d '[:space:]')
    if [[ -n "$package" && ! "$package" =~ ^# ]]; then
        echo "Installing apt package: $package"
        sudo apt install -y "$package"
    fi
done </tmp/apt-packages.txt

## cleanup
sudo apt autoremove -y

if [[ "$UPDATE_ONLY" == "false" ]]; then
#####
## nix
#####
## install nix
# Set NIX_BUILD_GROUP_ID to auto-detect the group ID that the system assigns
# This prevents conflicts when Ubuntu assigns a different GID than expected
export NIX_BUILD_GROUP_ID=$(getent group nixbld | cut -d: -f3 2>/dev/null || echo "30000")
curl -L https://nixos.org/nix/install | sh -s -- --daemon
source /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh || source ~/.nix-profile/etc/profile.d/nix.sh || true

# Add nix to shell profiles (both bash and zsh)
(
    echo
    echo '# Nix'
    echo 'if [ -e /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh ]; then'
    echo '  source /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh'
    echo 'elif [ -e ~/.nix-profile/etc/profile.d/nix.sh ]; then'
    echo '  source ~/.nix-profile/etc/profile.d/nix.sh'
    echo 'fi'
) >> ~/.bashrc

# Create nix configuration before running nix commands
sudo mkdir -p /etc/nix
sudo tee /etc/nix/nix.conf > /dev/null << 'EOF'
experimental-features = nix-command flakes
substituters = https://cache.nixos.org/ https://nix-community.cachix.org
trusted-public-keys = cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY= nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs=
auto-optimise-store = true
max-jobs = auto
EOF

# Reload nix
source /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh || source ~/.nix-profile/etc/profile.d/nix.sh || true

## install home-manager and apply configuration
if command -v nix &> /dev/null; then
    echo "Installing Home Manager and applying configuration..."
    # Use 'switch' instead of 'init' to use the GitHub flake configuration directly
    nix run "github:nix-community/home-manager" -- switch \
        --flake "github:jfalava/outfitting?dir=packages/x64-linux#jfalava" \
        --no-write-lock-file \
        -b backup || {
        echo "Warning: Home Manager installation failed."
        echo "After script completion, you can try:"
        echo "  nix run github:nix-community/home-manager -- switch --flake 'github:jfalava/outfitting?dir=packages/x64-linux#jfalava' --no-write-lock-file -b backup"
    }

    # Now that Home Manager has installed zsh, set it as the default shell
    if command -v zsh &> /dev/null; then
        echo "Setting zsh as default shell..."
        sudo chsh -s "$(which zsh)" "$USER" || echo "Warning: Failed to set zsh as default shell. You can manually run: chsh -s \$(which zsh)"
    else
        echo "Warning: zsh not found after Home Manager installation"
    fi

    # Safety check: Verify Nix is still accessible after Home Manager configuration
    echo ""
    echo "Verifying Nix accessibility after Home Manager setup..."
    if command -v nix &> /dev/null; then
        echo "✓ Nix is still accessible"
    else
        echo "⚠ Warning: Nix is no longer in PATH after Home Manager setup!"
        echo "  This may happen if your shell profile wasn't properly sourced."
        echo "  Try one of the following:"
        echo "    1. Close this terminal and open a new one (sources ~/.bashrc)"
        echo "    2. Run: source ~/.bashrc && source ~/.zshrc"
        echo "    3. Manually source Nix: source /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh"
    fi
else
    echo "Nix not found, skipping home-manager installation"
fi
fi

if [[ "$UPDATE_ONLY" == "false" ]]; then
#####
## runtimes
#####
curl -fsSL https://bun.sh/install | bash
deno jupyter --install # if the deno flake fails to install, this will fail gracefully
curl -fsSL https://get.pnpm.io/install.sh | sh -
curl -LsSf https://astral.sh/uv/install.sh | sh
fi

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
## hashicorp repositories for terraform and packer
#####
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://apt.releases.hashicorp.com/gpg -o /etc/apt/keyrings/hashicorp-archive-keyring.asc
sudo chmod a+r /etc/apt/keyrings/hashicorp-archive-keyring.asc
echo \
    "deb [signed-by=/etc/apt/keyrings/hashicorp-archive-keyring.asc] https://apt.releases.hashicorp.com \
    $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") main" |
    sudo tee /etc/apt/sources.list.d/hashicorp.list >/dev/null
sudo apt update

#####
## github cli repository
#####
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
sudo chmod a+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo \
    "deb [signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages \
    stable main" |
    sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
sudo apt update && sudo apt install gh

#####
## charm repository for crush
#####
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://repo.charm.sh/apt/gpg.key -o /etc/apt/keyrings/charm-archive-keyring.asc
sudo chmod a+r /etc/apt/keyrings/charm-archive-keyring.asc
echo \
    "deb [signed-by=/etc/apt/keyrings/charm-archive-keyring.asc] https://repo.charm.sh/apt * *" |
    sudo tee /etc/apt/sources.list.d/charm.list >/dev/null
sudo apt update && sudo apt install crush

## end message and validation
echo ""
echo "================================"
echo "Installation Complete!"
echo "================================"
echo ""

# Validate installation
echo "Validating installation..."
echo ""

# Check Nix
if command -v nix &> /dev/null; then
    echo "✓ Nix installed: $(nix --version)"
else
    echo "✗ Nix not found"
fi

# Check Home Manager
if command -v home-manager &> /dev/null; then
    echo "✓ Home Manager installed"
else
    echo "✗ Home Manager not found"
fi

# Check zsh
if command -v zsh &> /dev/null; then
    echo "✓ Zsh installed: $(zsh --version)"

    # Check default shell
    user_shell=$(getent passwd "$USER" | cut -d: -f7)
    if [[ "$user_shell" == *"zsh"* ]]; then
        echo "✓ Default shell set to zsh"
    else
        echo "✗ Default shell is $user_shell (expected zsh)"
    fi
else
    echo "✗ Zsh not found"
fi

# Check .zshrc
if [ -f ~/.zshrc ]; then
    zshrc_size=$(wc -l < ~/.zshrc)
    if [ "$zshrc_size" -gt 100 ]; then
        echo "✓ .zshrc properly configured ($zshrc_size lines)"

        # Check if .zshrc sources Nix properly
        if grep -q "nix-daemon.sh\|~/.nix-profile" ~/.zshrc; then
            echo "✓ .zshrc properly sources Nix"
        else
            echo "⚠ .zshrc may not properly source Nix (check Tool Initialization section)"
        fi
    else
        echo "⚠ .zshrc exists but seems incomplete ($zshrc_size lines, expected 800+)"
    fi
else
    echo "✗ .zshrc not found"
fi

# Check .ripgreprc
if [ -f ~/.ripgreprc ]; then
    echo "✓ .ripgreprc configured"
else
    echo "✗ .ripgreprc not found"
fi

echo ""
echo "================================"
echo "Next Steps:"
echo "================================"
echo "1. Close this terminal and open a new one"
echo "2. You should see the Starship prompt and have zsh configured"
echo "3. Run 'ff' to see system info (fastfetch)"
echo "4. Run 'pnpm approve-builds -g' to finish LLM CLI setup"
echo ""
echo "If you encounter issues, check:"
echo "  - Run 'source ~/.zshrc' to reload your shell configuration"
echo "  - Run 'home-manager switch --flake github:jfalava/outfitting?dir=packages/x64-linux#jfalava' to reapply configuration"
echo ""
