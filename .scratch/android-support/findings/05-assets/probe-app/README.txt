Throwaway Compose probe app for ticket 05 (package dev.jevbridge.actionsprobe).
Built by copying examples/diagnostic-app-android (its gradle wrapper, build.gradle.kts, gradle.properties,
local.properties) next to these files, then `./gradlew --offline :app:assembleDebug`.
Screens: fields (plain, password, phone with a visual transformation, uppercasing, two classic EditTexts),
lists (LazyColumn, LazyRow, Column.verticalScroll, with a scroll-state echo), anim (800 ms slide-in panel,
1500 ms counter, infinite spinner).
