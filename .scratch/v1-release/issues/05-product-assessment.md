# Product assessment: is v0.1.0 worth a stable promise?

Type: grilling
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: 01, 02, 03

## Question

Go or no-go for 1.0? The owner made this assessment a gate: a no-go redraws the destination as another prerelease. Judge v0.1.0 honestly against what a mobile developer would get from it, with the facts from "Where bridge time goes", "Code and design review", and "Why assertions abstain":

- **Value:** one submission and one recorded report with evidence, vs Claude driving MobileBuildMCP directly. Today the bridge measured slower (Weather 147.6 s vs 90.4 s prepared baseline) and cheaper in model cost ($0.48 vs $0.74), with authoring cost unmeasured.
- **Trust:** the zero-confidently-wrong record comes from a small exploratory corpus; how much of the 1.0 promise that can carry.
- **Friction:** hand-authored selectors and guards, the Weather sheet mistake, and keyboard-state typing surprises.
- **What must be true before 1.0** (the conditions of a go), and what can be documented as a known limit instead.
- **Carried risks:** prompt injection through screen text, and non-English screens.

## Answer

Decided with the owner on 2026-09-25, from "Where bridge time goes", "Code and design review of v0.1.0 before a stability promise", and "Why assertions abstain".

**Verdict: go for 1.0, conditionally.** The destination stays a v1.0.0 release spec.

1. **The job 1.0 serves is repeatable checks.** Developers keep scripts in their repository and re-run them after changes, like UI tests that read the screen the way a person would. Authoring cost pays off across runs. One-off verification, where a script is written fresh each time, works but isn't what the guide and examples are built around.
2. **Go conditions** (all five must hold before tagging):
   1. fix the three review defects: `value: ''` selectors never matching, the unrecoverable retained device lock, and dead autonomous-design code in the package;
   2. implement ADR-0004's precedence (a confidently false claim fails beside uncertain ones);
   3. meet the "Performance target and tuning plan" target;
   4. pass the Compose checks set by "Compose app evidence plan";
   5. remove the dead code and version every frozen surface (detailed by "The 1.0 stable contract").

   Everything else ships as a documented limit.
3. **Speed:** the bridge can remain slower than Claude driving MobileBuildMCP directly. The docs must say so plainly. The value is cost per run, recorded evidence, and repeatable verdicts, not speed.
4. **Known risks, documented rather than fixed:**
   - **Prompt injection:** screen text written by users could steer Jev toward confirming a claim. The guide tells developers to verify with synthetic data in apps they control.
   - **Non-English screens:** Jev is less accurate on them. 1.0 assurance covers English screens only.
5. **Authoring cost** isn't measured before 1.0 (no new measurement campaign). The docs say it's unmeasured. The guide and worked SwiftUI and Compose examples are how 1.0 makes scripts cheaper to write.
