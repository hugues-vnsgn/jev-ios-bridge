#!/bin/zsh
# Builds the throwaway log probe with the SDK build tools only (no Gradle). Output: /tmp/jev-logprobe/probe.apk
set -e
cd "${0:A:h}"
SDK=~/Library/Android/sdk; BT=$SDK/build-tools/36.0.0; JAR=$SDK/platforms/android-36/android.jar; OUT=/tmp/jev-logprobe
rm -rf $OUT; mkdir -p $OUT/classes $OUT/dex
$BT/aapt2 link --manifest AndroidManifest.xml -I $JAR -o $OUT/unsigned.apk
javac --release 11 -cp $JAR -d $OUT/classes src/dev/jevbridge/logprobe/*.java
$BT/d8 --min-api 24 --lib $JAR --output $OUT/dex $OUT/classes/dev/jevbridge/logprobe/*.class
(cd $OUT/dex && zip -q -j ../unsigned.apk classes.dex)
$BT/zipalign -f 4 $OUT/unsigned.apk $OUT/aligned.apk
# A throwaway signing key, made here and deleted with /tmp/jev-logprobe.
keytool -genkeypair -keystore $OUT/throwaway.jks -storepass probe123 -keypass probe123 -alias probe \
  -keyalg RSA -keysize 2048 -validity 1 -dname CN=probe >/dev/null 2>&1
$BT/apksigner sign --ks $OUT/throwaway.jks --ks-pass pass:probe123 --out $OUT/probe.apk $OUT/aligned.apk
ls -la $OUT/probe.apk
