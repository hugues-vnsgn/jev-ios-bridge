# Canonical device identity

Type: grilling
Status: open
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
