#!/bin/zsh
# Usage: run-probe.sh <label> <mode> [restart]  Streams --uid, --pid and whole-log logcat around one probe launch.
export ANDROID_ADB_SERVER_PORT=5098
ADB=~/Library/Android/sdk/platform-tools/adb; S=emulator-5554; PKG=dev.jevbridge.logprobe
LABEL=$1; MODE=$2; OUT=/tmp/jev-06/$LABEL; mkdir -p $OUT; cd "${0:A:h}"
UID_=$($ADB -s $S shell pm list packages -U $PKG | sed -n 's/.*uid:\([0-9]*\).*/\1/p' | tr -d '\r')
$ADB -s $S shell am force-stop $PKG
sleep 1
START=$($ADB -s $S shell 'date +%s.%3N' | tr -d '\r')
node stamp.mjs $OUT/uid.log $ADB -s $S logcat -v threadtime,year,uid --uid=$UID_ -T $START &
P1=$!
node stamp.mjs $OUT/all.log $ADB -s $S logcat -b main,system,crash,events -v threadtime,year,uid -T $START &
P2=$!
node stamp.mjs $OUT/crashbuf.log $ADB -s $S logcat -b crash -v threadtime,year,uid -T $START &
P3=$!
T0=$(python3 -c 'import time;print(int(time.time()*1000))')
$ADB -s $S shell am start -W -n $PKG/.MainActivity --es mode $MODE --es secret hunter2-SECRET > $OUT/start.txt
PID=$($ADB -s $S shell pidof $PKG | tr -d '\r')
echo "t0=$T0 pid=$PID uid=$UID_" > $OUT/meta.txt
node stamp.mjs $OUT/pid.log $ADB -s $S logcat -v threadtime,year,uid --pid=$PID -T $START &
P4=$!
# Poll pidof every 100 ms for 12 s, recording when the answer changes.
node poll-pidof.mjs $PKG 12000 > $OUT/pidof.log
if [ "$3" = restart ]; then
  $ADB -s $S shell am force-stop $PKG
  $ADB -s $S shell am start -W -n $PKG/.MainActivity --es mode normal > $OUT/restart.txt
  echo "restart pid=$($ADB -s $S shell pidof $PKG | tr -d '\r')" >> $OUT/meta.txt
  sleep 3
fi
kill -TERM $P1 $P2 $P3 $P4; wait
