# Driving a real iPhone: what a second device layer takes

Type: research
Status: resolved
Blocked by: none

## Question

MobileBuildMCP has no UI automation on a physical iPhone. What would a second device layer take to observe and act on one, behind the same device driver?

Building it is out of scope for this map. This ticket sizes the path, so that a later effort can decide whether to take it.

## Answer

**The most plausible option** is WebDriverAgent, run by Appium's XCUITest driver, with a second device driver talking to it over HTTP. It is the only option with all of the following:

- documented iOS 26.4+ support;
- signing paths for both free and paid Apple developer accounts;
- permissive licenses (BSD and Apache);
- near-daily releases.

**The alternatives fall short:**

- mobilecli needs a paid team with a wildcard profile, and is FSL-licensed.
- Maestro and idb cannot drive a real iPhone.
- pymobiledevice3 exposes no usable accessibility tree.
- Apple ships nothing scriptable.

**Setup for each developer:**

- USB pairing and Developer Mode.
- "Enable UI Automation", which asks for the passcode about once a day.
- Signing WebDriverAgent with their own team and a unique bundle ID. A free Apple ID has to re-sign every 7 days.
- Xcode 27 needs a sudo tunnel to start WebDriverAgent once it is installed.

**Jev's view stays the same** as long as one projection serves both device layers.

**Size: M.** Most of the cost is signing for each developer and keeping the runner working across Xcode releases.

Evidence: [physical-iphone-device-layer.md](../../../docs/research/physical-iphone-device-layer.md)
