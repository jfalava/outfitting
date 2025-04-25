# Add deno completions to search path
if [[ ":$FPATH:" != *":/home/jfalava/.zsh/completions:"* ]]; then export FPATH="/home/jfalava/.zsh/completions:$FPATH"; fi
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
eval "$(oh-my-posh init zsh --config /home/jfalava/.config/ohmyposh/profile.omp.json)"
source /home/linuxbrew/.linuxbrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
source $(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh
eval "$(zoxide init zsh)"
. "/home/jfalava/.deno/env"

# pnpm
export PNPM_HOME="/home/jfalava/.local/share/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end
# Initialize zsh completions (added by deno install script)
autoload -Uz compinit
compinit
