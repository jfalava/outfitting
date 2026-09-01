# nix-darwin configuration using Nix channels instead of flakes

{ pkgs, ... }:

{
  # User configuration
  users.users.jfalava = {
    home = "/Users/jfalava";
    shell = pkgs.zsh;
  };

  # Primary user for system settings (required for nix-darwin)
  system.primaryUser = "jfalava";

  # Set the Mac hostname
  networking.hostName = "jfa-mac-mini";
  networking.computerName = "jfa-mac-mini";

  # Enable zsh as the default shell
  programs.zsh.enable = true;
  programs.zsh.loginShellInit = ''
    [ ! -f "$HOME/.local/bin/env" ] || . "$HOME/.local/bin/env"
  '';

  # Nix configuration - using flakes
  # Note: Using Determinate Nix, so we disable nix-darwin's Nix management
  nix.enable = false;

  # Manual Nix settings for Determinate Nix compatibility
  # These settings will be managed by Determinate Nix instead
  programs.nix-index.enable = true;

  # macOS system defaults - enhanced configuration
  system.defaults = {
    # Dock settings
    dock = {
      autohide = true;
      show-recents = false;
      tilesize = 48;
      minimize-to-application = true;
    };

    # Finder settings
    finder = {
      AppleShowAllExtensions = true;
      ShowPathbar = true;
      FXEnableExtensionChangeWarning = false;
      ShowStatusBar = true;
      NewWindowTarget = "Home";
    };

    # Global macOS settings
    NSGlobalDomain = {
      AppleShowAllExtensions = true;
      InitialKeyRepeat = 15;
      KeyRepeat = 2;
      NSAutomaticSpellingCorrectionEnabled = false;
      NSAutomaticCapitalizationEnabled = false;
      NSAutomaticPeriodSubstitutionEnabled = false;
    };

    # Trackpad settings
    trackpad = {
      Clicking = true;
      DragLock = false;
      TrackpadThreeFingerDrag = true;
    };

    # Keep windows visible when clicking the desktop wallpaper.
    WindowManager.EnableStandardClickToShowDesktop = false;

    # Security settings
    screensaver = {
      askForPassword = true;
      askForPasswordDelay = 0;
    };
  };

  # macOS can leave the Dock's hidden state stuck after a Dock restart, which
  # reserves the bottom strip and prevents windows from being resized into it.
  # Activation runs as root, so write the preference and restart Dock as the
  # logged-in user. This is intentionally repeatable and only runs when Dock
  # is active; a switch therefore also repairs the runtime state on demand.
  system.activationScripts.postActivation.text = ''
    dock_uid="$(/usr/bin/id -u jfalava 2>/dev/null || true)"
    if [ -n "$dock_uid" ] \
      && /usr/bin/pgrep -u "$dock_uid" -x Dock >/dev/null 2>&1; then
      /usr/bin/sudo -u jfalava -H /usr/bin/defaults write com.apple.dock autohide -bool false
      /usr/bin/killall -u jfalava Dock >/dev/null 2>&1 || true
      /bin/sleep 1
      /usr/bin/sudo -u jfalava -H /usr/bin/defaults write com.apple.dock autohide -bool true
      /usr/bin/killall -u jfalava Dock >/dev/null 2>&1 || true
    fi
  '';

  # System services are now enabled automatically by nix-darwin

  # Security settings - updated for new nix-darwin
  security.pam.services.sudo_local.touchIdAuth = true;

  # Used for backwards compatibility, please read the changelog before changing.
  # $ darwin-rebuild changelog
  system.stateVersion = 5;
}
