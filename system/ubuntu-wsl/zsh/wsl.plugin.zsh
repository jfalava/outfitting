# shellcheck shell=zsh
# WSL-specific interactive behavior without a native Home Manager option.

OUTFITTING_HM_DIR="system/ubuntu-wsl"
OUTFITTING_HM_ATTR="jfalava"

_wsl_source_hm_profile() {
    local plugin_dir candidates path
    plugin_dir="${${(%):-%x}:A:h}"
    candidates=(
        "$HOME/.zsh/plugins/outfitting/hm-profile.inc.zsh"
        "$plugin_dir/../../common/zsh/hm-profile.inc.zsh"
        "${OUTFITTING_REPO:+$OUTFITTING_REPO/system/common/zsh/hm-profile.inc.zsh}"
        "$HOME/.config/outfitting/source/system/common/zsh/hm-profile.inc.zsh"
        "$HOME/code/outfitting/system/common/zsh/hm-profile.inc.zsh"
    )
    if [ -L "$HOME/.config/home-manager" ]; then
        candidates+=("$(/bin/readlink -f "$HOME/.config/home-manager")/../common/zsh/hm-profile.inc.zsh")
    fi
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
