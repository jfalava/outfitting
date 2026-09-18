# oci-agents

Headless Home Manager profile for the Pulumi-managed `oci-agents` machine.
The expected Linux user is `jfalava` with home directory `/home/jfalava`.

## First activation

Run this as `jfalava` after Pulumi/cloud-init has installed Nix and created the
user account:

```sh
git clone https://github.com/jfalava/outfitting /home/jfalava/.config/outfitting/repo
cd /home/jfalava/.config/outfitting/repo
./system/oci-agents/bootstrap.sh
```

The bootstrap installs the upstream Amp and T3 Code CLIs, activates the locked
Home Manager profile, sets the login shell to zsh, enables user lingering,
brings up the user systemd session bus when needed, and starts the Amp, T3, and
OpenCode services. It does not authenticate any service.

After bootstrap, open a **new SSH session** (or `exec zsh`) so the Home Manager
zsh profile loads. The profile:

- starts a local `ssh-agent` when agent forwarding is absent
- auto-loads `~/.ssh/jfalava-gitAuth-elliptic` (or legacy `id-ed25519`) when the agent is empty
- exports `DBUS_SESSION_BUS_ADDRESS` for libsecret / GNOME Keyring

Shared SSH config prefers `jfalava-gitAuth-elliptic` for `github.com`.

## Authentication and access

Authenticate on the machine:

```sh
# once, if the key was not auto-loaded (passphrase-protected keys)
ssh-add ~/.ssh/jfalava-gitAuth-elliptic

amp login
opencode auth login
t3 pair --tailscale
```

Use the generated T3 pairing link from a client on the tailnet. OpenCode is
available on the tailnet at `http://oci-agents:4096`; its password is stored in
`~/.config/opencode/service.env`.

Inspect the persistent services with:

```sh
systemctl --user status amp-runner.service t3code.service opencode-web.service
```

Do not run `t3 service install`; the T3 service is managed by Home Manager so
its Tailscale endpoint and provider `PATH` remain explicit.
