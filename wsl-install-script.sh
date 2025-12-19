#!/bin/bash

# ========================================
# WSL Outfitting Installation Script
# ========================================
# Channel-based Home Manager setup (no flakes)

# Default mode: update repositories and Nix packages only (skip APT installs)
export UPDATE_ONLY=true
export NIX_ONLY=true
MODE="default"

# Parse command line arguments for override flags
for arg in "$@"; do
    case "$arg" in
        --full-install)
            UPDATE_ONLY=false
            NIX_ONLY=false
            MODE="full-install"
            ;;
        --update-only)
            UPDATE_ONLY=true
            NIX_ONLY=false
            MODE="update-only"
            ;;
        --nix-only)
            UPDATE_ONLY=false
            NIX_ONLY=true
            MODE="nix-only"
            ;;
    esac
done

case "$MODE" in
    "default")
        echo "Running default mode (update + nix-only, skipping APT installs)..."
        ;;
    "update-only")
        echo "Running update-only mode (update repositories and APT packages)..."
        ;;
    "nix-only")
        echo "Running nix-only mode (Nix installation only, skip APT)..."
        ;;
    "full-install")
        echo "Running full WSL setup..."
        ;;
esac

# Handle initialization based on mode
case "$MODE" in
    "default"|"nix-only")
        ## minimal init for nix-only/default mode - just install curl
        sudo apt install -y curl
        ;;
    "update-only"|"full-install")
        ## full init for modes that need APT package management
        sudo apt update -y && sudo apt upgrade -y && sudo apt install -y curl
        ;;
esac

# Install APT packages only for modes that need them
if [[ "$MODE" == "update-only" || "$MODE" == "full-install" ]]; then
#####
## install apt packages
#####
APT_LIST_URL="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/x64-linux/apt.txt"
curl -fsSL "$APT_LIST_URL" -o /tmp/apt-packages.txt || {
    echo "Failed to fetch APT package list. Exiting..."
    exit 1
}

# Use xargs to process packages line by line (avoids WSL read issues)
xargs -a /tmp/apt-packages.txt -I {} bash -c "
    package=\$(echo '{}' | tr -d '[:space:]')
    if [[ -n \"\$package\" && ! \"\$package\" =~ ^# ]]; then
        echo \"Installing apt package: \$package\"
        sudo apt install -y \"\$package\"
    fi
"

## cleanup
sudo apt autoremove -y
fi

if [[ "$MODE" != "update-only" ]]; then

#####
## Configure outfitting repository location
#####
configure_outfitting_repo() {
    echo ""
    echo "================================"
    echo "Repository Configuration"
    echo "================================"
    echo ""
    echo "Setting up outfitting repository location..."
    echo ""
    
    # Always use default location for remote installation
    repo_path="$HOME/Workspace/outfitting"
    echo "Using default repository location: $repo_path"
    
    # Handle the repository setup
    if [ ! -d "$repo_path" ]; then
        echo "Directory doesn't exist. Creating: $repo_path"
        mkdir -p "$(dirname "$repo_path")"

        echo "Cloning outfitting repository..."
        if git clone https://github.com/jfalava/outfitting.git "$repo_path"; then
            echo "✓ Repository cloned successfully"
        else
            echo "✗ Failed to clone repository, but continuing..."
        fi
    elif [ ! -d "$repo_path/.git" ]; then
        echo "Error: Directory exists but is not a git repository: $repo_path"
        return 1
    else
        echo "✓ Using existing repository at: $repo_path"
    fi

    # Store the configuration
    local config_dir="$HOME/.config/outfitting"
    local config_file="$config_dir/repo-path"

    mkdir -p "$config_dir"
    echo "$repo_path" > "$config_file"
    chmod 600 "$config_file"

    echo "✓ Repository location configured successfully!"
    echo "  Repository path: $repo_path"
    echo "  Configuration stored in: $config_file"
    echo ""
    echo "You can now use local commands like: hm-sync, hm-switch, hm-update"
    echo "To change location later, run: setup-outfitting-repo"
    
    return 0
}

# Call the configuration function
configure_outfitting_repo

echo ""

if [[ "$MODE" != "update-only" ]]; then
#####
## nix
#####
curl --proto '=https' --tlsv1.2 -sSf -L https://nixos.org/nix/install | sh -s -- --daemon || {
    echo "Failed to install Nix. Exiting..."
    exit 1
}

# Source nix for the current session
# shellcheck source=/dev/null
source /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh || source ~/.nix-profile/etc/profile.d/nix.sh || true

if ! grep -q "nix-daemon.sh" ~/.bashrc 2>/dev/null; then
    (
        echo
        echo '# Nix'
        echo 'if [ -e /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh ]; then'
        echo '  source /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh'
        echo 'elif [ -e ~/.nix-profile/etc/profile.d/nix.sh ]; then'
        echo '  source ~/.nix-profile/etc/profile.d/nix.sh'
        echo 'fi'
    ) >> ~/.bashrc
fi

sudo mkdir -p /etc/nix
sudo tee -a /etc/nix/nix.conf > /dev/null << 'EOF'

substituters = https://cache.nixos.org/ https://nix-community.cachix.org
trusted-public-keys = cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY= nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs=
auto-optimise-store = true
max-jobs = auto
experimental-features = nix-command
EOF

## install home-manager using CHANNELS (no flakes)
if command -v nix >/dev/null; then
    echo "Installing Home Manager using Nix channels..."

    echo "Adding nixpkgs channel..."
    nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs

    echo "Adding Home Manager channel..."
    nix-channel --add https://github.com/nix-community/home-manager/archive/release-25.11.tar.gz home-manager

    echo "Updating channels..."
    nix-channel --update

    export NIX_PATH="$HOME/.nix-defexpr/channels${NIX_PATH:+:$NIX_PATH}"
    echo "NIX_PATH set to: $NIX_PATH"

    echo "Verifying channels..."
    nix-channel --list

    echo "Running Home Manager installation..."
    nix-shell '<home-manager>' -A install

    # Check if local repository is configured
    config_file="$HOME/.config/outfitting/repo-path"
    if [ -f "$config_file" ]; then
        repo_path=$(cat "$config_file")
        echo "Using local repository: $repo_path"

        # Copy home.nix to Home Manager location
        mkdir -p ~/.config/home-manager
        cp "$repo_path/packages/x64-linux/home.nix" ~/.config/home-manager/
        
        # Apply configuration using channels (no flakes)
        home-manager switch || {
            echo "Warning: Home Manager configuration failed."
            echo "After script completion, you can try:"
            echo "  home-manager switch"
        }
    else
        echo "Using default Home Manager configuration (no local repository found)"
        # Home Manager will use default config
    fi

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
fi

if [[ "$MODE" != "update-only" ]]; then
#####
## runtimes
#####
curl -fsSL https://bun.sh/install | bash
deno jupyter --install # if the deno flake fails to install, this will fail gracefully
curl -LsSf https://astral.sh/uv/install.sh | sh

#####
## install bun global packages from bun.txt
#####
if command -v bun >/dev/null 2>&1; then
    echo "❖ Installing Bun global packages..."
    BUN_PACKAGES_URL="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/packages/bun.txt"
    BUN_PACKAGES_FILE="/tmp/bun-packages.txt"

    if curl -fsSL "$BUN_PACKAGES_URL" -o "$BUN_PACKAGES_FILE"; then
        while IFS= read -r package; do
            # Skip empty lines and comments
            [[ -z "$package" || "$package" =~ ^[[:space:]]*# ]] && continue
            # Remove leading/trailing whitespace
            package=$(echo "$package" | xargs)
            if [[ -n "$package" ]]; then
                echo "❖ Installing Bun package: $package"
                bun install -g "$package" || echo "❖ Warning: Failed to install $package"
            fi
        done < "$BUN_PACKAGES_FILE"
        rm -f "$BUN_PACKAGES_FILE"
    else
        echo "❖ Warning: Failed to fetch Bun packages list, skipping global package installations"
    fi
else
    echo "❖ Bun not found, skipping global package installations"
fi
fi

echo ""
echo "================================"
echo "Installation Complete!"
echo "================================"
echo ""
echo "✓ Nix installed with channel-based Home Manager"
echo "✓ Home Manager configuration applied"
echo "✓ Default shell set to zsh"
echo ""
echo "To update packages in the future:"
echo "  nix-channel --update && home-manager switch"
echo ""
echo "Or use the helper function:"
echo "  hm-update"
echo ""
echo "Your packages will float with nixpkgs-unstable (like Homebrew)"
echo "No more flake.lock management needed!"