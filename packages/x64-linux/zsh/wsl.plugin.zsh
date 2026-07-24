# shellcheck shell=zsh

# WSL-specific interactive behavior without a native Home Manager option.

port() {
    if [ -z "$1" ]; then
        echo "Usage: port <port_number>"
        return 1
    fi
    sudo lsof -i ":$1" || sudo ss -tulpn | command grep ":$1"
}

_outfitting_repo() {
    echo "${OUTFITTING_REPO:-$HOME/.config/outfitting/repo}"
}

_ensure_home_manager_link() {
    local repo_path target
    repo_path=$(_outfitting_repo)
    target="$repo_path/packages/x64-linux"
    mkdir -p "$HOME/.config"

    if [ ! -L "$HOME/.config/home-manager" ] ||
       [ "$(readlink -f "$HOME/.config/home-manager")" != "$(readlink -f "$target")" ]; then
        ln -sfn "$target" "$HOME/.config/home-manager"
    fi
}

hm-sync() {
    local repo_path
    repo_path=$(_outfitting_repo)
    _ensure_home_manager_link || return 1
    home-manager switch --flake "path:$repo_path/packages/x64-linux#jfalava" --impure
}

hm-switch() {
    hm-sync
}

hm-update() {
    local repo_path
    repo_path=$(_outfitting_repo)
    _ensure_home_manager_link || return 1
    nix flake update --flake "$repo_path/packages/x64-linux" &&
        home-manager switch --flake "path:$repo_path/packages/x64-linux#jfalava" --impure
}

hm-rollback() {
    home-manager generations
    echo "Run the activation script of the generation you want to restore."
}

hm-clean() {
    nix-collect-garbage -d
}

update-all() {
    sudo -v || return 1
    sudo apt update &&
        sudo apt upgrade -y &&
        sudo apt autoremove -y &&
        hm-update &&
        hm-clean &&
        bun-update-global
}

remote-update() {
    curl -L https://wsl.jfa.dev | bash -s -- --update-only
}

# Keep one agent available across WSL shell sessions.
SSH_AGENT_FILE="$HOME/.ssh/agent-env"
if [ -f "$SSH_AGENT_FILE" ]; then
    eval "$(cat "$SSH_AGENT_FILE")" >/dev/null 2>&1
fi
if [ -z "$SSH_AUTH_SOCK" ] || [ ! -S "$SSH_AUTH_SOCK" ]; then
    ssh_agent_output="$(ssh-agent -s)"
    echo "$ssh_agent_output" > "$SSH_AGENT_FILE"
    eval "$ssh_agent_output" >/dev/null 2>&1
    chmod 600 "$SSH_AGENT_FILE"
fi
unset SSH_AGENT_FILE
