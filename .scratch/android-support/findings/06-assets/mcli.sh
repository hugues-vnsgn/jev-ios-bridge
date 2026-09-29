#!/bin/zsh
# Run the pinned mobilecli binary with the guard environment from docs/research/mobilecli-dependency.md.
# Refuses to run unless the private adb server on 5098 lists only emulator-5554.
export ANDROID_ADB_SERVER_PORT=5098
devs=$(~/Library/Android/sdk/platform-tools/adb -P 5098 devices | tail -n +2 | awk 'NF{print $1}' | tr '\n' ' ')
[ "$devs" = "emulator-5554 " ] || { echo "REFUSING: adb 5098 lists: $devs" >&2; exit 99; }
unset MOBILECLI_TOKEN
export XDG_CONFIG_HOME=/tmp/jev-mcli-06/xdg MOBILECLI_HOME=/tmp/jev-mcli-06/home MOBILECLI_FLEET_URL=ws://127.0.0.1:9 \
  USBMUXD_SOCKET_ADDRESS=/tmp/jev-mcli-06/no-usbmuxd
exec /tmp/jev-mcli-06/node_modules/@mobilenext/mobilecli-darwin-arm64/mobilecli-darwin-arm64 --insecure-storage "$@"
