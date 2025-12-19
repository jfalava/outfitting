# nix-darwin configuration using Nix channels instead of flakes
# This provides system-level macOS configuration with Home Manager integration

{ config, pkgs, ... }:

{
  # User configuration
  users.users.jfalava = {
    home = "/Users/jfalava";
    shell = pkgs.zsh;
  };
  
  # Primary user for system settings (required for nix-darwin)
  system.primaryUser = "jfalava";

  # System-wide packages (minimal - most packages in home.nix)
  environment.systemPackages = with pkgs; [
    vim
  ];

  # Enable zsh as the default shell
  programs.zsh.enable = true;

  # Nix configuration - using flakes
  nix = {
    settings = {
      experimental-features = [
        "nix-command"
        "flakes"
      ];
      substituters = [
        "https://cache.nixos.org/"
        "https://nix-community.cachix.org"
        "https://cache.flakehub.com"
      ];
      trusted-public-keys = [
        "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
        "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
        "cache.flakehub.com-3:hJuILl5sVK4iKm86JzgdXW12Y2Hwd5G07qKtHTOcDCM="
        "cache.flakehub.com-4:Asi8qIv291s0aYLyH6IOnr5Kf6+OF14WVjkE6t3xMio="
        "cache.flakehub.com-5:zB96CRlL7tiPtzA9/WKyPkp3A2vqxqgdgyTVNGShPDU="
        "cache.flakehub.com-6:W4EGFwAGgBj3he7c5fNh9NkOXw0PUVaxygCVKeuvaqU="
        "cache.flakehub.com-7:mvxJ2DZVHn/kRxlIaxYNMuDG1OvMckZu32um1TadOR8="
        "cache.flakehub.com-8:moO+OVS0mnTjBTcOUh2kYLQEd59ExzyoW1QgQ8XAARQ="
        "cache.flakehub.com-9:wChaSeTI6TeCuV/Sg2513ZIM9i0qJaYsF+lZCXg0J6o="
        "cache.flakehub.com-10:2GqeNlIp6AKp4EF2MVbE1kBOp9iBSyo0UPR9KoR0o1Y="
      ];
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
    
    # Use automatic store optimization (replaces deprecated auto-optimise-store)
    optimise.automatic = true;
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

  # System services are now enabled automatically by nix-darwin

  # Security settings - updated for new nix-darwin
  security.pam.services.sudo_local.touchIdAuth = true;

  # Used for backwards compatibility, please read the changelog before changing.
  # $ darwin-rebuild changelog
  system.stateVersion = 5;
}