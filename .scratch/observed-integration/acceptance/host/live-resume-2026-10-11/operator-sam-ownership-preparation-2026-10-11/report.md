# Ownership-only attempt: authentication refusal

**First confirmed cause: SUDO_PASSWORD_REQUIRED.** Exact attempted argv: `/usr/bin/sudo -n /usr/sbin/diskutil enableOwnership /Volumes/Sam`. The direct sudo child exited 1, signal null, and actually closed at 2026-10-11T04:59:22.767Z. Complete raw stdout0bytes/stderr29bytes; stderr exactly `sudo: a password is required
`. No timeout, overflow, kill or retry. The outer tool returned exit3 for the stopped attempt. This was an OS administrator authentication refusal after supported sandbox approval, not an automatic tool-approval rejection.

Fresh pre-attempt non-following bigint ancestor checks, exact volume/UUID/device/external HFS+/writable bindings and ACL inspection passed. The pre-attempt query reported GlobalPermissionsEnabled=false. There was one sudo attempt. No after-attempt ownership query or recovery query ran, and no ownership success is claimed. The original result's UNCONFIRMED_AFTER_TOGGLE_ATTEMPT remains unchanged. Only the direct sudo close is observed; diskutil descendants are unobserved, so no nativeChildren=0 claim or general mutation-settlement claim is made.

Root audited the exact clean refusal and confirmed no unresolved direct child. The owner has separately been asked by Root to run the exact command locally; this operator neither requests nor reads a password and does not retry. A fresh Sam identity/ownership recheck requires a later Root dispatch after the owner reports completion.

All four direct child commands (diskutil info, offline Python plist parse, finite ancestor ACL listing, sudo attempt) have complete raw captures and actual closes. Their exact argv/env/bounds/events are retained; each deadline10s/output64KiB/shellfalse with TERM then250ms KILL policy unused. All approved source/parser/recorder bytes and the 12-file prepared seal remain unchanged. No mount/unmount/repartition commands, Sam mkdir/open/chmod, recursive chmod/chown, namespace setup, data moves/removals, cache cleanup, build or device action. Sam-root0775 staff-writable permission acceptance remains pending separate Root review.

Root authorizes the independent metadata-only cache child inventory to continue. This report and completion-hashes.json seal the stopped ownership attempt; original prepared-hashes.json stays preserved. All files0600/directory0700.
