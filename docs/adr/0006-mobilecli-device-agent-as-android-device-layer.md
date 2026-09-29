---
status: accepted
date: 2026-09-29
---

# mobilecli's device agent, driven directly, is the Android device layer

On Android the bridge needs what MobileBuildMCP gives it on iOS: read the screen's accessibility elements, tap, type, swipe and take screenshots. We use the on-device agent from mobile-next's mobilecli, pinned at `mobilecli@1.0.14`, but we don't run mobilecli.

The agent is an Android DEX file built into the mobilecli program. The bridge copies it out of the pinned npm package at run time, checks its SHA-256 (`0e0865d0617bc6e4abf0a7b24a956da1ca25cfc795c30d8e32c64eb0d1f6258f`), pushes it to the device with `adb`, starts it, forwards a local port to it, and speaks its JSON-RPC directly. Plain `adb` does the rest: device checks, restarting the app with intent extras, logcat, and the port forward.

The agent covers everything the bridge needs ([research](../research/mobilecli-dependency.md); [domain model](../../.scratch/android-support/domain-model.md#facts-checked-in-this-session)):
- reading the tree with its `scrollable` and `password` flags, which mobilecli's own `dump ui` drops;
- tap, swipe, key chords and typing, including non-English text through its clipboard;
- screenshots.

mobilecli's CLI adds only a host daemon. Any command starts it, it's shared per home folder, it restarts daemons of other versions, it caches serials, it queries every connected phone and paired iPhone, and it looks for a cloud token in the keychain. Containing it took a private home per run, network guards and extra cleanup.

## Considered options

- **mobilecli's CLI and daemon, with a direct read of the tree:** the plan accepted before this ADR. Rejected, because the daemon was most of the risk and none of the capability.
- **mobile-mcp:** rejected. It sends PostHog and Scarf telemetry and pulls in Playwright.
- **Our own `adb` and uiautomator driver:** rejected, and kept as the fallback. `adb shell input text` was slower at 100 characters and can't type non-English text reliably ("Actions across Android versions", in `.scratch/android-support/`).
- **Building the agent from mobilecli's source ourselves:** rejected. It needs the Android build tools, and we'd ship a file built from FSL code.
- **The abandoned `@mobilenext/mobilecli` npm name:** not used.

## Consequences

- **The licence is FSL-1.1-ALv2:** source-available, not open source.
  - The bridge uses the agent as a tool for its own purpose, which the licence permits. A hosted "run your app on devices" service built on it could count as a "Competing Use".
  - Each release becomes Apache-2.0 two years after it ships, so 1.0.14 converts on 2028-09-27. Before 2026-05-24 it was AGPL-3.0, and the npm "MIT" label up to 1.0.11 was a packaging error.
  - The bridge doesn't redistribute it: npm installs mobilecli from the registry, and the agent is copied on the user's own machine. So the bridge stays MIT. The owner accepted this trade-off.
- **We depend on mobilecli's internals:** how it builds the agent into its program, and the agent's protocol. The pinned SHA-256 catches any change before the agent reaches a device, and a mismatch is `ANDROID_TOOLS_UNAVAILABLE`.
  - mobilecli shipped 12 releases in 5 weeks, so upgrades are deliberate.
  - Adopting a new version means copying out its agent, pinning the new hash, passing the contract tests, and having the Android evidence scripts keep their verdicts. It ships as a minor release.
- **The bridge never runs mobilecli.** So:
  - no daemon, no cloud or token lookup, and no query of other phones or paired iPhones;
  - the agent listens only on the device's local socket, which `adb forward` reaches from `127.0.0.1`.
- **Android allows one UI-automation agent per device.** The bridge refuses a device held by a foreign agent with `DEVICE_BUSY`, and kills only its own agent, which it keeps at its own path on the device. A crashed run's leftover agent and forward are swept by the next run that takes the device lease.
- **Stopping the agent is the fence.** Once the agent is confirmed gone, no agent command whose outcome was unknown can still take effect. The device lease can then be released, which is proof that nothing the run started can still act on the device.
- **Android's view has its own gate.** [ADR-0004](0004-fixed-assertion-bounds-single-judgment.md)'s corpus gate covers only iOS screens. A change to the `android-full-text-v1` projection, or a new Jev model, re-runs the 10-screen check from "What Jev sees on Android" (its 31 claims, one run), and must give zero confidently wrong answers.

## Validation

- **Copying the agent: checked offline.** The 1.0.14 packages for Apple silicon and Intel Macs each hold exactly one valid DEX file of 72,660 bytes, with the SHA-256 above.
- **Starting it on a device without mobilecli: not yet proven.** Detecting a foreign agent isn't proven either. The Android driver's first step is a tracer on an emulator that proves both.
  - If it fails, this decision comes back to the owner, with mobilecli's CLI as the fallback.
