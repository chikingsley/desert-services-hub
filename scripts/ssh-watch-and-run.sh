#!/usr/bin/env bash
set -euo pipefail

PROGRAM_NAME="$(basename "$0")"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

HOST=""
TAILSCALE_HOST=""
SSH_USER=""
PORT=22
PORT_WAS_SET=0
IDENTITY_FILE=""
IDENTITY_FILE_WAS_SET=0
MODE="auto"
INTERVAL_SECONDS=30
CONNECT_TIMEOUT=8
MAX_ATTEMPTS=0
REPEAT_MODE=0
ALLOW_DESTRUCTIVE=0
LOG_FILE=""
NOTIFY_COMMAND=""
PROBE_COMMAND="true"
REMOTE_COMMAND=""
KNOWN_HOST_POLICY="accept-new"
declare -a DELETE_PATHS=()

RESOLVED_USER=""
RESOLVED_PORT=""
RESOLVED_IDENTITY_FILE=""

LAST_OUTPUT=""
LAST_METHOD=""

usage() {
  cat <<'EOF'
Usage:
  ssh-watch-and-run.sh --host HOST [options]

Poll a remote host until SSH becomes reachable, then run one remote action and
notify locally. By default it tries direct SSH first and falls back to SSH over
Tailscale transport.

Required:
  --host HOST                 SSH host alias or hostname to watch

Remote action:
  --remote-command CMD        Shell command to run remotely once the host is up
  --delete-path PATH          Remote path to remove with rm -rf (repeatable)
  --allow-destructive         Required when using --delete-path

Connection options:
  --tailscale-host HOST       MagicDNS or Tailscale host to use for fallback
                              transport. Defaults to --host.
  --user USER                 SSH username. Defaults to ssh -G resolution.
  --port PORT                 SSH port. Defaults to ssh -G resolution or 22.
  --identity-file PATH        SSH private key path.
  --mode MODE                 One of: auto, ssh, tailscale-proxy
  --known-host-policy POLICY  SSH StrictHostKeyChecking policy. Default:
                              accept-new
  --probe-command CMD         Command used to test reachability. Default: true

Polling options:
  --interval SECONDS          Poll interval. Default: 30
  --connect-timeout SECONDS   SSH connect timeout. Default: 8
  --max-attempts COUNT        Stop after COUNT failed polls. 0 means forever.
  --repeat                    Stay running and trigger again on next down->up
                              transition instead of exiting after success.

Notifications and logging:
  --notify-command CMD        Local shell command run on success or failure.
                              Env vars: SSH_WATCH_HOST, SSH_WATCH_METHOD,
                              SSH_WATCH_LEVEL, SSH_WATCH_MESSAGE
  --log-file PATH             Log file. Defaults to logs/ssh-watch-HOST.log

Examples:
  ssh-watch-and-run.sh \
    --host home-mac \
    --remote-command 'echo connected on $(hostname)'

  ssh-watch-and-run.sh \
    --host work-mac \
    --tailscale-host work-mac \
    --user chiejimofor \
    --delete-path '~/github' \
    --allow-destructive \
    --interval 20
EOF
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 2
}

expand_home_path() {
  local path="$1"
  if [[ "$path" == "~/"* ]]; then
    printf '%s/%s\n' "$HOME" "${path:2}"
    return
  fi

  if [[ "$path" == "~" ]]; then
    printf '%s\n' "$HOME"
    return
  fi

  printf '%s\n' "$path"
}

shell_quote() {
  local value="$1"
  value=${value//\'/\'\\\'\'}
  printf "'%s'" "$value"
}

remote_path_expr() {
  local path="$1"

  if [[ "$path" == "~" ]]; then
    printf '"$HOME"'
    return
  fi

  if [[ "$path" == "~/"* ]]; then
    printf '"$HOME"/%s' "$(shell_quote "${path:2}")"
    return
  fi

  shell_quote "$path"
}

default_log_file_for_host() {
  local safe_host
  safe_host="${HOST//[^A-Za-z0-9._-]/_}"
  printf '%s/logs/ssh-watch-%s.log\n' "$REPO_ROOT" "$safe_host"
}

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

log_message() {
  local level="$1"
  shift
  local message="$*"
  local line
  line="$(timestamp) [$level] $message"
  printf '%s\n' "$line"
  mkdir -p -- "$(dirname -- "$LOG_FILE")"
  printf '%s\n' "$line" >>"$LOG_FILE"
  if command -v logger >/dev/null 2>&1; then
    logger -t "$PROGRAM_NAME" -- "$message"
  fi
}

notify_local() {
  local level="$1"
  shift
  local message="$*"

  log_message "$level" "$message"

  if command -v notify-send >/dev/null 2>&1 && { [[ -n "${DISPLAY:-}" ]] || [[ -n "${WAYLAND_DISPLAY:-}" ]]; }; then
    notify-send "$PROGRAM_NAME [$level]" "$message" || true
  fi

  if [[ -n "$NOTIFY_COMMAND" ]]; then
    SSH_WATCH_HOST="$HOST" \
      SSH_WATCH_METHOD="$LAST_METHOD" \
      SSH_WATCH_LEVEL="$level" \
      SSH_WATCH_MESSAGE="$message" \
      bash -lc "$NOTIFY_COMMAND" || true
  fi
}

capture_command() {
  local output status errexit_was_on=0
  if [[ $- == *e* ]]; then
    errexit_was_on=1
    set +e
  fi

  output="$("$@" 2>&1)"
  status=$?

  if [[ "$errexit_was_on" -eq 1 ]]; then
    set -e
  fi

  LAST_OUTPUT="$output"
  return "$status"
}

resolve_ssh_defaults() {
  local raw_line key value fallback_identity=""

  while IFS= read -r raw_line; do
    key="${raw_line%% *}"
    value="${raw_line#"$key" }"

    case "$key" in
      user)
        if [[ -z "$RESOLVED_USER" ]]; then
          RESOLVED_USER="$value"
        fi
        ;;
      port)
        if [[ -z "$RESOLVED_PORT" ]]; then
          RESOLVED_PORT="$value"
        fi
        ;;
      identityfile)
        value="$(expand_home_path "$value")"
        if [[ -z "$fallback_identity" ]]; then
          fallback_identity="$value"
        fi
        if [[ -f "$value" ]]; then
          RESOLVED_IDENTITY_FILE="$value"
        fi
        ;;
    esac
  done < <(ssh -G "$HOST" 2>/dev/null || true)

  if [[ -z "$RESOLVED_IDENTITY_FILE" && -n "$fallback_identity" ]]; then
    RESOLVED_IDENTITY_FILE="$fallback_identity"
  fi

  if [[ -z "$SSH_USER" && -n "$RESOLVED_USER" ]]; then
    SSH_USER="$RESOLVED_USER"
  fi

  if [[ "$PORT_WAS_SET" -eq 0 && -n "$RESOLVED_PORT" ]]; then
    PORT="$RESOLVED_PORT"
  fi

  if [[ "$IDENTITY_FILE_WAS_SET" -eq 0 && -n "$RESOLVED_IDENTITY_FILE" ]]; then
    IDENTITY_FILE="$RESOLVED_IDENTITY_FILE"
  fi
}

ssh_common_options() {
  local -a opts
  opts=(
    -o "BatchMode=yes"
    -o "ConnectTimeout=${CONNECT_TIMEOUT}"
    -o "StrictHostKeyChecking=${KNOWN_HOST_POLICY}"
    -p "$PORT"
  )

  if [[ -n "$IDENTITY_FILE" ]]; then
    opts+=(-i "$IDENTITY_FILE" -o "IdentitiesOnly=yes")
  fi

  printf '%s\n' "${opts[@]}"
}

build_direct_target() {
  if [[ -n "$SSH_USER" ]]; then
    printf '%s@%s\n' "$SSH_USER" "$HOST"
    return
  fi

  printf '%s\n' "$HOST"
}

build_tailscale_target() {
  if [[ -n "$SSH_USER" ]]; then
    printf '%s@%s\n' "$SSH_USER" "$TAILSCALE_HOST"
    return
  fi

  printf '%s\n' "$TAILSCALE_HOST"
}

run_direct_ssh() {
  local remote_command="$1"
  local -a cmd opts
  mapfile -t opts < <(ssh_common_options)
  cmd=(ssh "${opts[@]}" "$(build_direct_target)" "$remote_command")
  capture_command "${cmd[@]}"
}

run_tailscale_proxy_ssh() {
  local remote_command="$1"
  local -a cmd opts
  mapfile -t opts < <(ssh_common_options)
  cmd=(
    ssh
    -F /dev/null
    "${opts[@]}"
    -o "UserKnownHostsFile=${HOME}/.ssh/known_hosts"
    -o "ProxyCommand=tailscale nc %h %p"
    "$(build_tailscale_target)"
    "$remote_command"
  )
  capture_command "${cmd[@]}"
}

probe_host() {
  case "$MODE" in
    ssh)
      LAST_METHOD="direct-ssh"
      run_direct_ssh "$PROBE_COMMAND"
      return
      ;;
    tailscale-proxy)
      LAST_METHOD="tailscale-proxy"
      run_tailscale_proxy_ssh "$PROBE_COMMAND"
      return
      ;;
    auto)
      LAST_METHOD="direct-ssh"
      if run_direct_ssh "$PROBE_COMMAND"; then
        return 0
      fi
      local direct_output="$LAST_OUTPUT"

      if ! command -v tailscale >/dev/null 2>&1; then
        LAST_OUTPUT="$direct_output"
        return 1
      fi

      LAST_METHOD="tailscale-proxy"
      if run_tailscale_proxy_ssh "$PROBE_COMMAND"; then
        return 0
      fi

      LAST_OUTPUT=$'direct-ssh:\n'"$direct_output"$'\n\ntailscale-proxy:\n'"$LAST_OUTPUT"
      return 1
      ;;
  esac
}

build_remote_action() {
  if [[ -n "$REMOTE_COMMAND" ]]; then
    printf '%s\n' "$REMOTE_COMMAND"
    return
  fi

  if [[ "${#DELETE_PATHS[@]}" -eq 0 ]]; then
    fail "Provide either --remote-command or --delete-path"
  fi

  if [[ "$ALLOW_DESTRUCTIVE" -ne 1 ]]; then
    fail "--delete-path requires --allow-destructive"
  fi

  local expr path
  expr="rm -rf --"
  for path in "${DELETE_PATHS[@]}"; do
    expr+=" $(remote_path_expr "$path")"
  done

  printf '%s\n' "$expr"
}

execute_remote_action() {
  local remote_action="$1"
  case "$LAST_METHOD" in
    direct-ssh)
      run_direct_ssh "$remote_action"
      ;;
    tailscale-proxy)
      run_tailscale_proxy_ssh "$remote_action"
      ;;
    *)
      fail "No execution method selected"
      ;;
  esac
}

validate_args() {
  case "$MODE" in
    auto|ssh|tailscale-proxy)
      ;;
    *)
      fail "Unsupported mode: $MODE"
      ;;
  esac

  if [[ -z "$HOST" ]]; then
    fail "--host is required"
  fi

  if [[ -z "$TAILSCALE_HOST" ]]; then
    TAILSCALE_HOST="$HOST"
  fi

  if [[ -z "$LOG_FILE" ]]; then
    LOG_FILE="$(default_log_file_for_host)"
  fi

  LOG_FILE="$(expand_home_path "$LOG_FILE")"

  if [[ -n "$IDENTITY_FILE" ]]; then
    IDENTITY_FILE="$(expand_home_path "$IDENTITY_FILE")"
    if [[ ! -f "$IDENTITY_FILE" ]]; then
      if [[ "$IDENTITY_FILE_WAS_SET" -eq 1 ]]; then
        fail "Identity file not found: $IDENTITY_FILE"
      fi
      printf 'WARN: resolved identity file does not exist, skipping explicit key: %s\n' "$IDENTITY_FILE" >&2
      IDENTITY_FILE=""
    fi
  fi

  if [[ -n "$REMOTE_COMMAND" && "${#DELETE_PATHS[@]}" -gt 0 ]]; then
    fail "Use either --remote-command or --delete-path, not both"
  fi

  if [[ -z "$REMOTE_COMMAND" && "${#DELETE_PATHS[@]}" -eq 0 ]]; then
    fail "Provide either --remote-command or --delete-path"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST="$2"
      shift 2
      ;;
    --tailscale-host)
      TAILSCALE_HOST="$2"
      shift 2
      ;;
    --user)
      SSH_USER="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      PORT_WAS_SET=1
      shift 2
      ;;
    --identity-file)
      IDENTITY_FILE="$2"
      IDENTITY_FILE_WAS_SET=1
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    --interval)
      INTERVAL_SECONDS="$2"
      shift 2
      ;;
    --connect-timeout)
      CONNECT_TIMEOUT="$2"
      shift 2
      ;;
    --max-attempts)
      MAX_ATTEMPTS="$2"
      shift 2
      ;;
    --repeat)
      REPEAT_MODE=1
      shift
      ;;
    --allow-destructive)
      ALLOW_DESTRUCTIVE=1
      shift
      ;;
    --notify-command)
      NOTIFY_COMMAND="$2"
      shift 2
      ;;
    --log-file)
      LOG_FILE="$2"
      shift 2
      ;;
    --probe-command)
      PROBE_COMMAND="$2"
      shift 2
      ;;
    --remote-command)
      REMOTE_COMMAND="$2"
      shift 2
      ;;
    --delete-path)
      DELETE_PATHS+=("$2")
      shift 2
      ;;
    --known-host-policy)
      KNOWN_HOST_POLICY="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

if [[ "$HOST" == *"@"* && -z "$SSH_USER" ]]; then
  SSH_USER="${HOST%@*}"
  HOST="${HOST#*@}"
fi

resolve_ssh_defaults
validate_args

remote_action="$(build_remote_action)"

log_message "INFO" \
  "Starting watch: host=$HOST tailscale_host=$TAILSCALE_HOST mode=$MODE user=${SSH_USER:-<ssh-default>} port=$PORT repeat=$REPEAT_MODE interval=${INTERVAL_SECONDS}s"

if [[ -n "$IDENTITY_FILE" ]]; then
  log_message "INFO" "Using identity file: $IDENTITY_FILE"
fi

attempt=0
last_reachability="down"

while :; do
  attempt=$((attempt + 1))

  if probe_host; then
    if [[ "$last_reachability" != "up" ]]; then
      log_message "INFO" "Host became reachable via $LAST_METHOD on attempt $attempt"
      if execute_remote_action "$remote_action"; then
        notify_local "SUCCESS" "Remote action completed via $LAST_METHOD for $HOST"
      else
        notify_local "ERROR" "Remote action failed via $LAST_METHOD for $HOST: $LAST_OUTPUT"
        if [[ "$REPEAT_MODE" -eq 0 ]]; then
          exit 1
        fi
      fi
    else
      log_message "INFO" "Host still reachable via $LAST_METHOD; waiting for next transition"
    fi

    last_reachability="up"

    if [[ "$REPEAT_MODE" -eq 0 ]]; then
      exit 0
    fi
  else
    if [[ "$last_reachability" != "down" ]]; then
      log_message "WARN" "Host is no longer reachable: $LAST_OUTPUT"
    else
      log_message "INFO" "Probe failed on attempt $attempt: $LAST_OUTPUT"
    fi

    last_reachability="down"

    if [[ "$MAX_ATTEMPTS" -gt 0 && "$attempt" -ge "$MAX_ATTEMPTS" ]]; then
      notify_local "ERROR" "Reached max attempts for $HOST without a successful probe"
      exit 1
    fi
  fi

  sleep "$INTERVAL_SECONDS"
done
