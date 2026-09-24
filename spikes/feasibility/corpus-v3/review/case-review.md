# Checkpoint feasibility cases for owner review

These 30 labels are drafts: the original 10 tuning captures have new checkpoint goals for development, and the 20 held-out captures are fresh. Review each screenshot, paired compact/full capture, acceptable action set, completion label, and assertion label before approving the frozen experiment. The complete offered-option list and hashes are in [label-review.md](label-review.md).

Each goal names one desired screen state at the active checkpoint. Values appear only where that checkpoint types. [Corpus notes](../README.md) record the synthetic setup and capture limitations. No screen justifies a `wait` label; that category remains unverified.

Both Iris Moss rows are valid inspection steps because the list does not reveal which has the unique old email. On the final Weather, Contacts, Reminders, and Diagnostic screens, a visible desired state can coexist with a false assertion. A reached goal with a false assertion supports a failed verdict under the all-assertions rule.

## t01-settings-onofflabels-root (tuning)

Goal: The Accessibility page is open with its Vision section and Display & Text Size row visible.

Screen: [screenshot](../raw/t01-settings-onofflabels-root.jpg) · [compact capture](../raw/t01-settings-onofflabels-root.compact.json) · [full capture](../raw/t01-settings-onofflabels-root.full.json)

Supplied values: none

Recent steps: none

Acceptable next action: `tap:e54`: Tap Accessibility

Goal reached: no

Assertion accessibility_vision_visible: The Accessibility page visibly shows Vision and Display & Text Size. **no**

## t02-settings-onofflabels-accessibility (tuning)

Goal: The Display & Text Size page is open with the On/Off Labels control visible.

Screen: [screenshot](../raw/t02-settings-onofflabels-accessibility.jpg) · [compact capture](../raw/t02-settings-onofflabels-accessibility.compact.json) · [full capture](../raw/t02-settings-onofflabels-accessibility.full.json)

Supplied values: none

Recent steps: Opened Accessibility from Settings.

Acceptable next actions: `tap:e44`: Tap Display & Text Size or `tap:e166`: Tap Display & Text Size or `tap:e47`: Tap Display & Text Size or `tap:e169`: Tap Display & Text Size

Goal reached: no

Assertion onoff_control_visible: The Display & Text Size page visibly shows the On/Off Labels control. **no**

Supplementary positional wording on this same screen: Open the second row in the Vision section so the Display & Text Size page is visible.

Acceptable action: `tap:e44`: Tap Display & Text Size or `tap:e166`: Tap Display & Text Size or `tap:e47`: Tap Display & Text Size or `tap:e169`: Tap Display & Text Size

## t03-settings-onofflabels-off (tuning)

Goal: The On/Off Labels control is visibly on.

Screen: [screenshot](../raw/t03-settings-onofflabels-off.jpg) · [compact capture](../raw/t03-settings-onofflabels-off.compact.json) · [full capture](../raw/t03-settings-onofflabels-off.full.json)

Supplied values: none

Recent steps: Opened Accessibility. → Opened Display & Text Size.

Acceptable next actions: `tap:e35`: Tap On/Off Labels or `tap:e37`: Tap On/Off Labels

Goal reached: no

Assertion onoff_on: The On/Off Labels control visibly has value on. **no**

## t04-settings-onofflabels-on (tuning)

Goal: The On/Off Labels control is visibly on.

Screen: [screenshot](../raw/t04-settings-onofflabels-on.jpg) · [compact capture](../raw/t04-settings-onofflabels-on.compact.json) · [full capture](../raw/t04-settings-onofflabels-on.full.json)

Supplied values: none

Recent steps: Opened Display & Text Size. → Turned on On/Off Labels.

Acceptable next action: `stop-goal`: Stop because the goal is reached

Goal reached: yes

Assertion onoff_on: The On/Off Labels control visibly has value on. **yes**

## t05-contacts-create-list (tuning)

Goal: A New Contact form is open with an empty First name field.

Screen: [screenshot](../raw/t05-contacts-create-list.jpg) · [compact capture](../raw/t05-contacts-create-list.compact.json) · [full capture](../raw/t05-contacts-create-list.full.json)

Supplied values: none

Recent steps: none

Acceptable next action: `tap:e89`: Tap Add

Goal reached: no

Assertion new_contact_form_open: A New Contact form visibly shows an empty First name field. **no**

## t06-contacts-create-blank (tuning)

Goal: The First name field on the New Contact form contains Mira.

Screen: [screenshot](../raw/t06-contacts-create-blank.jpg) · [compact capture](../raw/t06-contacts-create-blank.compact.json) · [full capture](../raw/t06-contacts-create-blank.full.json)

Supplied values: firstName="Mira"

Recent steps: Tapped Add on the Contacts list.

Acceptable next action: `type:e116:firstName`: Replace all text in First name with supplied firstName value (Mira)

Goal reached: no

Assertion first_name_mira: The First name field visibly contains Mira. **no**

## t07-contacts-create-filled (tuning)

Goal: A saved Mira Vale contact card is visible, outside the edit form.

Screen: [screenshot](../raw/t07-contacts-create-filled.jpg) · [compact capture](../raw/t07-contacts-create-filled.compact.json) · [full capture](../raw/t07-contacts-create-filled.full.json)

Supplied values: none

Recent steps: Opened a new contact form. → Typed first name Mira and last name Vale.

Acceptable next action: `tap:e103`: Tap Done

Goal reached: no

Assertion saved_mira_card: A saved contact card visibly shows Mira Vale. **no**

## t08-reminders-create-onboarding (tuning)

Goal: The Welcome sheet is dismissed and the iCloud syncing choice is visibly in front.

Screen: [screenshot](../raw/t08-reminders-create-onboarding.jpg) · [compact capture](../raw/t08-reminders-create-onboarding.compact.json) · [full capture](../raw/t08-reminders-create-onboarding.full.json)

Supplied values: none

Recent steps: none

Acceptable next action: `tap:e78`: Tap Continue

Goal reached: no

Assertion icloud_choice_visible: The iCloud syncing choice is visibly in front. **no**

## t09-reminders-create-icloud-prompt (tuning)

Goal: The local Reminders list is visible with the iCloud prompt gone.

Screen: [screenshot](../raw/t09-reminders-create-icloud-prompt.jpg) · [compact capture](../raw/t09-reminders-create-icloud-prompt.compact.json) · [full capture](../raw/t09-reminders-create-icloud-prompt.full.json)

Supplied values: none

Recent steps: Tapped Continue on Reminders onboarding.

Acceptable next action: `tap:e71`: Tap Not Now

Goal reached: no

Assertion local_list_unblocked: The local Reminders list is visible without an iCloud prompt. **no**

## t10-reminders-create-empty-list (tuning)

Goal: The New Reminder composer is open with its Title field visible.

Screen: [screenshot](../raw/t10-reminders-create-empty-list.jpg) · [compact capture](../raw/t10-reminders-create-empty-list.compact.json) · [full capture](../raw/t10-reminders-create-empty-list.full.json)

Supplied values: none

Recent steps: Continued onboarding. → Chose Not Now for iCloud syncing.

Acceptable next action: `tap:e44`: Tap New Reminder

Goal reached: no

Assertion composer_title_visible: The New Reminder composer visibly shows its Title field. **no**

## v3-w01-location-picker (heldout)

Goal: Weather location search results visibly include Oslo.

Screen: [screenshot](../raw/v3-w01-location-picker.jpg) · [compact capture](../raw/v3-w01-location-picker.compact.json) · [full capture](../raw/v3-w01-location-picker.full.json)

Supplied values: query="Oslo"

Recent steps: Opened the Weather location picker.

Acceptable next action: `type:e103:query`: Replace all text in weather.locationsSheet with supplied query value (Oslo)

Goal reached: no

Assertion oslo_result_visible: The Weather search result list visibly includes Oslo. **no**

## v3-w02-oslo-search-result (heldout)

Goal: The main Weather location button visibly reads Oslo.

Screen: [screenshot](../raw/v3-w02-oslo-search-result.jpg) · [compact capture](../raw/v3-w02-oslo-search-result.compact.json) · [full capture](../raw/v3-w02-oslo-search-result.full.json)

Supplied values: none

Recent steps: Typed Oslo into Weather location search.

Acceptable next action: `tap:e108`: Tap Oslo, Norway, 10:24 PM · Snow Showers

Goal reached: no

Assertion main_location_oslo: The main Weather location button visibly reads Oslo. **no**

## v3-w03-oslo-main (heldout)

Goal: The Weather Settings sheet is open with Wind speed controls visible.

Screen: [screenshot](../raw/v3-w03-oslo-main.jpg) · [compact capture](../raw/v3-w03-oslo-main.compact.json) · [full capture](../raw/v3-w03-oslo-main.full.json)

Supplied values: none

Recent steps: Selected Oslo from search. → Closed the location picker.

Acceptable next action: `tap:e89`: Tap Settings

Goal reached: no

Assertion wind_controls_visible: The Weather Settings sheet visibly shows Wind speed controls. **no**

## v3-w04-wind-mph-settings (heldout)

Goal: Wind speed m/s is visibly selected in Weather Settings.

Screen: [screenshot](../raw/v3-w04-wind-mph-settings.jpg) · [compact capture](../raw/v3-w04-wind-mph-settings.compact.json) · [full capture](../raw/v3-w04-wind-mph-settings.full.json)

Supplied values: none

Recent steps: Opened Weather Settings from Oslo.

Acceptable next action: `tap:e110`: Tap m/s

Goal reached: no

Assertion wind_ms_selected: Weather Settings visibly shows m/s selected for Wind speed. **no**

## v3-w05-wind-ms-selected (heldout)

Goal: Wind speed m/s is visibly selected in Weather Settings.

Screen: [screenshot](../raw/v3-w05-wind-ms-selected.jpg) · [compact capture](../raw/v3-w05-wind-ms-selected.compact.json) · [full capture](../raw/v3-w05-wind-ms-selected.full.json)

Supplied values: none

Recent steps: Opened Weather Settings from Oslo. → Selected m/s for Wind speed.

Acceptable next action: `stop-goal`: Stop because the goal is reached

Goal reached: yes

Assertion wind_ms_selected: Weather Settings visibly shows m/s selected for Wind speed. **yes**
Assertion wind_mph_selected: Weather Settings visibly shows mph selected for Wind speed. **no**

## v3-c01-two-iris-rows (heldout)

Goal: An Iris Moss contact card visibly shows iris.old@example.test.

Screen: [screenshot](../raw/v3-c01-two-iris-rows.jpg) · [compact capture](../raw/v3-c01-two-iris-rows.compact.json) · [full capture](../raw/v3-c01-two-iris-rows.full.json)

Supplied values: none

Recent steps: none

Acceptable next actions: `tap:e79`: Tap Contact photo for Iris Moss or `tap:e84`: Tap Contact photo for Iris Moss

Goal reached: no

Assertion iris_old_card_visible: An open Iris Moss contact card visibly shows iris.old@example.test. **no**

## v3-c02-iris-old-card (heldout)

Goal: The Iris Moss Edit form is open.

Screen: [screenshot](../raw/v3-c02-iris-old-card.jpg) · [compact capture](../raw/v3-c02-iris-old-card.compact.json) · [full capture](../raw/v3-c02-iris-old-card.full.json)

Supplied values: none

Recent steps: Inspected an Iris Moss card and found the unique old email.

Acceptable next action: `tap:e11`: Tap Edit

Goal reached: no

Assertion iris_edit_open: The Iris Moss Edit form is visibly open. **no**

## v3-c03-iris-email-offscreen (heldout)

Goal: The edit form visibly shows the email field containing iris.old@example.test.

Screen: [screenshot](../raw/v3-c03-iris-email-offscreen.jpg) · [compact capture](../raw/v3-c03-iris-email-offscreen.compact.json) · [full capture](../raw/v3-c03-iris-email-offscreen.full.json)

Supplied values: none

Recent steps: Opened the Iris Moss card with the old email. → Tapped Edit.

Acceptable next action: `swipe:e25:up`: Swipe up in scroll-view

Goal reached: no

Assertion old_email_field_visible: The email field containing iris.old@example.test is visibly in the edit form viewport. **no**

## v3-c04-iris-old-email-visible (heldout)

Goal: The edit form email field contains iris.new@example.test.

Screen: [screenshot](../raw/v3-c04-iris-old-email-visible.jpg) · [compact capture](../raw/v3-c04-iris-old-email-visible.compact.json) · [full capture](../raw/v3-c04-iris-old-email-visible.full.json)

Supplied values: email="iris.new@example.test"

Recent steps: Opened Edit. → Swiped up in the contact form to reveal the old email field.

Acceptable next action: `type:e108:email`: Replace all text in home with supplied email value (iris.new@example.test)

Goal reached: no

Assertion new_email_field_value: The edit form email field visibly contains iris.new@example.test. **no**

## v3-c05-iris-new-email-unsaved (heldout)

Goal: A saved Iris Moss contact card visibly shows iris.new@example.test.

Screen: [screenshot](../raw/v3-c05-iris-new-email-unsaved.jpg) · [compact capture](../raw/v3-c05-iris-new-email-unsaved.compact.json) · [full capture](../raw/v3-c05-iris-new-email-unsaved.full.json)

Supplied values: none

Recent steps: Revealed the old email field. → Replaced it with the supplied new email.

Acceptable next action: `tap:e11`: Tap Done

Goal reached: no

Assertion new_email_saved_card: A saved Iris Moss card visibly shows iris.new@example.test. **no**

## v3-c06-iris-new-saved-card (heldout)

Goal: A saved Iris Moss contact card visibly shows iris.new@example.test.

Screen: [screenshot](../raw/v3-c06-iris-new-saved-card.jpg) · [compact capture](../raw/v3-c06-iris-new-saved-card.compact.json) · [full capture](../raw/v3-c06-iris-new-saved-card.full.json)

Supplied values: none

Recent steps: Replaced the old email. → Tapped Done. → Scrolled the saved card to its email row.

Acceptable next action: `stop-goal`: Stop because the goal is reached

Goal reached: yes

Assertion new_email_saved_card: A saved Iris Moss card visibly shows iris.new@example.test. **yes**
Assertion old_email_still_visible: The saved card visibly shows iris.old@example.test. **no**

## v3-c07-ada-search-ready (heldout)

Goal: Contacts search visibly reports finished results for Ada Birch.

Screen: [screenshot](../raw/v3-c07-ada-search-ready.jpg) · [compact capture](../raw/v3-c07-ada-search-ready.compact.json) · [full capture](../raw/v3-c07-ada-search-ready.full.json)

Supplied values: query="Ada Birch"

Recent steps: Opened Contacts search.

Acceptable next action: `type:e116:query`: Replace all text in text-field with supplied query value (Ada Birch)

Goal reached: no

Assertion ada_no_results_visible: Contacts search visibly says No Results for Ada Birch. **no**

## v3-c08-ada-no-results (heldout)

Goal: An existing Ada Birch contact card is open.

Screen: [screenshot](../raw/v3-c08-ada-no-results.jpg) · [compact capture](../raw/v3-c08-ada-no-results.compact.json) · [full capture](../raw/v3-c08-ada-no-results.full.json)

Supplied values: none

Recent steps: Opened Contacts search. → Searched for Ada Birch. → Waited for results to settle.

Acceptable next action: `stop-blocked`: Stop because of an observed blocker

Goal reached: no

Assertion ada_card_open: An existing Ada Birch contact card is visibly open. **no**

## v3-r01-pack-batteries-notes-empty (heldout)

Goal: The Pack batteries Details Notes field visibly contains Bring charger.

Screen: [screenshot](../raw/v3-r01-pack-batteries-notes-empty.jpg) · [compact capture](../raw/v3-r01-pack-batteries-notes-empty.compact.json) · [full capture](../raw/v3-r01-pack-batteries-notes-empty.full.json)

Supplied values: note="Bring charger"

Recent steps: Opened Pack batteries Details.

Acceptable next action: `type:e92:note`: Replace all text in Notes with supplied note value (Bring charger)

Goal reached: no

Assertion notes_bring_charger: The foreground Notes field visibly contains Bring charger. **no**

## v3-r02-pack-batteries-notes-unsaved (heldout)

Goal: A saved Pack batteries reminder row visibly includes Bring charger.

Screen: [screenshot](../raw/v3-r02-pack-batteries-notes-unsaved.jpg) · [compact capture](../raw/v3-r02-pack-batteries-notes-unsaved.compact.json) · [full capture](../raw/v3-r02-pack-batteries-notes-unsaved.full.json)

Supplied values: none

Recent steps: Typed Bring charger into Pack batteries Notes.

Acceptable next action: `tap:e75`: Tap Done

Goal reached: no

Assertion saved_row_has_note: A saved Pack batteries reminder row visibly includes Bring charger. **no**

## v3-r03-pack-batteries-saved-note (heldout)

Goal: A saved Pack batteries reminder row visibly includes Bring charger.

Screen: [screenshot](../raw/v3-r03-pack-batteries-saved-note.jpg) · [compact capture](../raw/v3-r03-pack-batteries-saved-note.compact.json) · [full capture](../raw/v3-r03-pack-batteries-saved-note.full.json)

Supplied values: none

Recent steps: Typed Bring charger into Notes. → Tapped Done.

Acceptable next action: `stop-goal`: Stop because the goal is reached

Goal reached: yes

Assertion saved_row_has_note: A saved Pack batteries reminder row visibly includes Bring charger. **yes**
Assertion saved_row_note_absent: The saved Pack batteries reminder row has no note. **no**

## v3-d01-shop-empty (heldout)

Goal: Sample Shop visibly says Selected: Apple.

Screen: [screenshot](../raw/v3-d01-shop-empty.jpg) · [compact capture](../raw/v3-d01-shop-empty.compact.json) · [full capture](../raw/v3-d01-shop-empty.full.json)

Supplied values: none

Recent steps: none

Acceptable next action: `tap:e16`: Tap Add Apple ($2)

Goal reached: no

Assertion apple_selected: Sample Shop visibly says Selected: Apple. **no**

## v3-d02-apple-selected (heldout)

Goal: Sample Shop visibly says Selected: Apple, Bread.

Screen: [screenshot](../raw/v3-d02-apple-selected.jpg) · [compact capture](../raw/v3-d02-apple-selected.compact.json) · [full capture](../raw/v3-d02-apple-selected.full.json)

Supplied values: none

Recent steps: Tapped Add Apple.

Acceptable next action: `tap:e19`: Tap Add Bread ($3)

Goal reached: no

Assertion both_selected: Sample Shop visibly says Selected: Apple, Bread. **no**

## v3-d03-both-selected (heldout)

Goal: The Order complete confirmation page is visibly open.

Screen: [screenshot](../raw/v3-d03-both-selected.jpg) · [compact capture](../raw/v3-d03-both-selected.compact.json) · [full capture](../raw/v3-d03-both-selected.full.json)

Supplied values: none

Recent steps: Tapped Add Apple. → Tapped Add Bread.

Acceptable next action: `tap:e22`: Tap Complete order

Goal reached: no

Assertion confirmation_visible: The Order complete confirmation page is visibly open. **no**

## v3-d04-order-complete-total3 (heldout)

Goal: The Order complete confirmation page is visibly open.

Screen: [screenshot](../raw/v3-d04-order-complete-total3.jpg) · [compact capture](../raw/v3-d04-order-complete-total3.compact.json) · [full capture](../raw/v3-d04-order-complete-total3.full.json)

Supplied values: none

Recent steps: Tapped Add Apple. → Tapped Add Bread. → Tapped Complete order.

Acceptable next action: `stop-goal`: Stop because the goal is reached

Goal reached: yes

Assertion confirmation_visible: The Order complete confirmation page is visibly open. **yes**
Assertion total_three_visible: The confirmation visibly shows Total: $3. **yes**
Assertion total_five_visible: The confirmation visibly shows Total: $5. **no**
