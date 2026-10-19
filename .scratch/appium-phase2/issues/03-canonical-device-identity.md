# Canonical device identity

Type: grilling
Status: resolved
Claimed by: Claude Code (owner session)
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 2 decision map](../map.md)
Blocked by: 02

## Question

What single canonical key scheme identifies every device the authority admits, so aliases converge and categories never collide?

## Required investigation or discussion

Today `canonicalDevice` accepts only a simulator UUID and `devices.platform` is CHECK'd to `ios-simulator`; Android leases key on AVD name or phone serial. Cover: simulator UUID plus device set, emulator AVD plus provenance (from Android emulator provenance), phone serial, category tags, reserved physical-iPhone and physical-Android categories (refused until enabled), transport serial changes, and how existing iOS keys and allocation IDs stay valid.

## Completion criterion

Record the actual owner decision (or sourced answer for research), unresolved
limits, and the exact changes required in the Phase 2 specification.

## Answer

Owner decision, 2026-10-19 (grilling, all recommendations accepted, two rounds):

- **Shape.** Identity is the pair (category, value), unique as a pair, with the category in its own column (the existing `devices.platform`, widened). `category:value` is a display form only. Existing iOS rows keep their bare uppercase UUID; no stored value or checksummed allocation record is rewritten.
- **Values.** Simulator: uppercase UDID, default device set only (others refuse, set path recorded). Emulator: `realpath(avd path)` alone; AVD name, id, device plus inode, version, serial, pid and start time are attributes. `-id` clones and `-read-only` second instances share the key and serialize; one inode under two paths is a conflict. Phone: `getprop ro.serialno`; the adb transport serial (USB, `ip:port`, mDNS) is an attribute, revalidated before effects.
- **Categories.** Closed list: `ios-simulator`, `android-emulator`, `android-phone` enabled; `ios-phone` reserved and refused with `CATEGORY_NOT_ENABLED` before effects, including iPhone-UDID-shaped names. New categories need a spec change.
- **Allocation IDs** get their own `canonicalAllocationId` (uppercase UUID), so every existing ID stays valid.
- **Resolution** is live on every admission, never cached. `DEVICE_AMBIGUOUS` / `DEVICE_NOT_FOUND`; the `avd || name` serial fallback is removed. Disagreeing sources refuse `DEVICE_IDENTITY_CONFLICT`, recorded but not quarantined. A moved or renamed AVD is a new identity; a same-name match only adds a note, never adoption.
- **Provenance.** The eight spec changes from Android emulator provenance are adopted, plus refusal of a remote-adb `emulator-N` serial.

Spec changes made: `phases/phase-2-ownership.md` "Identity and preflight" (identity table, resolution, provenance rules) and "Verification and exit" (aliasing tests, live console-byte trial). `GLOSSARY.md`: **Device identity** redefined, **Device category** added. Store schema evolution gained the schema input.

Unresolved limits: exact console reply bytes (missing or empty token, `offline`) wait for the live trial; `ro.serialno` behaviour on unusual phones and the real case-folding behaviour of `realpath` on case-insensitive volumes are untested; import of legacy AVD-name lease files stays in the fog (no name-only upgrade).
