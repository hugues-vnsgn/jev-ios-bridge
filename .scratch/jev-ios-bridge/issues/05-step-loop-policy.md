# Step loop policy: bounds, confidence, fallback, stop

Type: grilling
Status: open
Blocked by: 03, 04

## Question

What rules govern a run's loop: max steps and wall-clock timeout defaults, the confidence threshold below which the bridge stops trusting Jev's choice, what happens then (retry with more context, hand the screenshot to the host agent, or fail inconclusive), how loops and repeated screens are detected, and what ends a run as passed, failed, or inconclusive?

Also decide when assertions are checked: every step, or only when Jev signals the scenario is complete.
