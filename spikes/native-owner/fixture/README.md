# Owned native-owner fixture

This newly authored Objective-C UIKit fixture adapts the behavior of the owned
`NativeIdentityPrototype/ReachabilityFixture.swift` experiment at
`894bf6dd9f5f045603d727df6c2c7c1967b3a115`. It copies no WDA Implementation.
The ordinary button has identical frame/title/identifier after replacement.

`Documents/result.txt` is atomic UTF-8 JSON with exactly `pid`, `generation` and
`ordinary` integer fields. A successfully consumed `Documents/recreate.request`
replaces the button and increments generation, without input. Actual ordinary
button activation increments its separate `ordinary` counter. The app opens no
network connection. Fixture telemetry establishes its own state only; it cannot
certify native identity, accessibility association lifetime or input release.
