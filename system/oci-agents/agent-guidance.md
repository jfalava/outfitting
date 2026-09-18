# oci-agents host guidance

- This is a persistent shared host, not an ephemeral Amp orb.
- Work under `/home/jfalava/code` and inspect `git status` before changing a checkout.
- Use separate Git worktrees when Amp, T3 Code, and OpenCode work concurrently. Never have two harnesses edit the same checkout at the same time.
- Nix/Home Manager owns packages and declarative configuration. Do not overwrite `~/.t3/userdata`, provider login state, or the OpenCode service password file.
- Network services are Tailscale-only. Do not add public listeners or firewall exposure.
- GitHub SSH uses `~/.ssh/jfalava-gitAuth-elliptic` (see shared `ssh.config`). The login shell starts a local ssh-agent when forwarding is absent; passphrase-protected keys still need one interactive `ssh-add`.
- Use the repository's `AGENTS.md` and project-specific verification commands for code changes.
