# jev-ios-bridge

Planning-stage repo: no code yet. Humans start at `README.md`; agents working a ticket start at `.scratch/jev-ios-bridge/map.md`.

## Local secrets

`.env` at the repo root holds `TYPESAFE_API_KEY`, the Jev API key that `@typesafe-ai/sdk` reads. It is gitignored and mode 600, so only the owner's account can read it.

- **The key is a placeholder** until the owner puts in the real one, so TypeSafe rejects any request made with it. Don't work around that; tell the owner.
- **Never print, copy, or commit the key.** Keep it out of tickets, research notes, run logs, and command output. To check it is set, test for the variable without echoing its value.
- **If you recreate `.env`**, do it under `umask 077`, so the file is never readable by other users, even briefly.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
