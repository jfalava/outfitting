#!/bin/bash

# Home Manager Version Manager
# Simple script to update Home Manager to the latest stable release

set -euo pipefail

# Current version (update this when new releases come out)
CURRENT_HM_VERSION="25.11"

# Function to update Home Manager version
hm-update-version() {
    local new_version="${1:-$CURRENT_HM_VERSION}"
    
    echo "Updating Home Manager to release-$new_version..."
    
    # Update WSL setup script
    sed -i "s/release-[0-9][0-9]\.[0-9][0-9]/release-$new_version/g" packages/x64-linux/setup-home-manager.sh
    
    # Update macOS setup script  
    sed -i "s/release-[0-9][0-9]\.[0-9][0-9]/release-$new_version/g" macos-install-script.sh
    
    # Update stateVersion in home.nix files
    sed -i "s/stateVersion = \"[0-9][0-9]\.[0-9][0-9]\"/stateVersion = \"$new_version\"/g" packages/*/home.nix
    
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
    
    # Get latest release from GitHub web interface (more reliable than API)
    LATEST_RELEASE=$(curl -s https://github.com/nix-community/home-manager/branches | \
        grep -o 'release-[0-9][0-9]\.[0-9][0-9]' | sort -V | tail -1)
    
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

# Main function
case "${1:-check}" in
    "update")
        hm-update-version "${2:-}"
        ;;
    "check")
        check-latest
        ;;
    *)
        echo "Usage: $0 {check|update [version]}"
        echo ""
        echo "Commands:"
        echo "  check          - Check if newer release is available"
        echo "  update         - Update to latest release"
        echo "  update 26.05   - Update to specific version"
        echo ""
        echo "Current version: $CURRENT_HM_VERSION"
        ;;
esac