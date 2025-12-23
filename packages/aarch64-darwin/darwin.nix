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

  # System-wide packages (minimal - most packages in home.nix)
  environment.systemPackages = with pkgs; [
    vim
  ];

  # Enable zsh as the default shell
  programs.zsh.enable = true;

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
    };

    # Global macOS settings
    NSGlobalDomain = {
      AppleShowAllExtensions = true;
      InitialKeyRepeat = 15;
      KeyRepeat = 2;
      NSAutomaticSpellingCorrectionEnabled = false;
      NSAutomaticCapitalizationEnabled = false;
      NSAutomaticPeriodSubstitutionEnabled = false;
      # Enable PC-style keyboard behavior for Windows keyboards
      "com.apple.keyboard.fnState" = false;
    };

    # Trackpad settings
    trackpad = {
      Clicking = true;
      DragLock = false;
      TrackpadThreeFingerDrag = true;
    };

    # Security settings
    screensaver = {
      askForPassword = true;
      askForPasswordDelay = 0;
    };
  };

  # System services are now enabled automatically by nix-darwin

  # Security settings - updated for new nix-darwin
  security.pam.services.sudo_local.touchIdAuth = true;

  # Keyboard configuration - Set custom Spanish ISO keyboard layout for Windows keyboard
  system.activationScripts.postActivation.text = ''
    echo "Configuring custom Spanish ISO keyboard layout for Windows keyboard..."

    # Note: Custom keyboard layout installed at ~/Library/Keyboard Layouts/Spanish-ISO-Fixed.keylayout
    # The user needs to manually select "Spanish - ISO (Fixed)" from System Settings > Keyboard > Input Sources

    echo "Custom Spanish ISO keyboard layout with tilde fix has been installed."
    echo "To enable it:"
    echo "1. Go to System Settings > Keyboard > Input Sources"
    echo "2. Click '+' to add a new input source"
    echo "3. Select 'Spanish - ISO (Fixed)' from the list"
    echo "4. Remove the old 'Spanish - ISO' layout if desired"
    echo ""
    echo "After enabling, Right Alt + 4 will produce ~ (tilde)"
  '';

  # Used for backwards compatibility, please read the changelog before changing.
  # $ darwin-rebuild changelog
  system.stateVersion = 5;
}
