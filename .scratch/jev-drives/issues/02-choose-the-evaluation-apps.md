# Choose the evaluation apps

Type: research
Status: resolved
Blocked by: none

## Question

Which apps do the offline spike and the live prototype use, so the result says something about *other developers'* apps, not only the owner's app (Codex Q9, Q11)?

- Several unrelated apps with different UI frameworks (SwiftUI, UIKit, Compose Multiplatform, Jetpack Compose, Android Views) and different accessibility quality (good identifiers, label-only, icon-only controls, a canvas or map screen).
- At least one app maintained outside this repo, with a public build we can install on a simulator or emulator. the owner's app stays as one case; this repo's example apps can be others.
- For each app: how to build and install it, its test data and login, whether it can write to a backend, and how a preflight could prove a test environment (Codex Q14).
- Which platforms each app covers. The platform comes from the skill or prompt (Codex Q5, Q10), and each platform gets its own gate.

Output: a short list with one line per app, owner-approved before ticket 03 freezes its cases.

## Answer

Resolved 2026-10-01 with the owner. Details: [research/evaluation-apps.md](../research/evaluation-apps.md).

**Offline spike (ticket 03): every app below.**

| App | Platform | Framework | Maintainer |
|---|---|---|---|
| the owner's app (SM flows) | iOS + Android | Compose Multiplatform 1.9 | owner |
| KotlinConf app | iOS + Android | Compose Multiplatform 1.11 | JetBrains |
| NetNewsWire | iOS | UIKit + SwiftUI | outside |
| ReadMe (Kodeco SwiftUI course) | iOS | SwiftUI | owner's course copy |
| Now in Android, demo build | Android | Jetpack Compose | Google |
| Fossify Calendar | Android | Android Views | outside |
| ListMaker (Kodeco Android course) | Android | Jetpack Compose | owner's course copy |
| Weather mock + Apple Contacts/Reminders/Settings | iOS | SwiftUI / Apple | spike-only extra screens, comparable with v0.1 |

The two `examples/diagnostic-app*` apps are smoke checks for the loop, not evaluation apps.

**Owner decisions (Q1–Q6 of this ticket):**

1. The release gate (≥ 60 accepted Jev actions per app) runs on 3 apps per platform: **iOS** the owner's app, NetNewsWire, KotlinConf; **Android** the owner's app, Now in Android, Fossify Calendar. ReadMe and ListMaker, the Apple apps and Weather are spike and prototype cases. (The owner may later swap ReadMe/ListMaker into the gate set.)
2. KotlinConf is read-only: no votes or feedback.
3. Changing content: the spike uses frozen captures. Live runs: NetNewsWire reads a local feed file we control; KotlinConf checks don't depend on specific talk titles.
4. Apple's built-in apps are extra screens only, not "other developers' apps".
5. Wikipedia stays a backup, not in the set.
6. The first KotlinConf iOS build gets one hour; if it fails, KotlinConf is Android-only and iOS is covered by the owner's app, NetNewsWire and ReadMe.

Also: disk is not a limit (85 GB free). ListMaker needs JDK 17 to build.
