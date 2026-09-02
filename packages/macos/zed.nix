{
  config,
  lib,
  pkgs,
  ...
}:

let
  # Shared formatter config: format-on-save via the oxfmt language server,
  # with Zed's built-in prettier integration disabled so it can't compete.
  oxfmtFormatter = {
    "format_on_save" = "on";
    "prettier" = {
      "allowed" = false;
    };
    "formatter" = [
      {
        "language_server" = {
          "name" = "oxfmt";
        };
      }
    ];
  };

  # Languages that only need the shared oxfmt formatter block, with no
  # language-server overrides.
  oxfmtOnlyLanguages = [
    "CSS"
    "HTML"
    "JSON"
    "JSON5"
    "JSONC"
    "TOML"
    "YAML"
  ];

  # oxlint 1.80 attaches a `help: Consider removing...` line and a related-
  # information popup to every no-unused-vars diagnostic, which renders as
  # two stacked boxes and duplicates the TS server's short diagnostic. Keep
  # only the plain ts(6133) message: drop oxlint, keep tsgo (typescript-ls)
  # for diagnostics and oxfmt for formatting.
  # tailwindcss-language-server provides class completions, diagnostics, and
  # color previews; it emits no TS diagnostics, so it can't duplicate tsgo's.
  tsLanguageServers = [
    "typescript-ls"
    "!vtsls"
    "!typescript-language-server"
    "tailwindcss-language-server"
    "oxfmt"
  ];

  # Zed's Astro extension doesn't auto-enable the Tailwind LSP: the server
  # needs `includeLanguages` to map Astro to its HTML host mode and a
  # classRegex to see Astro's `class`/`class:list` attributes, per
  # https://zed.dev/docs/languages/astro.
  astroLanguageServers = [
    "astro-language-server"
    "tailwindcss-language-server"
    "oxlint"
  ];

  tailwindLspSettings = {
    "includeLanguages" = {
      "astro" = "html";
    };
    "experimental" = {
      "classRegex" = [
        "class=\"([^\"]*)\""
        "class='([^']*)'"
        "class:list=\"{([^}]*)}\""
        "class:list='{([^}]*)}'"
      ];
    };
  };

  tsLikeConfig = oxfmtFormatter // {
    "language_servers" = tsLanguageServers;
  };
in
{
  programs.zed-editor = {
    enable = true;

    # The macOS application remains owned by the Homebrew cask.
    package = null;

    # Merge declared settings into Zed's writable settings file so private
    # and machine-local values can remain outside the Nix store.
    mutableUserSettings = true;

    extensions = [
      "html"
      "csv"
      "git-firefly"
      "dockerfile"
      "sql"
      "xml"
      "lua"
      "terraform"
      "astro"
      "nix"
      "powershell"
      "deno"
      "discord-presence"
      "bearded-theme"
      "bearded-icon-theme"
      "helm"
      "log"
      "oxc"
      "json5"
      "github-theme"
      "tsgo"
      "mdx"
      "ini"
      "make"
      "windows-batch"
    ];

    userSettings = {
      "cli_default_open_behavior" = "existing_window";
      "git" = {
        "inline_blame" = {
          "show_commit_summary" = true;
        };
      };
      "diff_view_style" = "unified";

      "agent_servers" = {
        "github-copilot-cli" = {
          "default_config_options" = {
            "allow_all" = "on";
            "model" = "claude-sonnet-5";
          };
          "type" = "registry";
        };
        "codex-acp" = {
          "default_config_options" = {
            "reasoning_effort" = "high";
            "model" = "gpt-5.6-sol";
          };
          "type" = "registry";
        };
        "opencode" = {
          "default_config_options" = {
            "effort" = "medium";
          };
          "type" = "registry";
        };
      };

      "context_servers" = {
        "Chrome DevTools" = {
          "enabled" = true;
          "remote" = false;
          "command" = "bunx chrome-devtools-mcp@latest";
          "args" = [
            "-y"
          ];
        };
        "Cloudflare Builds" = {
          "enabled" = true;
          "url" = "https://builds.mcp.cloudflare.com/mcp";
        };
        "Cloudflare Bindings" = {
          "enabled" = true;
          "url" = "https://bindings.mcp.cloudflare.com/mcp";
        };
        "Cloudflare Docs" = {
          "enabled" = true;
          "url" = "https://docs.mcp.cloudflare.com/mcp";
        };
        "Cloudflare" = {
          "enabled" = true;
          "url" = "https://mcp.cloudflare.com/mcp";
        };
      };

      "show_edit_predictions" = false;
      "restore_on_startup" = "last_workspace";
      "when_closing_with_no_tabs" = "keep_window_open";
      "confirm_quit" = true;

      "telemetry" = {
        "diagnostics" = true;
        "metrics" = false;
      };

      "base_keymap" = "VSCode";
      "multi_cursor_modifier" = "alt";

      "minimap" = {
        "show" = "never";
      };

      "linked_edits" = true;
      "icon_theme" = "Bearded Icon Theme";

      "edit_predictions" = {
        "provider" = "copilot";
        "codestral" = {
          "api_url" = "https://codestral.mistral.ai/v1/fim/completions";
        };
        "mode" = "subtle";
        "copilot" = {
          "proxy" = null;
          "proxy_no_verify" = null;
        };
      };

      "collaboration_panel" = {
        "button" = false;
        "dock" = "left";
        "default_width" = 240;
      };

      "outline_panel" = {
        "button" = false;
        "dock" = "left";
        "default_width" = 300;
        "git_status" = true;
      };

      "scrollbar" = {
        "show" = "auto";
        "cursors" = true;
        "git_diff" = true;
        "search_results" = true;
        "selected_text" = true;
        "selected_symbol" = true;
        "diagnostics" = "all";
        "axes" = {
          "horizontal" = false;
          "vertical" = true;
        };
      };

      "soft_wrap" = "editor_width";
      "preferred_line_length" = 80;
      "show_wrap_guides" = true;

      "git_panel" = {
        "tree_view" = true;
        "dock" = "right";
      };

      "agent" = {
        "tool_permissions" = {
          "default" = "allow";
        };
        "default_model" = {
          "effort" = "medium";
          "enable_thinking" = true;
          "provider" = "copilot_chat";
          "model" = "gpt-5-mini";
        };
        "play_sound_when_agent_done" = "always";
        "enable_feedback" = true;
        "default_profile" = "write";
        "single_file_review" = false;
        "dock" = "left";
        "commit_message_model" = {
          "model" = "gpt-5-mini";
          "provider" = "copilot_chat";
        };
      };

      "project_panel" = {
        "dock" = "right";
        "hide_root" = true;
        "default_width" = 400;
        "auto_fold_dirs" = false;
      };

      "ui_font_size" = 19;
      "extend_comment_on_newline" = false;
      "ui_font_family" = "Atlassian Sans";
      "tab_size" = 2;
      "auto_indent" = "none";
      "auto_indent_on_paste" = false;
      "buffer_font_size" = 19;
      "buffer_font_family" = "Aptos Mono";
      "buffer_font_weight" = 400;

      "terminal" = {
        "dock" = "left";
        "font_family" = "VictorMono Nerd Font Propo";
        "font_size" = 17;
        "font_weight" = 500;
      };

      "horizontal_scroll_margin" = 1;
      "vertical_scroll_margin" = 1;
      "close_on_file_delete" = false;

      "session" = {
        "restore_unsaved_buffers" = true;
      };

      "restore_on_file_reopen" = true;

      "gutter" = {
        "min_line_number_digits" = 0;
      };

      "theme" = {
        "mode" = "system";
        "light" = "One Light";
        "dark" = "Bearded Theme Arc";
      };

      # The `syntax` keys are tree-sitter capture paths: doc comments are
      # "comment.doc", not "comment_doc" (the underscore key silently matches
      # nothing and the override is a no-op).
      "theme_overrides" = {
        "One Light" = {
          "syntax" = {
            "comment" = {
              "font_style" = "italic";
            };
            "comment.doc" = {
              "font_style" = "italic";
            };
          };
        };
        "Bearded Theme Arc" = {
          "syntax" = {
            "comment" = {
              "font_style" = "italic";
            };
            "comment.doc" = {
              "font_style" = "italic";
            };
          };
        };
      };

      "lsp" = {
        "oxfmt" = {
          "initialization_options" = {
            "settings" = {
              "configPath" = null;
              "printWidth" = 80;
              "flags" = { };
              "fmt.configPath" = null;
              "fmt.experimental" = true;
              "run" = "onSave";
              "typeAware" = false;
              "unusedDisableDirectives" = "warn";
            };
          };
        };
        "oxlint" = {
          "initialization_options" = {
            "settings" = {
              "disableNestedConfig" = false;
              "fixKind" = "safe_fix";
              "run" = "onType";
              "typeAware" = true;
              "unusedDisableDirectives" = "deny";
            };
          };
        };
        "tailwindcss-language-server" = {
          "settings" = tailwindLspSettings;
        };
        "discord_presence" = {
          "initialization_options" = {
            "application_id" = "1263505205522337886";
            "base_icons_url" =
              "https://raw.githubusercontent.com/xhyrom/zed-discord-presence/main/assets/icons/";
            "state" = "working on smth";
            "details" = "in some file";
            "large_image" = "{base_icons_url}/{language:lo}.png";
            "large_text" = "{language:u}";
            "small_image" = "{base_icons_url}/zed.png";
            "small_text" = "Zed";
            "idle" = {
              "timeout" = 300;
              "action" = "change_activity";
              "state" = "Idling";
              "details" = "In Zed";
              "large_image" = "{base_icons_url}/zed.png";
              "large_text" = "Zed";
              "small_image" = "{base_icons_url}/idle.png";
              "small_text" = "Idle";
            };
            "rules" = {
              "mode" = "blacklist";
              "paths" = [
                "absolute path"
              ];
            };
            "git_integration" = false;
            "languages" = { };
          };
        };
      };

      "languages" =
        # CSS, HTML, JSON, JSON5, JSONC, TOML, YAML all get the plain
        # oxfmt-on-save treatment with no language-server overrides.
        (lib.genAttrs oxfmtOnlyLanguages (_: oxfmtFormatter)) // {
          "Astro" = {
            "language_servers" = astroLanguageServers;
          };

          "Markdown" = oxfmtFormatter // {
            "show_completions_on_input" = false;
          };

          "MDX" = oxfmtFormatter;

          # JavaScript/TypeScript/TSX share the same oxlint-vs-tsgo
          # workaround (see tsLikeConfig above).
          "JavaScript" = tsLikeConfig;
          "TypeScript" = tsLikeConfig;
          "TSX" = tsLikeConfig;

          "Nix" = {
            "format_on_save" = "on";
            "formatter" = {
              "external" = {
                "command" = "nixfmt";
                "arguments" = [
                  "--filename"
                  "{buffer_path}"
                ];
              };
            };
          };
        };
    };
  };

  # The settings file is mutable (`mutableUserSettings`): home-manager merges
  # the declared settings into the existing file (`$dynamic * $static`), so
  # keys that were written by hand in the past survive every rebuild. Some of
  # those leftovers are invalid or no-ops in Zed's settings and get flagged:
  # - `context_servers.<name>.type` (the stdio/http shapes have no `type` field)
  # - `lsp.<name>.features` (`LspSettings` has no `features` field)
  # - `theme_overrides.<theme>.syntax.comment_doc` (obsolete key; the capture
  #   path is `comment.doc`, declared above)
  # Strip them after the zed settings activation so the resulting file stays
  # schema-clean, while leaving other manually-added keys untouched.
  home.activation.zedSettingsSchemaCleanup =
    lib.hm.dag.entryAfter
      [
        "zedSettingsActivation"
      ]
      ''
        settings="${config.xdg.configHome}/zed/settings.json"
        if [ -f "$settings" ]; then
          tmp="$(mktemp)"
          ${pkgs.jq}/bin/jq \
            'if (.context_servers? | type) == "object"
             then .context_servers |= with_entries(.value |= (if type == "object" then del(.type) else . end))
             else . end
             | if (.theme_overrides? | type) == "object"
               then .theme_overrides |= with_entries(.value |= (if (.syntax? | type) == "object" then .syntax |= del(.comment_doc) else . end))
               else . end
             | if (.lsp.vtsls? | type) == "object"
               then .lsp.vtsls |= (if type == "object" then del(.features) else . end)
               else . end' \
            "$settings" > "$tmp" && mv "$tmp" "$settings" || rm -f "$tmp"
        fi
      '';
}
