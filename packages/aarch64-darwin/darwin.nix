# nix-darwin configuration using Nix channels instead of flakes
# This provides system-level macOS configuration with Home Manager integration

{ config, pkgs, ... }:

{
  # User configuration
  users.users.jfalava = {
    home = "/Users/jfalava";
    shell = pkgs.zsh;
  };

  # System-wide packages (minimal - most packages in home.nix)
  environment.systemPackages = with pkgs; [
    vim
  ];

  # Enable zsh as the default shell
  programs.zsh.enable = true;

  # Nix configuration - using channels instead of flakes
  nix = {
    settings = {
      experimental-features = [
        "nix-command"
        "flakes"
      ];
      substituters = [
        "https://cache.nixos.org/"
        "https://nix-community.cachix.org"
      ];
      trusted-public-keys = [
        "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
        "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
      ];
      auto-optimise-store = true;
      max-jobs = "auto";
    };

    # Enable garbage collection
    gc = {
      automatic = true;
      interval = {
        Weekday = 0;  # Sunday
        Hour = 3;     # 3 AM
        Minute = 0;
      };
      options = "--delete-older-than 30d";
    };
  };

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

  # Enable system services
  services = {
    nix-daemon.enable = true;
    activate-system.enable = true;
  };

  # Security settings
  security = {
    pam.enableSudoTouchIdAuth = true;
  };

  # Used for backwards compatibility, please read the changelog before changing.
  # $ darwin-rebuild changelog
  system.stateVersion = 5;
}
