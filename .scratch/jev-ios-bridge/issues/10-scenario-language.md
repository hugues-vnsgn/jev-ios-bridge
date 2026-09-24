# Scenario language: goals, assertions, typed values

Type: grilling
Status: open
Blocked by: 20

## Question

How does a developer, or Claude on their behalf, write a scenario? Decide:

- **The minimal schema:**
  - goal text;
  - assertions;
  - values to type;
  - preconditions, such as a test account or seeded data.
- **Typed values.** Jev cannot write text, so every value is a literal or a named value in the scenario. Only US-keyboard characters can be typed, so accented text, such as Vietnamese, needs another input path or is out of v1.
- **Assertion phrasing.** How an assertion is worded so it becomes one clean Noul question. Also whether ordering, as in "after login, the Home tab is visible", is in v1.
- **Where reusable scenarios live.** Files in the app's repo keep later unattended runs possible.
- **Who writes what.** Decide what Claude writes and what a person reviews. TypeSafe notes that coding agents tend to write weak questions.
