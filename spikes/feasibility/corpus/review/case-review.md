# Corpus cases for owner label review

These 30 labels are drafts. Review the screenshot and the paired compact/full evidence for each case before approving a frozen experiment. The full candidate list and the corpus and manifest hashes are in [label-review.md](label-review.md).

The corpus has no truthful wait case. The iOS 26.4 simulator does not show Software Update under General, and no captured screen showed a transient loading state. This is a coverage gap against the feasibility plan.

In h04, finding the United States region completes the goal, while the claim that the region is France is false. A completed run should therefore fail that assertion. In h18 and h19, zero active reminders do not rule out a completed item; search remains the proposed next step before the settled empty result in h20.

## t01-settings-onofflabels-root (tuning)

Goal: Turn on On/Off Labels in Accessibility.

Screen: [screenshot](../raw/t01-settings-onofflabels-root.jpg) · [compact capture](../raw/t01-settings-onofflabels-root.compact.json) · [full capture](../raw/t01-settings-onofflabels-root.full.json)

Supplied values: none

Recent steps: none

Acceptable next action: Tap Accessibility

Goal reached: no

Assertion labels_enabled: On/Off Labels is visibly enabled. **no**

## t02-settings-onofflabels-accessibility (tuning)

Goal: Turn on On/Off Labels in Accessibility.

Screen: [screenshot](../raw/t02-settings-onofflabels-accessibility.jpg) · [compact capture](../raw/t02-settings-onofflabels-accessibility.compact.json) · [full capture](../raw/t02-settings-onofflabels-accessibility.full.json)

Supplied values: none

Recent steps: Opened Accessibility from Settings.

Acceptable next actions: Tap Display & Text Size

Goal reached: no

Assertion labels_enabled: On/Off Labels is visibly enabled. **no**

Supplementary positional wording on this same screen: Open the second row in the Vision section of Accessibility.

Acceptable action: Tap Display & Text Size

## t03-settings-onofflabels-off (tuning)

Goal: Turn on On/Off Labels in Accessibility.

Screen: [screenshot](../raw/t03-settings-onofflabels-off.jpg) · [compact capture](../raw/t03-settings-onofflabels-off.compact.json) · [full capture](../raw/t03-settings-onofflabels-off.full.json)

Supplied values: none

Recent steps: Opened Accessibility. → Opened Display & Text Size.

Acceptable next actions: Tap On/Off Labels

Goal reached: no

Assertion labels_enabled: On/Off Labels is visibly enabled. **no**

## t04-settings-onofflabels-on (tuning)

Goal: Turn on On/Off Labels in Accessibility.

Screen: [screenshot](../raw/t04-settings-onofflabels-on.jpg) · [compact capture](../raw/t04-settings-onofflabels-on.compact.json) · [full capture](../raw/t04-settings-onofflabels-on.full.json)

Supplied values: none

Recent steps: Opened Display & Text Size. → Turned on On/Off Labels.

Acceptable next action: Stop: goal reached

Goal reached: yes

Assertion labels_enabled: On/Off Labels is visibly enabled. **yes**

## t05-contacts-create-list (tuning)

Goal: Create a saved contact named Mira Vale.

Screen: [screenshot](../raw/t05-contacts-create-list.jpg) · [compact capture](../raw/t05-contacts-create-list.compact.json) · [full capture](../raw/t05-contacts-create-list.full.json)

Supplied values: firstName="Mira", lastName="Vale"

Recent steps: none

Acceptable next action: Tap Add

Goal reached: no

Assertion contact_saved: A saved contact named Mira Vale is visible. **no**

## t06-contacts-create-blank (tuning)

Goal: Create a saved contact named Mira Vale.

Screen: [screenshot](../raw/t06-contacts-create-blank.jpg) · [compact capture](../raw/t06-contacts-create-blank.compact.json) · [full capture](../raw/t06-contacts-create-blank.full.json)

Supplied values: firstName="Mira", lastName="Vale"

Recent steps: Tapped Add on the Contacts list.

Acceptable next actions: Replace all text in First name with supplied firstName value (Mira) or Replace all text in Last name with supplied lastName value (Vale)

Goal reached: no

Assertion contact_saved: A saved contact named Mira Vale is visible. **no**

## t07-contacts-create-filled (tuning)

Goal: Create a saved contact named Mira Vale.

Screen: [screenshot](../raw/t07-contacts-create-filled.jpg) · [compact capture](../raw/t07-contacts-create-filled.compact.json) · [full capture](../raw/t07-contacts-create-filled.full.json)

Supplied values: firstName="Mira", lastName="Vale"

Recent steps: Opened a new contact form. → Typed first name Mira and last name Vale.

Acceptable next action: Tap Done

Goal reached: no

Assertion contact_saved: A saved contact named Mira Vale is visible. **no**

## t08-reminders-create-onboarding (tuning)

Goal: Create a reminder titled Call Mira in the local Reminders list.

Screen: [screenshot](../raw/t08-reminders-create-onboarding.jpg) · [compact capture](../raw/t08-reminders-create-onboarding.compact.json) · [full capture](../raw/t08-reminders-create-onboarding.full.json)

Supplied values: title="Call Mira"

Recent steps: none

Acceptable next action: Tap Continue

Goal reached: no

Assertion reminder_saved: A saved reminder titled Call Mira is visible. **no**

## t09-reminders-create-icloud-prompt (tuning)

Goal: Create a reminder titled Call Mira in the local Reminders list.

Screen: [screenshot](../raw/t09-reminders-create-icloud-prompt.jpg) · [compact capture](../raw/t09-reminders-create-icloud-prompt.compact.json) · [full capture](../raw/t09-reminders-create-icloud-prompt.full.json)

Supplied values: title="Call Mira"

Recent steps: Tapped Continue on Reminders onboarding.

Acceptable next action: Tap Not Now

Goal reached: no

Assertion reminder_saved: A saved reminder titled Call Mira is visible. **no**

## t10-reminders-create-empty-list (tuning)

Goal: Create a reminder titled Call Mira in the local Reminders list.

Screen: [screenshot](../raw/t10-reminders-create-empty-list.jpg) · [compact capture](../raw/t10-reminders-create-empty-list.compact.json) · [full capture](../raw/t10-reminders-create-empty-list.full.json)

Supplied values: title="Call Mira"

Recent steps: Continued onboarding. → Chose Not Now for iCloud syncing.

Acceptable next action: Tap New Reminder

Goal reached: no

Assertion reminder_saved: A saved reminder titled Call Mira is visible. **no**

## h01-settings-about-general (heldout)

Goal: Open the detailed iOS version screen and find its build identifier.

Screen: [screenshot](../raw/h01-settings-about-general.jpg) · [compact capture](../raw/h01-settings-about-general.compact.json) · [full capture](../raw/h01-settings-about-general.full.json)

Supplied values: none

Recent steps: Opened General from Settings.

Acceptable next actions: Tap About

Goal reached: no

Assertion build_shown: The iOS build identifier 23E254a is visible. **no**

## h02-settings-about-version-row (heldout)

Goal: Open the detailed iOS version screen and find its build identifier.

Screen: [screenshot](../raw/h02-settings-about-version-row.jpg) · [compact capture](../raw/h02-settings-about-version-row.compact.json) · [full capture](../raw/h02-settings-about-version-row.full.json)

Supplied values: none

Recent steps: Opened General. → Opened About.

Acceptable next actions: Tap iOS Version, 26.4.1

Goal reached: no

Assertion build_shown: The iOS build identifier 23E254a is visible. **no**

## h03-settings-about-build-detail (heldout)

Goal: Open the detailed iOS version screen and find its build identifier.

Screen: [screenshot](../raw/h03-settings-about-build-detail.jpg) · [compact capture](../raw/h03-settings-about-build-detail.compact.json) · [full capture](../raw/h03-settings-about-build-detail.full.json)

Supplied values: none

Recent steps: Opened General. → Opened About. → Opened iOS Version.

Acceptable next action: Stop: goal reached

Goal reached: yes

Assertion build_shown: The iOS build identifier 23E254a is visible. **yes**

## h04-settings-region-check (heldout)

Goal: Verify the device region shown in Language & Region is United States.

Screen: [screenshot](../raw/h04-settings-region-check.jpg) · [compact capture](../raw/h04-settings-region-check.compact.json) · [full capture](../raw/h04-settings-region-check.full.json)

Supplied values: none

Recent steps: Opened General. → Opened Language & Region.

Acceptable next action: Stop: goal reached

Goal reached: yes

Assertion region_us: The device region shown is United States. **yes**
Assertion region_france: The device region shown is France. **no**

## h05-settings-keyboard-top (heldout)

Goal: Open the Dictation Languages list under Keyboard settings.

Screen: [screenshot](../raw/h05-settings-keyboard-top.jpg) · [compact capture](../raw/h05-settings-keyboard-top.compact.json) · [full capture](../raw/h05-settings-keyboard-top.full.json)

Supplied values: none

Recent steps: Opened General. → Opened Keyboard.

Acceptable next action: Swipe up in scroll-view

Goal reached: no

Assertion languages_shown: The Dictation Languages list shows English (US) and Vietnamese. **no**

## h06-settings-dictation-languages-row (heldout)

Goal: Open the Dictation Languages list under Keyboard settings.

Screen: [screenshot](../raw/h06-settings-dictation-languages-row.jpg) · [compact capture](../raw/h06-settings-dictation-languages-row.compact.json) · [full capture](../raw/h06-settings-dictation-languages-row.full.json)

Supplied values: none

Recent steps: Opened Keyboard. → Scrolled down to the Dictation section.

Acceptable next actions: Tap Dictation Languages

Goal reached: no

Assertion languages_shown: The Dictation Languages list shows English (US) and Vietnamese. **no**

## h07-settings-dictation-languages-open (heldout)

Goal: Open the Dictation Languages list under Keyboard settings.

Screen: [screenshot](../raw/h07-settings-dictation-languages-open.jpg) · [compact capture](../raw/h07-settings-dictation-languages-open.compact.json) · [full capture](../raw/h07-settings-dictation-languages-open.full.json)

Supplied values: none

Recent steps: Opened Keyboard. → Scrolled to Dictation Languages. → Opened Dictation Languages.

Acceptable next action: Stop: goal reached

Goal reached: yes

Assertion languages_shown: The Dictation Languages list shows English (US) and Vietnamese. **yes**

## h08-contacts-find-list (heldout)

Goal: Open the saved contact Mira Stone.

Screen: [screenshot](../raw/h08-contacts-find-list.jpg) · [compact capture](../raw/h08-contacts-find-list.compact.json) · [full capture](../raw/h08-contacts-find-list.full.json)

Supplied values: query="Mira"

Recent steps: none

Acceptable next actions: Tap Contact photo for Mira Stone or Replace all text in text-field with supplied query value (Mira)

Goal reached: no

Assertion contact_open: The Mira Stone contact card is open. **no**

## h09-contacts-find-results (heldout)

Goal: Open the saved contact Mira Stone.

Screen: [screenshot](../raw/h09-contacts-find-results.jpg) · [compact capture](../raw/h09-contacts-find-results.compact.json) · [full capture](../raw/h09-contacts-find-results.full.json)

Supplied values: query="Mira"

Recent steps: Typed Mira in Contacts search.

Acceptable next action: Tap Contact photo for Mira Stone

Goal reached: no

Assertion contact_open: The Mira Stone contact card is open. **no**

## h10-contacts-find-opened (heldout)

Goal: Open the saved contact Mira Stone.

Screen: [screenshot](../raw/h10-contacts-find-opened.jpg) · [compact capture](../raw/h10-contacts-find-opened.compact.json) · [full capture](../raw/h10-contacts-find-opened.full.json)

Supplied values: query="Mira"

Recent steps: Searched Contacts for Mira. → Opened the Mira Stone result.

Acceptable next action: Stop: goal reached

Goal reached: yes

Assertion contact_open: The Mira Stone contact card is open. **yes**

## h11-contacts-edit-detail (heldout)

Goal: Change Mira Vale's last name to Stone and verify the saved contact.

Screen: [screenshot](../raw/h11-contacts-edit-detail.jpg) · [compact capture](../raw/h11-contacts-edit-detail.compact.json) · [full capture](../raw/h11-contacts-edit-detail.full.json)

Supplied values: lastName="Stone"

Recent steps: Opened the saved Mira Vale contact.

Acceptable next action: Tap Edit

Goal reached: no

Assertion surname_stone: The saved contact card shows Mira Stone. **no**

## h12-contacts-edit-form (heldout)

Goal: Change Mira Vale's last name to Stone and verify the saved contact.

Screen: [screenshot](../raw/h12-contacts-edit-form.jpg) · [compact capture](../raw/h12-contacts-edit-form.compact.json) · [full capture](../raw/h12-contacts-edit-form.full.json)

Supplied values: lastName="Stone"

Recent steps: Opened Mira Vale. → Tapped Edit.

Acceptable next action: Replace all text in Last name with supplied lastName value (Stone)

Goal reached: no

Assertion surname_stone: The saved contact card shows Mira Stone. **no**

## h13-contacts-edit-saved (heldout)

Goal: Change Mira Vale's last name to Stone and verify the saved contact.

Screen: [screenshot](../raw/h13-contacts-edit-saved.jpg) · [compact capture](../raw/h13-contacts-edit-saved.compact.json) · [full capture](../raw/h13-contacts-edit-saved.full.json)

Supplied values: lastName="Stone"

Recent steps: Tapped Edit. → Replaced Vale with Stone. → Tapped Done.

Acceptable next action: Stop: goal reached

Goal reached: yes

Assertion surname_stone: The saved contact card shows Mira Stone. **yes**

## h14-reminders-complete-list (heldout)

Goal: Complete Call Mira and verify that it appears as Completed.

Screen: [screenshot](../raw/h14-reminders-complete-list.jpg) · [compact capture](../raw/h14-reminders-complete-list.compact.json) · [full capture](../raw/h14-reminders-complete-list.full.json)

Supplied values: none

Recent steps: Created the reminder Call Mira.

Acceptable next action: Tap circle

Goal reached: no

Assertion reminder_completed: Call Mira is visibly marked Completed. **no**

## h15-reminders-complete-call-mira (heldout)

Goal: Complete Call Mira and verify that it appears as Completed.

Screen: [screenshot](../raw/h15-reminders-complete-call-mira.jpg) · [compact capture](../raw/h15-reminders-complete-call-mira.compact.json) · [full capture](../raw/h15-reminders-complete-call-mira.full.json)

Supplied values: none

Recent steps: Tapped the completion circle for Call Mira; the item left the active list.

Acceptable next action: Tap More

Goal reached: no

Assertion reminder_completed: Call Mira is visibly marked Completed. **no**

## h16-reminders-complete-menu (heldout)

Goal: Complete Call Mira and verify that it appears as Completed.

Screen: [screenshot](../raw/h16-reminders-complete-menu.jpg) · [compact capture](../raw/h16-reminders-complete-menu.compact.json) · [full capture](../raw/h16-reminders-complete-menu.full.json)

Supplied values: none

Recent steps: Completed Call Mira. → Opened the list's More menu.

Acceptable next action: Tap Show Completed

Goal reached: no

Assertion reminder_completed: Call Mira is visibly marked Completed. **no**

## h17-reminders-complete-confirmed (heldout)

Goal: Complete Call Mira and verify that it appears as Completed.

Screen: [screenshot](../raw/h17-reminders-complete-confirmed.jpg) · [compact capture](../raw/h17-reminders-complete-confirmed.compact.json) · [full capture](../raw/h17-reminders-complete-confirmed.full.json)

Supplied values: none

Recent steps: Completed Call Mira. → Opened More. → Selected Show Completed.

Acceptable next action: Stop: goal reached

Goal reached: yes

Assertion reminder_completed: Call Mira is visibly marked Completed. **yes**

## h18-reminders-missing-lists (heldout)

Goal: Open the pre-existing reminder titled Follow up with Nia without creating a new reminder.

Screen: [screenshot](../raw/h18-reminders-missing-lists.jpg) · [compact capture](../raw/h18-reminders-missing-lists.compact.json) · [full capture](../raw/h18-reminders-missing-lists.full.json)

Supplied values: query="Follow up with Nia"

Recent steps: none

Acceptable next action: Tap Search

Goal reached: no

Assertion target_open: The Follow up with Nia reminder is visibly open. **no**

## h19-reminders-missing-search (heldout)

Goal: Open the pre-existing reminder titled Follow up with Nia without creating a new reminder.

Screen: [screenshot](../raw/h19-reminders-missing-search.jpg) · [compact capture](../raw/h19-reminders-missing-search.compact.json) · [full capture](../raw/h19-reminders-missing-search.full.json)

Supplied values: query="Follow up with Nia"

Recent steps: Opened Reminders search.

Acceptable next action: Replace all text in text-field with supplied query value (Follow up with Nia)

Goal reached: no

Assertion target_open: The Follow up with Nia reminder is visibly open. **no**

## h20-reminders-missing-no-results (heldout)

Goal: Open the pre-existing reminder titled Follow up with Nia without creating a new reminder.

Screen: [screenshot](../raw/h20-reminders-missing-no-results.jpg) · [compact capture](../raw/h20-reminders-missing-no-results.compact.json) · [full capture](../raw/h20-reminders-missing-no-results.full.json)

Supplied values: query="Follow up with Nia"

Recent steps: Opened Reminders search. → Searched for Follow up with Nia. → Waited for search results to settle.

Acceptable next action: Stop: observed blocker

Goal reached: no

Assertion target_open: The Follow up with Nia reminder is visibly open. **no**
