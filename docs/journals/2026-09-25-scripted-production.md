# Scripted production integration, 2026-09-25

The owner approved explicit scripts after three autonomous-action no-go results. The separately frozen assertion experiment passed its fixed gate, followed by twelve real script outcomes and three fault probes. ADR-0003 now accepts bridge-owned scripted execution with Jev assertion checks; the earlier experiments retain their original no-go results.

Production CLI and MCP entrypoints now accept scripts only. The port preserves every held-out assertion request byte for byte. It adds useful semantic report excerpts and full redacted assertion observations in local JSONL, bounds reports to 24,000 UTF-8 bytes, and counts script steps rather than wait polls. The integrated check passed 147 tests before final hardening.

The installed-host smoke exposed two failures before passing. Simulator typing changed casing and failed whole-field replacement; booting the dedicated simulator restored direct probes, but the cause remains unknown. Next, Contacts restored an empty-results screen with two Search images, making the authored guard ambiguous. Removing the redundant icon anchor while retaining card/editor exclusions fixed that startup case. All attempts and capture evidence remain preserved.

The successful installed run used a clean npm-tarball installation and its packaged `/test-ios` skill. Claude submitted the reviewed script unchanged, called start once and read the report, and received the expected pass. The bridge made one Jev request, cleaned up, and released its lock. A separate blind report-and-source task identified the Diagnostic app's planted total-calculation error without tools or answer-bearing documentation.

Review found additional production edge cases before release: a wait could accept a late capture, cancellation during final evidence writes could still produce a pass, and literal redaction could damage structural log values. Focused regressions and fixes are in progress. Browser inspection also found a failed checkpoint headed “Checkpoint confirmed”; the heading is being corrected without changing the recorded verdict.

The three same-machine benchmark comparisons are in progress. Initial script drafting was not instrumented; that cost cannot be recovered from file timestamps. Subsequent maintenance is measured and the missing initial cost will be disclosed. Prepared-execution savings, if observed, cannot establish total savings or break-even.

Final independent review, clean package validation, main-checkout reconciliation, CI, merge, tag, and GitHub prerelease remain outstanding. The [release plan](../../.scratch/jev-ios-bridge/release-plan.md) tracks these gates.
