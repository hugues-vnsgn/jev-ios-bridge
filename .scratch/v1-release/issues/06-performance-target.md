# Performance target and tuning plan

Type: grilling
Status: open
Blocked by: 01

## Question

Given the breakdown from "Where bridge time goes", what numeric performance target does 1.0 commit to, and which changes get there? Decide:

- **The target and its measurement:** for example, prepared bridge execution for the Weather, Contacts, and Reminders scripts relative to v0.1.0, or host elapsed time relative to the prepared-app baseline. Say which machine, runs, and statistic count.
- **The tuning changes in scope:** a resolved binary or a long-lived device-layer process instead of per-command `npx`; fewer captures per step; parallel screenshot and capture; settle times. Say whether any of them changes ADR-0002 or needs a new ADR.
- **Which changes must not alter verdicts:** tuning must not weaken guards, reference-freshness checks, or evidence completeness.
