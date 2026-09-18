# shellcheck shell=zsh
# WSL-specific interactive behavior without a native Home Manager option.

OUTFITTING_HM_DIR="system/ubuntu-wsl"
OUTFITTING_HM_ATTR="jfalava"

_wsl_source_hm_profile() {
    local candidates=(
        "${OUTFITTING_REPO:+$OUTFITTING_REPO/system/common/zsh/hm-profile.inc.zsh}"
        "$HOME/.config/outfitting/source/system/common/zsh/hm-profile.inc.zsh"
    )
    if [ -L "$HOME/.config/home-manager" ]; then
        candidates+=("$(readlink -f "$HOME/.config/home-manager")/../common/zsh/hm-profile.inc.zsh")
    fi
    local path
    for path in "${candidates[@]}"; do
        [ -n "$path" ] || continue
        if [ -r "$path" ]; then
            # shellcheck source=/dev/null
            . "$path"
            return 0
        fi
    done
    return 1
}
_wsl_source_hm_profile
unset -f _wsl_source_hm_profile

port() {
    if [ -z "$1" ]; then
        echo "Usage: port <port_number>"
        return 1
    fi
    sudo lsof -i ":$1" || sudo ss -tulpn | command grep ":$1"
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
