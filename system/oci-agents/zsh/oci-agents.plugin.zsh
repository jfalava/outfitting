# shellcheck shell=zsh

# oci-agents interactive helpers without a native Home Manager option.

_outfitting_repo() {
    echo "${OUTFITTING_REPO:-$HOME/.config/outfitting/source}"
}

_ensure_home_manager_link() {
    local repo_path target
    repo_path=$(_outfitting_repo)
    target="$repo_path/system/oci-agents"
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
    home-manager switch --flake "path:$repo_path/system/oci-agents#oci-agents" --impure
}

hm-switch() {
    hm-sync
}

hm-update() {
    local repo_path
    repo_path=$(_outfitting_repo)
    _ensure_home_manager_link || return 1
    nix flake update --flake "$repo_path/system/oci-agents" &&
        home-manager switch --flake "path:$repo_path/system/oci-agents#oci-agents" --impure
}

hm-rollback() {
    home-manager generations
    echo "Run the activation script of the generation you want to restore."
}

hm-clean() {
    nix-collect-garbage -d
}

# Ensure the user bus address exists for libsecret / gnome-keyring consumers.
if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
    _oci_runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
    if [ -S "$_oci_runtime_dir/bus" ]; then
        export DBUS_SESSION_BUS_ADDRESS="unix:path=$_oci_runtime_dir/bus"
    fi
    unset _oci_runtime_dir
fi

# Reuse one local agent across SSH sessions when agent forwarding is absent.
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
        for _oci_key in \
            "$HOME/.ssh/jfalava-gitAuth-elliptic" \
            "$HOME/.ssh/id-ed25519"; do
            if [ -f "$_oci_key" ]; then
                ssh-add -q "$_oci_key" </dev/null >/dev/null 2>&1 || true
                break
            fi
        done
        unset _oci_key
    fi
fi
