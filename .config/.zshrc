# Location of the history file
HISTFILE=~/.zsh_history
# Maximum number of entries in the history file
HISTSIZE=10000
# Maximum number of lines in memory before writing to the file
SAVEHIST=10000
# History options
setopt APPEND_HISTORY             # Append history instead of overwriting
setopt SHARE_HISTORY              # Share history across multiple terminals
setopt HIST_IGNORE_DUPS           # Ignore duplicate commands
setopt HIST_IGNORE_SPACE          # Ignore commands starting with a space
setopt HIST_VERIFY                # Let you edit history before executing
## Paths
PATH=$PATH:/home/$USER/go/bin
PATH=$PATH:/home/$USER/.local/bin
export HOMEBREW_NO_AUTO_UPDATE=1
## Aliases
alias auto-update='sudo apt update && sudo apt upgrade && brew update && brew upgrade && brew cleanup'
alias cls='clear'
alias ff='fastfetch'
alias l='eza --color=always --long --git --no-filesize --icons=always'
alias ls='eza --color=always --long --git --no-filesize --icons=always --all'
alias ssh='ssh.exe'
alias ssh-add='ssh-add.exe'
## Sources
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
eval "$(oh-my-posh init zsh --config https://raw.githubusercontent.com/JanDeDobbeleer/oh-my-posh/refs/heads/main/themes/wopian.omp.json)"
source /home/linuxbrew/.linuxbrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
source $(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh
eval "$(zoxide init zsh)"
