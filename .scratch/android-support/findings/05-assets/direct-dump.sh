#!/bin/sh
# Ask mobilecli's on-device DeviceServer for its UI tree directly, over the adb forward mobilecli made.
# Usage: direct-dump.sh <local-port> > out.json
curl -s -X POST "http://127.0.0.1:$1/" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":"1","method":"device.dump.ui","params":{"waitUntilIdle":2000}}'
