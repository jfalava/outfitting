#!/bin/bash

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

# Also add to zshrc for now (will be overwritten by Home Manager later, but needed for this session)
(
    echo
    echo '# Nix'
    echo 'if [ -e /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh ]; then'
    echo '  . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh'
    echo 'elif [ -e ~/.nix-profile/etc/profile.d/nix.sh ]; then'
    echo '  . ~/.nix-profile/etc/profile.d/nix.sh'
    echo 'fi'
) >> ~/.zshrc

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
    nix run "github:nix-community/home-manager/release-24.11" -- switch \
        --flake "github:jfalava/outfitting?dir=packages/x64-linux#jfalava" \
        --no-write-lock-file || {
        echo "Warning: Home Manager installation failed."
        echo "After script completion, you can try:"
        echo "  nix run github:nix-community/home-manager/release-24.11 -- switch --flake 'github:jfalava/outfitting?dir=packages/x64-linux#jfalava'"
    }

    # Now that Home Manager has installed zsh, set it as the default shell
    if command -v zsh &> /dev/null; then
        echo "Setting zsh as default shell..."
        sudo chsh -s "$(which zsh)" "$USER" || echo "Warning: Failed to set zsh as default shell. You can manually run: chsh -s \$(which zsh)"
    else
        echo "Warning: zsh not found after Home Manager installation"
    fi
else
    echo "Nix not found, skipping home-manager installation"
fi

#####
## runtimes
#####
curl -fsSL https://bun.sh/install | bash
deno jupyter --install # if the deno flake fails to install, this will fail gracefully
curl -fsSL https://get.pnpm.io/install.sh | sh -
curl -LsSf https://astral.sh/uv/install.sh | sh

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
    pnpm install -g @openai/codex
else
    echo "warning: pnpm not found in PATH. it may not be available until after opening a new terminal."
fi
curl -fsSL https://opencode.ai/install | bash
curl -fsSL https://claude.ai/install.sh | bash
echo "run pnpm approve-builds -g to finish"

#####
## dotfiles are now managed by Home Manager
#####
echo "Dotfiles (.zshrc, .ripgreprc, .gitconfig) are managed by Home Manager"
echo "To update dotfiles: commit changes to git, then run 'home-manager switch --flake github:jfalava/outfitting?dir=packages/x64-linux#jfalava'"

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
