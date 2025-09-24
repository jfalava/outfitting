# Add deno completions to search path
if [[ ":$FPATH:" != *":/home/jfalava/.zsh/completions:"* ]]; then export FPATH="/home/jfalava/.zsh/completions:$FPATH"; fi
. "/home/jfalava/.deno/env"
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
# ---- Paths ----
PATH=$PATH:/home/$USER/go/bin
PATH=$PATH:/home/$USER/.local/bin
# ---- Aliases ----
alias update-all='sudo apt update && sudo apt upgrade && sudo apt autoremove'
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
eval "$(zoxide init zsh)"
. "$HOME/.deno/env"
# SSH
if [ -z "$SSH_AUTH_SOCK" ] || [ ! -S "$SSH_AUTH_SOCK" ]; then
    eval "$(ssh-agent -s)"
fi
# Starship
eval "$(starship init zsh)"
# Initialize zsh completions (added by deno install script)
autoload -Uz compinit
compinit
