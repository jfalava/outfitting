# Native Nix configuration knobs for installed macOS software

Generated 2026-07-24 from the Home Manager 26.05 option schema pinned in `packages/aarch64-darwin/flake.nix`.

This covers all 454 Nix options across the 28 installed applications and tools that have native Home Manager `programs.*` modules. An option such as `settings` may be a free-form attribute set; in that case Home Manager exposes one Nix knob and the nested keys are defined by the application itself.

Enabling a module can install its Nix package. For software intentionally installed by Homebrew, inspect the module's `package` option before enabling it; use `package = null` only when its documented type permits `null`.

## Index

| Module | Application | Current installer | Knobs |
|---|---|---|---:|
| [`programs.awscli`](#programsawscli) | AWS CLI | Homebrew formula | 4 |
| [`programs.bat`](#programsbat) | Bat | Nix | 10 |
| [`programs.btop`](#programsbtop) | Btop | Nix | 5 |
| [`programs.eza`](#programseza) | Eza | Nix | 12 |
| [`programs.fastfetch`](#programsfastfetch) | Fastfetch | Nix | 3 |
| [`programs.fd`](#programsfd) | fd | Nix | 5 |
| [`programs.firefox`](#programsfirefox) | Firefox | Homebrew cask | 67 |
| [`programs.fzf`](#programsfzf) | fzf | Nix | 15 |
| [`programs.gh`](#programsgh) | GitHub CLI | Nix | 10 |
| [`programs.ghostty`](#programsghostty) | Ghostty | Homebrew cask | 12 |
| [`programs.git`](#programsgit) | Git | Nix | 21 |
| [`programs.go`](#programsgo) | Go | Nix | 9 |
| [`programs.google-chrome`](#programsgooglechrome) | Google Chrome | Homebrew cask | 1 |
| [`programs.jq`](#programsjq) | jq | Nix | 3 |
| [`programs.lazygit`](#programslazygit) | Lazygit | Homebrew formula | 8 |
| [`programs.neovim`](#programsneovim) | Neovim | Homebrew formula | 42 |
| [`programs.ranger`](#programsranger) | Ranger | Homebrew formula | 13 |
| [`programs.ripgrep`](#programsripgrep) | Ripgrep | Nix | 3 |
| [`programs.starship`](#programsstarship) | Starship | Nix | 13 |
| [`programs.t3code`](#programst3code) | T3 Code | Homebrew cask | 8 |
| [`programs.tirith`](#programstirith) | Tirith | Nix | 7 |
| [`programs.twitch-tui`](#programstwitchtui) | Twitch TUI | Nix | 3 |
| [`programs.vim`](#programsvim) | Vim | Nix | 7 |
| [`programs.vscode`](#programsvscode) | Visual Studio Code | Homebrew cask | 22 |
| [`programs.zed-editor`](#programszededitor) | Zed | Homebrew cask | 16 |
| [`programs.zellij`](#programszellij) | Zellij | Homebrew formula | 11 |
| [`programs.zoxide`](#programszoxide) | Zoxide | Nix | 7 |
| [`programs.zsh`](#programszsh) | Zsh | Nix | 117 |

## `programs.awscli`

AWS CLI — currently installed through Homebrew formula.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.awscli.credentials` | open submodule of attribute set of section of an INI file (attrs of INI atom (null, bool, int, float or string)) | `{ }` | Configuration written to {file}`$HOME/.aws/credentials`. For security reasons, never store cleartext passwords here. We recommend that you use `credential_process` option to retrieve the IAM credentials from your favorite password manager during runtime, or use AWS IAM Identity Center to get short-term credentials. See <https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-authentication.html>. |
| `programs.awscli.enable` | boolean | `false` | Whether to enable AWS CLI tool. |
| `programs.awscli.package` | null or package | `pkgs.awscli2` | The aws package to use. |
| `programs.awscli.settings` | open submodule of attribute set of section of an INI file (attrs of INI atom (null, bool, int, float or string)) | `{ }` | Configuration written to {file}`$HOME/.aws/config`. |

## `programs.bat`

Bat — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.bat.config` | attribute set of (string or list of string or boolean) | `{ }` | Bat configuration. |
| `programs.bat.enable` | boolean | `false` | Whether to enable bat, a cat clone with wings. |
| `programs.bat.extraPackages` | list of package | `[ ]` | Additional bat packages to install. |
| `programs.bat.package` | package | `pkgs.bat` | The bat package to use. |
| `programs.bat.syntaxes` | attribute set of (strings concatenated with "\n" or (submodule)) | `{ }` | Additional syntaxes to provide. |
| `programs.bat.syntaxes.<name>.file` | null or string | `null` | Subpath of the syntax file within the source, if needed. |
| `programs.bat.syntaxes.<name>.src` | absolute path | — | Path to the syntax folder. |
| `programs.bat.themes` | attribute set of (strings concatenated with "\n" or (submodule)) | `{ }` | Additional themes to provide. |
| `programs.bat.themes.<name>.file` | null or string | `null` | Subpath of the theme file within the source, if needed. |
| `programs.bat.themes.<name>.src` | absolute path | — | Path to the theme folder. |

## `programs.btop`

Btop — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.btop.enable` | boolean | `false` | Whether to enable btop. |
| `programs.btop.extraConfig` | strings concatenated with "\n" | `""` | Extra lines added to the {file}`btop.conf` file. |
| `programs.btop.package` | null or package | `pkgs.btop` | The btop package to use. |
| `programs.btop.settings` | attribute set of (boolean or floating point number or signed integer or string) | `{ }` | Options to add to {file}`btop.conf` file. See <https://github.com/aristocratos/btop#configurability> for options. |
| `programs.btop.themes` | lazy attribute set of (absolute path or strings concatenated with "\n") | `{ }` | Themes to be written to {file}`$XDG_CONFIG_HOME/btop/themes/${name}.theme` |

## `programs.eza`

Eza — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.eza.colors` | one of <null>, "auto", "always", "never" | `null` | Use terminal colors in output ({option}`--color` argument). |
| `programs.eza.enable` | boolean | `false` | Whether to enable eza, a modern replacement for {command}`ls`. |
| `programs.eza.enableBashIntegration` | boolean | `[](#opt-home.shell.enableBashIntegration)` | Whether to enable Bash integration. |
| `programs.eza.enableFishIntegration` | boolean | `[](#opt-home.shell.enableFishIntegration)` | Whether to enable Fish integration. |
| `programs.eza.enableIonIntegration` | boolean | `[](#opt-home.shell.enableIonIntegration)` | Whether to enable Ion integration. |
| `programs.eza.enableNushellIntegration` | boolean | `[](#opt-home.shell.enableNushellIntegration)` | Whether to enable Nushell integration. |
| `programs.eza.enableZshIntegration` | boolean | `[](#opt-home.shell.enableZshIntegration)` | Whether to enable Zsh integration. |
| `programs.eza.extraOptions` | list of string | `[ ]` | Extra command line options passed to eza. |
| `programs.eza.git` | boolean | `false` | List each file's Git status if tracked or ignored ({option}`--git` argument). |
| `programs.eza.icons` | one of <null>, true, false, "auto", "always", "never" | `null` | Display icons next to file names ({option}`--icons` argument). Note, the support for Boolean values is deprecated. Setting this option to `true` corresponds to `--icons=auto`. |
| `programs.eza.package` | null or package | `pkgs.eza` | The eza package to use. |
| `programs.eza.theme` | YAML 1.1 value | `{ }` | Written to {file}`$XDG_CONFIG_HOME/eza/theme.yml` See <https://github.com/eza-community/eza#custom-themes> |

## `programs.fastfetch`

Fastfetch — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.fastfetch.enable` | boolean | `false` | Whether to enable Fastfetch. |
| `programs.fastfetch.package` | null or package | `pkgs.fastfetch` | The fastfetch package to use. |
| `programs.fastfetch.settings` | JSON value | `{ }` | Configuration written to {file}`$XDG_CONFIG_HOME/fastfetch/config.jsonc`. See <https://github.com/fastfetch-cli/fastfetch/wiki/Json-Schema> for the documentation. |

## `programs.fd`

fd — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.fd.enable` | boolean | `false` | Whether to enable fd, a simple, fast and user-friendly alternative to {command}`find`. |
| `programs.fd.extraOptions` | list of string | `[ ]` | Extra command line options passed to fd. |
| `programs.fd.hidden` | boolean | `false` | Search hidden files and directories ({option}`--hidden` argument). |
| `programs.fd.ignores` | list of string | `[ ]` | List of paths that should be globally ignored. |
| `programs.fd.package` | null or package | `pkgs.fd` | The fd package to use. |

## `programs.firefox`

Firefox — currently installed through Homebrew cask.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.firefox.darwinDefaultsId` | null or string | `"org.mozilla.firefox.plist"` | The id for the darwin defaults in order to set policies |
| `programs.firefox.enable` | boolean | `false` | Whether to enable Firefox. |
| `programs.firefox.enableGnomeExtensions` | boolean | `false` | Whether to enable the GNOME Shell native host connector. Note, you also need to set the NixOS option `services.gnome.gnome-browser-connector.enable` to `true`. |
| `programs.firefox.finalPackage` | null or package | `null` | Resulting Firefox package. |
| `programs.firefox.languagePacks` | list of string | `[ ]` | The language packs to install. Available language codes can be found on the releases page: `https://releases.mozilla.org/pub/firefox/releases/${version}/linux-x86_64/xpi/`, replacing `${version}` with the version of Firefox you have. If the version string of your Firefox derivative diverts from the upstream version, try setting the `release` option. |
| `programs.firefox.nativeMessagingHosts` | list of package | `[ ]` | Additional packages containing native messaging hosts that should be made available to Firefox extensions. |
| `programs.firefox.package` | null or package | `pkgs.firefox` | The Firefox package to use. If state version ≥ 19.09 then this should be a wrapped Firefox package. For earlier state versions it should be an unwrapped Firefox package. Set to `null` to disable installing Firefox. |
| `programs.firefox.pkcs11Modules` | list of package | `[ ]` | Additional packages to be loaded as PKCS #11 modules in Firefox. |
| `programs.firefox.policies` | attribute set of (JSON value) | `{ }` | [See list of policies](https://mozilla.github.io/policy-templates/). |
| `programs.firefox.profiles` | attribute set of (submodule) | `{ }` | Attribute set of Firefox profiles. When using Firefox Developer Edition, the profile name should be `dev-edition-default`. You can still set {option}`path` to store the profile in a custom directory. |
| `programs.firefox.profiles.<name>.bookmarks` | (submodule) or ((list of ((bookmark submodule) or (directory submodule) or value "separator" (singular enum))) or (attribute set of ((bookmark submodule) or (directory submodule) or value "separator" (singular enum))) convertible to it) convertible to it | `{ }` | Declarative bookmarks. |
| `programs.firefox.profiles.<name>.bookmarks.configFile` | null or absolute path | `null` | Configuration file to define custom bookmarks. |
| `programs.firefox.profiles.<name>.bookmarks.force` | boolean | `false` | Whether to force override existing custom bookmarks. |
| `programs.firefox.profiles.<name>.bookmarks.meta.maintainers` | list of lib.maintainers | `[ ]` | List of maintainers of each module. This option should be defined at most once per module. The option value is not a list of maintainers, but an attribute set that maps module file names to lists of maintainers. |
| `programs.firefox.profiles.<name>.bookmarks.meta.teams` | list of lib.teams | `[ ]` | List of team maintainers of each module. This option should be defined at most once per module. |
| `programs.firefox.profiles.<name>.bookmarks.settings` | (list of ((bookmark submodule) or (directory submodule) or value "separator" (singular enum))) or (attribute set of ((bookmark submodule) or (directory submodule) or value "separator" (singular enum))) convertible to it | `[ ]` | Custom bookmarks. |
| `programs.firefox.profiles.<name>.containers` | attribute set of (submodule) | `{ }` | Attribute set of container configurations. See [Multi-Account Containers](https://support.mozilla.org/en-US/kb/containers) for more information. |
| `programs.firefox.profiles.<name>.containers.<name>.color` | one of "blue", "turquoise", "green", "yellow", "orange", "red", "pink", "purple", "toolbar" | `"pink"` | Container color. |
| `programs.firefox.profiles.<name>.containers.<name>.icon` | one of "briefcase", "cart", "circle", "dollar", "fence", "fingerprint", "gift", "vacation", "food", "fruit", "pet", "tree", "chill" | `"fruit"` | Container icon. |
| `programs.firefox.profiles.<name>.containers.<name>.id` | unsigned integer, meaning >=0 | `1` | Container ID. This should be set to a unique number per container in this profile. |
| `programs.firefox.profiles.<name>.containers.<name>.name` | string | `"‹name›"` | Container name, e.g., shopping. |
| `programs.firefox.profiles.<name>.containersForce` | boolean | `false` | Whether to force replace the existing containers configuration. This is recommended since Firefox will replace the symlink on every launch, but note that you'll lose any existing configuration by enabling this. |
| `programs.firefox.profiles.<name>.extensions` | submodule | `{ }` | Submodule for installing and configuring extensions. |
| `programs.firefox.profiles.<name>.extensions.exactPermissions` | boolean | `false` | When enabled, {option}`programs.firefox.profiles.<profile>.extensions.settings.<extensionID>.permissions` must specify the exact set of permissions that the extension will request. This means that if the authorized permissions are broader than what the extension requests, the assertion will fail. |
| `programs.firefox.profiles.<name>.extensions.exhaustivePermissions` | boolean | `false` | When enabled, the user must authorize requested permissions for all extensions from {option}`programs.firefox.profiles.<profile>.extensions.packages` in {option}`programs.firefox.profiles.<profile>.extensions.settings.<extensionID>.permissions` |
| `programs.firefox.profiles.<name>.extensions.force` | boolean | `false` | Whether to override all previous firefox settings. This is required when using `settings`. |
| `programs.firefox.profiles.<name>.extensions.packages` | list of package | `[ ]` | List of ‹name› add-on packages to install for this profile. Some pre-packaged add-ons are accessible from the Nix User Repository. Once you have NUR installed run ```console $ nix-env -f '<nixpkgs>' -qaP -A nur.repos.rycee.firefox-addons ``` to list the available ‹name› add-ons. Note that it is necessary to manually enable these extensions inside ‹name› after the first installation. To automatically enable extensions add `"extensions.autoDisableScopes" = 0;` to [{option}`programs.firefox.profiles.<profile>.settings`](#opt-programs.firefox.profiles._name_.settings) On systems using impermanence, this only prevents ‹name› from requiring manual extension approval. It does not preserve extension runtime state such as extension UUIDs, logins, local storage, or per-extension data. Persist the ‹name› profile state needed by your extensions, or configure supported extension settings declaratively with [{option}`programs.firefox.profiles.<profile>.extensions.settings`](#opt-programs.firefox.profiles._name_.extensions.settings). Persisting only the `extensions` directory is generally not sufficient, because ‹name› stores extension state in other profile files and databases that are managed outside Home Manager. |
| `programs.firefox.profiles.<name>.extensions.settings` | attribute set of (submodule) | `{ }` | Attribute set of options for each extension. The keys of the attribute set consist of the ID of the extension or its UUID wrapped in curly braces. |
| `programs.firefox.profiles.<name>.extensions.settings.<name>.force` | boolean | `false` | Forcibly override any existing configuration for this extension. |
| `programs.firefox.profiles.<name>.extensions.settings.<name>.permissions` | null or (list of string) | `"Any permissions"` | Allowed permissions for this extension. See <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions> for a list of relevant permissions. |
| `programs.firefox.profiles.<name>.extensions.settings.<name>.settings` | attribute set of (JSON value) | `{ }` | Json formatted options for this extension. |
| `programs.firefox.profiles.<name>.extraConfig` | strings concatenated with "\n" | `""` | Extra preferences to add to {file}`user.js`. |
| `programs.firefox.profiles.<name>.handlers` | submodule | `{ }` | Declarative handlers configuration for MIME types and URL schemes. |
| `programs.firefox.profiles.<name>.handlers.force` | boolean | `false` | Whether to force replace the existing handlers configuration. |
| `programs.firefox.profiles.<name>.handlers.meta.maintainers` | list of lib.maintainers | `[ ]` | List of maintainers of each module. This option should be defined at most once per module. The option value is not a list of maintainers, but an attribute set that maps module file names to lists of maintainers. |
| `programs.firefox.profiles.<name>.handlers.meta.teams` | list of lib.teams | `[ ]` | List of team maintainers of each module. This option should be defined at most once per module. |
| `programs.firefox.profiles.<name>.handlers.mimeTypes` | attribute set of (submodule) | `{ }` | Attribute set mapping MIME types to their handler configurations. For a configuration example, see [this file on Firefox’s source code](https://github.com/mozilla-firefox/firefox/blob/c3797cdebac1316dd7168e995e3468c5a597e8d1/uriloader/exthandler/tests/unit/handlers.json). |
| `programs.firefox.profiles.<name>.handlers.mimeTypes.<name>.action` | one of 0, 1, 2, 3, 4 | `1` | The action to take for this MIME type / URL scheme. Possible values: - 0: Save file - 1: Always ask - 2: Use helper app - 3: Open in Firefox - 4: Use system default |
| `programs.firefox.profiles.<name>.handlers.mimeTypes.<name>.ask` | boolean | `false` | If true, the user is asked what they want to do with the file. If false, the action is taken without user intervention. |
| `programs.firefox.profiles.<name>.handlers.mimeTypes.<name>.extensions` | list of string matching the pattern ^[^\.].+$ | `[ ]` | List of file extensions associated with this MIME type. |
| `programs.firefox.profiles.<name>.handlers.mimeTypes.<name>.handlers` | list of (submodule) | `[ ]` | An array of handlers with the first one being the default. If you don't want to have a default handler, use an empty object for the first handler. Only valid when action is set to 2 (Use helper app). |
| `programs.firefox.profiles.<name>.handlers.mimeTypes.<name>.handlers.*.name` | null or string | `null` | Display name of the handler. |
| `programs.firefox.profiles.<name>.handlers.mimeTypes.<name>.handlers.*.path` | null or string | `null` | Path to the executable to be used. Only one of 'path' or 'uriTemplate' should be set. |
| `programs.firefox.profiles.<name>.handlers.mimeTypes.<name>.handlers.*.uriTemplate` | null or string | `null` | URI for the application handler. Only one of 'path' or 'uriTemplate' should be set. |
| `programs.firefox.profiles.<name>.handlers.schemes` | attribute set of (submodule) | `{ }` | Attribute set mapping URL schemes to their handler configurations. For a configuration example, see [this file on Firefox’s source code](https://github.com/mozilla-firefox/firefox/blob/c3797cdebac1316dd7168e995e3468c5a597e8d1/uriloader/exthandler/tests/unit/handlers.json). |
| `programs.firefox.profiles.<name>.handlers.schemes.<name>.action` | one of 0, 1, 2, 3, 4 | `1` | The action to take for this MIME type / URL scheme. Possible values: - 0: Save file - 1: Always ask - 2: Use helper app - 3: Open in Firefox - 4: Use system default |
| `programs.firefox.profiles.<name>.handlers.schemes.<name>.ask` | boolean | `false` | If true, the user is asked what they want to do with the file. If false, the action is taken without user intervention. |
| `programs.firefox.profiles.<name>.handlers.schemes.<name>.handlers` | list of (submodule) | `[ ]` | An array of handlers with the first one being the default. If you don't want to have a default handler, use an empty object for the first handler. Only valid when action is set to 2 (Use helper app). |
| `programs.firefox.profiles.<name>.handlers.schemes.<name>.handlers.*.name` | null or string | `null` | Display name of the handler. |
| `programs.firefox.profiles.<name>.handlers.schemes.<name>.handlers.*.path` | null or string | `null` | Path to the executable to be used. Only one of 'path' or 'uriTemplate' should be set. |
| `programs.firefox.profiles.<name>.handlers.schemes.<name>.handlers.*.uriTemplate` | null or string | `null` | URI for the application handler. Only one of 'path' or 'uriTemplate' should be set. |
| `programs.firefox.profiles.<name>.id` | unsigned integer, meaning >=0 | `0` | Profile ID. This should be set to a unique number per profile. |
| `programs.firefox.profiles.<name>.isDefault` | boolean | `"true if profile ID is 0"` | Whether this is a default profile. |
| `programs.firefox.profiles.<name>.name` | string | `"‹name›"` | Profile name. |
| `programs.firefox.profiles.<name>.path` | string | `"‹name›"` | Profile path. |
| `programs.firefox.profiles.<name>.preConfig` | strings concatenated with "\n" | `""` | Extra preferences to add to {file}`user.js`, before [](#opt-programs.firefox.profiles._name_.settings). Use [](#opt-programs.firefox.profiles._name_.extraConfig), unless you want to overwrite in [](#opt-programs.firefox.profiles._name_.settings), then use this option. |
| `programs.firefox.profiles.<name>.search` | submodule | `{ }` | Declarative search engine configuration. |
| `programs.firefox.profiles.<name>.search.default` | null or string | `null` | The default search engine used in the address bar and search bar. |
| `programs.firefox.profiles.<name>.search.engines` | attribute set of attribute set of (JSON value) | `{ }` | Attribute set of search engine configurations. Engines that only have {var}`metaData` specified will be treated as builtin to Firefox. See [SearchEngine.jsm](https://searchfox.org/mozilla-central/rev/e3f42ec9320748b2aab3d474d1e47075def9000c/toolkit/components/search/SearchEngine.sys.mjs#890-923) in Firefox's source for available options. We maintain a mapping to let you specify all options in the referenced link without underscores, but it may fall out of date with future options. Note, {var}`icon` is also a special option added by Home Manager to make it convenient to specify absolute icon paths. |
| `programs.firefox.profiles.<name>.search.force` | boolean | `false` | Whether to force replace the existing search configuration. This is recommended since Firefox will replace the symlink for the search configuration on every launch, but note that you'll lose any existing configuration by enabling this. |
| `programs.firefox.profiles.<name>.search.meta.maintainers` | list of lib.maintainers | `[ ]` | List of maintainers of each module. This option should be defined at most once per module. The option value is not a list of maintainers, but an attribute set that maps module file names to lists of maintainers. |
| `programs.firefox.profiles.<name>.search.meta.teams` | list of lib.teams | `[ ]` | List of team maintainers of each module. This option should be defined at most once per module. |
| `programs.firefox.profiles.<name>.search.order` | list of string | `[ ]` | The order the search engines are listed in. Any engines that aren't included in this list will be listed after these in an unspecified order. |
| `programs.firefox.profiles.<name>.search.privateDefault` | null or string | `null` | The default search engine used in the Private Browsing. |
| `programs.firefox.profiles.<name>.settings` | attribute set of (Firefox preference (int, bool, string, and also attrs, list, float as a JSON string)) | `{ }` | Attribute set of Firefox preferences. Firefox only supports int, bool, and string types for preferences, but home-manager will automatically convert all other JSON-compatible values into strings. |
| `programs.firefox.profiles.<name>.userChrome` | strings concatenated with "\n" or absolute path | `""` | Custom Firefox user chrome CSS. |
| `programs.firefox.profiles.<name>.userContent` | strings concatenated with "\n" or absolute path | `""` | Custom Firefox user content CSS. |

## `programs.fzf`

fzf — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.fzf.changeDirWidgetCommand` | null or string | `null` | The command that gets executed as the source for fzf for the ALT-C keybinding. |
| `programs.fzf.changeDirWidgetOptions` | list of string | `[ ]` | Command line options for the ALT-C keybinding. |
| `programs.fzf.colors` | attribute set of string | `{ }` | Color scheme options added to `FZF_DEFAULT_OPTS`. See <https://github.com/junegunn/fzf/wiki/Color-schemes> for documentation. |
| `programs.fzf.defaultCommand` | null or string | `null` | The command that gets executed as the default source for fzf when running. |
| `programs.fzf.defaultOptions` | list of string | `[ ]` | Extra command line options given to fzf by default. |
| `programs.fzf.enable` | boolean | `false` | Whether to enable fzf - a command-line fuzzy finder. |
| `programs.fzf.enableBashIntegration` | boolean | `[](#opt-home.shell.enableBashIntegration)` | Whether to enable Bash integration. |
| `programs.fzf.enableFishIntegration` | boolean | `[](#opt-home.shell.enableFishIntegration)` | Whether to enable Fish integration. |
| `programs.fzf.enableZshIntegration` | boolean | `[](#opt-home.shell.enableZshIntegration)` | Whether to enable Zsh integration. |
| `programs.fzf.fileWidgetCommand` | null or string | `null` | The command that gets executed as the source for fzf for the CTRL-T keybinding. |
| `programs.fzf.fileWidgetOptions` | list of string | `[ ]` | Command line options for the CTRL-T keybinding. |
| `programs.fzf.historyWidgetOptions` | list of string | `[ ]` | Command line options for the CTRL-R keybinding. |
| `programs.fzf.package` | package | `pkgs.fzf` | The fzf package to use. |
| `programs.fzf.tmux.enableShellIntegration` | boolean | `false` | Whether to enable setting `FZF_TMUX=1` which causes shell integration to use fzf-tmux . |
| `programs.fzf.tmux.shellIntegrationOptions` | list of string | `[ ]` | If {option}`programs.fzf.tmux.enableShellIntegration` is set to `true`, shell integration will use these options for fzf-tmux. See {command}`fzf-tmux --help` for available options. |

## `programs.gh`

GitHub CLI — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.gh.enable` | boolean | `false` | Whether to enable GitHub CLI tool. |
| `programs.gh.extensions` | list of package | `[ ]` | gh extensions, see <https://cli.github.com/manual/gh_extension>. |
| `programs.gh.gitCredentialHelper.enable` | boolean | `true` | Whether to enable the gh git credential helper. |
| `programs.gh.gitCredentialHelper.hosts` | list of string | `[   "https://github.com"   "https://gist.github.com" ]` | GitHub hosts to enable the gh git credential helper for |
| `programs.gh.hosts` | YAML 1.1 value | `{ }` | Host-specific configuration written to {file}`$XDG_CONFIG_HOME/gh/hosts.yml`. |
| `programs.gh.package` | package | `pkgs.gh` | The gh package to use. |
| `programs.gh.settings` | open submodule of (YAML 1.1 value) | `{ }` | Configuration written to {file}`$XDG_CONFIG_HOME/gh/config.yml`. |
| `programs.gh.settings.aliases` | attribute set of string | `{ }` | Aliases that allow you to create nicknames for gh commands. |
| `programs.gh.settings.editor` | string | `""` | The editor that gh should run when creating issues, pull requests, etc. If blank, will refer to environment. |
| `programs.gh.settings.git_protocol` | string | `"https"` | The protocol to use when performing Git operations. |

## `programs.ghostty`

Ghostty — currently installed through Homebrew cask.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.ghostty.clearDefaultKeybinds` | boolean | `false` | Whether to clear default keybinds. |
| `programs.ghostty.enable` | boolean | `false` | Whether to enable Ghostty. |
| `programs.ghostty.enableBashIntegration` | boolean | `[](#opt-home.shell.enableBashIntegration)` | Whether to enable Bash integration. This ensures that shell integration works in more scenarios, such as switching shells within Ghostty. But it is not needed to have shell integration. See <https://ghostty.org/docs/features/shell-integration#manual-shell-integration-setup> for more information. |
| `programs.ghostty.enableFishIntegration` | boolean | `[](#opt-home.shell.enableFishIntegration)` | Whether to enable Fish integration. This ensures that shell integration works in more scenarios, such as switching shells within Ghostty. But it is not needed to have shell integration. See <https://ghostty.org/docs/features/shell-integration#manual-shell-integration-setup> for more information. |
| `programs.ghostty.enableZshIntegration` | boolean | `[](#opt-home.shell.enableZshIntegration)` | Whether to enable Zsh integration. This ensures that shell integration works in more scenarios, such as switching shells within Ghostty. But it is not needed to have shell integration. See <https://ghostty.org/docs/features/shell-integration#manual-shell-integration-setup> for more information. |
| `programs.ghostty.installBatSyntax` | boolean | `\`true\` if programs.ghostty.package is not null` | Whether to enable installation of Ghostty configuration syntax for bat. |
| `programs.ghostty.installVimSyntax` | boolean | `false` | Whether to enable installation of Ghostty configuration syntax for Vim. |
| `programs.ghostty.package` | null or package | `pkgs.ghostty` | The ghostty package to use. Set programs.ghostty.package to null on platforms where ghostty is not available or marked broken |
| `programs.ghostty.settings` | attribute set of (atom (null, bool, int, float or string) or a list of them for duplicate keys) | `{ }` | Configuration written to {file}`$XDG_CONFIG_HOME/ghostty/config`. See <https://ghostty.org/docs/config/reference> for more information. |
| `programs.ghostty.systemd` | submodule | `{ }` | Configuration for Ghostty's systemd integration. This enables additional speed and features. See <https://ghostty.org/docs/linux/systemd> for more information. |
| `programs.ghostty.systemd.enable` | boolean | `\`true\` on Linux, \`false\` otherwise` | Whether to enable the Ghostty systemd user service. |
| `programs.ghostty.themes` | attribute set of attribute set of (atom (null, bool, int, float or string) or a list of them for duplicate keys) | `{ }` | Custom themes written to {file}`$XDG_CONFIG_HOME/ghostty/themes`. See <https://ghostty.org/docs/features/theme#authoring-a-custom-theme> for more information. |

## `programs.git`

Git — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.git.attributes` | list of string | `[ ]` | List of defining attributes set globally. |
| `programs.git.enable` | boolean | `false` | Whether to enable Git. |
| `programs.git.hooks` | attribute set of absolute path | `{ }` | Configuration helper for Git hooks. See <https://git-scm.com/docs/githooks> for reference. |
| `programs.git.ignores` | list of string | `[ ]` | List of paths that should be globally ignored. |
| `programs.git.includes` | list of (submodule) | `[ ]` | List of configuration files to include. |
| `programs.git.includes.*.condition` | null or string | `null` | Include this configuration only when {var}`condition` matches. Allowed conditions are described in {manpage}`git-config(1)`. |
| `programs.git.includes.*.contents` | attribute set of anything | `{ }` | Configuration to include. If empty then a path must be given. This follows the configuration structure as described in {manpage}`git-config(1)`. |
| `programs.git.includes.*.contentSuffix` | string | `"gitconfig"` | Nix store name for the git configuration text file, when generating the configuration text from nix options. |
| `programs.git.includes.*.path` | string or absolute path | — | Path of the configuration file to include. |
| `programs.git.lfs.enable` | boolean | `false` | Whether to enable Git Large File Storage. |
| `programs.git.lfs.package` | null or package | `pkgs.git-lfs` | The git-lfs package to use. |
| `programs.git.lfs.skipSmudge` | boolean | `false` | Skip automatic downloading of objects on clone or pull. This requires a manual {command}`git lfs pull` every time a new commit is checked out on your repository. |
| `programs.git.maintenance.enable` | boolean | `false` | Enable the automatic {command}`git maintenance`. If you have SSH remotes, set {option}`programs.git.package` to a git version with SSH support (eg: `pkgs.gitFull`). See <https://git-scm.com/docs/git-maintenance>. |
| `programs.git.maintenance.repositories` | list of string | `[ ]` | Repositories on which {command}`git maintenance` should run. Should be a list of absolute paths. |
| `programs.git.maintenance.timers` | attribute set of string | `{   daily = "Tue..Sun *-*-* 0:53:00";   hourly = "*-*-* 1..23:53:00";   weekly = "Mon 0:53:00"; }` | Systemd timers to create for scheduled {command}`git maintenance`. Key is passed to `--schedule` argument in {command}`git maintenance run` and value is passed to `Timer.OnCalendar` in `systemd.user.timers`. |
| `programs.git.package` | null or package | `pkgs.git` | The git package to use. Use {var}`pkgs.gitFull` to gain access to {command}`git send-email` for instance. |
| `programs.git.settings` | (attribute set of attribute set of (string or boolean or signed integer or list of (string or boolean or signed integer) or attribute set of (string or boolean or signed integer or list of (string or boolean or signed integer)))) or list of attribute set of attribute set of (string or boolean or signed integer or list of (string or boolean or signed integer) or attribute set of (string or boolean or signed integer or list of (string or boolean or signed integer))) | `{ }` | Configuration written to {file}`$XDG_CONFIG_HOME/git/config`. This may be either a single attrset of Git settings or an ordered list of attrset fragments when repeated sections or explicit ordering matter. See {manpage}`git-config(1)` for details. |
| `programs.git.signing.format` | null or one of "openpgp", "ssh", "x509" | `if lib.versionAtLeast config.home.stateVersion "25.05" then null else "openpgp" ` | The signing method to use when signing commits and tags. Valid values are `openpgp` (OpenPGP/GnuPG), `ssh` (SSH), and `x509` (X.509 certificates). |
| `programs.git.signing.key` | null or string | `null` | The default signing key fingerprint. Set to `null` to let the signer decide what signing key to use depending on commit’s author. |
| `programs.git.signing.signByDefault` | null or boolean | `null` | Whether commits and tags should be signed by default. |
| `programs.git.signing.signer` | null or string | `null` | Path to signer binary to use. |

## `programs.go`

Go — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.go.enable` | boolean | `false` | Whether to enable Go. |
| `programs.go.env` | open submodule of attribute set of string | `{ }` | Environment variables for Go. All the available options can be found running 'go env'. |
| `programs.go.env.GOPATH` | string or list of string | `""` | List of directories that should be used by the Go tooling. |
| `programs.go.env.GOPRIVATE` | string or list of string | `""` | Controls which modules the 'go' command considers to be private (not available publicly) and should therefore not use the proxy or checksum database. |
| `programs.go.package` | null or package | `pkgs.go` | The go package to use. |
| `programs.go.packages` | attribute set of absolute path | `{ }` | Packages to add to GOPATH. |
| `programs.go.telemetry` | submodule | `{ }` | Options to configure Go telemetry mode. |
| `programs.go.telemetry.date` | string | `"1970-01-01"` | The date indicating the date at which the modefile was updated, in YYYY-MM-DD format. It's used to reset the timeout before the next telemetry report is uploaded when telemetry mode is set to "on". |
| `programs.go.telemetry.mode` | null or one of "off", "local", "on" | `null` | Go telemetry mode to be set. |

## `programs.google-chrome`

Google Chrome — currently installed through Homebrew cask.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.google-chrome.nativeMessagingHosts` | list of package | `[ ]` | List of Google Chrome native messaging hosts to install. |

## `programs.jq`

jq — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.jq.colors` | null or (submodule) | `null` | The colors used in colored JSON output, or null to use the defaults. See the [Colors section](https://jqlang.github.io/jq/manual/#Colors) of the jq manual. |
| `programs.jq.enable` | boolean | `false` | Whether to enable the jq command-line JSON processor. |
| `programs.jq.package` | null or package | `pkgs.jq` | The jq package to use. |

## `programs.lazygit`

Lazygit — currently installed through Homebrew formula.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.lazygit.enable` | boolean | `false` | Whether to enable lazygit, a simple terminal UI for git commands. |
| `programs.lazygit.enableBashIntegration` | boolean | `[](#opt-home.shell.enableBashIntegration)` | Whether to enable Bash integration. |
| `programs.lazygit.enableFishIntegration` | boolean | `[](#opt-home.shell.enableFishIntegration)` | Whether to enable Fish integration. |
| `programs.lazygit.enableNushellIntegration` | boolean | `[](#opt-home.shell.enableNushellIntegration)` | Whether to enable Nushell integration. |
| `programs.lazygit.enableZshIntegration` | boolean | `[](#opt-home.shell.enableZshIntegration)` | Whether to enable Zsh integration. |
| `programs.lazygit.package` | null or package | `pkgs.lazygit` | The lazygit package to use. |
| `programs.lazygit.settings` | YAML 1.1 value | `{ }` | Configuration written to {file}`$XDG_CONFIG_HOME/lazygit/config.yml` on Linux or on Darwin if [](#opt-xdg.enable) is set, otherwise {file}`~/Library/Application Support/lazygit/config.yml`. See <https://github.com/jesseduffield/lazygit/blob/master/docs/Config.md> for supported values. |
| `programs.lazygit.shellWrapperName` | string | `"lg"` | Name of the shell wrapper to be called. |

## `programs.neovim`

Neovim — currently installed through Homebrew formula.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.neovim.autowrapRuntimeDeps` | boolean | `true` | Whether to automatically wrap the binary with the runtime dependencies of the plugins. |
| `programs.neovim.coc.enable` | boolean | `false` | Whether to enable Coc. |
| `programs.neovim.coc.package` | package | `pkgs.vimPlugins.coc-nvim` | The coc-nvim package to use. |
| `programs.neovim.coc.pluginConfig` | strings concatenated with "\n" | `""` | Script to configure CoC. Must be viml. |
| `programs.neovim.coc.settings` | JSON value | `{ }` | Extra configuration lines to add to {file}`$XDG_CONFIG_HOME/nvim/coc-settings.json` See <https://github.com/neoclide/coc.nvim/wiki/Using-the-configuration-file> for options. |
| `programs.neovim.defaultEditor` | boolean | `false` | Whether to configure {command}`nvim` as the default editor using the {env}`EDITOR` and {env}`VISUAL` environment variables. |
| `programs.neovim.enable` | boolean | `false` | Whether to enable Neovim. |
| `programs.neovim.extraConfig` | strings concatenated with "\n" | `""` | Custom vimrc lines. |
| `programs.neovim.extraLuaPackages` | function that evaluates to a(n) list of package | `ps: [ ]` | The extra Lua packages required for your plugins to work. This option accepts a function that takes a Lua package set as an argument, and selects the required Lua packages from this package set. See the example for more info. |
| `programs.neovim.extraName` | string | `""` | Extra name appended to the wrapper package name. |
| `programs.neovim.extraPackages` | list of package | `[ ]` | Extra packages available to nvim. |
| `programs.neovim.extraPython3Packages` | function that evaluates to a(n) list of package | `ps: [ ]` | The extra Python 3 packages required for your plugins to work. This option accepts a function that takes a Python 3 package set as an argument, and selects the required Python 3 packages from this package set. See the example for more info. |
| `programs.neovim.extraWrapperArgs` | list of string | `[ ]` | Extra arguments to be passed to the neovim wrapper. This option sets environment variables required for building and running binaries with external package managers like mason.nvim. |
| `programs.neovim.finalPackage` | package | — | Resulting customized neovim package. |
| `programs.neovim.generatedConfigs` | attribute set of strings concatenated with "\n" | `{ }` | Generated configurations with as key their language (set via type). |
| `programs.neovim.generatedConfigViml` | strings concatenated with "\n" | — | Generated vimscript config. |
| `programs.neovim.initLua` | strings concatenated with "\n" | `""` | Content to be added to {file}`init.lua`. Automatically contains the [advised plugin config](https://nixos.org/manual/nixpkgs/stable/#neovim-custom-configuration) To specify the order, use `lib.mkOrder`, `lib.mkBefore`, `lib.mkAfter`. |
| `programs.neovim.package` | package | `pkgs.neovim-unwrapped` | The neovim package to use. |
| `programs.neovim.plugins` | list of (package or (submodule)) | `[ ]` | List of vim plugins to install optionally associated with configuration to be placed in init.vim. This option is mutually exclusive with {var}`configure`. |
| `programs.neovim.plugins.*.config` | null or strings concatenated with "\n" | `null` | Script to configure this plugin. The scripting language should match type. |
| `programs.neovim.plugins.*.optional` | boolean | `false` | Don't load by default (load with :packadd) |
| `programs.neovim.plugins.*.plugin` | package | — | The plugin package to use. |
| `programs.neovim.plugins.*.runtime` | attribute set of (submodule) | `{ }` | Set of files that have to be linked in nvim config folder. |
| `programs.neovim.plugins.*.runtime.<name>.enable` | boolean | `true` | Whether this file should be generated. This option allows specific files to be disabled. |
| `programs.neovim.plugins.*.runtime.<name>.executable` | null or boolean | `null` | Set the execute bit. If `null`, defaults to the mode of the {var}`source` file or to `false` for files created through the {var}`text` option. |
| `programs.neovim.plugins.*.runtime.<name>.force` | boolean | `false` | Whether the target path should be unconditionally replaced by the managed file source. Warning, this will silently delete the target regardless of whether it is a file or link. |
| `programs.neovim.plugins.*.runtime.<name>.ignorelinks` | boolean | `false` | When `recursive` is enabled, adds the `-ignorelinks` flag to lndir. It causes lndir to not treat symbolic links in the source directory specially. The link created in the target directory will point back to the corresponding symbolic link in the source directory. If that link points to a directory, the resulting target will be a link to the source tree's symlink rather than a recursively linked directory tree. |
| `programs.neovim.plugins.*.runtime.<name>.onChange` | strings concatenated with "\n" | `""` | Shell commands to run when file has changed between generations. The script will be run *after* the new files have been linked into place. Note, this code is always run when `recursive` is enabled. |
| `programs.neovim.plugins.*.runtime.<name>.recursive` | boolean | `false` | If the file source is a directory, then this option determines whether the directory should be recursively linked to the target location. This option has no effect if the source is a file. If `false` (the default) then the target will be a symbolic link to the source directory. If `true` then the target will be a directory structure matching the source's but whose leaves are symbolic links to the files of the source directory. |
| `programs.neovim.plugins.*.runtime.<name>.source` | absolute path | — | Path of the source file or directory. If [](#opt-programs.neovim.plugins._.runtime._name_.text) is non-null then this option will automatically point to a file containing that text. |
| `programs.neovim.plugins.*.runtime.<name>.target` | non-empty string | `name` | Path to target file relative to {var}`xdg.configHome/nvim`. |
| `programs.neovim.plugins.*.runtime.<name>.text` | null or strings concatenated with "\n" | `null` | Text of the file. If this option is null then [](#opt-programs.neovim.plugins._.runtime._name_.source) must be set. |
| `programs.neovim.plugins.*.type` | one of "lua", "viml", "teal", "fennel" or string | `if lib.versionAtLeast config.home.stateVersion "26.05" then "lua" else "viml" ` | Language used in config. Configurations are aggregated per-language. |
| `programs.neovim.sideloadInitLua` | boolean | `false` | Enable to avoid writing the content of {var}`initLua` to the default location {file}`$XDG_CONFIG_HOME/nvim/init.lua` and load it through neovim wrapper arguments instead. This is useful if you want to manage your own {file}`init.lua` imperatively. |
| `programs.neovim.viAlias` | boolean | `false` | Symlink {command}`vi` to {command}`nvim` binary. |
| `programs.neovim.vimAlias` | boolean | `false` | Symlink {command}`vim` to {command}`nvim` binary. |
| `programs.neovim.vimdiffAlias` | boolean | `false` | Alias {command}`vimdiff` to {command}`nvim -d`. |
| `programs.neovim.waylandSupport` | boolean | `pkgs.stdenv.isLinux` | Whether to enable Wayland clipboard support. |
| `programs.neovim.withNodeJs` | boolean | `false` | Enable node provider. Set to `true` to use Node plugins. |
| `programs.neovim.withPerl` | boolean | `false` | Enable perl provider. Set to `true` to use Perl plugins. |
| `programs.neovim.withPython3` | boolean | `if lib.versionAtLeast config.home.stateVersion "26.05" then false else true ` | Enable Python 3 provider. Set to `true` to use Python 3 plugins. |
| `programs.neovim.withRuby` | boolean | `if lib.versionAtLeast config.home.stateVersion "26.05" then false else true ` | Enable ruby provider. |

## `programs.ranger`

Ranger — currently installed through Homebrew formula.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.ranger.aliases` | attribute set of string | `{ }` | Aliases written to {file}`$XDG_CONFIG_HOME/ranger/rc.conf`. |
| `programs.ranger.enable` | boolean | `false` | Whether to enable ranger file manager. |
| `programs.ranger.extraConfig` | strings concatenated with "\n" | `""` | Extra configuration lines to add to {file}`$XDG_CONFIG_HOME/ranger/rc.conf`. |
| `programs.ranger.extraPackages` | list of package | `[ ]` | Extra packages added to ranger. |
| `programs.ranger.mappings` | attribute set of string | `{ }` | Mappings written to {file}`$XDG_CONFIG_HOME/ranger/rc.conf`. |
| `programs.ranger.package` | null or package | `pkgs.ranger` | The ranger package to use. |
| `programs.ranger.plugins` | list of (submodule) | `[ ]` | List of files to be added to {file}`$XDG_CONFIG_HOME/ranger/plugins/`. |
| `programs.ranger.plugins.*.name` | string | — | Name of the plugin linked to {file}`$XDG_CONFIG_HOME/ranger/plugins/`. In the case of a single-file plugin, it must also have `.py` suffix. |
| `programs.ranger.plugins.*.src` | absolute path | — | The plugin file or directory. |
| `programs.ranger.rifle` | list of (submodule) | `[ ]` | Settings written to {file}`$XDG_CONFIG_HOME/ranger/rifle.conf`. |
| `programs.ranger.rifle.*.command` | string | — | A command to run for the matching file. |
| `programs.ranger.rifle.*.condition` | string | — | A condition to match a file. |
| `programs.ranger.settings` | attribute set of (boolean or floating point number or signed integer or string) | `{ }` | Settings written to {file}`$XDG_CONFIG_HOME/ranger/rc.conf`. |

## `programs.ripgrep`

Ripgrep — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.ripgrep.arguments` | list of string | `[ ]` | List of arguments to pass to ripgrep. Each item is given to ripgrep as a single command line argument verbatim. See <https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md#configuration-file> for an example configuration. |
| `programs.ripgrep.enable` | boolean | `false` | Whether to enable Ripgrep. |
| `programs.ripgrep.package` | null or package | `pkgs.ripgrep` | The ripgrep package to use. |

## `programs.starship`

Starship — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.starship.configPath` | string | `${config.xdg.configHome}/starship.toml` | Relative path to the user's home directory where the Starship config should be stored. |
| `programs.starship.enable` | boolean | `false` | Whether to enable starship. |
| `programs.starship.enableBashIntegration` | boolean | `[](#opt-home.shell.enableBashIntegration)` | Whether to enable Bash integration. |
| `programs.starship.enableFishIntegration` | boolean | `[](#opt-home.shell.enableFishIntegration)` | Whether to enable Fish integration. |
| `programs.starship.enableInteractive` | boolean | `true` | Only enable starship when the shell is interactive. This option is only valid for the Fish shell. Some plugins require this to be set to `false` to function correctly. |
| `programs.starship.enableIonIntegration` | boolean | `[](#opt-home.shell.enableIonIntegration)` | Whether to enable Ion integration. |
| `programs.starship.enableNushellIntegration` | boolean | `[](#opt-home.shell.enableNushellIntegration)` | Whether to enable Nushell integration. |
| `programs.starship.enableTransience` | boolean | `false` | The TransientPrompt feature of Starship replaces previous prompts with a custom string. This is only a valid option for the Fish shell. For documentation on how to change the default replacement string and for more information visit https://starship.rs/advanced-config/#transientprompt-and-transientrightprompt-in-cmd |
| `programs.starship.enableZshIntegration` | boolean | `[](#opt-home.shell.enableZshIntegration)` | Whether to enable Zsh integration. |
| `programs.starship.extraPackages` | list of package | `[ ]` | Extra packages available to starship. |
| `programs.starship.package` | package | `pkgs.starship` | The starship package to use. |
| `programs.starship.presets` | list of string | `[ ]` | Preset files to be merged with settings in order. See <https://starship.rs/presets/> for the full list of available presets. |
| `programs.starship.settings` | TOML value | `{ }` | Configuration written to {file}`$XDG_CONFIG_HOME/starship.toml`. See <https://starship.rs/config/> for the full list of options. |

## `programs.t3code`

T3 Code — currently installed through Homebrew cask.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.t3code.clientSettings` | JSON value | `{ }` | Configuration written to t3code's {file}`client-settings.json`. |
| `programs.t3code.enable` | boolean | `false` | Whether to enable T3 Code, a minimal web GUI for coding agents. |
| `programs.t3code.keybindings` | JSON value | `[ ]` | Configuration written to t3code's {file}`keybindings.json`. |
| `programs.t3code.mutableClientSettings` | boolean | `true` | Whether client settings ({file}`client-settings.json`) can be updated by t3code. |
| `programs.t3code.mutableKeybindings` | boolean | `true` | Whether user keybindings ({file}`keybindings.json`) can be updated by t3code. |
| `programs.t3code.mutableUserSettings` | boolean | `true` | Whether user settings ({file}`settings.json`) can be updated by t3code. |
| `programs.t3code.package` | null or package | `pkgs.t3code` | The t3code package to install. |
| `programs.t3code.userSettings` | JSON value | `{ }` | Configuration written to t3code's {file}`settings.json`. |

## `programs.tirith`

Tirith — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.tirith.allowlist` | list of string | `[ ]` | List of allowed domains that bypass Tirith analysis. Written to `$XDG_CONFIG_HOME/tirith/allowlist`. |
| `programs.tirith.enable` | boolean | `false` | Whether to enable Tirith, a shell security monitor. |
| `programs.tirith.enableBashIntegration` | boolean | `[](#opt-home.shell.enableBashIntegration)` | Whether to enable Bash integration. |
| `programs.tirith.enableFishIntegration` | boolean | `[](#opt-home.shell.enableFishIntegration)` | Whether to enable Fish integration. |
| `programs.tirith.enableZshIntegration` | boolean | `[](#opt-home.shell.enableZshIntegration)` | Whether to enable Zsh integration. |
| `programs.tirith.package` | package | `pkgs.tirith` | The tirith package to use. |
| `programs.tirith.policy` | YAML 1.1 value | `{ }` | Tirith policy configuration. Written to `$XDG_CONFIG_HOME/tirith/policy.yaml`. See <https://github.com/sheeki03/tirith/blob/main/docs/cookbook.md> for policy examples. |

## `programs.twitch-tui`

Twitch TUI — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.twitch-tui.enable` | boolean | `false` | Whether to enable twitch-tui. |
| `programs.twitch-tui.package` | null or package | `pkgs.twitch-tui` | The twitch-tui package to use. |
| `programs.twitch-tui.settings` | TOML value | `{ }` | Configuration settings for twitch-tui. All the available options can be found here: <https://github.com/Xithrius/twitch-tui/blob/main/default-config.toml> |

## `programs.vim`

Vim — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.vim.defaultEditor` | boolean | `false` | Whether to configure {command}`vim` as the default editor using the {env}`EDITOR` and {env}`VISUAL` environment variables. |
| `programs.vim.enable` | boolean | `false` | Whether to enable Vim. |
| `programs.vim.extraConfig` | strings concatenated with "\n" | `""` | Custom .vimrc lines |
| `programs.vim.package` | package | — | Resulting customized vim package |
| `programs.vim.packageConfigurable` | package | `pkgs.vim-full` | The vim-full package to use. Vim package to customize |
| `programs.vim.plugins` | list of (string or package) | `[   <derivation vimplugin-vim-sensible-2.0-unstable-2024-06-08> ]` | List of vim plugins to install. To get a list of supported plugins run: {command}`nix-env -f '<nixpkgs>' -qaP -A vimPlugins`. Note: String values are deprecated, please use actual packages. |
| `programs.vim.settings` | submodule | `{ }` | At attribute set of Vim settings. The attribute names and corresponding values must be among the following supported options. {var}`background` : one of "dark", "light" {var}`backupdir` : list of string {var}`copyindent` : boolean {var}`directory` : list of string {var}`expandtab` : boolean {var}`hidden` : boolean {var}`history` : signed integer {var}`ignorecase` : boolean {var}`modeline` : boolean {var}`mouse` : one of "n", "v", "i", "c", "h", "a", "r" {var}`mousefocus` : boolean {var}`mousehide` : boolean {var}`mousemodel` : one of "extend", "popup", "popup_setpos" {var}`number` : boolean {var}`relativenumber` : boolean {var}`shiftwidth` : signed integer {var}`smartcase` : boolean {var}`tabstop` : signed integer {var}`undodir` : list of string {var}`undofile` : boolean See the Vim documentation for detailed descriptions of these options. Use [](#opt-programs.vim.extraConfig) to manually set any options not listed above. |

## `programs.vscode`

Visual Studio Code — currently installed through Homebrew cask.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.vscode.argvSettings` | absolute path or JSON value | `{ }` | Configuration written to Visual Studio Code's {file}`argv.json`. This can be a JSON object or a path to a custom JSON file. |
| `programs.vscode.enable` | boolean | `false` | Whether to enable Visual Studio Code. |
| `programs.vscode.haskell.enable` | boolean | `false` | Whether to enable Haskell integration for Visual Studio Code. |
| `programs.vscode.haskell.hie.enable` | boolean | `true` | Whether to enable Haskell IDE engine integration. |
| `programs.vscode.haskell.hie.executablePath` | absolute path | `"${pkgs.hie-nix.hies}/bin/hie-wrapper"` | The path to the Haskell IDE Engine executable. Because hie-nix is not packaged in Nixpkgs, you need to add it as an overlay or set this option. Example overlay configuration: ```nix nixpkgs.overlays = [ (self: super: { hie-nix = import ~/src/hie-nix {}; }) ] ``` |
| `programs.vscode.mutableExtensionsDir` | boolean | `(removeAttrs config.programs.vscode.profiles [ "default" ]) == { }` | Whether extensions can be installed or updated manually or by Visual Studio Code. Mutually exclusive to programs.vscode.profiles. |
| `programs.vscode.package` | null or package | `pkgs.vscode` | The vscode package to use. Version of Visual Studio Code to install. |
| `programs.vscode.profiles` | attribute set of (submodule) | `{ }` | A list of all Visual Studio Code profiles. Mutually exclusive to programs.vscode.mutableExtensionsDir |
| `programs.vscode.profiles.<name>.enableExtensionUpdateCheck` | null or boolean | `null` | Whether to enable update notifications for extensions. Can only be set for the default profile, but it applies to all profiles. |
| `programs.vscode.profiles.<name>.enableMcpIntegration` | boolean | `false` | Whether to integrate the MCP servers config from {option}`programs.mcp.servers` into {option}`programs.vscode.profiles.<name>.userMcp`. Note: Settings defined in {option}`programs.mcp.servers` are merged with {option}`programs.vscode.profiles.<name>.userMcp`, with Visual Studio Code settings taking precedence. |
| `programs.vscode.profiles.<name>.enableUpdateCheck` | null or boolean | `null` | Whether to enable update checks/notifications. Can only be set for the default profile, but it applies to all profiles. |
| `programs.vscode.profiles.<name>.extensions` | list of package | `[ ]` | The extensions Visual Studio Code should be started with. |
| `programs.vscode.profiles.<name>.globalSnippets` | JSON value | `{ }` | Defines global user snippets. |
| `programs.vscode.profiles.<name>.keybindings` | absolute path or list of (submodule) | `[ ]` | Keybindings written to Visual Studio Code's {file}`keybindings.json`. This can be a JSON object or a path to a custom JSON file. |
| `programs.vscode.profiles.<name>.keybindings.*.args` | null or JSON value | `null` | Optional arguments for a command. |
| `programs.vscode.profiles.<name>.keybindings.*.command` | string | — | The VS Code command to execute. |
| `programs.vscode.profiles.<name>.keybindings.*.key` | string | — | The key or key-combination to bind. |
| `programs.vscode.profiles.<name>.keybindings.*.when` | null or string | `null` | Optional context filter. |
| `programs.vscode.profiles.<name>.languageSnippets` | JSON value | `{ }` | Defines user snippets for different languages. |
| `programs.vscode.profiles.<name>.userMcp` | absolute path or JSON value | `{ }` | Configuration written to Visual Studio Code's {file}`mcp.json`. This can be a JSON object or a path to a custom JSON file. |
| `programs.vscode.profiles.<name>.userSettings` | absolute path or JSON value | `{ }` | Configuration written to Visual Studio Code's {file}`settings.json`. This can be a JSON object or a path to a custom JSON file. |
| `programs.vscode.profiles.<name>.userTasks` | absolute path or JSON value | `{ }` | Configuration written to Visual Studio Code's {file}`tasks.json`. This can be a JSON object or a path to a custom JSON file. |

## `programs.zed-editor`

Zed — currently installed through Homebrew cask.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.zed-editor.defaultEditor` | boolean | `false` | Whether to set {command}`zeditor -w` as the default editor using the {env}`EDITOR` and {env}`VISUAL` environment variables. |
| `programs.zed-editor.enable` | boolean | `false` | Whether to enable Zed, the high performance, multiplayer code editor from the creators of Atom and Tree-sitter. |
| `programs.zed-editor.enableMcpIntegration` | boolean | `false` | Whether to integrate the MCP server config from {option}`programs.mcp.servers` into {option}`programs.zed-editor.userSettings.context_servers`. Note: Settings defined in {option}`programs.zed-editor.userSettings.context_servers` will take precedence over the generated MCP configuration. |
| `programs.zed-editor.extensions` | list of string | `[ ]` | A list of the extensions Zed should install on startup. Use the name of a repository in the [extension list](https://github.com/zed-industries/extensions/tree/main/extensions). |
| `programs.zed-editor.extraPackages` | list of package | `[ ]` | Extra packages available to Zed. |
| `programs.zed-editor.installRemoteServer` | boolean | `false` | Whether to symlink the Zed's remote server binary to the expected location. This allows remotely connecting to this system from a distant Zed client. For more information, consult the ["Remote Server" section](https://wiki.nixos.org/wiki/Zed#Remote_Server) in the wiki. |
| `programs.zed-editor.mutableUserDebug` | boolean | `true` | Whether user debug configurations (debug.json) can be updated by zed. |
| `programs.zed-editor.mutableUserKeymaps` | boolean | `true` | Whether user keymaps (keymap.json) can be updated by zed. |
| `programs.zed-editor.mutableUserSettings` | boolean | `true` | Whether user settings (settings.json) can be updated by zed. |
| `programs.zed-editor.mutableUserTasks` | boolean | `true` | Whether user tasks (tasks.json) can be updated by zed. |
| `programs.zed-editor.package` | null or package | `pkgs.zed-editor` | The zed-editor package to use. |
| `programs.zed-editor.themes` | attribute set of (JSON value or absolute path or strings concatenated with "\n") | `{ }` | Each theme is written to {file}`$XDG_CONFIG_HOME/zed/themes/theme-name.json` where the name of each attribute is the theme-name See <https://zed.dev/docs/extensions/themes> for the structure of a Zed theme |
| `programs.zed-editor.userDebug` | JSON value | `[ ]` | Configuration written to Zed's {file}`debug.json`. Global debug configurations for Zed's [Debugger](https://zed.dev/docs/debugger). |
| `programs.zed-editor.userKeymaps` | JSON value | `[ ]` | Configuration written to Zed's {file}`keymap.json`. |
| `programs.zed-editor.userSettings` | JSON value | `{ }` | Configuration written to Zed's {file}`settings.json`. |
| `programs.zed-editor.userTasks` | JSON value | `[ ]` | Configuration written to Zed's {file}`tasks.json`. [List of tasks](https://zed.dev/docs/tasks) that can be run from the command palette. |

## `programs.zellij`

Zellij — currently installed through Homebrew formula.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.zellij.attachExistingSession` | boolean | `false` | Whether to attach to the default session after being autostarted if a Zellij session already exists. Variable is checked in `auto-start` script. Requires shell integration to be enabled to have effect. |
| `programs.zellij.enable` | boolean | `false` | Whether to enable Zellij. |
| `programs.zellij.enableBashIntegration` | boolean | `[](#opt-home.shell.enableBashIntegration)` | Whether to enable Bash integration. |
| `programs.zellij.enableFishIntegration` | boolean | `[](#opt-home.shell.enableFishIntegration)` | Whether to enable Fish integration. |
| `programs.zellij.enableZshIntegration` | boolean | `[](#opt-home.shell.enableZshIntegration)` | Whether to enable Zsh integration. |
| `programs.zellij.exitShellOnExit` | boolean | `false` | Whether to exit the shell when Zellij exits after being autostarted. Variable is checked in `auto-start` script. Requires shell integration to be enabled to have effect. |
| `programs.zellij.extraConfig` | strings concatenated with "\n" | `""` | Extra configuration lines to add to `$XDG_CONFIG_HOME/zellij/config.kdl`. This does not support zellij.yaml and it's mostly a workaround for https://github.com/nix-community/home-manager/issues/4659. |
| `programs.zellij.layouts` | attribute set of (YAML 1.1 value or absolute path or strings concatenated with "\n") | `{ }` | Configuration written to {file}`$XDG_CONFIG_HOME/zellij/layouts/<layout>.kdl`. See <https://zellij.dev/documentation> for the full list of options. |
| `programs.zellij.package` | package | `pkgs.zellij` | The zellij package to use. |
| `programs.zellij.settings` | YAML 1.1 value | `{ }` | Configuration written to {file}`$XDG_CONFIG_HOME/zellij/config.kdl`. If `programs.zellij.package.version` is older than 0.32.0, then the configuration is written to {file}`$XDG_CONFIG_HOME/zellij/config.yaml`. See <https://zellij.dev/documentation> for the full list of options. |
| `programs.zellij.themes` | attribute set of (YAML 1.1 value or absolute path or strings concatenated with "\n") | `{ }` | Each them is written to {file}`$XDG_CONFIG_HOME/zellij/themes/NAME.kdl`. See <https://zellij.dev/documentation/themes.html> for more information. |

## `programs.zoxide`

Zoxide — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.zoxide.enable` | boolean | `false` | Whether to enable zoxide. |
| `programs.zoxide.enableBashIntegration` | boolean | `[](#opt-home.shell.enableBashIntegration)` | Whether to enable Bash integration. |
| `programs.zoxide.enableFishIntegration` | boolean | `[](#opt-home.shell.enableFishIntegration)` | Whether to enable Fish integration. |
| `programs.zoxide.enableNushellIntegration` | boolean | `[](#opt-home.shell.enableNushellIntegration)` | Whether to enable Nushell integration. |
| `programs.zoxide.enableZshIntegration` | boolean | `[](#opt-home.shell.enableZshIntegration)` | Whether to enable Zsh integration. |
| `programs.zoxide.options` | list of string | `[ ]` | List of options to pass to zoxide init. |
| `programs.zoxide.package` | package | `pkgs.zoxide` | The zoxide package to use. |

## `programs.zsh`

Zsh — currently installed through Nix.

| Option | Type | Default | Description |
|---|---|---|---|
| `programs.zsh.antidote.enable` | boolean | `false` | Whether to enable antidote - a zsh plugin manager. |
| `programs.zsh.antidote.package` | null or package | `pkgs.antidote` | The antidote package to use. |
| `programs.zsh.antidote.plugins` | list of string | `[ ]` | List of antidote plugins. |
| `programs.zsh.antidote.useFriendlyNames` | boolean | `false` | Whether to enable friendly names. |
| `programs.zsh.autocd` | null or boolean | `null` | Automatically enter into a directory if typed directly into shell. |
| `programs.zsh.autosuggestion.enable` | boolean | `false` | Enable zsh autosuggestions |
| `programs.zsh.autosuggestion.highlight` | null or string | `null` | Custom styles for autosuggestion highlighting. See {manpage}`zshzle(1)` for syntax. |
| `programs.zsh.autosuggestion.strategy` | list of (one of "history", "completion", "match_prev_cmd") | `[   "history" ]` | `ZSH_AUTOSUGGEST_STRATEGY` is an array that specifies how suggestions should be generated. The strategies in the array are tried successively until a suggestion is found. There are currently three built-in strategies to choose from: - `history`: Chooses the most recent match from history. - `completion`: Chooses a suggestion based on what tab-completion would suggest. (requires `zpty` module) - `match_prev_cmd`: Like `history`, but chooses the most recent match whose preceding history item matches the most recently executed command. Note that this strategy won't work as expected with ZSH options that don't preserve the history order such as `HIST_IGNORE_ALL_DUPS` or `HIST_EXPIRE_DUPS_FIRST`. Setting the option to an empty list `[]` will make ZSH_AUTOSUGGESTION_STRATEGY not be set automatically, allowing the variable to be declared in {option}`programs.zsh.localVariables` or {option}`programs.zsh.sessionVariables` |
| `programs.zsh.cdpath` | list of string | `[ ]` | List of paths to autocomplete calls to {command}`cd`. |
| `programs.zsh.completionInit` | strings concatenated with "\n" | `"autoload -U compinit && compinit"` | Initialization commands to run when completion is enabled. |
| `programs.zsh.defaultKeymap` | null or one of "emacs", "vicmd", "viins" | `null` | The default base keymap to use. |
| `programs.zsh.dirHashes` | attribute set of string | `{ }` | An attribute set that adds to named directory hash table. |
| `programs.zsh.dotDir` | null or string | `if config.xdg.enable && lib.versionAtLeast config.home.stateVersion "26.05" then   "${config.xdg.configHome}/zsh" else   config.home.homeDirectory ` | Directory where the zsh configuration and more should be located, relative to the users home directory. The default is the home directory. |
| `programs.zsh.enable` | boolean | `false` | Whether to enable Z shell (Zsh). |
| `programs.zsh.enableCompletion` | boolean | `true` | Enable zsh completion. Don't forget to add ```nix environment.pathsToLink = [ "/share/zsh" ]; ``` to your system configuration to get completion for system packages (e.g. systemd). |
| `programs.zsh.enableVteIntegration` | boolean | `false` | Whether to enable integration with terminals using the VTE library. This will let the terminal track the current working directory. |
| `programs.zsh.envExtra` | strings concatenated with "\n" | `""` | Extra commands that should be added to {file}`.zshenv`. |
| `programs.zsh.history` | submodule | `{ }` | Options related to commands history configuration. |
| `programs.zsh.history.append` | boolean | `false` | If set, zsh sessions will append their history list to the history file, rather than replace it. Thus, multiple parallel zsh sessions will all have the new entries from their history lists added to the history file, in the order that they exit. This file will still be periodically re-written to trim it when the number of lines grows 20% beyond the value specified by `programs.zsh.history.save`. |
| `programs.zsh.history.expireDuplicatesFirst` | boolean | `false` | Expire duplicates first. |
| `programs.zsh.history.extended` | boolean | `false` | Save timestamp into the history file. |
| `programs.zsh.history.findNoDups` | boolean | `false` | Do not display a line previously found in the history file. |
| `programs.zsh.history.ignoreAllDups` | boolean | `false` | If a new command line being added to the history list duplicates an older one, the older command is removed from the list (even if it is not the previous event). |
| `programs.zsh.history.ignoreDups` | boolean | `true` | Do not enter command lines into the history list if they are duplicates of the previous event. |
| `programs.zsh.history.ignorePatterns` | list of string | `[ ]` | Do not enter command lines into the history list if they match any one of the given shell patterns. |
| `programs.zsh.history.ignoreSpace` | boolean | `true` | Do not enter command lines into the history list if the first character is a space. |
| `programs.zsh.history.path` | string | `"\`\${config.programs.zsh.dotDir}/.zsh_history\`"` | History file location |
| `programs.zsh.history.save` | signed integer | `10000` | Number of history lines to save. |
| `programs.zsh.history.saveNoDups` | boolean | `false` | Do not write duplicate entries into the history file. |
| `programs.zsh.history.share` | boolean | `true` | Share command history between zsh sessions. |
| `programs.zsh.history.size` | signed integer | `10000` | Number of history lines to keep. |
| `programs.zsh.historySubstringSearch` | submodule | `{ }` | Options related to zsh-history-substring-search. |
| `programs.zsh.historySubstringSearch.enable` | boolean | `false` | Whether to enable history substring search. |
| `programs.zsh.historySubstringSearch.searchDownKey` | (list of string) or string | `[   "^[[B" ]` | The key codes to be used when searching down. The default of `^[[B` may correspond to the DOWN key -- if not, try `$terminfo[kcud1]`. |
| `programs.zsh.historySubstringSearch.searchUpKey` | (list of string) or string | `[   "^[[A" ]` | The key codes to be used when searching up. The default of `^[[A` may correspond to the UP key -- if not, try `$terminfo[kcuu1]`. |
| `programs.zsh.initContent` | strings concatenated with "\n" | `""` | Content to be added to {file}`.zshrc`. To specify the order, use `lib.mkOrder`. Common order values: - 500 (mkBefore): Early initialization (replaces initExtraFirst) - 550: Before completion initialization (replaces initExtraBeforeCompInit) - 1000 (default): General configuration (replaces initExtra) - 1500 (mkAfter): Last to run configuration To specify both content in Early initialization and General configuration, use `lib.mkMerge`. e.g. initContent = let zshConfigEarlyInit = lib.mkOrder 500 "do something"; zshConfig = lib.mkOrder 1000 "do something"; in lib.mkMerge [ zshConfigEarlyInit zshConfig ]; |
| `programs.zsh.localVariables` | attribute set | `{ }` | Extra local variables defined at the top of {file}`.zshrc`. |
| `programs.zsh.loginExtra` | strings concatenated with "\n" | `""` | Extra commands that should be added to {file}`.zlogin`. |
| `programs.zsh.logoutExtra` | strings concatenated with "\n" | `""` | Extra commands that should be added to {file}`.zlogout`. |
| `programs.zsh.oh-my-zsh` | submodule | `{ }` | Options to configure oh-my-zsh. |
| `programs.zsh.oh-my-zsh.custom` | string | `""` | Path to a custom oh-my-zsh package to override config of oh-my-zsh. See <https://github.com/robbyrussell/oh-my-zsh/wiki/Customization> for more information. |
| `programs.zsh.oh-my-zsh.enable` | boolean | `false` | Whether to enable oh-my-zsh. |
| `programs.zsh.oh-my-zsh.extraConfig` | strings concatenated with "\n" | `""` | Extra settings for plugins. |
| `programs.zsh.oh-my-zsh.package` | package | `pkgs.oh-my-zsh` | The oh-my-zsh package to use. |
| `programs.zsh.oh-my-zsh.plugins` | list of string | `[ ]` | List of oh-my-zsh plugins |
| `programs.zsh.oh-my-zsh.theme` | string | `""` | Name of the theme to be used by oh-my-zsh. |
| `programs.zsh.package` | package | `pkgs.zsh` | The zsh package to use. |
| `programs.zsh.plugins` | list of (submodule) | `[ ]` | Plugins to source in {file}`.zshrc`. |
| `programs.zsh.plugins.*.completions` | list of string | `[ ]` | Paths of additional functions to add to {env}`fpath`. |
| `programs.zsh.plugins.*.file` | string | — | The plugin script to source. Required if the script name does not match {file}`name.plugin.zsh` using the plugin {option}`name` from the plugin {option}`src`. |
| `programs.zsh.plugins.*.name` | string | — | The name of the plugin. |
| `programs.zsh.plugins.*.src` | absolute path | — | Path to the plugin folder. Will be added to {env}`fpath` and {env}`PATH`. |
| `programs.zsh.prezto` | submodule | `{ }` | Options to configure prezto. |
| `programs.zsh.prezto.autosuggestions.color` | null or string | `null` | Set the query found color. |
| `programs.zsh.prezto.caseSensitive` | null or boolean | `true` | Set case-sensitivity for completion, history lookup, etc. |
| `programs.zsh.prezto.color` | null or boolean | `true` | Color output (automatically set to `false` on dumb terminals). |
| `programs.zsh.prezto.completions.ignoredHosts` | list of string | `[ ]` | Set the entries to ignore in static {file}`/etc/hosts` for host completion. |
| `programs.zsh.prezto.editor.dotExpansion` | null or boolean | `null` | Automatically convert `....` to `../..` |
| `programs.zsh.prezto.editor.keymap` | null or one of "emacs", "vi" | `"emacs"` | Set the key mapping style to `emacs` or `vi`. |
| `programs.zsh.prezto.editor.promptContext` | null or boolean | `null` | Allow the Zsh prompt context to be shown. |
| `programs.zsh.prezto.enable` | boolean | `false` | Whether to enable prezto. |
| `programs.zsh.prezto.extraConfig` | strings concatenated with "\n" | `""` | Additional configuration to add to {file}`.zpreztorc`. |
| `programs.zsh.prezto.extraFunctions` | list of string | `[ ]` | Set the Zsh functions to load ({manpage}`zshcontrib(1)`). |
| `programs.zsh.prezto.extraModules` | list of string | `[ ]` | Set the Zsh modules to load ({manpage}`zshmodules(1)`). |
| `programs.zsh.prezto.git.submoduleIgnore` | null or one of "dirty", "untracked", "all", "none" | `null` | Ignore submodules when they are `dirty`, `untracked`, `all`, or `none`. |
| `programs.zsh.prezto.gnuUtility.prefix` | null or string | `null` | Set the command prefix on non-GNU systems. |
| `programs.zsh.prezto.historySubstring.foundColor` | null or string | `null` | Set the query found color. |
| `programs.zsh.prezto.historySubstring.globbingFlags` | null or string | `null` | Set the search globbing flags. |
| `programs.zsh.prezto.historySubstring.notFoundColor` | null or string | `null` | Set the query not found color. |
| `programs.zsh.prezto.macOS.dashKeyword` | null or string | `null` | Set the keyword used by {command}`mand` to open man pages in Dash.app. |
| `programs.zsh.prezto.package` | package | `pkgs.zsh-prezto` | The prezto package to use. |
| `programs.zsh.prezto.pmoduleDirs` | list of absolute path | `[ ]` | Add additional directories to load prezto modules from. |
| `programs.zsh.prezto.pmodules` | list of string | `[   "environment"   "terminal"   "editor"   "history"   "directory"   "spectrum"   "utility"   "completion"   "prompt" ]` | Set the Prezto modules to load (browse modules). The order matters. |
| `programs.zsh.prezto.prompt.pwdLength` | null or one of "short", "long", "full" | `null` | Set the working directory prompt display length. By default, it is set to `short`. Set it to `long` (without `~` expansion) for longer or `full` (with `~` expansion) for even longer prompt display. |
| `programs.zsh.prezto.prompt.showReturnVal` | null or boolean | `null` | Set the prompt to display the return code along with an indicator for non-zero return codes. This is not supported by all prompts. |
| `programs.zsh.prezto.prompt.theme` | null or string | `"sorin"` | Set the prompt theme to load. Setting it to `random` loads a random theme. Automatically set to `off` on dumb terminals. |
| `programs.zsh.prezto.python.virtualenvAutoSwitch` | null or boolean | `null` | Auto switch to Python virtualenv on directory change. |
| `programs.zsh.prezto.python.virtualenvInitialize` | null or boolean | `null` | Automatically initialize virtualenvwrapper if pre-requisites are met. |
| `programs.zsh.prezto.ruby.chrubyAutoSwitch` | null or boolean | `null` | Auto switch the Ruby version on directory change. |
| `programs.zsh.prezto.screen.autoStartLocal` | null or boolean | `null` | Auto start a session when Zsh is launched in a local terminal. |
| `programs.zsh.prezto.screen.autoStartRemote` | null or boolean | `null` | Auto start a session when Zsh is launched in a SSH connection. |
| `programs.zsh.prezto.ssh.identities` | list of string | `[ ]` | Set the SSH identities to load into the agent. |
| `programs.zsh.prezto.syntaxHighlighting.highlighters` | list of string | `[ ]` | Set syntax highlighters. By default, only the main highlighter is enabled. |
| `programs.zsh.prezto.syntaxHighlighting.pattern` | attribute set of string | `{ }` | Set syntax pattern styles. |
| `programs.zsh.prezto.syntaxHighlighting.styles` | attribute set of string | `{ }` | Set syntax highlighting styles. |
| `programs.zsh.prezto.terminal.autoTitle` | null or boolean | `null` | Auto set the tab and window titles. |
| `programs.zsh.prezto.terminal.multiplexerTitleFormat` | null or string | `null` | Set the multiplexer title format. |
| `programs.zsh.prezto.terminal.tabTitleFormat` | null or string | `null` | Set the tab title format. |
| `programs.zsh.prezto.terminal.windowTitleFormat` | null or string | `null` | Set the window title format. |
| `programs.zsh.prezto.tmux.autoStartLocal` | null or boolean | `null` | Auto start a session when Zsh is launched in a local terminal. |
| `programs.zsh.prezto.tmux.autoStartRemote` | null or boolean | `null` | Auto start a session when Zsh is launched in a SSH connection. |
| `programs.zsh.prezto.tmux.defaultSessionName` | null or string | `null` | Set the default session name. |
| `programs.zsh.prezto.tmux.itermIntegration` | null or boolean | `null` | Integrate with iTerm2. |
| `programs.zsh.prezto.utility.safeOps` | null or boolean | `null` | Enabled safe options. This aliases {command}`cp`, {command}`ln`, {command}`mv` and {command}`rm` so that they prompt before deleting or overwriting files. Set to `no` to disable this safer behavior. |
| `programs.zsh.profileExtra` | strings concatenated with "\n" | `""` | Extra commands that should be added to {file}`.zprofile`. |
| `programs.zsh.sessionVariables` | lazy attribute set of (null or string or absolute path or signed integer or floating point number or boolean) | `{ }` | Environment variables that will be set for zsh session. Setting a value to `null` will skip setting the variable at all, which may be useful when overriding. |
| `programs.zsh.setOptions` | list of string | `[ ]` | Configure zsh options. See {manpage}`zshoptions(1)`. To unset an option, prefix it with "NO_". |
| `programs.zsh.shellAliases` | attribute set of string | `{ }` | An attribute set that maps aliases (the top level attribute names in this option) to command strings or directly to build outputs. |
| `programs.zsh.shellGlobalAliases` | attribute set of string | `{ }` | Similar to [](#opt-programs.zsh.shellAliases), but are substituted anywhere on a line. |
| `programs.zsh.siteFunctions` | attribute set of strings concatenated with "\n" | `{ }` | Functions that are added to the Zsh environment and are subject to {command}`autoload`ing. The key is the name and the value is the body of the function to be autoloaded. They are also already marked for autoloading through `autoload -Uz`. |
| `programs.zsh.syntaxHighlighting` | submodule | `{ }` | Options related to zsh-syntax-highlighting. |
| `programs.zsh.syntaxHighlighting.enable` | boolean | `false` | Whether to enable zsh syntax highlighting. |
| `programs.zsh.syntaxHighlighting.highlighters` | list of string | `"[ \"main\" ]"` | Highlighters to enable See the list of highlighters: <https://github.com/zsh-users/zsh-syntax-highlighting/blob/master/docs/highlighters.md> Note: The "main" highlighter is always included automatically. If you'd like to exclude it, please configure with a higher priority using `mkForce`. |
| `programs.zsh.syntaxHighlighting.package` | package | `pkgs.zsh-syntax-highlighting` | The zsh-syntax-highlighting package to use. |
| `programs.zsh.syntaxHighlighting.patterns` | attribute set of string | `{ }` | Custom syntax highlighting for user-defined patterns. Reference: <https://github.com/zsh-users/zsh-syntax-highlighting/blob/master/docs/highlighters/pattern.md> |
| `programs.zsh.syntaxHighlighting.styles` | attribute set of string | `{ }` | Custom styles for syntax highlighting. See each highlighter style option: <https://github.com/zsh-users/zsh-syntax-highlighting/blob/master/docs/highlighters/main.md> |
| `programs.zsh.zplug.enable` | boolean | `false` | Whether to enable zplug - a zsh plugin manager. |
| `programs.zsh.zplug.package` | package | `pkgs.zplug` | The zplug package to use. |
| `programs.zsh.zplug.plugins` | list of (submodule) | `[ ]` | List of zplug plugins. |
| `programs.zsh.zplug.plugins.*.name` | string | — | The name of the plugin. |
| `programs.zsh.zplug.plugins.*.tags` | list of string | `[ ]` | The plugin tags. |
| `programs.zsh.zplug.zplugHome` | absolute path | `"~/.zplug"` | Path to zplug home directory. |
| `programs.zsh.zprof.enable` | boolean | `false` | Enable zprof in your zshrc. |
| `programs.zsh.zsh-abbr.abbreviations` | attribute set of string | `{ }` | An attribute set that maps aliases (the top level attribute names in this option) to abbreviations. Abbreviations are expanded with the longer phrase after they are entered. |
| `programs.zsh.zsh-abbr.enable` | boolean | `false` | Whether to enable zsh-abbr - zsh manager for auto-expanding abbreviations. |
| `programs.zsh.zsh-abbr.globalAbbreviations` | attribute set of string | `{ }` | Similar to [](#opt-programs.zsh.zsh-abbr.abbreviations), but are expanded anywhere on a line. |
| `programs.zsh.zsh-abbr.package` | package | `pkgs.zsh-abbr` | The zsh-abbr package to use. |

## Regenerating this reference

Build the pinned Home Manager JSON documentation and pass its `options.json` file to the generator:

```sh
cd packages/aarch64-darwin
options_root=$(nix build --impure --no-link --print-out-paths --expr '(builtins.getFlake (toString ./.)).inputs.home-manager.packages.aarch64-darwin.docs-json')
cd ../..
node scripts/generate-native-nix-module-options.mjs \
  "$options_root/share/doc/home-manager/options.json" \
  documentation/native-nix-module-options.md
```

