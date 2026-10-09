# Candidate installed/startup recorder

Status: **prepared only; no gates executed**. Root must dispatch the corrected,
frozen candidate after both independent re-reviews pass. This preparation is not
execution authorization or a Source correction dispatch.

The recorder lives in the isolated author checkout. It accepts a future context
with the existing `candidateCommit`, `source443`, `gitSource443`, `owned3`,
`protected440` and `compiled69` fields, supplied by exact context SHA256. Put that
new context under this directory; preserve every earlier context and receipt.
The old 4fa candidate is deliberately rejected. `invariants.json` binds the
original 443 path set, 440 protected hashes, three owned paths, 69 compiled paths,
and four additional protected packaging inputs from Git.

## Fixed execution plan

Run from `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-cryptex-runtime`.
Root supplies the future context path/SHA and fresh labels. The two phases expose
no configurable CWD, Node path, helper, guard, timeout, test flag or default gate.
Examples below are **not commands that were run**; replace the uppercase context
arguments only after Root's execution dispatch.

```sh
python3 .scratch/installed-legacy-volume-runtime/review-correction/candidate-installed-recorder.py packaging 26 corrected-packaging-node26 --context FUTURE_CONTEXT --context-sha256 FUTURE_SHA256
python3 .scratch/installed-legacy-volume-runtime/review-correction/candidate-installed-recorder.py startup 26 corrected-startup-node26 --context FUTURE_CONTEXT --context-sha256 FUTURE_SHA256 --packaging-label corrected-packaging-node26
python3 .scratch/installed-legacy-volume-runtime/review-correction/candidate-installed-recorder.py packaging 24 corrected-packaging-node24 --context FUTURE_CONTEXT --context-sha256 FUTURE_SHA256
python3 .scratch/installed-legacy-volume-runtime/review-correction/candidate-installed-recorder.py startup 24 corrected-startup-node24 --context FUTURE_CONTEXT --context-sha256 FUTURE_SHA256 --packaging-label corrected-packaging-node24
```

Await actual close and a complete PASS seal at each boundary before proceeding.
The recorder's private serial lock also rejects concurrent invocations. A failed
or uncertain run is retained; the recorder has no retry loop. The later gate
dispatch must authorize the unchanged proof helper's registry dependency fetches.

## Evidence and process ownership

Each fresh label creates an exclusive `runs/LABEL/` directory. The recorder saves
before/after 443 working and Git Source hashes, 440 protected hashes, 69 compiled
hashes, fixed helper/guard/Root runner/npm hashes, the future context binding,
allowlisted environment names, exact argv/CWD, direct PID/session/PGID, UTC launch
and actual-close times, exit, and separate raw stdout/stderr hashes. It inherits
no credentials, npm config, Node loaders or warning suppression. npm uses empty
private user/global configs and private caches. Node executable SHA256 is pinned;
the unchanged helper's runtime version must equal the selected exact runtime.

Packaging invokes the unchanged author `proof.mjs`. Its own original deadlines
and normal 0022 child umask remain in force; this outer phase waits naturally.
The derived record checks all 37 original command receipts, zero skips/forbidden
effects, all 69 compiled files at build/npm/plugin-build/plugin-install locations,
both complete archive member hash maps, and the same 69 payload files inside each
archive. No archive is extracted by the recorder.

The fixed packaging helper's `run()` records after `close`; its `mcp()` cleanup
can use an already set `exitCode`. The outer recorder preserves these original
semantics and does not claim instrumentation of an unobserved callback branch.
The actual helper root close and absence of its owned process group are separate
settlement evidence. The startup helper's three actual `close` records are
retained independently.

Startup consumes only a same-context/same-Node closed PASS packaging run whose
entire artifact seal still matches. It invokes the fixed integration `probe.mjs`
and that helper's fixed integration guard path, both byte unchanged. A 60-second
outer deadline bounds a hung helper. On timeout, only the recorder's direct
`start_new_session` process group is eligible: verify PID=PGID=SID, keep the
session leader unreaped to reserve its PID/PGID through SIGTERM and the bounded
SIGKILL escalation, then await actual root close and bounded group absence.
Signal delivery does not count as settlement. Ownership/close uncertainty is
recorded as failure, with no further signal or retry. An unsettled run receives
no artifact seal; its raw hashes are explicitly captured snapshots, and all later
gates remain held for Root's bounded settlement diagnosis. This recorder offers no
default-gate phase; actual defaults keep their separate natural-close policy.

After each closed phase, only its new owned artifact tree is sealed private:
directories 0700 and regular files 0600. This occurs after the helper's original
execution; the execution's 0022 child umask is retained in receipts. Symlinks are
described without following or chmodding their targets, including the helper's
build-tools link into the author checkout. Hardlink aliases refuse chmod.
The seal contains every regular-file hash and symlink descriptor, excludes only
itself, and does not rewrite old evidence. Startup runs installed CLI through the
exact Node executable, so post-gate private artifact modes do not change the
completed packaging proof's original executable smoke observations.

## Scope of the later native handoff

These gates prove offline candidate packaging and the guarded installed
`Admission.open` error translation. They execute no real account/native/device
lookup and establish no live acceptance result. Candidate gates precede Root
integration; Root must repeat fresh physical integrated gates afterward.

The later native compatibility helper must pass the actual registered production
factory directly to verification so its private context-aware invoker is used.
Record its actual children at the launch seam. The historical native helper used
a `recordedProcess` factory wrapper; the new launch trace has a different scope
and must say so. This outer recorder neither replaces that native helper nor
grants native execution.

Preparation review is static only: the recorder has not been run, compiled, or
tested. Its final SHA and unchanged Source/helper bindings are in
`preparation-receipt.json`.
