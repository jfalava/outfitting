#!/bin/bash

# Home Manager Version Manager
# Simple script to update Home Manager to the latest stable release
# Fixed for portability between GNU and BSD sed, with persistent NIX_PATH

set -euo pipefail

# Current version (update this when new releases come out)
CURRENT_HM_VERSION="25.11"

# Function to make environment variables persistent across shell sessions
# Updates existing values or appends new ones, handles rc file creation
persist_environment_var() {
    local var_name="$1"
    local var_value="$2"
    local shell_rc=""
    
    # Detect user's shell and appropriate rc file
    if [[ -n "${ZSH_VERSION:-}" ]]; then
        shell_rc="$HOME/.zshrc"
    elif [[ -n "${BASH_VERSION:-}" ]]; then
        shell_rc="$HOME/.bashrc"
    else
        # Fallback to .profile for other shells
        shell_rc="$HOME/.profile"
    fi
    
    # Create rc file if it doesn't exist
    if [[ ! -f "$shell_rc" ]]; then
        echo "Creating $shell_rc..."
        touch "$shell_rc"
    fi
    
    # Check if an export for this variable already exists
    if grep -q "^\s*export\s\+$var_name=" "$shell_rc" 2>/dev/null; then
        # Variable exists - update its value
        echo "Updating $var_name in $shell_rc..."
        # Create a temp file with the updated content
        local temp_file="${shell_rc}.tmp"
        
        # Remove existing export line and add new one
        grep -v "^\s*export\s\+$var_name=" "$shell_rc" > "$temp_file"
        echo "" >> "$temp_file"
        echo "# Added by Home Manager setup script" >> "$temp_file"
        echo "export $var_name=\"$var_value\"" >> "$temp_file"
        
        # Replace original file
        mv "$temp_file" "$shell_rc"
        echo "✓ Updated $var_name in $shell_rc"
    else
        # Variable doesn't exist - append it
        echo "Adding $var_name to $shell_rc..."
        {
            echo ""
            echo "# Added by Home Manager setup script"
            echo "export $var_name=\"$var_value\""
        } >> "$shell_rc"
        echo "✓ Added $var_name to $shell_rc"
    fi
}

# Portable sed function that works on both GNU and BSD sed
portable_sed() {
    local pattern="$1"
    local file="$2"
    local temp_file="${file}.tmp"
    
    # Use sed without -i flag, write to temp file, then move back
    sed "$pattern" "$file" > "$temp_file" && mv "$temp_file" "$file"
}

# Function to update Home Manager version
hm-update-version() {
    local new_version="${1:-$CURRENT_HM_VERSION}"
    
    echo "Updating Home Manager to release-$new_version..."
    
    # Update WSL setup script
    portable_sed "s/release-[0-9][0-9]\.[0-9][0-9]/release-$new_version/g" packages/x64-linux/setup-home-manager.sh
    
    # Update macOS setup script  
    portable_sed "s/release-[0-9][0-9]\.[0-9][0-9]/release-$new_version/g" macos-install-script.sh
    
    # Update stateVersion in home.nix files
    portable_sed "s/stateVersion = \"[0-9][0-9]\.[0-9][0-9]\"/stateVersion = \"$new_version\"/g" packages/x64-linux/home.nix
    portable_sed "s/stateVersion = \"[0-9][0-9]\.[0-9][0-9]\"/stateVersion = \"$new_version\"/g" packages/aarch64-darwin/home.nix
    
    echo "✓ Updated all files to use release-$new_version"
    echo ""
    echo "Next steps:"
    echo "1. Review the changes with: git diff"
    echo "2. Test the new version: nix-channel --update && home-manager switch"
    echo "3. If everything works, commit the changes"
}

# Function to check for newer releases
check-latest() {
    echo "Checking for newer Home Manager releases..."
    
    # Check if jq is available
    if ! command -v jq &>/dev/null; then
        echo "⚠ jq is not installed. Please install jq to check for updates."
        echo "  On macOS: brew install jq"
        echo "  On Linux: sudo apt install jq  # or your package manager"
        return 1
    fi
    
    # Try GitHub API first (more reliable)
    LATEST_RELEASE=$(curl -s https://api.github.com/repos/nix-community/home-manager/branches | \
        jq -r '.[].name' | grep -E '^release-[0-9][0-9]\.[0-9][0-9]$' | sort -V | tail -1)
    
    # If API doesn't show the latest, fall back to web scraping
    if [[ -z "$LATEST_RELEASE" ]]; then
        echo "ℹ API may not show latest release, checking web interface..."
        LATEST_RELEASE=$(curl -s https://github.com/nix-community/home-manager/branches | \
            grep -o 'release-[0-9][0-9]\.[0-9][0-9]' | sort -V | tail -1)
    fi
    
    if [[ -z "$LATEST_RELEASE" ]]; then
        echo "⚠ Could not detect latest release, assuming current is latest"
        return
    fi
    
    if [[ "$LATEST_RELEASE" == "release-$CURRENT_HM_VERSION" ]]; then
        echo "✓ You're already on the latest stable release: $CURRENT_HM_VERSION"
    else
        echo "⚠ Newer release available: $LATEST_RELEASE"
        echo "  Current: release-$CURRENT_HM_VERSION"
        echo ""
        echo "To update, run: hm-update-version ${LATEST_RELEASE#release-}"
    fi
}

# Function to set up persistent NIX_PATH
setup-persistent-nix-path() {
    # Use a clean, reproducible NIX_PATH value instead of the current temporary state
    local nix_path_value="$HOME/.nix-defexpr/channels:/nix/var/nix/profiles/per-user/root/channels"
    
    echo "Setting up persistent NIX_PATH..."
    persist_environment_var "NIX_PATH" "$nix_path_value"
    
    echo ""
    echo "✓ NIX_PATH will be persistent across shell sessions"
    echo "  You may need to restart your shell or run: source ~/.bashrc (or ~/.zshrc)"
}

# Main function
case "${1:-check}" in
    "update")
        hm-update-version "${2:-}"
        ;;
    "check")
        check-latest
        ;;
    "setup-nix-path")
        setup-persistent-nix-path
        ;;
    *)
        echo "Usage: $0 {check|update [version]|setup-nix-path}"
        echo ""
        echo "Commands:"
        echo "  check          - Check if newer release is available"
        echo "  update         - Update to latest release"
        echo "  update 26.05   - Update to specific version"
        echo "  setup-nix-path - Make NIX_PATH persistent across sessions"
        echo ""
        echo "Current version: $CURRENT_HM_VERSION"
        ;;
esac