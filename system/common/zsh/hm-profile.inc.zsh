# shellcheck shell=zsh
# Shared Home Manager helpers for Linux profiles.
# Callers set OUTFITTING_HM_DIR (repo-relative) and OUTFITTING_HM_ATTR before sourcing.

_outfitting_repo() {
    echo "${OUTFITTING_REPO:-$HOME/.config/outfitting/source}"
}

_ensure_home_manager_link() {
    local repo_path target
    repo_path=$(_outfitting_repo)
    target="$repo_path/${OUTFITTING_HM_DIR:?OUTFITTING_HM_DIR is required}"
    mkdir -p "$HOME/.config"

    if [ ! -L "$HOME/.config/home-manager" ] ||
       [ "$(readlink -f "$HOME/.config/home-manager")" != "$(readlink -f "$target")" ]; then
        ln -sfn "$target" "$HOME/.config/home-manager"
    fi
}

# Native Home Manager path used when the compiled manager is missing or offline.
hm-sync() {
    local repo_path
    repo_path=$(_outfitting_repo)
    _ensure_home_manager_link || return 1
    home-manager switch --flake "path:$repo_path/${OUTFITTING_HM_DIR}#${OUTFITTING_HM_ATTR:?}" --impure
}

hm-switch() {
    hm-sync
}

hm-update() {
    local repo_path
    repo_path=$(_outfitting_repo)
    _ensure_home_manager_link || return 1
    nix flake update --flake "$repo_path/${OUTFITTING_HM_DIR}" &&
        home-manager switch --flake "path:$repo_path/${OUTFITTING_HM_DIR}#${OUTFITTING_HM_ATTR}" --impure
}

hm-rollback() {
    home-manager generations
    echo "Run the activation script of the generation you want to restore."
}

hm-clean() {
    nix-collect-garbage -d
}

# Reuse one local agent across sessions when agent forwarding is absent.
# Do not replace a live SSH_AUTH_SOCK (forwarded or otherwise).
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh" 2>/dev/null || true
SSH_AGENT_FILE="$HOME/.ssh/agent-env"
if [ -f "$SSH_AGENT_FILE" ]; then
    # shellcheck disable=SC1090
    eval "$(cat "$SSH_AGENT_FILE")" >/dev/null 2>&1
fi
if [ -z "${SSH_AUTH_SOCK:-}" ] || [ ! -S "$SSH_AUTH_SOCK" ]; then
    if command -v ssh-agent >/dev/null 2>&1; then
        ssh_agent_output="$(ssh-agent -s)"
        printf '%s\n' "$ssh_agent_output" > "$SSH_AGENT_FILE"
        eval "$ssh_agent_output" >/dev/null 2>&1
        chmod 600 "$SSH_AGENT_FILE"
    fi
fi
unset SSH_AGENT_FILE

# Load the preferred GitHub auth key once when the agent has no identities.
# Never prompt non-interactively; skip locked keys that need a passphrase UI.
if [ -n "${SSH_AUTH_SOCK:-}" ] && [ -S "$SSH_AUTH_SOCK" ] && command -v ssh-add >/dev/null 2>&1; then
    if ! ssh-add -l >/dev/null 2>&1; then
        for _hm_key in \
            "$HOME/.ssh/jfalava-gitAuth-elliptic" \
            "$HOME/.ssh/id-ed25519"; do
            if [ -f "$_hm_key" ]; then
                ssh-add -q "$_hm_key" </dev/null >/dev/null 2>&1 || true
                break
            fi
        done
        unset _hm_key
    fi
fi
