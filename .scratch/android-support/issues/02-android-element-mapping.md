# How Android elements map onto the bridge's elements

Type: prototype
Status: claimed
Claimed by: Claude Code (owner session)
Blocked by: none

## Question

How should the Android driver turn `mobilecli dump ui --format raw` into the bridge's `Element` (role, label, value, identifier, frame, state, actions), so that selectors and guards work as they do on iOS?

- **Roles:** map Android classes and flags (`clickable`, `checkable`, `scrollable`) onto the bridge's role list. Compose buttons arrive as a clickable `android.view.View`. Decide whether 1.x adds roles such as `checkbox` or `radio`.
- **Compose text lift:** a clickable node with no text takes its label from its text children. Decide what happens to those children (keep, hide, or mark them), given that iOS guides already warn that merged buttons duplicate their label on a text child.
- **Labels, values and hints:** `text` vs `content-desc` for label; an `EditText`'s text as `value`; `hint` kept apart; password fields.
- **Noise:** status and navigation bars (`com.android.systemui:` resource-ids), invisible nodes, zero-size nodes, and deep layout wrappers.
- **Actions:** which elements can be tapped, typed into or swiped, derived from flags.

Prototype the mapping over captures of the Android twin app, `cmp` or `cmp-test`, and Settings on the emulator, and show the owner the mapped rows next to the raw tree to react to.
