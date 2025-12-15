#!/bin/bash

# ========================================
# WSL Outfitting Installation Script
# ========================================

UPDATE_ONLY=true
NIX_ONLY=true

# Parse command line arguments for override flags
for arg in "$@"; do
    case "$arg" in
        --full-install)
            UPDATE_ONLY=false
            NIX_ONLY=false
            ;;
        --update-only)
            UPDATE_ONLY=true
            NIX_ONLY=false
            ;;
        --nix-only)
            UPDATE_ONLY=false
            NIX_ONLY=true
            ;;
    esac
done

if [[ "$UPDATE_ONLY" == "true" && "$NIX_ONLY" == "true" ]]; then
    echo "Running default mode (update + nix-only, skipping APT installs)..."
elif [[ "$UPDATE_ONLY" == "true" && "$NIX_ONLY" == "false" ]]; then
    echo "Running update-only mode..."
elif [[ "$UPDATE_ONLY" == "false" && "$NIX_ONLY" == "true" ]]; then
    echo "Running nix-only mode (skipping APT installs)..."
else
    echo "Running full WSL setup..."
fi

if [[ "$NIX_ONLY" == "false" ]]; then
## init
sudo apt update -y && sudo apt upgrade -y && sudo apt install -y curl
else
## minimal init for nix-only mode
sudo apt install -y curl
fi

if [[ "$NIX_ONLY" == "false" ]]; then
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
fi

if [[ "$UPDATE_ONLY" == "false" ]]; then

#####
## Configure outfitting repository location
#####
configure_outfitting_repo() {
    echo ""
    echo "================================"
    echo "Repository Configuration"
    echo "================================"
    echo ""
    echo "For the best Home Manager experience, we recommend setting up a local clone"
    echo "of the outfitting repository. This enables local development and customization."
    echo ""
    echo "You can skip this and use the remote configuration, but local commands"
    echo "like 'hm-sync' won't work until you set up a local clone."
    echo ""

    # Offer choices
    echo "Where would you like to keep the outfitting repository?"
    echo ""
    echo "  1) Default location: ~/Workspace/outfitting"
    echo "  2) Choose custom location"
    echo "  3) Specify existing clone"
    echo "  s) Skip for now (use remote flake only)"
    echo ""

    while true; do
        read -p "Select option (1-3, s): " choice

        case "$choice" in
            1)
                repo_path="$HOME/Workspace/outfitting"
                break
                ;;
            2)
                read -e -p "Enter custom path: " repo_path
                if [ -z "$repo_path" ]; then
                    echo "Error: No path provided"
                    continue
                fi
                break
                ;;
            3)
                read -e -p "Enter existing clone path: " repo_path
                if [ -z "$repo_path" ]; then
                    echo "Error: No path provided"
                    continue
                fi
                break
                ;;
            s|S)
                echo "Skipped. You can set up local repository later with: setup-outfitting-repo"
                return 0
                ;;
            *)
                echo "Invalid option. Please choose 1-3 or s."
                continue
                ;;
        esac
    done

    # Handle the repository setup
    if [ ! -d "$repo_path" ]; then
        echo "Directory doesn't exist. Creating: $repo_path"
        mkdir -p "$(dirname "$repo_path")"

        echo "Cloning outfitting repository..."
        if git clone https://github.com/jfalava/outfitting.git "$repo_path"; then
            echo "✓ Repository cloned successfully"
        else
            echo "✗ Failed to clone repository"
            return 1
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

    echo ""
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

#####
## nix
#####
## install nix using Determinate Nix installer
# Determinate Nix provides better WSL support, FlakeHub integration, and improved defaults
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install --no-confirm || {
    echo "Failed to install Determinate Nix. Exiting..."
    exit 1
}

# Source nix for the current session
source /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh || source ~/.nix-profile/etc/profile.d/nix.sh || true

# Determinate installer already adds nix to shell profiles, but ensure it's in bashrc
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

# Add custom nix configuration (Determinate sets good defaults, but we add our preferences)
sudo mkdir -p /etc/nix
sudo tee -a /etc/nix/nix.conf > /dev/null << 'EOF'

# Custom configuration for jfalava outfitting
substituters = https://cache.nixos.org/ https://nix-community.cachix.org
trusted-public-keys = cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY= nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs=
auto-optimise-store = true
max-jobs = auto
EOF

## install home-manager and apply configuration
if command -v nix >/dev/null; then
    echo "Installing Home Manager and applying configuration..."

    # Check if local repository is configured
    local config_file="$HOME/.config/outfitting/repo-path"
    if [ -f "$config_file" ]; then
        local repo_path
        repo_path=$(cat "$config_file")
        echo "Using local repository: $repo_path"

        # Use local flake if configured
        nix run "github:nix-community/home-manager" -- switch \
            --flake "$repo_path/packages/x64-linux#jfalava" \
            --no-write-lock-file \
            -b backup || {
            echo "Warning: Home Manager installation failed."
            echo "After script completion, you can try:"
            echo "  nix run github:nix-community/home-manager -- switch --flake '$repo_path/packages/x64-linux#jfalava' --no-write-lock-file -b backup"
        }
    else
        echo "Using remote repository (no local configuration found)"

        # Fall back to remote flake
        nix run "github:nix-community/home-manager" -- switch \
            --flake "github:jfalava/outfitting?dir=packages/x64-linux#jfalava" \
            --no-write-lock-file \
            -b backup || {
            echo "Warning: Home Manager installation failed."
            echo "After script completion, you can try:"
            echo "  nix run github:nix-community/home-manager -- switch --flake 'github:jfalava/outfitting?dir=packages/x64-linux#jfalava' --no-write-lock-file -b backup"
        }
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

if [[ "$UPDATE_ONLY" == "false" ]]; then
#####
## runtimes
#####
curl -fsSL https://bun.sh/install | bash
deno jupyter --install # if the deno flake fails to install, this will fail gracefully
curl -LsSf https://astral.sh/uv/install.sh | sh
fi

if [[ "$NIX_ONLY" == "false" ]]; then
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
fi

if [[ "$NIX_ONLY" == "false" ]]; then
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
fi

if [[ "$NIX_ONLY" == "false" ]]; then
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
fi

if [[ "$NIX_ONLY" == "false" ]]; then
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
fi

## prevent agent-env ENOENT error on first new terminal session
mkdir ~/.ssh

## end message and validation
echo ""
echo "================================"
if [[ "$NIX_ONLY" == "true" ]]; then
    echo "Nix-only Installation Complete!"
else
    echo "Installation Complete!"
fi
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

echo ""
echo "================================"
echo "Next Steps:"
echo "================================"
echo "1. Close this terminal and open a new one"
echo "2. You should see the Starship prompt and have zsh configured"
echo "3. Run 'ff' to see system info (fastfetch)"
echo ""
echo "If you encounter issues, check:"
echo "  - Run 'source ~/.zshrc' to reload your shell configuration"

# Check if local repository is configured and provide appropriate command
if [ -f "$HOME/.config/outfitting/repo-path" ]; then
    local repo_path
    repo_path=$(cat "$HOME/.config/outfitting/repo-path")
    echo "  - Run 'home-manager switch --flake $repo_path/packages/x64-linux#jfalava' to reapply configuration"
else
    echo "  - Run 'home-manager switch --flake github:jfalava/outfitting?dir=packages/x64-linux#jfalava' to reapply configuration"
fi
echo ""
echo "================================"
echo "Usage Notes:"
echo "================================"
echo "Default behavior (curl -L wsl.jfa.dev | bash):"
echo "  - Updates repositories and Nix packages only"
echo "  - Skips APT package installations"
echo "  - Fast and safe for existing setups"
echo ""
echo "Override flags:"
echo "  --full-install  : Install everything (APT packages + Nix)"
echo "  --update-only   : Update repositories and APT packages"
echo "  --nix-only      : Nix installation only (skip APT)"
echo ""
echo "Examples:"
echo "  curl -L wsl.jfa.dev | bash                    # Default: update + nix-only"
echo "  curl -L wsl.jfa.dev | bash -s -- --full-install  # Full installation"
echo "  curl -L wsl.jfa.dev | bash -s -- --update-only   # Update APT packages"
