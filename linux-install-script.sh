#/bin/bash
## Update Packages ##
sudo apt update -y && sudo apt upgrade -y && sudo apt install curl
# Fetch the list of APT packages from GitHub
APT_LIST_URL="https://raw.githubusercontent.com/jfalava/dotfiles-and-such/refs/heads/main/packages/apt.txt"
echo "❖ Fetching APT package list from $APT_LIST_URL..."
curl -fsSL "$APT_LIST_URL" -o /tmp/apt-packages.txt || {
echo "❖ Failed to fetch APT package list. Exiting..."
    exit 1
}
# Install APT packages
echo "❖ Installing APT packages..."
while read -r package; do
    if [[ -n "$package" && "$package" != \#* ]]; then
        sudo apt install -y "$package"
    fi
done < /tmp/apt-packages.txt
## Homebrew ##
# Bash Shell Profile Edits #
echo "❖ Installing Homebrew"
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
(echo; echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"') >> ~/.bashrc
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
source .bashrc
## Alias Edits
if ! grep -q "HISTFILE=~/.zsh_history" "$HOME/.zshrc"; then
    cat <<'EOF' >> "$HOME/.zshrc"
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
PATH=\$PATH:/home/$USER/go/bin
PATH=\$PATH:/home/$USER/.local/bin
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
eval "\$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
eval "\$(oh-my-posh init zsh --config https://raw.githubusercontent.com/JanDeDobbeleer/oh-my-posh/refs/heads/main/themes/wopian.omp.json)"
source /home/linuxbrew/.linuxbrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
source \$(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh
eval "\$(zoxide init zsh)"
EOF
fi
## HashiCorp Packages ##
echo "❖ Adding HashiCorp repository and installing packages..."
if ! grep -q hashicorp /etc/apt/sources.list.d/hashicorp.list; then
    wget -qO- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
fi
sudo apt update -qq && sudo apt install -y terraform packer
## Homebrew Packages #
echo "❖ Installing Homebrew packages"
BREW_LIST_URL="https://raw.githubusercontent.com/jfalava/dotfiles-and-such/refs/heads/main/packages/brew.txt"
curl -fsSL "$BREW_LIST_URL" -o /tmp/brew-packages.txt
# Install each brew package
while read -r package; do
    # Skip empty lines and lines starting with #
    if [[ -n "$package" && "$package" != \#* ]]; then
        echo "❖ Installing $package"
        brew install "$package"
    fi
done < /tmp/brew-packages.txt
## Install OhMyPosh ##
sudo chsh -s $(which zsh) $USER
echo "❖ Installing OhMyPosh"
curl -s https://ohmyposh.dev/install.sh | bash -s
brew install zsh-syntax-highlighting
brew install zsh-autosuggestions
