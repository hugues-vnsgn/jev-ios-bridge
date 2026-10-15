# Appium migration baseline

Source: `0d3e54a9d1d80c1a9188c8c5e5717254e9a95994` (`v1.4.0`)
Date: 2026-10-12
Status: complete

## Reproduction and repairs

`npm ci --ignore-scripts` installed the selected base's lockfile on Node
`v26.8.1`. A fresh `npm run check` reproduced all five reported failures:
2,253 of 2,258 tests passed. Typechecking passed; the failing test command
prevented the chained build.

Four tests expected `1.3.1`: CLI version, MCP server version, package/lockfile
agreement, and documentation release tags. They now read the expected version
from `package.json`. The documentation check still compares independently
written GitHub tag URLs with that version. A separate Git check confirmed that
`v1.4.0` resolves to the selected source commit and its tagged package declares
`1.4.0`; see [release-tag.json](evidence/release-tag.json).

The fifth failure was a relative README link to release notes excluded from
the package. Fixing it exposed the same link in CHANGELOG and three guide URLs
still pointing to `v1.3.1`. Both release-note links now use the published
`v1.4.0` source URL, and the guide links use that tag. Historical prose about
what was absent from `v1.3.1` remains unchanged.

## Verification

The first targeted run passed 65 of 67 tests; only the two newly exposed
documentation checks failed. The final documentation rerun passed 27 of 27;
the other 40 targeted tests had passed. Build and plugin build also passed.

The mandatory installed-workflow proof built a fresh snapshot after all
repairs. Its tarball and plugin passed two clean installations, 37 commands,
CLI version/help/schema checks, and MCP enablement/schema checks. It recorded
zero skips and zero forbidden effects. Each artifact contains 23 Markdown
documents; all 147 relative links resolve. These are package and host checks,
not live device acceptance.

- [Baseline and targeted results](evidence/baseline-summary.json)
- [Packaged link checks](evidence/packaged-links.json)
- Local raw logs: `evidence/baseline-check.log`, `baseline-repairs.log`,
  `baseline-docs-repaired.log`, and `installed-proof.log`.

The standards and Phase 0 spec reviews found zero findings. The final full
`npm run check` passed: typecheck, 2,258 of 2,258 tests, and build. There were
zero failures, cancellations, or skips. See the final result in
[baseline-summary.json](evidence/baseline-summary.json); the raw output remains
local in `evidence/final-check.log`.

The first final-suite attempt stalled in an existing fake-process deadline
test. Its 20-event-loop-turn launch guess could expire before asynchronous
preflight completed, leaving cleanup waiting for an event it never emitted.
The stuck worker was terminated; that run is not a passing suite result.
Delaying preflight by 25 turns reproduced the hang with a five-second test
deadline. The repaired test waits for actual launch or terminal settlement,
has a ten-second deadline, and aborts cleanup. It retains the original SIGTERM,
SIGKILL, and actual-close assertions. The delayed case passed, as did all 259
tests in the file. Both review axes found zero additional findings.

## Branch history

The planning checkout remains on `main` at
`86d81bf573a0a8effe9f8d7509cc002f3f3dd187`, 172 commits behind the selected base.
Its existing local edits remain in place. Fetching `origin/main` confirmed
`dadd63a6525f470dc199e4c177308bb35753bdba` adds only the marketplace URL/hash
for the already published v1.4.0 plugin; its source remains older. Neither
branch supplied the implementation base. Eventual integration must retain
that marketplace pointer without replacing the selected v1.4.0 source.

The working branch is `feat/appium-mcp-migration`, in
`.worktrees/feat/appium-mcp-migration`. No merge, push, tag, or publication is
part of this work.
