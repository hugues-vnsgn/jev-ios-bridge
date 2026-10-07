# Implementation plan

Reviewed against the independent outcome and disposable-simulator designs. Selected the existing driver plus strict single-attempt executor; defer provisioning and destructive recovery.

1. Callback agent: executor and opt-in tapOnce path, behavior tests.
2. Settlement agent: durable attempt journal and permanent uncertain-device exclusion, crash/concurrency tests.
3. Supervisor: standalone JSON CLI, evidence output, usage documentation and integration verification.
4. Independent review, resolve findings, record exact test evidence and commit isolated changes.

No live simulator work in this slice; the historical retained study is not released. A future disposable-device allocator may replace quarantined devices but cannot undo remote side effects or prove native settlement.

## Completion

Phases 1–4 complete for the host implementation. Independent reviews resolved all material findings. Live verification remains issue 04, explicitly outside the offline evidence claim. See [verification](verification.md).
