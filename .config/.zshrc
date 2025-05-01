# Add deno completions to search path
if [[ ":$FPATH:" != *":$HOME/.zsh/completions:"* ]]; then export FPATH="$HOME/.zsh/completions:$FPATH"; fi
# ---- History ----
# Location of the history file
HISTFILE=~/.zsh_history
# Maximum number of entries in the history file
HISTSIZE=10000
# Maximum number of lines in memory before writing to the file
SAVEHIST=10000
# History options
setopt APPEND_HISTORY    # Append history instead of overwriting
setopt SHARE_HISTORY     # Share history across multiple terminals
setopt HIST_IGNORE_DUPS  # Ignore duplicate commands
setopt HIST_IGNORE_SPACE # Ignore commands starting with a space
setopt HIST_VERIFY       # Let you edit history before executing
# ---- Navigation ----
# Ctrl + Arrow Keys (word-wise navigation)
bindkey "^[[1;5C" forward-word  # Ctrl + Right
bindkey "^[[1;5D" backward-word # Ctrl + Left
# Shift + Arrow Keys (character-wise navigation)
bindkey "^[[1;2C" forward-char  # Shift + Right
bindkey "^[[1;2D" backward-char # Shift + Left
# Home/End
bindkey "^[[H" beginning-of-line # Home
bindkey "^[[F" end-of-line       # End
# Delete
bindkey "^[[3~" delete-char # Delete
# ---- Paths ----
PATH=$PATH:/home/$USER/go/bin
PATH=$PATH:/home/$USER/.local/bin
export HOMEBREW_NO_AUTO_UPDATE=1
# ---- Aliases ----
alias update-all='sudo apt update && sudo apt upgrade && sudo apt autoremove && brew update && brew upgrade && brew cleanup'
alias cls='clear'
alias ff='fastfetch'
alias tf='terraform'
alias l='eza --color=always --long --git --no-filesize --icons=always'
alias ls='eza --color=always --long --git --no-filesize --icons=always --all --color-scale-mode=gradient'
# ---- Sources ----
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
# pnpm
export PNPM_HOME="$HOME/.local/share/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end
# Initialize zsh completions (added by deno install script)
autoload -Uz compinit
compinit
# ---- Dynamic Terminal Themes ----
# Retrieve the current GTK theme
theme=$(gsettings get org.gnome.desktop.interface gtk-theme)
# Determine if the theme is dark
if [[ "$theme" == *"dark"* ]]; then
  THEME_PATH="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/dark-mode.omp.json"
else
  THEME_PATH="https://raw.githubusercontent.com/jfalava/outfitting/refs/heads/main/.config/light-mode.omp.json"
fi
# Initialize Oh My Posh with the selected theme
eval "$(oh-my-posh init zsh --config $THEME_PATH)"
# ---- ZSH Extras ----
source /home/linuxbrew/.linuxbrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
source $(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh
eval "$(zoxide init zsh)"
. "$HOME/.deno/env"
# eza Theme
export EZA_CONFIG_DIR="$HOME/.config/eza"
# Detect system theme using gsettings
theme=$(gsettings get org.gnome.desktop.interface color-scheme)
# Remove existing theme.yml symlink if it exists
rm -f "$EZA_CONFIG_DIR/theme.yml"
# Create symlink based on detected theme
if [[ "$theme" == *'dark'* ]]; then
  ln -s "$EZA_CONFIG_DIR/dark_mode-theme.yml" "$EZA_CONFIG_DIR/theme.yml"
else
  ln -s "$EZA_CONFIG_DIR/light_mode-theme.yml" "$EZA_CONFIG_DIR/theme.yml"
fi
# SSH
export SSH_AUTH_SOCK=$XDG_RUNTIME_DIR/gcr/ssh
