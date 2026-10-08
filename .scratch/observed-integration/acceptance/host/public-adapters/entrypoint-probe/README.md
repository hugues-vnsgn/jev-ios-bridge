# Local Node entrypoint boundary

These Root probes inspect Node behavior only; they do not import adapter source or operate a store/device. Node 26.8.1 and exact 24.0.0 both resolve a symlinked module's `import.meta.url` to its target while retaining the invoked path in `process.argv[1]`.

`result.json` preserves the first probe, whose temporary path also contains the macOS `/var` to `/private/var` alias. Its direct and symlink invocations both produce unequal lexical URLs. `canonical-result.json` repeats the same source with a canonical parent: direct invocation compares equal, symlink invocation does not. Neither receipt is a product regression or a harness error.

Root sent this boundary to the ticket08 owner. The owner subsequently confirmed an actual adapter regression, retained its own unchanged red/green tests and fixed only the owned CLI entry guard. Those product tests, the compiled npm bin check, source freeze and independent review belong to the adapter evidence. These general probes do not substitute for them.
