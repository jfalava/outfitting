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
    /bin/mkdir -p "$HOME/.config"

    if [ ! -L "$HOME/.config/home-manager" ] ||
       [ "$(/bin/readlink -f "$HOME/.config/home-manager")" != "$(/bin/readlink -f "$target")" ]; then
        /bin/ln -sfn "$target" "$HOME/.config/home-manager"
    fi
}

# Prefer outfitting-manager (build|switch|test|dry-run).
# Fall back to native Home Manager when the binary is missing.
hm-nix() {
    local action="${1:-switch}"
    case "$action" in
        build|switch|test|dry-run)
            ;;
        *)
            echo "Usage: hm-build | hm-switch | hm-test | hm-dry"
            return 1
            ;;
    esac

    if command -v outfitting-manager >/dev/null 2>&1; then
        command outfitting-manager nix "$action"
        return $?
    fi

    local repo_path
    repo_path=$(_outfitting_repo)
    _ensure_home_manager_link || return 1
    local flake_ref="path:$repo_path/${OUTFITTING_HM_DIR:?OUTFITTING_HM_DIR is required}#${OUTFITTING_HM_ATTR:?}"
    export OUTFITTING_REPO="$repo_path"
    case "$action" in
        build|test)
            nix build --no-link --impure \
                "$repo_path/${OUTFITTING_HM_DIR}#homeConfigurations.${OUTFITTING_HM_ATTR}.activationPackage"
            ;;
        dry-run)
            nix build --dry-run --no-link --impure \
                "$repo_path/${OUTFITTING_HM_DIR}#homeConfigurations.${OUTFITTING_HM_ATTR}.activationPackage"
            ;;
        switch)
            if command -v home-manager >/dev/null 2>&1; then
                home-manager switch --flake "$flake_ref" --impure
            else
                nix run github:nix-community/home-manager/release-26.05 -- \
                    switch --impure --flake "$flake_ref"
            fi
            ;;
    esac
}

hm-build() {
    hm-nix build
}

hm-test() {
    hm-nix test
}

hm-dry() {
    hm-nix dry-run
}

hm-sync() {
    hm-nix switch
}

hm-switch() {
    hm-nix switch
}

hm-update() {
    # Manager path does not bump flake inputs (same as macOS v1).
    if command -v outfitting-manager >/dev/null 2>&1; then
        echo "Note: hm-update no longer bumps flake inputs via the manager; switching only."
        hm-nix switch
        return $?
    fi
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
# Absolute paths + no `cat`: shellAliases map cat→bat, and PATH can be incomplete
# while Home Manager plugins load (before session path is fully applied).
/bin/mkdir -p "$HOME/.ssh"
/bin/chmod 700 "$HOME/.ssh" 2>/dev/null || true
SSH_AGENT_FILE="$HOME/.ssh/agent-env"
if [ -f "$SSH_AGENT_FILE" ]; then
    # shellcheck disable=SC1090
    eval "$(<"$SSH_AGENT_FILE")" >/dev/null 2>&1
fi
if [ -z "${SSH_AUTH_SOCK:-}" ] || [ ! -S "$SSH_AUTH_SOCK" ]; then
    if command -v ssh-agent >/dev/null 2>&1; then
        ssh_agent_output="$(command ssh-agent -s)"
        printf '%s\n' "$ssh_agent_output" >|"$SSH_AGENT_FILE"
        eval "$ssh_agent_output" >/dev/null 2>&1
        /bin/chmod 600 "$SSH_AGENT_FILE"
    fi
fi
unset SSH_AGENT_FILE

# Load the preferred GitHub auth key once when the agent has no identities.
# Never prompt non-interactively; skip locked keys that need a passphrase UI.
if [ -n "${SSH_AUTH_SOCK:-}" ] && [ -S "$SSH_AUTH_SOCK" ] && command -v ssh-add >/dev/null 2>&1; then
    if ! command ssh-add -l >/dev/null 2>&1; then
        for _hm_key in \
            "$HOME/.ssh/jfalava-gitAuth-elliptic" \
            "$HOME/.ssh/id-ed25519"; do
            if [ -f "$_hm_key" ]; then
                command ssh-add -q "$_hm_key" </dev/null >/dev/null 2>&1 || true
                break
            fi
        done
        unset _hm_key
    fi
fi
