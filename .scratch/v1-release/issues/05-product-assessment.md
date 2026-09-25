# Product assessment: is v0.1.0 worth a stable promise?

Type: grilling
Status: open
Blocked by: 01, 02, 03

## Question

Go or no-go for 1.0? The owner made this assessment a gate: a no-go redraws the destination as another prerelease. Judge v0.1.0 honestly against what a mobile developer would get from it, with the facts from "Where bridge time goes", "Code and design review", and "Why assertions abstain":

- **Value:** one submission and one recorded report with evidence, vs Claude driving MobileBuildMCP directly. Today the bridge measured slower (Weather 147.6 s vs 90.4 s prepared baseline) and cheaper in model cost ($0.48 vs $0.74), with authoring cost unmeasured.
- **Trust:** the zero-confidently-wrong record comes from a small exploratory corpus; how much of the 1.0 promise that can carry.
- **Friction:** hand-authored selectors and guards, the Weather sheet mistake, and keyboard-state typing surprises.
- **What must be true before 1.0** (the conditions of a go), and what can be documented as a known limit instead.
- **Carried risks:** prompt injection through screen text, and non-English screens.
