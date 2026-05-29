# SSH Watch And Run

`[scripts/ssh-watch-and-run.sh](/home/simon/github/desert-services-hub/scripts/ssh-watch-and-run.sh)` polls a host until SSH becomes reachable, then runs one remote action and notifies locally.

It is designed for the workflow you described:

- keep polling for a machine like `work-mac`
- try the normal SSH path first
- fall back to SSH over Tailscale transport
- run a remote action once the box is reachable
- leave a local log and optional notification hook

## What It Supports

- `--mode auto`: direct SSH first, then `tailscale nc` transport
- `--remote-command '...'`: run any remote shell command
- `--delete-path ... --allow-destructive`: explicit remote delete mode
- `--repeat`: stay armed and trigger again on the next down -> up transition
- `--notify-command '...'`: run any local command when it succeeds or fails
- automatic `ssh -G` resolution for user, port, and identity file when a host alias already exists in `~/.ssh/config`

## Safe First Test

Use `home-mac` first because it already accepts SSH from this machine:

```bash
/home/simon/github/desert-services-hub/scripts/ssh-watch-and-run.sh \
  --host home-mac \
  --remote-command 'mkdir -p "$HOME/.cache/ssh-watch-test" && date > "$HOME/.cache/ssh-watch-test/ran.txt"' \
  --notify-command 'printf "%s\n" "$SSH_WATCH_LEVEL: $SSH_WATCH_MESSAGE"'
```

That should execute immediately if `home-mac` is up.

Verify:

```bash
ssh home-mac 'cat "$HOME/.cache/ssh-watch-test/ran.txt"'
```

## Safe Delete Test

After the first test works, verify the delete flow with a disposable directory:

```bash
/home/simon/github/desert-services-hub/scripts/ssh-watch-and-run.sh \
  --host home-mac \
  --delete-path '~/.cache/ssh-watch-test' \
  --allow-destructive \
  --notify-command 'printf "%s\n" "$SSH_WATCH_LEVEL: $SSH_WATCH_MESSAGE"'
```

## Work-Mac Example

When you are ready to arm it for `work-mac`, keep the delete explicit:

```bash
/home/simon/github/desert-services-hub/scripts/ssh-watch-and-run.sh \
  --host work-mac \
  --tailscale-host work-mac \
  --user chiejimofor \
  --mode auto \
  --interval 20 \
  --repeat \
  --delete-path '~/github' \
  --allow-destructive \
  --notify-command 'logger -t ssh-watch "$SSH_WATCH_LEVEL: $SSH_WATCH_MESSAGE"'
```

Notes:

- `work-mac` is currently not reachable from this machine, so the script will poll and wait.
- If direct SSH ever works first, it will use that.
- If direct SSH fails but Tailscale transport works, it will use the Tailscale path.

## Deploy It As A User Service

If you want it always running in the background, use a user service:

```ini
[Unit]
Description=Watch work-mac and run a remote cleanup when it becomes reachable
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/home/simon/github/desert-services-hub/scripts/ssh-watch-and-run.sh \
  --host work-mac \
  --tailscale-host work-mac \
  --user chiejimofor \
  --mode auto \
  --interval 20 \
  --repeat \
  --delete-path '~/github' \
  --allow-destructive \
  --notify-command 'logger -t ssh-watch "$SSH_WATCH_LEVEL: $SSH_WATCH_MESSAGE"'
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

Save that to `~/.config/systemd/user/ssh-watch-work-mac.service`, then:

```bash
systemctl --user daemon-reload
systemctl --user enable --now ssh-watch-work-mac.service
journalctl --user -u ssh-watch-work-mac.service -f
```

## Logs

By default the script writes a log file under:

```text
/home/simon/github/desert-services-hub/logs/ssh-watch-HOST.log
```

Override it with `--log-file`.
