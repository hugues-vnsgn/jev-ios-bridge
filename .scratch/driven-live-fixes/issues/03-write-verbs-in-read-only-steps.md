# A read-only step never carries out a pick of a write control

Status: resolved
Type: bug (safety)
Source: live trial 2026-10-02: a read-only check ended on an approval screen in the approver's turn, with live Approve and Reject buttons. Neither was a risky word, so a confident Jev pick of Approve in that `effect: none` step would have been carried out, writing a final approval. It didn't happen (Jev's done check ended the step).

## Problem

The risky-word net (E11: Delete, Remove, Erase, Reset, Sign out, Unsubscribe, Pay) covers controls that destroy or pay. A step that declares `effect: none` promises no writes, but nothing stops the bridge from tapping a control that commits one.

## What to build

In an `effect: none` step, a pick on a control whose label, value or identifier has a write word (whole word, any case) goes to Claude as `RISKY_ACTION`, the way risky words do in every step. Write words: Approve, Reject, Send, Submit, Confirm, Save, Publish, Post. `test_write` steps are unchanged (writing is their job, and the preflight guards them), and `destructive` steps already hand every action to Claude.

## Acceptance

- `effect: none`: picks on "Approve", "Send message", `form.submit` hand back `RISKY_ACTION`; "Saved items", "Posts" (not whole words) don't.
- `test_write`: the same picks are accepted at the floor.
- Guide `13-driven-steps.md` lists the write words next to the risky words.
