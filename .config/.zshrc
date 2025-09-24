# ---- History ----
HISTFILE=~/.zsh_history # Location of the history file
HISTSIZE=10000 # Maximum number of entries in the history file
SAVEHIST=10000 # Maximum number of lines in memory before writing to the file
# History options
setopt APPEND_HISTORY    # Append history instead of overwriting
setopt SHARE_HISTORY     # Share history across multiple terminals
setopt HIST_IGNORE_DUPS  # Ignore duplicate commands
setopt HIST_IGNORE_SPACE # Ignore commands starting with a space
setopt HIST_VERIFY       # Let you edit history before executing

# ---- Paths ----
PATH=$PATH:/home/$USER/go/bin
PATH=$PATH:/home/$USER/.local/bin
# pnpm
export PNPM_HOME="$HOME/.local/share/pnpm"
case ":$PATH:" in
*":$PNPM_HOME:"*) ;;
*) export PATH="$PNPM_HOME:$PATH" ;;
esac
# deno
export DENO_INSTALL="$HOME/.deno"
export PATH="$PNPM_HOME:$DENO_INSTALL/bin:$PATH"
# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
# opencode
export PATH=/home/jfalava/.opencode/bin:$PATH

# ---- Aliases ----
alias update-all="sudo apt update && sudo apt upgrade && sudo apt autoremove && nix profile upgrade packages --no-write-lock-file"
alias cls='clear'
alias ff='fastfetch'
alias tf='terraform'
alias l='eza --color=always --long --git --no-filesize --icons=always'
alias ls='eza --color=always --long --git --no-filesize --icons=always --all --color-scale-mode=gradient'

# ---- Sources ----
# zsh
if [ -f $HOME/.nix-profile/share/zsh-autosuggestions/zsh-autosuggestions.zsh ]; then
  source $HOME/.nix-profile/share/zsh-autosuggestions/zsh-autosuggestions.zsh
fi
if [ -f $HOME/.nix-profile/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]; then
  source $HOME/.nix-profile/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
fi
# nix
source ~/.nix-profile/etc/profile.d/nix.sh
# zoxide
eval "$(zoxide init zsh)"
# SSH
if [ -z "$SSH_AUTH_SOCK" ] || [ ! -S "$SSH_AUTH_SOCK" ]; then
    eval "$(ssh-agent -s)"
fi
# starship
eval "$(starship init zsh)"
# add deno completions to search path
if [[ ":$FPATH:" != *":/home/jfalava/.zsh/completions:"* ]]; then export FPATH="/home/jfalava/.zsh/completions:$FPATH"; fi
. "/home/jfalava/.deno/env"
# Initialize zsh completions (added by deno install script)
autoload -Uz compinit
compinit
