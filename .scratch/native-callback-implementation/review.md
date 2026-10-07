# Independent review of the callback diagnostic

Baseline: `86d81bf`. Review scope: `spikes/native-owner/` and the architecture update, including new native helper files. The specification is [spec.md](spec.md).

## Standards

Zero documented-standard violations. One optional low-priority Duplicated Code heuristic: test setup repeats the point-session/provenance closures in several `ObservationStudyTests.m` cases. A test-only helper could centralize these. The repeated closures are kept visible beside each test's other collaborators; no production duplication or failing requirement results.

The standalone boundary required by the architecture and ADRs remains intact. The reviewer checked native red/green logs, the integrated host log and encoded records. An early double-read race was corrected by returning callback state and its retained element in one synchronized snapshot.

## Specification

Zero unresolved findings after two evidence corrections: admission now distinguishes stop from deadline, and runtime provenance includes the checked session-getter type encoding. Both have regressions. Review covered retained object identity, bounded callback payload storage, duplicate refusal, throw-after-reply handling, the original deadline, the final observation cutoff, strict host parsing and historical compatibility.

The independent reviewers assessed local diagnostic behavior. They accepted no native-settlement, contact-release, live-simulator or production-ticket claim. Generic build receipts are checked separately in the final verification report.
