# shellcheck shell=zsh
# oci-agents interactive helpers without a native Home Manager option.

OUTFITTING_HM_DIR="system/oci-agents"
OUTFITTING_HM_ATTR="oci-agents"

_oci_source_hm_profile() {
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
_oci_source_hm_profile
unset -f _oci_source_hm_profile

# Ensure the user bus address exists for libsecret / gnome-keyring consumers.
if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
    _oci_runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
    if [ -S "$_oci_runtime_dir/bus" ]; then
        export DBUS_SESSION_BUS_ADDRESS="unix:path=$_oci_runtime_dir/bus"
    fi
    unset _oci_runtime_dir
fi
