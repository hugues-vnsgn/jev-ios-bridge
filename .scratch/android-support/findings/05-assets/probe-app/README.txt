Throwaway Compose probe app for ticket 05 (package dev.jevbridge.actionsprobe).
Built by copying examples/diagnostic-app-android (its gradle wrapper, build.gradle.kts, gradle.properties,
local.properties) next to these files, then `./gradlew --offline :app:assembleDebug`.
Screens: fields (plain, password, phone with a visual transformation, uppercasing, two classic EditTexts),
lists (LazyColumn, LazyRow, Column.verticalScroll, with a scroll-state echo), anim (800 ms slide-in panel,
1500 ms counter, infinite spinner).
Two more screens open only through intent extra `screen`; the app still starts on fields without it:
noid (a Compose TextField with no test tag, so no resource id, and its echo) and slow (the UI thread busy for
`busyMs` of every cycle, 2500 by default, at most 4500, while 41 texts change each cycle). Slow is meant to keep
a page source read pending past the bridge's 3 s settle cap. That is unmeasured: raise `busyMs` if reads settle.
