# Maintenance entrypoint repair — Spec PASS

Inspected candidate `535973ed85ef206ab8a613105e9b24b620753c98`, sole parent `c1577abbd6933aa133b7b2007a442c2a18c7b4cc`. Exactly the two authorized paths changed: `src/device/admission-maintenance.ts` and `tests/admission-maintenance-entry.test.ts`.

No findings. The guard at source lines51–55 compares canonical filesystem paths, so direct invocation through a file symlink or directory alias reaches the same maintenance function. Absent or nonexistent importing-host argv remains inert. This repairs the observed empty-help behavior without introducing a separate migration route.

Verified by exact source comparison that the complete help text and exported `runAdmissionMaintenance` function are unchanged. Its offline invocation validation, declaration restrictions, migration API selection, exit/error rendering and lack of public destination-root override therefore retain their prior semantics. This matches Root's bounded scope and admission-decision:88,161,165 / ADR0008; the guard adds no store or device operation.

Independently reran the unchanged five-case test oracle on Node26.8.1 and exact24.0.0:5/5 each, zero skips. Cases cover canonical, file-symlink and directory-alias help plus imports with absent/nonexistent argv. Read both original red logs (3/5 each, alias cases fail with empty stdout) and repaired owner logs (5/5 each); verified the red oracle equals the committed test bytes.

Both files' SHA256 and Git blobs matched manifest, immutable copies, current worktree and candidate before and after checks. No product changes, migration/store/device operations, secrets, full suites, build, coverage or packaging runs. This is a bounded Spec review, not ticket12 or live/integrated acceptance.

## Evidence appendix

`revision.json` records exact candidate, parent and paths. `manifest.json`, `before-hashes.json` and `after-hashes.json` record both exact mappings. Source SHA256: `908864b9c6df13805998b917f0ca1a3a7b430708548decdccb1abcb726e866a5`; blob `1fee5d62045b87efa9dc17976133771c57dc07d0`. Test SHA256: `992a918bfa26edfcecdd7fee0b6265261d5f7270a758968ca42ee14d2a131420`; blob `a4c4fd949b3cb7d47e2b82320c0b7cb69ee2a7ae`.

Commands: `<runtime> --import tsx --test tests/admission-maintenance-entry.test.ts`; exact executable paths/versions, cwd, exit0 and child umask0022 are in `node26.json` / `node24.json`. Raw output: `node26.log` / `node24.log`. Evidence directory created under umask0077. Migration behavior was inspected as unchanged, not executed.
