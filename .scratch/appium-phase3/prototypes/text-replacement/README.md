# Text replacement evidence

Throwaway P07 prototype from `5a1ba9b80`. This branch contains evidence only. Claude coordinates and the owner locks the operation contract.

The fixture archives and frozen candidate stack come from PFX. Both platforms use `skipLogCapture=true`. iOS settings are read back natively with idle timeout 1, snapshot depth 50, animation cool-off 2, and no excluded source attributes. Android uses the locked P05 settings.

Each count comes from `FIXTURE_EVENT` lines. A change callback is an app-observed editing event. The fixture does not instrument OS key events. Setup navigation and recorder taps are separate from replacement callbacks.

Fresh XML is normalized by the retained P05 normalizer. Android then uses the existing production Android mapper. The fixture's committed labels are additional echo evidence and are separate from the target field's exposed value. Secure input is process-local and persisted evidence is redacted.

`results.json` contains per-step counts, fresh field values, keyboard states, explicit limits, and evidence hashes. The external evidence directory retains the exact scripts, raw nonsecure XML and logs, secure-stream metadata, failed attempts and diagnoses.

Evidence is `/Users/hugues_mini/.codex/reports/jev-ios-bridge/phase3-build/P07-evidence/`.

The observations are the test. This prototype makes no adapter implementation or product decision.

## Measured callbacks and shown values

Counts below are change callbacks, with focus callbacks shown separately. All are counted from native fixture lines.

| Platform | Field | Clear change/focus | Set or replace change/focus | Fresh field value | Keyboard after final step |
| --- | --- | --- | --- | --- | --- |
| ios | plain | 0/0 | 16/1 | -leading-hyphen | True |
| ios | unicode | 0/0 | 22/1 | Tiếng Việt 日本語 café 👩🏽‍💻 | True |
| ios | formatted | 0/0 | 10/1 | 123456789 | True |
| ios | empty | 0/0 | 1/1 | Empty hint | True |
| ios | prefilled | 2/1 | 11/0 | Replacement | True |
| ios | secure | 0/0 | 25/1 | redacted; native supplement has 24 mask characters | True |
| android | plain | n/a | 1/0 | -leading-hyphen | False |
| android | unicode | n/a | 1/0 | Tiếng Việt 日本語 café 👩🏽‍💻 | False |
| android | formatted | n/a | 1/0 | 123-456-789 | False |
| android | empty | n/a | 0/0 | omitted by P05 | False |

Android prefilled and secure remain unproved after the corrected retry could not find prefilled following the bounded scroll. Live work stopped at the owner retry limit. The first attempt's MCP result-shape error and the interrupted extra preflight are retained separately.

iOS final keyboard state is shown. Main XML has no focus attribute. Its focus callbacks are retained; supplementary native active-element reads confirm prefilled focus after lost clear and secure focus after typing. All four completed Android fields expose focused=false and keyboard=false.

The formatted iOS field exposes unformatted digits while its committed label has hyphens. Android exposes the formatted value in both. Empty iOS exposes the hint as value; P05 omits Android's empty value. These are correspondence questions for the owner.

Lost acknowledgement is observed. Native clear returned, the owned child was killed before any reply, and fresh attachment to the same app PID showed empty prefilled content. The field exposed its placeholder. No set or retry followed the lost clear. Clear's fixture callbacks were one focus and two changes.

Boundary leaks are observed in iOS appium-mcp tool arguments on child stderr, fresh source values and committed labels, and local nonsecure request timelines. The secure request echo was detected in memory and persisted only as metadata. Secure committed labels leak into source; the native secure field itself exposed 24 mask characters. Successful mutator results and deliberately invalid-element errors did not echo inputs. Android emitted no typed value on captured child stderr at this log level; secure Android was not reached. Separate device-side vendor logs were not collected under skipLogCapture.

Leading-hyphen and multilingual Unicode text passed on the installed iOS keyboard. A non-US keyboard layout was not selected or independently identified. The frozen setValueImmediate implementation delegates to setValue and supplies no distinct keyboard bypass; no other bounded alternative was named by ticket 07.

Both exact private devices passed six final offline and closed-port samples. All 78 frozen hashes are unchanged. No Jev or real-store operation occurred. The main checkout was never edited. No subagents or reviewers ran.

Run `python3 verify.py` from this directory for retained-evidence verification. Full capture, normalization and summarization scripts remain in the external evidence directory. The root question is in `root-notes.md` there.
