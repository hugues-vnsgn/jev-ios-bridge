# Write claims

At a checkpoint, Jev answers one yes/no question per claim: *does the visible evidence on this screen support this claim?* Each answer is a probability.

## What Jev sees

Jev sees the **text** of every visible element on the screen: role, label, value, identifier, position, and state. That's all. It doesn't see the screenshot, the app's history, your source code, or earlier screens. If something isn't printed on screen or exposed through accessibility, Jev can't confirm it.

## How claims become a verdict

- **0.9 or higher:** the claim is established.
- **0.1 or lower:** the claim is rejected.
- **In between:** uncertain.

For each checkpoint:
- any rejected claim **fails** it, even if other claims are uncertain;
- otherwise, any uncertain claim makes it **inconclusive**;
- otherwise it **passes**.

The bounds are fixed; no script, flag, or setting changes them. Each checkpoint is judged **once**, and the bridge never re-asks.

## Rules that keep claims decisive

These come from the project's measured judgments.

1. **Claim what's printed.** "The order total reads $5" is better than "The order was placed correctly". Name the text you'd point at on screen. Claims about what a widget *means* ("the checkbox is checked") do worse than claims about its printed text ("a button labelled ON is visible"): 0.88 against 0.99 on the same screen.
2. **One kind of evidence per claim.** Don't mix a visible fact with a count, an absence, or an inference. Split them.
3. **Absence only through text the app prints.** "Contacts shows No Results for Nina" works; "the list has no other reminders" doesn't, because nothing on screen proves a list has ended. That one scored 0.65–0.87 across runs.
4. **Don't count rows yourself.** Claim the app's own total ("The header reads 2 Completed"), or use guards to require exactly the rows you expect.
5. **"Saved" only on the screen after saving.** On an editor, "the contact is saved" is a guess. Open the saved card, and claim what it shows.
6. **Stay in the viewport.** Claim what's on screen now, not what's above or below it.
7. **No history.** "The button is shown again" asks about the past; "A Bottom Sheet button is visible" doesn't.
8. **English.** Jev is most accurate on English screen text, and 1.0's assurance covers English screens only.

## When a claim comes back uncertain

Don't re-run and hope: near a bound, identical requests can land on either side of it. Instead:

- **Reword the claim** to name printed text (rule 1).
- **Add evidence,** then check again: scroll to the end of the list, open the detail screen, or wait for the result text. Follow that with a new checkpoint.
- **Move the check into a guard** when code can decide it exactly, for example that an element with this identifier and value is present.

A guard can make a run inconclusive, but never makes it pass. So moving a check into a guard never hides a failure behind a pass.
