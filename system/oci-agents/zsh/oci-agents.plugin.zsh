# shellcheck shell=bash
# oci-agents interactive helpers without a native Home Manager option.

OUTFITTING_HM_DIR="system/oci-agents"
OUTFITTING_HM_ATTR="oci-agents"

# Load shared hm-* (manager first, native fallback). Prefer the always-installed
# outfitting plugin dir, then monorepo/sparse/checkout paths.
_oci_source_hm_profile() {
    local plugin_path plugin_dir candidates path
    # funcfiletrace[1] is this file when sourced; strip its line suffix.
    # zsh provides funcfiletrace as a special array.
    # shellcheck disable=SC2154
    plugin_path="${funcfiletrace[1]%:*}"
    plugin_dir="${plugin_path:A:h}"
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
_oci_source_hm_profile
unset -f _oci_source_hm_profile

# Ensure the user bus address exists for libsecret / gnome-keyring consumers.
# The daemon itself is started by gnome-keyring-unlock.service / .profile.
if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
    _oci_runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
    if [ -S "$_oci_runtime_dir/bus" ]; then
        export DBUS_SESSION_BUS_ADDRESS="unix:path=$_oci_runtime_dir/bus"
    fi
    unset _oci_runtime_dir
fi
