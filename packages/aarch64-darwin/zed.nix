{ ... }:

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
      "toml"
      "git-firefly"
      "dockerfile"
      "sql"
      "xml"
      "lua"
      "terraform"
      "githum-theme"
      "astro"
      "nix"
      "opencode"
      "basher"
      "powershell"
      "deno"
      "discord-presence"
      "bearded-theme"
      "bearded-icon-theme"
      "helm"
      "log"
      "oxc"
      "json5"
      "bearded-themes"
      "github-theme"
      "tsgo"
      "mdx"
      "ini"
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
        "amp-acp" = {
          "type" = "registry";
        };
        "pi-acp" = {
          "default_config_options" = {
            "model" = "openai-codex/gpt-5.6-sol";
          };
          "type" = "registry";
        };
        "github-copilot-cli" = {
          "favorite_config_option_values" = {
            "model" = [
              "gpt-5.3-codex"
              "claude-sonnet-5"
              "mai-code-1-flash-picker"
            ];
          };
          "default_config_options" = {
            "allow_all" = "on";
            "model" = "claude-sonnet-5";
          };
          "type" = "registry";
        };
        "codex-acp" = {
          "default_config_options" = {
            "reasoning_effort" = "low";
            "model" = "gpt-5.6-sol";
          };
          "type" = "registry";
        };
        "opencode" = {
          "default_config_options" = {
            "effort" = "medium";
            "model" = "opencode/nemotron-3-ultra-free";
          };
          "type" = "registry";
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
      "ui_font_family" = "Pretendard";
      "tab_size" = 2;
      "auto_indent" = "none";
      "auto_indent_on_paste" = false;
      "buffer_font_size" = 19;
      "buffer_font_family" = "Google Sans Code";
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
      "theme_overrides" = {
        "One Light" = {
          "syntax" = {
            "comment" = {
              "font_style" = "italic";
            };
            "comment_doc" = {
              "font_style" = "italic";
            };
          };
        };
        "Bearded Theme Arc" = {
          "syntax" = {
            "comment" = {
              "font_style" = "italic";
            };
            "comment_doc" = {
              "font_style" = "italic";
            };
          };
        };
      };
      "lsp" = {
        "vtsls" = {
          "settings" = {
            "typescript" = {
              "updateImportsOnFileMove" = {
                "enabled" = "always";
              };
            };
            "javascript" = {
              "updateImportsOnFileMove" = {
                "enabled" = "always";
              };
            };
          };
          "enable_lsp_tasks" = true;
        };
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
      "languages" = {
        "CSS" = {
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
        "HTML" = {
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
        "JavaScript" = {
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
        "JSON" = {
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
        "JSON5" = {
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
        "JSONC" = {
          "show_edit_predictions" = false;
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
        "Markdown" = {
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
          "show_completions_on_input" = false;
        };
        "MDX" = {
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
        "TOML" = {
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
        "TypeScript" = {
          "language_servers" = [
            "tsgo"
            "vtsls"
          ];
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
        "TSX" = {
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
        "YAML" = {
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
}
