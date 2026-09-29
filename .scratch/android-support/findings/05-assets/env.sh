# Source this before any device command in ticket 05.
# Private adb server (port 5099, no USB phones) and a sandboxed mobilecli.
export ANDROID_ADB_SERVER_PORT=5099
export ADB=~/Library/Android/sdk/platform-tools/adb
export XDG_CONFIG_HOME=/tmp/jev-mcli-05/xdg
export MOBILECLI_HOME=/tmp/jev-mcli-05/home
export MOBILECLI_FLEET_URL=ws://127.0.0.1:9
export USBMUXD_SOCKET_ADDRESS=/tmp/jev-mcli-05/no-usbmuxd
unset MOBILECLI_TOKEN
MCLI_BIN=/tmp/jev-mcli-05/node_modules/@mobilenext/mobilecli-darwin-arm64/mobilecli-darwin-arm64
S=emulator-5560
D=jev-actions-api31
# Refuse to run if any non-emulator device is on the private server.
guard() {
  local bad
  bad=$($ADB -P 5099 devices | awk 'NR>1 && $1!="" && $1 !~ /^emulator-/ {print $1}')
  if [ -n "$bad" ]; then echo "STOP: non-emulator device on port 5099: $bad" >&2; return 1; fi
}
mcli() { guard || return 1; "$MCLI_BIN" --insecure-storage "$@"; }
a() { $ADB -P 5099 -s $S "$@"; }
now() { python3 -c 'import time;print(time.time())'; }
