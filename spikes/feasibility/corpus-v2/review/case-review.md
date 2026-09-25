# Feasibility revision cases for owner review

These 30 labels are drafts: 10 original tuning cases retained for development, then 20 fresh held-out cases. Review each screenshot, paired compact/full capture, acceptable action set, completion label, and assertion label before approving the frozen experiment. The complete offered-option list and hashes are in [label-review.md](label-review.md).

The seven unavailable Settings cases were replaced before any v2 Jev request with Sentry mock Weather cases. [Corpus notes](../README.md) record the preflight evidence and synthetic setup. No captured screen justifies `wait`; that category remains unverified.

The two Noah Reed rows in C1 cannot be distinguished by company in the text snapshot. Both taps are valid inspections; the scored goal uses the unique old email to identify the target. At W3, W7, and R5, the goal is reached while a deliberately false assertion remains false. Those completed cases should produce a failed verdict under the all-assertions rule.

## t01-settings-onofflabels-root (tuning)

Goal: Turn on On/Off Labels in Accessibility.

Screen: [screenshot](../raw/t01-settings-onofflabels-root.jpg) · [compact capture](../raw/t01-settings-onofflabels-root.compact.json) · [full capture](../raw/t01-settings-onofflabels-root.full.json)

Supplied values: none

Recent steps: none

Acceptable next action: `tap:e54`: Tap Accessibility

Goal reached: no

Assertion labels_enabled: On/Off Labels is visibly enabled. **no**

## t02-settings-onofflabels-accessibility (tuning)

Goal: Turn on On/Off Labels in Accessibility.

Screen: [screenshot](../raw/t02-settings-onofflabels-accessibility.jpg) · [compact capture](../raw/t02-settings-onofflabels-accessibility.compact.json) · [full capture](../raw/t02-settings-onofflabels-accessibility.full.json)

Supplied values: none

Recent steps: Opened Accessibility from Settings.

Acceptable next actions: `tap:e44`: Tap Display & Text Size or `tap:e166`: Tap Display & Text Size or `tap:e47`: Tap Display & Text Size or `tap:e169`: Tap Display & Text Size

Goal reached: no

Assertion labels_enabled: On/Off Labels is visibly enabled. **no**

Supplementary positional wording on this same screen: Open the second row in the Vision section of Accessibility.

Acceptable action: `tap:e44`: Tap Display & Text Size or `tap:e166`: Tap Display & Text Size or `tap:e47`: Tap Display & Text Size or `tap:e169`: Tap Display & Text Size

## t03-settings-onofflabels-off (tuning)

Goal: Turn on On/Off Labels in Accessibility.

Screen: [screenshot](../raw/t03-settings-onofflabels-off.jpg) · [compact capture](../raw/t03-settings-onofflabels-off.compact.json) · [full capture](../raw/t03-settings-onofflabels-off.full.json)

Supplied values: none

Recent steps: Opened Accessibility. → Opened Display & Text Size.

Acceptable next actions: `tap:e35`: Tap On/Off Labels or `tap:e37`: Tap On/Off Labels

Goal reached: no

Assertion labels_enabled: On/Off Labels is visibly enabled. **no**

## t04-settings-onofflabels-on (tuning)

Goal: Turn on On/Off Labels in Accessibility.

Screen: [screenshot](../raw/t04-settings-onofflabels-on.jpg) · [compact capture](../raw/t04-settings-onofflabels-on.compact.json) · [full capture](../raw/t04-settings-onofflabels-on.full.json)

Supplied values: none

Recent steps: Opened Display & Text Size. → Turned on On/Off Labels.

Acceptable next action: `stop-goal`: Stop because the goal is reached

Goal reached: yes

Assertion labels_enabled: On/Off Labels is visibly enabled. **yes**

## t05-contacts-create-list (tuning)

Goal: Create a saved contact named Mira Vale.

Screen: [screenshot](../raw/t05-contacts-create-list.jpg) · [compact capture](../raw/t05-contacts-create-list.compact.json) · [full capture](../raw/t05-contacts-create-list.full.json)

Supplied values: firstName="Mira", lastName="Vale"

Recent steps: none

Acceptable next action: `tap:e89`: Tap Add

Goal reached: no

Assertion contact_saved: A saved contact named Mira Vale is visible. **no**

## t06-contacts-create-blank (tuning)

Goal: Create a saved contact named Mira Vale.

Screen: [screenshot](../raw/t06-contacts-create-blank.jpg) · [compact capture](../raw/t06-contacts-create-blank.compact.json) · [full capture](../raw/t06-contacts-create-blank.full.json)

Supplied values: firstName="Mira", lastName="Vale"

Recent steps: Tapped Add on the Contacts list.

Acceptable next actions: `type:e116:firstName`: Replace all text in First name with supplied firstName value (Mira) or `type:e119:lastName`: Replace all text in Last name with supplied lastName value (Vale)

Goal reached: no

Assertion contact_saved: A saved contact named Mira Vale is visible. **no**

## t07-contacts-create-filled (tuning)

Goal: Create a saved contact named Mira Vale.

Screen: [screenshot](../raw/t07-contacts-create-filled.jpg) · [compact capture](../raw/t07-contacts-create-filled.compact.json) · [full capture](../raw/t07-contacts-create-filled.full.json)

Supplied values: firstName="Mira", lastName="Vale"

Recent steps: Opened a new contact form. → Typed first name Mira and last name Vale.

Acceptable next action: `tap:e103`: Tap Done

Goal reached: no

Assertion contact_saved: A saved contact named Mira Vale is visible. **no**

## t08-reminders-create-onboarding (tuning)

Goal: Create a reminder titled Call Mira in the local Reminders list.

Screen: [screenshot](../raw/t08-reminders-create-onboarding.jpg) · [compact capture](../raw/t08-reminders-create-onboarding.compact.json) · [full capture](../raw/t08-reminders-create-onboarding.full.json)

Supplied values: title="Call Mira"

Recent steps: none

Acceptable next action: `tap:e78`: Tap Continue

Goal reached: no

Assertion reminder_saved: A saved reminder titled Call Mira is visible. **no**

## t09-reminders-create-icloud-prompt (tuning)

Goal: Create a reminder titled Call Mira in the local Reminders list.

Screen: [screenshot](../raw/t09-reminders-create-icloud-prompt.jpg) · [compact capture](../raw/t09-reminders-create-icloud-prompt.compact.json) · [full capture](../raw/t09-reminders-create-icloud-prompt.full.json)

Supplied values: title="Call Mira"

Recent steps: Tapped Continue on Reminders onboarding.

Acceptable next action: `tap:e71`: Tap Not Now

Goal reached: no

Assertion reminder_saved: A saved reminder titled Call Mira is visible. **no**

## t10-reminders-create-empty-list (tuning)

Goal: Create a reminder titled Call Mira in the local Reminders list.

Screen: [screenshot](../raw/t10-reminders-create-empty-list.jpg) · [compact capture](../raw/t10-reminders-create-empty-list.compact.json) · [full capture](../raw/t10-reminders-create-empty-list.full.json)

Supplied values: title="Call Mira"

Recent steps: Continued onboarding. → Chose Not Now for iCloud syncing.

Acceptable next action: `tap:e44`: Tap New Reminder

Goal reached: no

Assertion reminder_saved: A saved reminder titled Call Mira is visible. **no**

## v2-w01-celsius-main (heldout)

Goal: Set Weather temperature units to Fahrenheit and verify Fahrenheit is selected in Settings.

Screen: [screenshot](../raw/v2-w01-celsius-main.jpg) · [compact capture](../raw/v2-w01-celsius-main.compact.json) · [full capture](../raw/v2-w01-celsius-main.full.json)

Supplied values: none

Recent steps: none

Acceptable next action: `tap:e89`: Tap Settings

Goal reached: no

Assertion fahrenheit_selected: The current screen visibly shows Fahrenheit selected. **no**
Assertion celsius_selected: The current screen visibly shows Celsius selected. **no**

## v2-w02-celsius-settings (heldout)

Goal: Set Weather temperature units to Fahrenheit and verify Fahrenheit is selected in Settings.

Screen: [screenshot](../raw/v2-w02-celsius-settings.jpg) · [compact capture](../raw/v2-w02-celsius-settings.compact.json) · [full capture](../raw/v2-w02-celsius-settings.full.json)

Supplied values: none

Recent steps: Opened Weather Settings.

Acceptable next action: `tap:e105`: Tap °F

Goal reached: no

Assertion fahrenheit_selected: The current screen visibly shows Fahrenheit selected. **no**
Assertion celsius_selected: The current screen visibly shows Celsius selected. **yes**

## v2-w03-fahrenheit-selected (heldout)

Goal: Set Weather temperature units to Fahrenheit and verify Fahrenheit is selected in Settings.

Screen: [screenshot](../raw/v2-w03-fahrenheit-selected.jpg) · [compact capture](../raw/v2-w03-fahrenheit-selected.compact.json) · [full capture](../raw/v2-w03-fahrenheit-selected.full.json)

Supplied values: none

Recent steps: Opened Weather Settings. → Selected Fahrenheit.

Acceptable next action: `stop-goal`: Stop because the goal is reached

Goal reached: yes

Assertion fahrenheit_selected: The current screen visibly shows Fahrenheit selected. **yes**
Assertion celsius_selected: The current screen visibly shows Celsius selected. **no**

## v2-w04-fahrenheit-main (heldout)

Goal: Set Weather wind speed to km/h and pressure to inHg, then verify both selections in Settings.

Screen: [screenshot](../raw/v2-w04-fahrenheit-main.jpg) · [compact capture](../raw/v2-w04-fahrenheit-main.compact.json) · [full capture](../raw/v2-w04-fahrenheit-main.full.json)

Supplied values: none

Recent steps: none

Acceptable next action: `tap:e89`: Tap Settings

Goal reached: no

Assertion wind_kmh_selected: The current screen visibly shows wind speed km/h selected. **no**
Assertion pressure_inhg_selected: The current screen visibly shows pressure inHg selected. **no**
Assertion pressure_mb_selected: The current screen visibly shows pressure mb selected. **no**

## v2-w05-wind-pressure-defaults (heldout)

Goal: Set Weather wind speed to km/h and pressure to inHg, then verify both selections in Settings.

Screen: [screenshot](../raw/v2-w05-wind-pressure-defaults.jpg) · [compact capture](../raw/v2-w05-wind-pressure-defaults.compact.json) · [full capture](../raw/v2-w05-wind-pressure-defaults.full.json)

Supplied values: none

Recent steps: Opened Weather Settings.

Acceptable next actions: `tap:e109`: Tap km/h or `tap:e113`: Tap inHg

Goal reached: no

Assertion wind_kmh_selected: The current screen visibly shows wind speed km/h selected. **no**
Assertion pressure_inhg_selected: The current screen visibly shows pressure inHg selected. **no**
Assertion pressure_mb_selected: The current screen visibly shows pressure mb selected. **yes**

## v2-w06-wind-only-changed (heldout)

Goal: Set Weather wind speed to km/h and pressure to inHg, then verify both selections in Settings.

Screen: [screenshot](../raw/v2-w06-wind-only-changed.jpg) · [compact capture](../raw/v2-w06-wind-only-changed.compact.json) · [full capture](../raw/v2-w06-wind-only-changed.full.json)

Supplied values: none

Recent steps: Opened Weather Settings. → Selected wind speed km/h.

Acceptable next action: `tap:e113`: Tap inHg

Goal reached: no

Assertion wind_kmh_selected: The current screen visibly shows wind speed km/h selected. **yes**
Assertion pressure_inhg_selected: The current screen visibly shows pressure inHg selected. **no**
Assertion pressure_mb_selected: The current screen visibly shows pressure mb selected. **yes**

## v2-w07-wind-pressure-selected (heldout)

Goal: Set Weather wind speed to km/h and pressure to inHg, then verify both selections in Settings.

Screen: [screenshot](../raw/v2-w07-wind-pressure-selected.jpg) · [compact capture](../raw/v2-w07-wind-pressure-selected.compact.json) · [full capture](../raw/v2-w07-wind-pressure-selected.full.json)

Supplied values: none

Recent steps: Opened Weather Settings. → Selected wind speed km/h. → Selected pressure inHg.

Acceptable next action: `stop-goal`: Stop because the goal is reached

Goal reached: yes

Assertion wind_kmh_selected: The current screen visibly shows wind speed km/h selected. **yes**
Assertion pressure_inhg_selected: The current screen visibly shows pressure inHg selected. **yes**
Assertion pressure_mb_selected: The current screen visibly shows pressure mb selected. **no**

## v2-c01-two-noah-rows (heldout)

Goal: Find the Noah Reed contact with noah.old@example.test, replace that address with noah.new@example.test, and verify the saved card.

Screen: [screenshot](../raw/v2-c01-two-noah-rows.jpg) · [compact capture](../raw/v2-c01-two-noah-rows.compact.json) · [full capture](../raw/v2-c01-two-noah-rows.full.json)

Supplied values: email="noah.new@example.test"

Recent steps: none

Acceptable next actions: `tap:e69`: Tap Contact photo for Noah Reed or `tap:e74`: Tap Contact photo for Noah Reed

Goal reached: no

Assertion new_email_saved: The saved Noah Reed contact card visibly shows noah.new@example.test. **no**
Assertion old_email_visible: The current screen visibly shows noah.old@example.test. **no**

## v2-c02-northstar-card-old-email (heldout)

Goal: Find the Noah Reed contact with noah.old@example.test, replace that address with noah.new@example.test, and verify the saved card.

Screen: [screenshot](../raw/v2-c02-northstar-card-old-email.jpg) · [compact capture](../raw/v2-c02-northstar-card-old-email.compact.json) · [full capture](../raw/v2-c02-northstar-card-old-email.full.json)

Supplied values: email="noah.new@example.test"

Recent steps: Inspected a Noah Reed card and found the old email.

Acceptable next action: `tap:e11`: Tap Edit

Goal reached: no

Assertion new_email_saved: The saved Noah Reed contact card visibly shows noah.new@example.test. **no**
Assertion old_email_visible: The current screen visibly shows noah.old@example.test. **yes**

## v2-c03-email-offscreen (heldout)

Goal: Find the Noah Reed contact with noah.old@example.test, replace that address with noah.new@example.test, and verify the saved card.

Screen: [screenshot](../raw/v2-c03-email-offscreen.jpg) · [compact capture](../raw/v2-c03-email-offscreen.compact.json) · [full capture](../raw/v2-c03-email-offscreen.full.json)

Supplied values: email="noah.new@example.test"

Recent steps: Opened the Noah Reed card with the old email. → Tapped Edit.

Acceptable next action: `swipe:e25:up`: Swipe up in scroll-view

Goal reached: no

Assertion new_email_saved: The saved Noah Reed contact card visibly shows noah.new@example.test. **no**
Assertion old_email_visible: The current screen visibly shows noah.old@example.test. **no**

## v2-c04-old-email-visible (heldout)

Goal: Find the Noah Reed contact with noah.old@example.test, replace that address with noah.new@example.test, and verify the saved card.

Screen: [screenshot](../raw/v2-c04-old-email-visible.jpg) · [compact capture](../raw/v2-c04-old-email-visible.compact.json) · [full capture](../raw/v2-c04-old-email-visible.full.json)

Supplied values: email="noah.new@example.test"

Recent steps: Opened Edit. → Swiped up in the contact form to reveal the email field.

Acceptable next action: `type:e96:email`: Replace all text in home with supplied email value (noah.new@example.test)

Goal reached: no

Assertion new_email_saved: The saved Noah Reed contact card visibly shows noah.new@example.test. **no**
Assertion old_email_visible: The current screen visibly shows noah.old@example.test. **yes**

## v2-c05-new-email-unsaved (heldout)

Goal: Find the Noah Reed contact with noah.old@example.test, replace that address with noah.new@example.test, and verify the saved card.

Screen: [screenshot](../raw/v2-c05-new-email-unsaved.jpg) · [compact capture](../raw/v2-c05-new-email-unsaved.compact.json) · [full capture](../raw/v2-c05-new-email-unsaved.full.json)

Supplied values: email="noah.new@example.test"

Recent steps: Revealed the old email field. → Replaced all text with the supplied new email.

Acceptable next action: `tap:e11`: Tap Done

Goal reached: no

Assertion new_email_saved: The saved Noah Reed contact card visibly shows noah.new@example.test. **no**
Assertion old_email_visible: The current screen visibly shows noah.old@example.test. **no**

## v2-c06-northstar-card-new-email (heldout)

Goal: Find the Noah Reed contact with noah.old@example.test, replace that address with noah.new@example.test, and verify the saved card.

Screen: [screenshot](../raw/v2-c06-northstar-card-new-email.jpg) · [compact capture](../raw/v2-c06-northstar-card-new-email.compact.json) · [full capture](../raw/v2-c06-northstar-card-new-email.full.json)

Supplied values: email="noah.new@example.test"

Recent steps: Replaced the old email. → Tapped Done. → Scrolled the saved card to the email row.

Acceptable next action: `stop-goal`: Stop because the goal is reached

Goal reached: yes

Assertion new_email_saved: The saved Noah Reed contact card visibly shows noah.new@example.test. **yes**
Assertion old_email_visible: The current screen visibly shows noah.old@example.test. **no**

## v2-c07-lena-search-ready (heldout)

Goal: Open an existing Lena Quill contact without creating a new contact.

Screen: [screenshot](../raw/v2-c07-lena-search-ready.jpg) · [compact capture](../raw/v2-c07-lena-search-ready.compact.json) · [full capture](../raw/v2-c07-lena-search-ready.full.json)

Supplied values: query="Lena Quill"

Recent steps: Opened Contacts search.

Acceptable next action: `type:e111:query`: Replace all text in text-field with supplied query value (Lena Quill)

Goal reached: no

Assertion lena_open: The current screen visibly shows an open Lena Quill contact card. **no**

## v2-c08-lena-no-results (heldout)

Goal: Open an existing Lena Quill contact without creating a new contact.

Screen: [screenshot](../raw/v2-c08-lena-no-results.jpg) · [compact capture](../raw/v2-c08-lena-no-results.compact.json) · [full capture](../raw/v2-c08-lena-no-results.full.json)

Supplied values: query="Lena Quill"

Recent steps: Opened Contacts search. → Searched for Lena Quill. → Waited for the results to settle.

Acceptable next action: `stop-blocked`: Stop because of an observed blocker

Goal reached: no

Assertion lena_open: The current screen visibly shows an open Lena Quill contact card. **no**

## v2-r01-weekend-list (heldout)

Goal: Rename the saved Weekend Errands list to Market Errands and verify the saved list title.

Screen: [screenshot](../raw/v2-r01-weekend-list.jpg) · [compact capture](../raw/v2-r01-weekend-list.compact.json) · [full capture](../raw/v2-r01-weekend-list.full.json)

Supplied values: newName="Market Errands"

Recent steps: none

Acceptable next action: `tap:e11`: Tap More

Goal reached: no

Assertion market_saved: The saved list title on this screen is Market Errands. **no**

## v2-r02-more-menu (heldout)

Goal: Rename the saved Weekend Errands list to Market Errands and verify the saved list title.

Screen: [screenshot](../raw/v2-r02-more-menu.jpg) · [compact capture](../raw/v2-r02-more-menu.compact.json) · [full capture](../raw/v2-r02-more-menu.full.json)

Supplied values: newName="Market Errands"

Recent steps: Opened the Weekend Errands list. → Tapped More.

Acceptable next action: `tap:e56`: Tap Show List Info

Goal reached: no

Assertion market_saved: The saved list title on this screen is Market Errands. **no**

## v2-r03-list-info-old-name (heldout)

Goal: Rename the saved Weekend Errands list to Market Errands and verify the saved list title.

Screen: [screenshot](../raw/v2-r03-list-info-old-name.jpg) · [compact capture](../raw/v2-r03-list-info-old-name.compact.json) · [full capture](../raw/v2-r03-list-info-old-name.full.json)

Supplied values: newName="Market Errands"

Recent steps: Opened More. → Opened Show List Info.

Acceptable next action: `type:e71:newName`: Replace all text in List Name with supplied newName value (Market Errands)

Goal reached: no

Assertion market_saved: The saved list title on this screen is Market Errands. **no**

## v2-r04-list-info-new-name (heldout)

Goal: Rename the saved Weekend Errands list to Market Errands and verify the saved list title.

Screen: [screenshot](../raw/v2-r04-list-info-new-name.jpg) · [compact capture](../raw/v2-r04-list-info-new-name.compact.json) · [full capture](../raw/v2-r04-list-info-new-name.full.json)

Supplied values: newName="Market Errands"

Recent steps: Opened Show List Info. → Replaced the list name with Market Errands.

Acceptable next action: `tap:e57`: Tap Done

Goal reached: no

Assertion market_saved: The saved list title on this screen is Market Errands. **no**

## v2-r05-renamed-list-saved (heldout)

Goal: Rename the saved Weekend Errands list to Market Errands and verify the saved list title.

Screen: [screenshot](../raw/v2-r05-renamed-list-saved.jpg) · [compact capture](../raw/v2-r05-renamed-list-saved.compact.json) · [full capture](../raw/v2-r05-renamed-list-saved.full.json)

Supplied values: newName="Market Errands"

Recent steps: Replaced the old list name. → Tapped Done.

Acceptable next action: `stop-goal`: Stop because the goal is reached

Goal reached: yes

Assertion market_saved: The saved list title on this screen is Market Errands. **yes**
Assertion weekend_still_saved: The saved list title on this screen is still Weekend Errands. **no**
