# Feasibility corpus label review

Corpus SHA-256: `136dd6ed8e7880e6e1118b1691a31693b72a19f0498cd7ef8b4be475d58363cf`
Manifest SHA-256: `ced6bfb11cc14e1138f2f28d5fca66ec16dade716a0aa126ddd4ca94a204a172`

Review every acceptable action, completion label, assertion label, case group and partition. The approval file must bind both hashes after the manifest is frozen.

## t01-settings-onofflabels-root (tuning; group tuning-settings-checkpoints)

Goal: The Accessibility page is open with its Vision section and Display & Text Size row visible.

Acceptable action IDs: `tap:e54`

Goal reached: **false**

Assertions: `accessibility_vision_visible`=false

Evidence: raw/t01-settings-onofflabels-root.compact.json, raw/t01-settings-onofflabels-root.full.json, raw/t01-settings-onofflabels-root.jpg

Full-only collapsed tap refs: `e138` ← `e140`

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e31` | Tap Apple Account, Sign in to access your iCloud data, the App Store, Apple services, and more. (button, ref e31). | yes | yes |
| `tap:e40` | Tap Ready for Apple Intelligence (button, ref e40). | yes | yes |
| `tap:e47` | Tap General (button, ref e47). | yes | yes |
| `tap:e54` | Tap Accessibility (button, ref e54). | yes | yes |
| `tap:e62` | Tap Action Button (button, ref e62). | yes | yes |
| `tap:e70` | Tap Apple Intelligence & Siri (button, ref e70). | yes | yes |
| `tap:e78` | Tap Camera (button, ref e78). | yes | yes |
| `tap:e86` | Tap Home Screen & App Library (button, ref e86). | yes | yes |
| `tap:e94` | Tap Search (button, ref e94). | yes | yes |
| `tap:e102` | Tap StandBy (button, ref e102). | yes | yes |
| `tap:e111` | Tap Screen Time (button, ref e111). | yes | yes |
| `tap:e137` | Tap text-field (text-field, ref e137). | yes | no |
| `tap:e138` | Tap Dictate (button, ref e138). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |
| `tap:e140` | Tap Dictate (button, ref e140). | no | yes |

## t02-settings-onofflabels-accessibility (tuning; group tuning-settings-checkpoints)

Goal: The Display & Text Size page is open with the On/Off Labels control visible.

Positional alternate goal (same capture, tuning only): Open the second row in the Vision section so the Display & Text Size page is visible.
Alternate acceptable action IDs: `tap:e44`, `tap:e166`, `tap:e47`, `tap:e169`

Acceptable action IDs: `tap:e44`, `tap:e166`, `tap:e47`, `tap:e169`

Goal reached: **false**

Assertions: `onoff_control_visible`=false

Evidence: raw/t02-settings-onofflabels-accessibility.compact.json, raw/t02-settings-onofflabels-accessibility.full.json, raw/t02-settings-onofflabels-accessibility.jpg

Full-only collapsed tap refs: `e33` ← `e176`, `e36`, `e179`; `e44` ← `e166`, `e47`, `e169`; `e54` ← `e156`, `e57`, `e159`; `e64` ← `e146`, `e67`, `e149`; `e74` ← `e136`, `e77`, `e139`; `e84` ← `e126`, `e87`, `e129`; `e94` ← `e116`, `e97`, `e119`

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e12` | Tap Settings (button, ref e12). | yes | yes |
| `swipe:e18:up` | Swipe up within AccessibilitySettingsControllerView: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e18). | yes | yes |
| `swipe:e18:down` | Swipe down within AccessibilitySettingsControllerView: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e18). | yes | yes |
| `swipe:e18:left` | Swipe left within AccessibilitySettingsControllerView: move the finger from right to left; content moves left to reveal items farther right (other, ref e18). | yes | yes |
| `swipe:e18:right` | Swipe right within AccessibilitySettingsControllerView: move the finger from left to right; content moves right to reveal items farther left (other, ref e18). | yes | yes |
| `swipe:e22:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e22). | yes | yes |
| `swipe:e22:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e22). | yes | yes |
| `swipe:e22:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e22). | yes | yes |
| `swipe:e22:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e22). | yes | yes |
| `tap:e33` | Tap Hover Text, Off (button, ref e33). | yes | yes |
| `tap:e44` | Tap Display & Text Size (button, ref e44). | yes | yes |
| `tap:e54` | Tap Motion (button, ref e54). | yes | yes |
| `tap:e64` | Tap Spoken Content (button, ref e64). | yes | yes |
| `tap:e74` | Tap Face ID & Attention (button, ref e74). | yes | yes |
| `tap:e84` | Tap Control Nearby Devices (button, ref e84). | yes | yes |
| `tap:e94` | Tap Subtitles & Captioning (button, ref e94). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |
| `tap:e36` | Tap Hover Text, Off (button, ref e36). | no | yes |
| `tap:e176` | Tap Hover Text, Off (button, ref e176). | no | yes |
| `tap:e179` | Tap Hover Text, Off (button, ref e179). | no | yes |
| `tap:e47` | Tap Display & Text Size (button, ref e47). | no | yes |
| `tap:e57` | Tap Motion (button, ref e57). | no | yes |
| `tap:e67` | Tap Spoken Content (button, ref e67). | no | yes |
| `tap:e77` | Tap Face ID & Attention (button, ref e77). | no | yes |
| `tap:e87` | Tap Control Nearby Devices (button, ref e87). | no | yes |
| `tap:e97` | Tap Subtitles & Captioning (button, ref e97). | no | yes |
| `tap:e116` | Tap Subtitles & Captioning (button, ref e116). | no | yes |
| `tap:e119` | Tap Subtitles & Captioning (button, ref e119). | no | yes |
| `tap:e126` | Tap Control Nearby Devices (button, ref e126). | no | yes |
| `tap:e129` | Tap Control Nearby Devices (button, ref e129). | no | yes |
| `tap:e136` | Tap Face ID & Attention (button, ref e136). | no | yes |
| `tap:e139` | Tap Face ID & Attention (button, ref e139). | no | yes |
| `tap:e146` | Tap Spoken Content (button, ref e146). | no | yes |
| `tap:e149` | Tap Spoken Content (button, ref e149). | no | yes |
| `tap:e156` | Tap Motion (button, ref e156). | no | yes |
| `tap:e159` | Tap Motion (button, ref e159). | no | yes |
| `tap:e166` | Tap Display & Text Size (button, ref e166). | no | yes |
| `tap:e169` | Tap Display & Text Size (button, ref e169). | no | yes |

## t03-settings-onofflabels-off (tuning; group tuning-settings-checkpoints)

Goal: The On/Off Labels control is visibly on.

Acceptable action IDs: `tap:e35`, `tap:e37`

Goal reached: **false**

Assertions: `onoff_on`=false

Evidence: raw/t03-settings-onofflabels-off.compact.json, raw/t03-settings-onofflabels-off.full.json, raw/t03-settings-onofflabels-off.jpg

Full-only collapsed tap refs: `e24` ← `e62`, `e27`, `e65`; `e35` ← `e37`

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e12` | Tap Accessibility (button, ref e12). | yes | yes |
| `swipe:e22:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e22). | yes | yes |
| `swipe:e22:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e22). | yes | yes |
| `swipe:e22:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e22). | yes | yes |
| `swipe:e22:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e22). | yes | yes |
| `tap:e24` | Tap Larger Text, Off (button, ref e24). | yes | yes |
| `tap:e35` | Tap On/Off Labels (switch, ref e35). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |
| `tap:e27` | Tap Larger Text, Off (button, ref e27). | no | yes |
| `tap:e62` | Tap Larger Text, Off (button, ref e62). | no | yes |
| `tap:e65` | Tap Larger Text, Off (button, ref e65). | no | yes |
| `tap:e37` | Tap On/Off Labels (switch, ref e37). | no | yes |

## t04-settings-onofflabels-on (tuning; group tuning-settings-checkpoints)

Goal: The On/Off Labels control is visibly on.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `onoff_on`=true

Evidence: raw/t04-settings-onofflabels-on.compact.json, raw/t04-settings-onofflabels-on.full.json, raw/t04-settings-onofflabels-on.jpg

Full-only collapsed tap refs: `e24` ← `e62`, `e27`, `e65`; `e35` ← `e37`

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e12` | Tap Accessibility (button, ref e12). | yes | yes |
| `swipe:e22:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e22). | yes | yes |
| `swipe:e22:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e22). | yes | yes |
| `swipe:e22:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e22). | yes | yes |
| `swipe:e22:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e22). | yes | yes |
| `tap:e24` | Tap Larger Text, Off (button, ref e24). | yes | yes |
| `tap:e35` | Tap On/Off Labels (switch, ref e35). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |
| `tap:e27` | Tap Larger Text, Off (button, ref e27). | no | yes |
| `tap:e62` | Tap Larger Text, Off (button, ref e62). | no | yes |
| `tap:e65` | Tap Larger Text, Off (button, ref e65). | no | yes |
| `tap:e37` | Tap On/Off Labels (switch, ref e37). | no | yes |

## t05-contacts-create-list (tuning; group tuning-contact-checkpoints)

Goal: A New Contact form is open with an empty First name field.

Acceptable action IDs: `tap:e89`

Goal reached: **false**

Assertions: `new_contact_form_open`=false

Evidence: raw/t05-contacts-create-list.compact.json, raw/t05-contacts-create-list.full.json, raw/t05-contacts-create-list.jpg

Full-only collapsed tap refs: `e82` ← `e84`

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap Back (button, ref e10). | yes | yes |
| `swipe:e17:up` | Swipe up within ContactsListView: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e17). | yes | yes |
| `swipe:e17:down` | Swipe down within ContactsListView: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e17). | yes | yes |
| `swipe:e17:left` | Swipe left within ContactsListView: move the finger from right to left; content moves left to reveal items farther right (other, ref e17). | yes | yes |
| `swipe:e17:right` | Swipe right within ContactsListView: move the finger from left to right; content moves right to reveal items farther left (other, ref e17). | yes | yes |
| `tap:e26` | Tap Contact photo for John Appleseed (button, ref e26). | yes | yes |
| `tap:e34` | Tap Contact photo for Kate Bell (button, ref e34). | yes | yes |
| `tap:e42` | Tap Contact photo for Anna Haro (button, ref e42). | yes | yes |
| `tap:e47` | Tap Contact photo for Daniel Higgins Jr. (button, ref e47). | yes | yes |
| `tap:e55` | Tap Contact photo for David Taylor (button, ref e55). | yes | yes |
| `tap:e63` | Tap Contact photo for Hank M. Zakroff (button, ref e63). | yes | yes |
| `tap:e81` | Tap text-field (text-field, ref e81). | yes | no |
| `tap:e82` | Tap Dictate (button, ref e82). | yes | yes |
| `tap:e89` | Tap Add (button, ref e89). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |
| `tap:e84` | Tap Dictate (button, ref e84). | no | yes |

## t06-contacts-create-blank (tuning; group tuning-contact-checkpoints)

Goal: The First name field on the New Contact form contains Mira.

Acceptable action IDs: `type:e116:firstName`

Goal reached: **false**

Assertions: `first_name_mira`=false

Evidence: raw/t06-contacts-create-blank.compact.json, raw/t06-contacts-create-blank.full.json, raw/t06-contacts-create-blank.jpg

Full-only collapsed tap refs: `e83` ← `e85`

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e11` | Tap Back (button, ref e11). | yes | yes |
| `swipe:e18:up` | Swipe up within ContactsListView: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e18). | yes | yes |
| `swipe:e18:down` | Swipe down within ContactsListView: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e18). | yes | yes |
| `swipe:e18:left` | Swipe left within ContactsListView: move the finger from right to left; content moves left to reveal items farther right (other, ref e18). | yes | yes |
| `swipe:e18:right` | Swipe right within ContactsListView: move the finger from left to right; content moves right to reveal items farther left (other, ref e18). | yes | yes |
| `tap:e27` | Tap Contact photo for John Appleseed (button, ref e27). | yes | yes |
| `tap:e35` | Tap Contact photo for Kate Bell (button, ref e35). | yes | yes |
| `tap:e43` | Tap Contact photo for Anna Haro (button, ref e43). | yes | yes |
| `tap:e48` | Tap Contact photo for Daniel Higgins Jr. (button, ref e48). | yes | yes |
| `tap:e56` | Tap Contact photo for David Taylor (button, ref e56). | yes | yes |
| `tap:e64` | Tap Contact photo for Hank M. Zakroff (button, ref e64). | yes | yes |
| `type:e82:firstName` | Replace all text in text-field with the supplied scenario value firstName (text-field, ref e82). | yes | yes |
| `tap:e83` | Tap Dictate (button, ref e83). | yes | yes |
| `tap:e90` | Tap Add (button, ref e90). | yes | yes |
| `tap:e96` | Tap Sheet Grabber (button, ref e96). | yes | no |
| `tap:e101` | Tap close (button, ref e101). | yes | yes |
| `tap:e112` | Tap Add photo (button, ref e112). | yes | yes |
| `swipe:e114:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e114). | yes | yes |
| `swipe:e114:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e114). | yes | yes |
| `swipe:e114:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e114). | yes | yes |
| `swipe:e114:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e114). | yes | yes |
| `type:e116:firstName` | Replace all text in First name with the supplied scenario value firstName (text-field, ref e116). | yes | yes |
| `type:e119:firstName` | Replace all text in Last name with the supplied scenario value firstName (text-field, ref e119). | yes | yes |
| `type:e122:firstName` | Replace all text in Company with the supplied scenario value firstName (text-field, ref e122). | yes | yes |
| `tap:e124` | Tap add phone (button, ref e124). | yes | yes |
| `tap:e125` | Tap Insert add phone (button, ref e125). | yes | yes |
| `tap:e129` | Tap add email (button, ref e129). | yes | yes |
| `tap:e130` | Tap Insert add email (button, ref e130). | yes | yes |
| `tap:e134` | Tap add pronouns (button, ref e134). | yes | yes |
| `tap:e135` | Tap Insert add pronouns (button, ref e135). | yes | yes |
| `tap:e149` | Tap add url (button, ref e149). | yes | yes |
| `tap:e150` | Tap Insert add url (button, ref e150). | yes | yes |
| `tap:e174` | Tap add url (button, ref e174). | yes | yes |
| `tap:e175` | Tap Insert add url (button, ref e175). | yes | yes |
| `tap:e179` | Tap add pronouns (button, ref e179). | yes | yes |
| `tap:e180` | Tap Insert add pronouns (button, ref e180). | yes | yes |
| `tap:e184` | Tap add email (button, ref e184). | yes | yes |
| `tap:e185` | Tap Insert add email (button, ref e185). | yes | yes |
| `tap:e189` | Tap add phone (button, ref e189). | yes | yes |
| `tap:e190` | Tap Insert add phone (button, ref e190). | yes | yes |
| `tap:e194` | Tap Add photo (button, ref e194). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |
| `tap:e85` | Tap Dictate (button, ref e85). | no | yes |

## t07-contacts-create-filled (tuning; group tuning-contact-checkpoints)

Goal: A saved Mira Vale contact card is visible, outside the edit form.

Acceptable action IDs: `tap:e103`

Goal reached: **false**

Assertions: `saved_mira_card`=false

Evidence: raw/t07-contacts-create-filled.compact.json, raw/t07-contacts-create-filled.full.json, raw/t07-contacts-create-filled.jpg

Full-only collapsed tap refs: `e83` ← `e85`

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e11` | Tap Back (button, ref e11). | yes | yes |
| `swipe:e18:up` | Swipe up within ContactsListView: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e18). | yes | yes |
| `swipe:e18:down` | Swipe down within ContactsListView: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e18). | yes | yes |
| `swipe:e18:left` | Swipe left within ContactsListView: move the finger from right to left; content moves left to reveal items farther right (other, ref e18). | yes | yes |
| `swipe:e18:right` | Swipe right within ContactsListView: move the finger from left to right; content moves right to reveal items farther left (other, ref e18). | yes | yes |
| `tap:e27` | Tap Contact photo for John Appleseed (button, ref e27). | yes | yes |
| `tap:e35` | Tap Contact photo for Kate Bell (button, ref e35). | yes | yes |
| `tap:e43` | Tap Contact photo for Anna Haro (button, ref e43). | yes | yes |
| `tap:e48` | Tap Contact photo for Daniel Higgins Jr. (button, ref e48). | yes | yes |
| `tap:e56` | Tap Contact photo for David Taylor (button, ref e56). | yes | yes |
| `tap:e64` | Tap Contact photo for Hank M. Zakroff (button, ref e64). | yes | yes |
| `tap:e82` | Tap text-field (text-field, ref e82). | yes | no |
| `tap:e83` | Tap Dictate (button, ref e83). | yes | yes |
| `tap:e90` | Tap Add (button, ref e90). | yes | yes |
| `tap:e96` | Tap Sheet Grabber (button, ref e96). | yes | no |
| `tap:e101` | Tap close (button, ref e101). | yes | yes |
| `tap:e103` | Tap Done (button, ref e103). | yes | yes |
| `tap:e112` | Tap Add photo (button, ref e112). | yes | yes |
| `swipe:e114:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e114). | yes | yes |
| `swipe:e114:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e114). | yes | yes |
| `swipe:e114:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e114). | yes | yes |
| `swipe:e114:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e114). | yes | yes |
| `tap:e116` | Tap First name (text-field, ref e116). | yes | no |
| `tap:e119` | Tap Last name (text-field, ref e119). | yes | no |
| `tap:e120` | Tap Clear text (button, ref e120). | yes | yes |
| `tap:e123` | Tap Company (text-field, ref e123). | yes | no |
| `tap:e125` | Tap add phone (button, ref e125). | yes | yes |
| `tap:e126` | Tap Insert add phone (button, ref e126). | yes | yes |
| `tap:e130` | Tap add email (button, ref e130). | yes | yes |
| `tap:e131` | Tap Insert add email (button, ref e131). | yes | yes |
| `tap:e135` | Tap add pronouns (button, ref e135). | yes | yes |
| `tap:e136` | Tap Insert add pronouns (button, ref e136). | yes | yes |
| `tap:e150` | Tap add url (button, ref e150). | yes | yes |
| `tap:e151` | Tap Insert add url (button, ref e151). | yes | yes |
| `tap:e175` | Tap add url (button, ref e175). | yes | yes |
| `tap:e176` | Tap Insert add url (button, ref e176). | yes | yes |
| `tap:e180` | Tap add pronouns (button, ref e180). | yes | yes |
| `tap:e181` | Tap Insert add pronouns (button, ref e181). | yes | yes |
| `tap:e185` | Tap add email (button, ref e185). | yes | yes |
| `tap:e186` | Tap Insert add email (button, ref e186). | yes | yes |
| `tap:e190` | Tap add phone (button, ref e190). | yes | yes |
| `tap:e191` | Tap Insert add phone (button, ref e191). | yes | yes |
| `tap:e195` | Tap Add photo (button, ref e195). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |
| `tap:e85` | Tap Dictate (button, ref e85). | no | yes |

## t08-reminders-create-onboarding (tuning; group tuning-reminders-checkpoints)

Goal: The Welcome sheet is dismissed and the iCloud syncing choice is visibly in front.

Acceptable action IDs: `tap:e78`

Goal reached: **false**

Assertions: `icloud_choice_visible`=false

Evidence: raw/t08-reminders-create-onboarding.compact.json, raw/t08-reminders-create-onboarding.full.json, raw/t08-reminders-create-onboarding.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e11` | Tap Back (button, ref e11). | yes | yes |
| `tap:e12` | Tap More (button, ref e12). | yes | yes |
| `tap:e45` | Tap New Reminder (button, ref e45). | yes | yes |
| `swipe:e57:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e57). | yes | yes |
| `swipe:e57:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e57). | yes | yes |
| `swipe:e57:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e57). | yes | yes |
| `swipe:e57:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e57). | yes | yes |
| `tap:e78` | Tap Continue (button, ref e78). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## t09-reminders-create-icloud-prompt (tuning; group tuning-reminders-checkpoints)

Goal: The local Reminders list is visible with the iCloud prompt gone.

Acceptable action IDs: `tap:e71`

Goal reached: **false**

Assertions: `local_list_unblocked`=false

Evidence: raw/t09-reminders-create-icloud-prompt.compact.json, raw/t09-reminders-create-icloud-prompt.full.json, raw/t09-reminders-create-icloud-prompt.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap Back (button, ref e10). | yes | yes |
| `tap:e11` | Tap More (button, ref e11). | yes | yes |
| `tap:e44` | Tap New Reminder (button, ref e44). | yes | yes |
| `swipe:e50:up` | Swipe up within Enable iCloud Syncing?: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e50). | yes | yes |
| `swipe:e50:down` | Swipe down within Enable iCloud Syncing?: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e50). | yes | yes |
| `swipe:e50:left` | Swipe left within Enable iCloud Syncing?: move the finger from right to left; content moves left to reveal items farther right (other, ref e50). | yes | yes |
| `swipe:e50:right` | Swipe right within Enable iCloud Syncing?: move the finger from left to right; content moves right to reveal items farther left (other, ref e50). | yes | yes |
| `swipe:e55:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e55). | yes | yes |
| `swipe:e55:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e55). | yes | yes |
| `swipe:e55:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e55). | yes | yes |
| `swipe:e55:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e55). | yes | yes |
| `swipe:e68:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e68). | yes | yes |
| `swipe:e68:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e68). | yes | yes |
| `swipe:e68:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e68). | yes | yes |
| `swipe:e68:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e68). | yes | yes |
| `tap:e71` | Tap Not Now (button, ref e71). | yes | yes |
| `tap:e72` | Tap Go to Settings (button, ref e72). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## t10-reminders-create-empty-list (tuning; group tuning-reminders-checkpoints)

Goal: The New Reminder composer is open with its Title field visible.

Acceptable action IDs: `tap:e44`

Goal reached: **false**

Assertions: `composer_title_visible`=false

Evidence: raw/t10-reminders-create-empty-list.compact.json, raw/t10-reminders-create-empty-list.full.json, raw/t10-reminders-create-empty-list.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap Back (button, ref e10). | yes | yes |
| `tap:e11` | Tap More (button, ref e11). | yes | yes |
| `tap:e44` | Tap New Reminder (button, ref e44). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-w01-location-picker (heldout; group weather-oslo-wind-checkpoints)

Goal: Weather location search results visibly include Oslo.

Acceptable action IDs: `type:e103:query`

Goal reached: **false**

Assertions: `oslo_result_visible`=false

Evidence: raw/v3-w01-location-picker.compact.json, raw/v3-w01-location-picker.full.json, raw/v3-w01-location-picker.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `swipe:e8:up` | Swipe up within weather.mainScrollView: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e8). | yes | yes |
| `swipe:e8:down` | Swipe down within weather.mainScrollView: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e8). | yes | yes |
| `swipe:e8:left` | Swipe left within weather.mainScrollView: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e8). | yes | yes |
| `swipe:e8:right` | Swipe right within weather.mainScrollView: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e8). | yes | yes |
| `swipe:e18:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e18). | yes | yes |
| `swipe:e18:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e18). | yes | yes |
| `swipe:e18:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e18). | yes | yes |
| `swipe:e18:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e18). | yes | yes |
| `tap:e86` | Tap San Francisco (button, ref e86). | yes | yes |
| `tap:e90` | Tap Settings (button, ref e90). | yes | yes |
| `tap:e94` | Tap Sheet Grabber (button, ref e94). | yes | no |
| `tap:e100` | Tap Edit (button, ref e100). | yes | yes |
| `tap:e101` | Tap Close (button, ref e101). | yes | yes |
| `type:e103:query` | Replace all text in weather.locationsSheet with the supplied scenario value query (text-field, ref e103). | yes | yes |
| `tap:e104` | Tap Use current location (button, ref e104). | yes | yes |
| `swipe:e108:up` | Swipe up within weather.locationsSheet: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e108). | yes | yes |
| `swipe:e108:down` | Swipe down within weather.locationsSheet: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e108). | yes | yes |
| `swipe:e108:left` | Swipe left within weather.locationsSheet: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e108). | yes | yes |
| `swipe:e108:right` | Swipe right within weather.locationsSheet: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e108). | yes | yes |
| `tap:e111` | Tap MY LOCATION, San Francisco, 1:24 PM · Mostly Sunny, 64°, H:68° L:54° (button, ref e111). | yes | yes |
| `tap:e118` | Tap Portland, 1:24 PM · Light Rain, 52°, H:55° L:48° (button, ref e118). | yes | yes |
| `tap:e124` | Tap Aspen, 2:24 PM · Light Snow, 25°, H:28° L:14° (button, ref e124). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-w02-oslo-search-result (heldout; group weather-oslo-wind-checkpoints)

Goal: The main Weather location button visibly reads Oslo.

Acceptable action IDs: `tap:e108`

Goal reached: **false**

Assertions: `main_location_oslo`=false

Evidence: raw/v3-w02-oslo-search-result.compact.json, raw/v3-w02-oslo-search-result.full.json, raw/v3-w02-oslo-search-result.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `swipe:e8:up` | Swipe up within weather.mainScrollView: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e8). | yes | yes |
| `swipe:e8:down` | Swipe down within weather.mainScrollView: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e8). | yes | yes |
| `swipe:e8:left` | Swipe left within weather.mainScrollView: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e8). | yes | yes |
| `swipe:e8:right` | Swipe right within weather.mainScrollView: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e8). | yes | yes |
| `swipe:e18:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e18). | yes | yes |
| `swipe:e18:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e18). | yes | yes |
| `swipe:e18:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e18). | yes | yes |
| `swipe:e18:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e18). | yes | yes |
| `tap:e86` | Tap San Francisco (button, ref e86). | yes | yes |
| `tap:e90` | Tap Settings (button, ref e90). | yes | yes |
| `tap:e94` | Tap Sheet Grabber (button, ref e94). | yes | no |
| `tap:e100` | Tap Close (button, ref e100). | yes | yes |
| `tap:e102` | Tap weather.locationsSheet (text-field, ref e102). | yes | no |
| `tap:e103` | Tap Clear search (button, ref e103). | yes | yes |
| `swipe:e105:up` | Swipe up within weather.locationsSheet: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e105). | yes | yes |
| `swipe:e105:down` | Swipe down within weather.locationsSheet: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e105). | yes | yes |
| `swipe:e105:left` | Swipe left within weather.locationsSheet: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e105). | yes | yes |
| `swipe:e105:right` | Swipe right within weather.locationsSheet: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e105). | yes | yes |
| `tap:e108` | Tap Oslo, Norway, 10:24 PM · Snow Showers (button, ref e108). | yes | yes |
| `tap:e114` | Tap Add (button, ref e114). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-w03-oslo-main (heldout; group weather-oslo-wind-checkpoints)

Goal: The Weather Settings sheet is open with Wind speed controls visible.

Acceptable action IDs: `tap:e89`

Goal reached: **false**

Assertions: `wind_controls_visible`=false

Evidence: raw/v3-w03-oslo-main.compact.json, raw/v3-w03-oslo-main.full.json, raw/v3-w03-oslo-main.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `swipe:e7:up` | Swipe up within weather.mainScrollView: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e7). | yes | yes |
| `swipe:e7:down` | Swipe down within weather.mainScrollView: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e7). | yes | yes |
| `swipe:e7:left` | Swipe left within weather.mainScrollView: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e7). | yes | yes |
| `swipe:e7:right` | Swipe right within weather.mainScrollView: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e7). | yes | yes |
| `swipe:e17:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e17). | yes | yes |
| `swipe:e17:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e17). | yes | yes |
| `swipe:e17:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e17). | yes | yes |
| `swipe:e17:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e17). | yes | yes |
| `tap:e85` | Tap Oslo (button, ref e85). | yes | yes |
| `tap:e89` | Tap Settings (button, ref e89). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-w04-wind-mph-settings (heldout; group weather-oslo-wind-checkpoints)

Goal: Wind speed m/s is visibly selected in Weather Settings.

Acceptable action IDs: `tap:e110`

Goal reached: **false**

Assertions: `wind_ms_selected`=false

Evidence: raw/v3-w04-wind-mph-settings.compact.json, raw/v3-w04-wind-mph-settings.full.json, raw/v3-w04-wind-mph-settings.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `swipe:e8:up` | Swipe up within weather.mainScrollView: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e8). | yes | yes |
| `swipe:e8:down` | Swipe down within weather.mainScrollView: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e8). | yes | yes |
| `swipe:e8:left` | Swipe left within weather.mainScrollView: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e8). | yes | yes |
| `swipe:e8:right` | Swipe right within weather.mainScrollView: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e8). | yes | yes |
| `swipe:e18:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e18). | yes | yes |
| `swipe:e18:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e18). | yes | yes |
| `swipe:e18:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e18). | yes | yes |
| `swipe:e18:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e18). | yes | yes |
| `tap:e86` | Tap Oslo (button, ref e86). | yes | yes |
| `tap:e90` | Tap Settings (button, ref e90). | yes | yes |
| `tap:e94` | Tap Sheet Grabber (button, ref e94). | yes | no |
| `swipe:e99:up` | Swipe up within weather.settingsSheet: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e99). | yes | yes |
| `swipe:e99:down` | Swipe down within weather.settingsSheet: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e99). | yes | yes |
| `swipe:e99:left` | Swipe left within weather.settingsSheet: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e99). | yes | yes |
| `swipe:e99:right` | Swipe right within weather.settingsSheet: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e99). | yes | yes |
| `tap:e102` | Tap Close (button, ref e102). | yes | yes |
| `tap:e105` | Tap °F (button, ref e105). | yes | yes |
| `tap:e106` | Tap °C (button, ref e106). | yes | yes |
| `tap:e108` | Tap mph (button, ref e108). | yes | yes |
| `tap:e109` | Tap km/h (button, ref e109). | yes | yes |
| `tap:e110` | Tap m/s (button, ref e110). | yes | yes |
| `tap:e112` | Tap mb (button, ref e112). | yes | yes |
| `tap:e113` | Tap inHg (button, ref e113). | yes | yes |
| `tap:e115` | Tap mi (button, ref e115). | yes | yes |
| `tap:e116` | Tap km (button, ref e116). | yes | yes |
| `tap:e118` | Tap Atmospheric animations (switch, ref e118). | yes | yes |
| `tap:e120` | Tap switch (switch, ref e120). | yes | yes |
| `tap:e121` | Tap Severe weather alerts (switch, ref e121). | yes | yes |
| `tap:e123` | Tap switch (switch, ref e123). | yes | yes |
| `tap:e124` | Tap Reduce transparency (switch, ref e124). | yes | yes |
| `tap:e126` | Tap switch (switch, ref e126). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-w05-wind-ms-selected (heldout; group weather-oslo-wind-checkpoints)

Goal: Wind speed m/s is visibly selected in Weather Settings.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `wind_ms_selected`=true, `wind_mph_selected`=false

Evidence: raw/v3-w05-wind-ms-selected.compact.json, raw/v3-w05-wind-ms-selected.full.json, raw/v3-w05-wind-ms-selected.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `swipe:e8:up` | Swipe up within weather.mainScrollView: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e8). | yes | yes |
| `swipe:e8:down` | Swipe down within weather.mainScrollView: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e8). | yes | yes |
| `swipe:e8:left` | Swipe left within weather.mainScrollView: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e8). | yes | yes |
| `swipe:e8:right` | Swipe right within weather.mainScrollView: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e8). | yes | yes |
| `swipe:e18:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e18). | yes | yes |
| `swipe:e18:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e18). | yes | yes |
| `swipe:e18:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e18). | yes | yes |
| `swipe:e18:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e18). | yes | yes |
| `tap:e86` | Tap Oslo (button, ref e86). | yes | yes |
| `tap:e90` | Tap Settings (button, ref e90). | yes | yes |
| `tap:e94` | Tap Sheet Grabber (button, ref e94). | yes | no |
| `swipe:e99:up` | Swipe up within weather.settingsSheet: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e99). | yes | yes |
| `swipe:e99:down` | Swipe down within weather.settingsSheet: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e99). | yes | yes |
| `swipe:e99:left` | Swipe left within weather.settingsSheet: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e99). | yes | yes |
| `swipe:e99:right` | Swipe right within weather.settingsSheet: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e99). | yes | yes |
| `tap:e102` | Tap Close (button, ref e102). | yes | yes |
| `tap:e105` | Tap °F (button, ref e105). | yes | yes |
| `tap:e106` | Tap °C (button, ref e106). | yes | yes |
| `tap:e108` | Tap mph (button, ref e108). | yes | yes |
| `tap:e109` | Tap km/h (button, ref e109). | yes | yes |
| `tap:e110` | Tap m/s (button, ref e110). | yes | yes |
| `tap:e112` | Tap mb (button, ref e112). | yes | yes |
| `tap:e113` | Tap inHg (button, ref e113). | yes | yes |
| `tap:e115` | Tap mi (button, ref e115). | yes | yes |
| `tap:e116` | Tap km (button, ref e116). | yes | yes |
| `tap:e118` | Tap Atmospheric animations (switch, ref e118). | yes | yes |
| `tap:e120` | Tap switch (switch, ref e120). | yes | yes |
| `tap:e121` | Tap Severe weather alerts (switch, ref e121). | yes | yes |
| `tap:e123` | Tap switch (switch, ref e123). | yes | yes |
| `tap:e124` | Tap Reduce transparency (switch, ref e124). | yes | yes |
| `tap:e126` | Tap switch (switch, ref e126). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-c01-two-iris-rows (heldout; group contacts-iris-checkpoints)

Goal: An Iris Moss contact card visibly shows iris.old@example.test.

Acceptable action IDs: `tap:e79`, `tap:e84`

Goal reached: **false**

Assertions: `iris_old_card_visible`=false

Evidence: raw/v3-c01-two-iris-rows.compact.json, raw/v3-c01-two-iris-rows.full.json, raw/v3-c01-two-iris-rows.jpg

Full-only collapsed tap refs: `e123` ← `e125`

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap Back (button, ref e10). | yes | yes |
| `swipe:e17:up` | Swipe up within ContactsListView: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e17). | yes | yes |
| `swipe:e17:down` | Swipe down within ContactsListView: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e17). | yes | yes |
| `swipe:e17:left` | Swipe left within ContactsListView: move the finger from right to left; content moves left to reveal items farther right (other, ref e17). | yes | yes |
| `swipe:e17:right` | Swipe right within ContactsListView: move the finger from left to right; content moves right to reveal items farther left (other, ref e17). | yes | yes |
| `tap:e42` | Tap View Duplicates (button, ref e42). | yes | yes |
| `tap:e44` | Tap Close (button, ref e44). | yes | yes |
| `tap:e50` | Tap Contact photo for John Appleseed (button, ref e50). | yes | yes |
| `tap:e58` | Tap Contact photo for Kate Bell (button, ref e58). | yes | yes |
| `tap:e66` | Tap Contact photo for Anna Haro (button, ref e66). | yes | yes |
| `tap:e71` | Tap Contact photo for Daniel Higgins Jr. (button, ref e71). | yes | yes |
| `tap:e79` | Tap Contact photo for Iris Moss (button, ref e79). | yes | yes |
| `tap:e84` | Tap Contact photo for Iris Moss (button, ref e84). | yes | yes |
| `tap:e92` | Tap Contact photo for Noah Reed (button, ref e92). | yes | yes |
| `tap:e97` | Tap Contact photo for Noah Reed (button, ref e97). | yes | yes |
| `tap:e122` | Tap text-field (text-field, ref e122). | yes | no |
| `tap:e123` | Tap Dictate (button, ref e123). | yes | yes |
| `tap:e130` | Tap Add (button, ref e130). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |
| `tap:e125` | Tap Dictate (button, ref e125). | no | yes |

## v3-c02-iris-old-card (heldout; group contacts-iris-checkpoints)

Goal: The Iris Moss Edit form is open.

Acceptable action IDs: `tap:e11`

Goal reached: **false**

Assertions: `iris_edit_open`=false

Evidence: raw/v3-c02-iris-old-card.compact.json, raw/v3-c02-iris-old-card.full.json, raw/v3-c02-iris-old-card.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap Contacts (button, ref e10). | yes | yes |
| `tap:e11` | Tap Edit (button, ref e11). | yes | yes |
| `swipe:e22:up` | Swipe up within ContactCardScrollViewReader: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e22). | yes | yes |
| `swipe:e22:down` | Swipe down within ContactCardScrollViewReader: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e22). | yes | yes |
| `swipe:e22:left` | Swipe left within ContactCardScrollViewReader: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e22). | yes | yes |
| `swipe:e22:right` | Swipe right within ContactCardScrollViewReader: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e22). | yes | yes |
| `swipe:e30:up` | Swipe up within ContactCardScrollViewReader: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e30). | yes | yes |
| `swipe:e30:down` | Swipe down within ContactCardScrollViewReader: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e30). | yes | yes |
| `swipe:e30:left` | Swipe left within ContactCardScrollViewReader: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e30). | yes | yes |
| `swipe:e30:right` | Swipe right within ContactCardScrollViewReader: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e30). | yes | yes |
| `tap:e53` | Tap Message (button, ref e53). | yes | yes |
| `tap:e54` | Tap button (button, ref e54). | yes | yes |
| `tap:e56` | Tap Call (button, ref e56). | yes | yes |
| `tap:e57` | Tap button (button, ref e57). | yes | yes |
| `tap:e60` | Tap Mail (button, ref e60). | yes | yes |
| `tap:e61` | Tap button (button, ref e61). | yes | yes |
| `tap:e69` | Tap Contact Photo & Poster (button, ref e69). | yes | yes |
| `tap:e79` | Tap mobile, (555) 010-2001 (button, ref e79). | yes | yes |
| `tap:e88` | Tap home, (555) 010-2002 (button, ref e88). | yes | yes |
| `tap:e98` | Tap work, (555) 010-2003 (button, ref e98). | yes | yes |
| `tap:e108` | Tap school, (555) 010-2004 (button, ref e108). | yes | yes |
| `tap:e118` | Tap iPhone, (555) 010-2005 (button, ref e118). | yes | yes |
| `tap:e128` | Tap Apple Watch, (555) 010-2006 (button, ref e128). | yes | yes |
| `tap:e138` | Tap home, iris.old@example.test (button, ref e138). | yes | yes |
| `tap:e149` | Tap ContactCardDetailsView (text-field, ref e149). | yes | no |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-c03-iris-email-offscreen (heldout; group contacts-iris-checkpoints)

Goal: The edit form visibly shows the email field containing iris.old@example.test.

Acceptable action IDs: `swipe:e25:up`

Goal reached: **false**

Assertions: `old_email_field_visible`=false

Evidence: raw/v3-c03-iris-email-offscreen.compact.json, raw/v3-c03-iris-email-offscreen.full.json, raw/v3-c03-iris-email-offscreen.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap close (button, ref e10). | yes | yes |
| `tap:e23` | Tap Add photo (button, ref e23). | yes | yes |
| `swipe:e25:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e25). | yes | yes |
| `swipe:e25:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e25). | yes | yes |
| `swipe:e25:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e25). | yes | yes |
| `swipe:e25:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e25). | yes | yes |
| `tap:e27` | Tap First name (text-field, ref e27). | yes | no |
| `tap:e30` | Tap Last name (text-field, ref e30). | yes | no |
| `tap:e33` | Tap Company (text-field, ref e33). | yes | no |
| `tap:e35` | Tap mobile (other, ref e35). | yes | yes |
| `tap:e36` | Tap Remove mobile (button, ref e36). | yes | yes |
| `tap:e37` | Tap remove (image, ref e37). | yes | yes |
| `tap:e38` | Tap mobile (button, ref e38). | yes | yes |
| `tap:e39` | Tap mobile (text, ref e39). | yes | yes |
| `tap:e42` | Tap Forward (image, ref e42). | yes | yes |
| `tap:e43` | Tap mobile (text-field, ref e43). | yes | no |
| `tap:e44` | Tap home (other, ref e44). | yes | yes |
| `tap:e45` | Tap Remove home (button, ref e45). | yes | yes |
| `tap:e46` | Tap remove (image, ref e46). | yes | yes |
| `tap:e47` | Tap home (button, ref e47). | yes | yes |
| `tap:e48` | Tap home (text, ref e48). | yes | yes |
| `tap:e51` | Tap Forward (image, ref e51). | yes | yes |
| `tap:e52` | Tap home (text-field, ref e52). | yes | no |
| `tap:e53` | Tap work (other, ref e53). | yes | yes |
| `tap:e54` | Tap Remove work (button, ref e54). | yes | yes |
| `tap:e55` | Tap remove (image, ref e55). | yes | yes |
| `tap:e56` | Tap work (button, ref e56). | yes | yes |
| `tap:e57` | Tap work (text, ref e57). | yes | yes |
| `tap:e60` | Tap Forward (image, ref e60). | yes | yes |
| `tap:e61` | Tap work (text-field, ref e61). | yes | no |
| `tap:e62` | Tap school (other, ref e62). | yes | yes |
| `tap:e63` | Tap Remove school (button, ref e63). | yes | yes |
| `tap:e64` | Tap remove (image, ref e64). | yes | yes |
| `tap:e65` | Tap school (button, ref e65). | yes | yes |
| `tap:e66` | Tap school (text, ref e66). | yes | yes |
| `tap:e69` | Tap Forward (image, ref e69). | yes | yes |
| `tap:e70` | Tap school (text-field, ref e70). | yes | no |
| `tap:e71` | Tap iPhone (other, ref e71). | yes | yes |
| `tap:e72` | Tap Remove iPhone (button, ref e72). | yes | yes |
| `tap:e73` | Tap remove (image, ref e73). | yes | yes |
| `tap:e74` | Tap iPhone (button, ref e74). | yes | yes |
| `tap:e75` | Tap iPhone (text, ref e75). | yes | yes |
| `tap:e78` | Tap Forward (image, ref e78). | yes | yes |
| `tap:e79` | Tap iPhone (text-field, ref e79). | yes | no |
| `tap:e80` | Tap Apple Watch (other, ref e80). | yes | yes |
| `tap:e81` | Tap Remove Apple Watch (button, ref e81). | yes | yes |
| `tap:e82` | Tap remove (image, ref e82). | yes | yes |
| `tap:e83` | Tap Apple Watch (button, ref e83). | yes | yes |
| `tap:e84` | Tap Apple Watch (text, ref e84). | yes | yes |
| `tap:e87` | Tap Forward (image, ref e87). | yes | yes |
| `tap:e88` | Tap Apple Watch (text-field, ref e88). | yes | no |
| `tap:e89` | Tap add phone (button, ref e89). | yes | yes |
| `tap:e90` | Tap Insert add phone (button, ref e90). | yes | yes |
| `tap:e120` | Tap add phone (button, ref e120). | yes | yes |
| `tap:e121` | Tap Insert add phone (button, ref e121). | yes | yes |
| `tap:e125` | Tap Add photo (button, ref e125). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-c04-iris-old-email-visible (heldout; group contacts-iris-checkpoints)

Goal: The edit form email field contains iris.new@example.test.

Acceptable action IDs: `type:e108:email`

Goal reached: **false**

Assertions: `new_email_field_value`=false

Evidence: raw/v3-c04-iris-old-email-visible.compact.json, raw/v3-c04-iris-old-email-visible.full.json, raw/v3-c04-iris-old-email-visible.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap close (button, ref e10). | yes | yes |
| `swipe:e34:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e34). | yes | yes |
| `swipe:e34:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e34). | yes | yes |
| `swipe:e34:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e34). | yes | yes |
| `swipe:e34:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e34). | yes | yes |
| `type:e39:email` | Replace all text in Company with the supplied scenario value email (text-field, ref e39). | yes | yes |
| `tap:e41` | Tap mobile (other, ref e41). | yes | yes |
| `tap:e42` | Tap Remove mobile (button, ref e42). | yes | yes |
| `tap:e43` | Tap remove (image, ref e43). | yes | no |
| `tap:e44` | Tap mobile (button, ref e44). | yes | yes |
| `tap:e45` | Tap mobile (text, ref e45). | yes | yes |
| `tap:e48` | Tap Forward (image, ref e48). | yes | yes |
| `type:e49:email` | Replace all text in mobile with the supplied scenario value email (text-field, ref e49). | yes | yes |
| `tap:e50` | Tap home (other, ref e50). | yes | yes |
| `tap:e51` | Tap Remove home (button, ref e51). | yes | yes |
| `tap:e52` | Tap remove (image, ref e52). | yes | no |
| `tap:e53` | Tap home (button, ref e53). | yes | yes |
| `tap:e54` | Tap home (text, ref e54). | yes | yes |
| `tap:e57` | Tap Forward (image, ref e57). | yes | yes |
| `type:e58:email` | Replace all text in home with the supplied scenario value email (text-field, ref e58). | yes | yes |
| `tap:e59` | Tap work (other, ref e59). | yes | yes |
| `tap:e60` | Tap Remove work (button, ref e60). | yes | yes |
| `tap:e61` | Tap remove (image, ref e61). | yes | no |
| `tap:e62` | Tap work (button, ref e62). | yes | yes |
| `tap:e63` | Tap work (text, ref e63). | yes | yes |
| `tap:e66` | Tap Forward (image, ref e66). | yes | yes |
| `type:e67:email` | Replace all text in work with the supplied scenario value email (text-field, ref e67). | yes | yes |
| `tap:e68` | Tap school (other, ref e68). | yes | yes |
| `tap:e69` | Tap Remove school (button, ref e69). | yes | yes |
| `tap:e70` | Tap remove (image, ref e70). | yes | no |
| `tap:e71` | Tap school (button, ref e71). | yes | yes |
| `tap:e72` | Tap school (text, ref e72). | yes | yes |
| `tap:e75` | Tap Forward (image, ref e75). | yes | yes |
| `type:e76:email` | Replace all text in school with the supplied scenario value email (text-field, ref e76). | yes | yes |
| `tap:e77` | Tap iPhone (other, ref e77). | yes | yes |
| `tap:e78` | Tap Remove iPhone (button, ref e78). | yes | yes |
| `tap:e79` | Tap remove (image, ref e79). | yes | no |
| `tap:e80` | Tap iPhone (button, ref e80). | yes | yes |
| `tap:e81` | Tap iPhone (text, ref e81). | yes | yes |
| `tap:e84` | Tap Forward (image, ref e84). | yes | yes |
| `type:e85:email` | Replace all text in iPhone with the supplied scenario value email (text-field, ref e85). | yes | yes |
| `tap:e86` | Tap Apple Watch (other, ref e86). | yes | yes |
| `tap:e87` | Tap Remove Apple Watch (button, ref e87). | yes | yes |
| `tap:e88` | Tap remove (image, ref e88). | yes | no |
| `tap:e89` | Tap Apple Watch (button, ref e89). | yes | yes |
| `tap:e90` | Tap Apple Watch (text, ref e90). | yes | yes |
| `tap:e93` | Tap Forward (image, ref e93). | yes | yes |
| `type:e94:email` | Replace all text in Apple Watch with the supplied scenario value email (text-field, ref e94). | yes | yes |
| `tap:e95` | Tap add phone (button, ref e95). | yes | yes |
| `tap:e96` | Tap Insert add phone (button, ref e96). | yes | yes |
| `tap:e100` | Tap home (other, ref e100). | yes | yes |
| `tap:e101` | Tap Remove home (button, ref e101). | yes | yes |
| `tap:e102` | Tap remove (image, ref e102). | yes | no |
| `tap:e103` | Tap home (button, ref e103). | yes | yes |
| `tap:e104` | Tap home (text, ref e104). | yes | yes |
| `tap:e107` | Tap Forward (image, ref e107). | yes | yes |
| `type:e108:email` | Replace all text in home with the supplied scenario value email (text-field, ref e108). | yes | yes |
| `tap:e109` | Tap add email (button, ref e109). | yes | yes |
| `tap:e110` | Tap Insert add email (button, ref e110). | yes | yes |
| `tap:e114` | Tap add pronouns (button, ref e114). | yes | yes |
| `tap:e115` | Tap Insert add pronouns (button, ref e115). | yes | yes |
| `tap:e129` | Tap add url (button, ref e129). | yes | yes |
| `tap:e130` | Tap Insert add url (button, ref e130). | yes | yes |
| `tap:e134` | Tap add address (button, ref e134). | yes | yes |
| `tap:e135` | Tap Insert add address (button, ref e135). | yes | yes |
| `tap:e157` | Tap add address (button, ref e157). | yes | yes |
| `tap:e158` | Tap Insert add address (button, ref e158). | yes | yes |
| `tap:e162` | Tap add url (button, ref e162). | yes | yes |
| `tap:e163` | Tap Insert add url (button, ref e163). | yes | yes |
| `tap:e167` | Tap add pronouns (button, ref e167). | yes | yes |
| `tap:e168` | Tap Insert add pronouns (button, ref e168). | yes | yes |
| `tap:e172` | Tap add email (button, ref e172). | yes | yes |
| `tap:e173` | Tap Insert add email (button, ref e173). | yes | yes |
| `tap:e177` | Tap add phone (button, ref e177). | yes | yes |
| `tap:e178` | Tap Insert add phone (button, ref e178). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-c05-iris-new-email-unsaved (heldout; group contacts-iris-checkpoints)

Goal: A saved Iris Moss contact card visibly shows iris.new@example.test.

Acceptable action IDs: `tap:e11`

Goal reached: **false**

Assertions: `new_email_saved_card`=false

Evidence: raw/v3-c05-iris-new-email-unsaved.compact.json, raw/v3-c05-iris-new-email-unsaved.full.json, raw/v3-c05-iris-new-email-unsaved.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap close (button, ref e10). | yes | no |
| `tap:e11` | Tap Done (button, ref e11). | yes | yes |
| `swipe:e34:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e34). | yes | yes |
| `swipe:e34:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e34). | yes | yes |
| `swipe:e34:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e34). | yes | yes |
| `swipe:e34:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e34). | yes | yes |
| `tap:e39` | Tap Company (text-field, ref e39). | yes | no |
| `tap:e41` | Tap mobile (other, ref e41). | yes | yes |
| `tap:e42` | Tap Remove mobile (button, ref e42). | yes | yes |
| `tap:e43` | Tap remove (image, ref e43). | yes | no |
| `tap:e44` | Tap mobile (button, ref e44). | yes | yes |
| `tap:e45` | Tap mobile (text, ref e45). | yes | yes |
| `tap:e48` | Tap Forward (image, ref e48). | yes | yes |
| `tap:e49` | Tap mobile (text-field, ref e49). | yes | no |
| `tap:e50` | Tap home (other, ref e50). | yes | yes |
| `tap:e51` | Tap Remove home (button, ref e51). | yes | yes |
| `tap:e52` | Tap remove (image, ref e52). | yes | no |
| `tap:e53` | Tap home (button, ref e53). | yes | yes |
| `tap:e54` | Tap home (text, ref e54). | yes | yes |
| `tap:e57` | Tap Forward (image, ref e57). | yes | yes |
| `tap:e58` | Tap home (text-field, ref e58). | yes | no |
| `tap:e59` | Tap work (other, ref e59). | yes | yes |
| `tap:e60` | Tap Remove work (button, ref e60). | yes | yes |
| `tap:e61` | Tap remove (image, ref e61). | yes | no |
| `tap:e62` | Tap work (button, ref e62). | yes | yes |
| `tap:e63` | Tap work (text, ref e63). | yes | yes |
| `tap:e66` | Tap Forward (image, ref e66). | yes | yes |
| `tap:e67` | Tap work (text-field, ref e67). | yes | no |
| `tap:e68` | Tap school (other, ref e68). | yes | yes |
| `tap:e69` | Tap Remove school (button, ref e69). | yes | yes |
| `tap:e70` | Tap remove (image, ref e70). | yes | no |
| `tap:e71` | Tap school (button, ref e71). | yes | yes |
| `tap:e72` | Tap school (text, ref e72). | yes | yes |
| `tap:e75` | Tap Forward (image, ref e75). | yes | yes |
| `tap:e76` | Tap school (text-field, ref e76). | yes | no |
| `tap:e77` | Tap iPhone (other, ref e77). | yes | yes |
| `tap:e78` | Tap Remove iPhone (button, ref e78). | yes | yes |
| `tap:e79` | Tap remove (image, ref e79). | yes | no |
| `tap:e80` | Tap iPhone (button, ref e80). | yes | yes |
| `tap:e81` | Tap iPhone (text, ref e81). | yes | yes |
| `tap:e84` | Tap Forward (image, ref e84). | yes | yes |
| `tap:e85` | Tap iPhone (text-field, ref e85). | yes | no |
| `tap:e86` | Tap Apple Watch (other, ref e86). | yes | yes |
| `tap:e87` | Tap Remove Apple Watch (button, ref e87). | yes | yes |
| `tap:e88` | Tap remove (image, ref e88). | yes | no |
| `tap:e89` | Tap Apple Watch (button, ref e89). | yes | yes |
| `tap:e90` | Tap Apple Watch (text, ref e90). | yes | yes |
| `tap:e93` | Tap Forward (image, ref e93). | yes | yes |
| `tap:e94` | Tap Apple Watch (text-field, ref e94). | yes | no |
| `tap:e95` | Tap add phone (button, ref e95). | yes | yes |
| `tap:e96` | Tap Insert add phone (button, ref e96). | yes | yes |
| `tap:e100` | Tap home (other, ref e100). | yes | yes |
| `tap:e101` | Tap Remove home (button, ref e101). | yes | yes |
| `tap:e102` | Tap remove (image, ref e102). | yes | no |
| `tap:e103` | Tap home (button, ref e103). | yes | yes |
| `tap:e104` | Tap home (text, ref e104). | yes | yes |
| `tap:e107` | Tap Forward (image, ref e107). | yes | yes |
| `tap:e108` | Tap home (text-field, ref e108). | yes | no |
| `tap:e109` | Tap Clear text (button, ref e109). | yes | yes |
| `tap:e110` | Tap add email (button, ref e110). | yes | yes |
| `tap:e111` | Tap Insert add email (button, ref e111). | yes | yes |
| `tap:e115` | Tap add pronouns (button, ref e115). | yes | yes |
| `tap:e116` | Tap Insert add pronouns (button, ref e116). | yes | yes |
| `tap:e130` | Tap add url (button, ref e130). | yes | yes |
| `tap:e131` | Tap Insert add url (button, ref e131). | yes | yes |
| `tap:e135` | Tap add address (button, ref e135). | yes | yes |
| `tap:e136` | Tap Insert add address (button, ref e136). | yes | yes |
| `tap:e158` | Tap add address (button, ref e158). | yes | yes |
| `tap:e159` | Tap Insert add address (button, ref e159). | yes | yes |
| `tap:e163` | Tap add url (button, ref e163). | yes | yes |
| `tap:e164` | Tap Insert add url (button, ref e164). | yes | yes |
| `tap:e168` | Tap add pronouns (button, ref e168). | yes | yes |
| `tap:e169` | Tap Insert add pronouns (button, ref e169). | yes | yes |
| `tap:e173` | Tap add email (button, ref e173). | yes | yes |
| `tap:e174` | Tap Insert add email (button, ref e174). | yes | yes |
| `tap:e178` | Tap add phone (button, ref e178). | yes | yes |
| `tap:e179` | Tap Insert add phone (button, ref e179). | yes | no |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-c06-iris-new-saved-card (heldout; group contacts-iris-checkpoints)

Goal: A saved Iris Moss contact card visibly shows iris.new@example.test.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `new_email_saved_card`=true, `old_email_still_visible`=false

Evidence: raw/v3-c06-iris-new-saved-card.compact.json, raw/v3-c06-iris-new-saved-card.full.json, raw/v3-c06-iris-new-saved-card.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap Contacts (button, ref e10). | yes | yes |
| `tap:e11` | Tap Edit (button, ref e11). | yes | yes |
| `swipe:e22:up` | Swipe up within ContactCardScrollViewReader: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e22). | yes | yes |
| `swipe:e22:down` | Swipe down within ContactCardScrollViewReader: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e22). | yes | yes |
| `swipe:e22:left` | Swipe left within ContactCardScrollViewReader: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e22). | yes | yes |
| `swipe:e22:right` | Swipe right within ContactCardScrollViewReader: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e22). | yes | yes |
| `swipe:e30:up` | Swipe up within ContactCardScrollViewReader: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e30). | yes | yes |
| `swipe:e30:down` | Swipe down within ContactCardScrollViewReader: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e30). | yes | yes |
| `swipe:e30:left` | Swipe left within ContactCardScrollViewReader: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e30). | yes | yes |
| `swipe:e30:right` | Swipe right within ContactCardScrollViewReader: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e30). | yes | yes |
| `tap:e53` | Tap Message (button, ref e53). | yes | yes |
| `tap:e54` | Tap button (button, ref e54). | yes | yes |
| `tap:e56` | Tap Call (button, ref e56). | yes | yes |
| `tap:e57` | Tap button (button, ref e57). | yes | yes |
| `tap:e60` | Tap Mail (button, ref e60). | yes | yes |
| `tap:e61` | Tap button (button, ref e61). | yes | yes |
| `tap:e69` | Tap Contact Photo & Poster (button, ref e69). | yes | yes |
| `tap:e79` | Tap mobile, (555) 010-2001 (button, ref e79). | yes | yes |
| `tap:e88` | Tap home, (555) 010-2002 (button, ref e88). | yes | yes |
| `tap:e98` | Tap work, (555) 010-2003 (button, ref e98). | yes | yes |
| `tap:e108` | Tap school, (555) 010-2004 (button, ref e108). | yes | yes |
| `tap:e118` | Tap iPhone, (555) 010-2005 (button, ref e118). | yes | yes |
| `tap:e128` | Tap Apple Watch, (555) 010-2006 (button, ref e128). | yes | yes |
| `tap:e138` | Tap home, iris.new@example.test (button, ref e138). | yes | yes |
| `tap:e149` | Tap ContactCardDetailsView (text-field, ref e149). | yes | no |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-c07-ada-search-ready (heldout; group contacts-ada-blocker)

Goal: Contacts search visibly reports finished results for Ada Birch.

Acceptable action IDs: `type:e116:query`

Goal reached: **false**

Assertions: `ada_no_results_visible`=false

Evidence: raw/v3-c07-ada-search-ready.compact.json, raw/v3-c07-ada-search-ready.full.json, raw/v3-c07-ada-search-ready.jpg

Full-only collapsed tap refs: `e117` ← `e119`

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `swipe:e14:up` | Swipe up within ContactsListView: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e14). | yes | yes |
| `swipe:e14:down` | Swipe down within ContactsListView: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e14). | yes | yes |
| `swipe:e14:left` | Swipe left within ContactsListView: move the finger from right to left; content moves left to reveal items farther right (other, ref e14). | yes | yes |
| `swipe:e14:right` | Swipe right within ContactsListView: move the finger from left to right; content moves right to reveal items farther left (other, ref e14). | yes | yes |
| `tap:e29` | Tap View Duplicates (button, ref e29). | yes | yes |
| `tap:e31` | Tap Close (button, ref e31). | yes | yes |
| `tap:e37` | Tap Contact photo for John Appleseed (button, ref e37). | yes | yes |
| `tap:e45` | Tap Contact photo for Kate Bell (button, ref e45). | yes | yes |
| `tap:e53` | Tap Contact photo for Anna Haro (button, ref e53). | yes | yes |
| `tap:e58` | Tap Contact photo for Daniel Higgins Jr. (button, ref e58). | yes | yes |
| `tap:e66` | Tap Contact photo for Iris Moss (button, ref e66). | yes | yes |
| `tap:e71` | Tap Contact photo for Iris Moss (button, ref e71). | yes | yes |
| `tap:e79` | Tap Contact photo for Noah Reed (button, ref e79). | yes | yes |
| `tap:e84` | Tap Contact photo for Noah Reed (button, ref e84). | yes | yes |
| `tap:e92` | Tap Contact photo for Mira Stone (button, ref e92). | yes | yes |
| `type:e116:query` | Replace all text in text-field with the supplied scenario value query (text-field, ref e116). | yes | yes |
| `tap:e117` | Tap Dictate (button, ref e117). | yes | yes |
| `tap:e124` | Tap close (button, ref e124). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |
| `tap:e119` | Tap Dictate (button, ref e119). | no | yes |

## v3-c08-ada-no-results (heldout; group contacts-ada-blocker)

Goal: An existing Ada Birch contact card is open.

Acceptable action IDs: `stop-blocked`

Goal reached: **false**

Assertions: `ada_card_open`=false

Evidence: raw/v3-c08-ada-no-results.compact.json, raw/v3-c08-ada-no-results.full.json, raw/v3-c08-ada-no-results.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `swipe:e14:up` | Swipe up within ContactsListView: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e14). | yes | yes |
| `swipe:e14:down` | Swipe down within ContactsListView: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e14). | yes | yes |
| `swipe:e14:left` | Swipe left within ContactsListView: move the finger from right to left; content moves left to reveal items farther right (other, ref e14). | yes | yes |
| `swipe:e14:right` | Swipe right within ContactsListView: move the finger from left to right; content moves right to reveal items farther left (other, ref e14). | yes | yes |
| `tap:e29` | Tap View Duplicates (button, ref e29). | yes | yes |
| `tap:e31` | Tap Close (button, ref e31). | yes | yes |
| `tap:e37` | Tap Contact photo for John Appleseed (button, ref e37). | yes | yes |
| `tap:e45` | Tap Contact photo for Kate Bell (button, ref e45). | yes | yes |
| `tap:e53` | Tap Contact photo for Anna Haro (button, ref e53). | yes | yes |
| `tap:e58` | Tap Contact photo for Daniel Higgins Jr. (button, ref e58). | yes | yes |
| `tap:e66` | Tap Contact photo for Iris Moss (button, ref e66). | yes | yes |
| `tap:e71` | Tap Contact photo for Iris Moss (button, ref e71). | yes | yes |
| `tap:e79` | Tap Contact photo for Noah Reed (button, ref e79). | yes | yes |
| `tap:e84` | Tap Contact photo for Noah Reed (button, ref e84). | yes | yes |
| `tap:e92` | Tap Contact photo for Mira Stone (button, ref e92). | yes | yes |
| `swipe:e105:up` | Swipe up within Activate to dismiss: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e105). | yes | yes |
| `swipe:e105:down` | Swipe down within Activate to dismiss: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e105). | yes | yes |
| `swipe:e105:left` | Swipe left within Activate to dismiss: move the finger from right to left; content moves left to reveal items farther right (other, ref e105). | yes | yes |
| `swipe:e105:right` | Swipe right within Activate to dismiss: move the finger from left to right; content moves right to reveal items farther left (other, ref e105). | yes | yes |
| `swipe:e106:up` | Swipe up within ContactsListView: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e106). | yes | yes |
| `swipe:e106:down` | Swipe down within ContactsListView: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e106). | yes | yes |
| `swipe:e106:left` | Swipe left within ContactsListView: move the finger from right to left; content moves left to reveal items farther right (other, ref e106). | yes | yes |
| `swipe:e106:right` | Swipe right within ContactsListView: move the finger from left to right; content moves right to reveal items farther left (other, ref e106). | yes | yes |
| `swipe:e112:up` | Swipe up within Search results: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e112). | yes | yes |
| `swipe:e112:down` | Swipe down within Search results: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e112). | yes | yes |
| `swipe:e112:left` | Swipe left within Search results: move the finger from right to left; content moves left to reveal items farther right (other, ref e112). | yes | yes |
| `swipe:e112:right` | Swipe right within Search results: move the finger from left to right; content moves right to reveal items farther left (other, ref e112). | yes | yes |
| `tap:e135` | Tap text-field (text-field, ref e135). | yes | no |
| `tap:e137` | Tap Clear text (button, ref e137). | yes | yes |
| `tap:e142` | Tap close (button, ref e142). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-r01-pack-batteries-notes-empty (heldout; group reminders-notes-save-checkpoints)

Goal: The Pack batteries Details Notes field visibly contains Bring charger.

Acceptable action IDs: `type:e92:note`

Goal reached: **false**

Assertions: `notes_bring_charger`=false

Evidence: raw/v3-r01-pack-batteries-notes-empty.compact.json, raw/v3-r01-pack-batteries-notes-empty.full.json, raw/v3-r01-pack-batteries-notes-empty.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e11` | Tap Back (button, ref e11). | yes | yes |
| `tap:e12` | Tap More (button, ref e12). | yes | yes |
| `swipe:e21:up` | Swipe up within RemindersList.ID.RemindersTable: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e21). | yes | yes |
| `swipe:e21:down` | Swipe down within RemindersList.ID.RemindersTable: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e21). | yes | yes |
| `swipe:e21:left` | Swipe left within RemindersList.ID.RemindersTable: move the finger from right to left; content moves left to reveal items farther right (other, ref e21). | yes | yes |
| `swipe:e21:right` | Swipe right within RemindersList.ID.RemindersTable: move the finger from left to right; content moves right to reveal items farther left (other, ref e21). | yes | yes |
| `tap:e26` | Tap Pack adapters, Incomplete, Pack the USB adapter (other, ref e26). | yes | yes |
| `tap:e27` | Tap circle (button, ref e27). | yes | yes |
| `type:e28:note` | Replace all text in Title with the supplied scenario value note (text-field, ref e28). | yes | yes |
| `type:e29:note` | Replace all text in Notes with the supplied scenario value note (text-field, ref e29). | yes | yes |
| `tap:e32` | Tap Pack batteries, Incomplete (other, ref e32). | yes | yes |
| `tap:e33` | Tap circle (button, ref e33). | yes | yes |
| `tap:e34` | Tap Edit Details (button, ref e34). | yes | yes |
| `type:e35:note` | Replace all text in Title with the supplied scenario value note (text-field, ref e35). | yes | yes |
| `type:e43:note` | Replace all text in Notes with the supplied scenario value note (text-field, ref e43). | yes | yes |
| `tap:e63` | Tap New Reminder (button, ref e63). | yes | yes |
| `tap:e73` | Tap Cancel (button, ref e73). | yes | yes |
| `tap:e75` | Tap Done (button, ref e75). | yes | yes |
| `swipe:e79:up` | Swipe up within ReminderDetail.ID.DetailsTable: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e79). | yes | yes |
| `swipe:e79:down` | Swipe down within ReminderDetail.ID.DetailsTable: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e79). | yes | yes |
| `swipe:e79:left` | Swipe left within ReminderDetail.ID.DetailsTable: move the finger from right to left; content moves left to reveal items farther right (other, ref e79). | yes | yes |
| `swipe:e79:right` | Swipe right within ReminderDetail.ID.DetailsTable: move the finger from left to right; content moves right to reveal items farther left (other, ref e79). | yes | yes |
| `swipe:e83:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e83). | yes | yes |
| `swipe:e83:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e83). | yes | yes |
| `swipe:e83:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e83). | yes | yes |
| `swipe:e83:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e83). | yes | yes |
| `type:e86:note` | Replace all text in Title with the supplied scenario value note (text-field, ref e86). | yes | yes |
| `type:e92:note` | Replace all text in Notes with the supplied scenario value note (text-field, ref e92). | yes | yes |
| `tap:e103` | Tap Date (switch, ref e103). | yes | yes |
| `tap:e112` | Tap Time (switch, ref e112). | yes | yes |
| `tap:e116` | Tap List (button, ref e116). | yes | yes |
| `tap:e136` | Tap Location (switch, ref e136). | yes | yes |
| `tap:e165` | Tap Location (switch, ref e165). | yes | yes |
| `tap:e175` | Tap List (button, ref e175). | yes | yes |
| `tap:e189` | Tap Time (switch, ref e189). | yes | yes |
| `tap:e198` | Tap Date (switch, ref e198). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-r02-pack-batteries-notes-unsaved (heldout; group reminders-notes-save-checkpoints)

Goal: A saved Pack batteries reminder row visibly includes Bring charger.

Acceptable action IDs: `tap:e75`

Goal reached: **false**

Assertions: `saved_row_has_note`=false

Evidence: raw/v3-r02-pack-batteries-notes-unsaved.compact.json, raw/v3-r02-pack-batteries-notes-unsaved.full.json, raw/v3-r02-pack-batteries-notes-unsaved.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e11` | Tap Back (button, ref e11). | yes | yes |
| `tap:e12` | Tap More (button, ref e12). | yes | yes |
| `swipe:e21:up` | Swipe up within RemindersList.ID.RemindersTable: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e21). | yes | yes |
| `swipe:e21:down` | Swipe down within RemindersList.ID.RemindersTable: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e21). | yes | yes |
| `swipe:e21:left` | Swipe left within RemindersList.ID.RemindersTable: move the finger from right to left; content moves left to reveal items farther right (other, ref e21). | yes | yes |
| `swipe:e21:right` | Swipe right within RemindersList.ID.RemindersTable: move the finger from left to right; content moves right to reveal items farther left (other, ref e21). | yes | yes |
| `tap:e26` | Tap Pack adapters, Incomplete, Pack the USB adapter (other, ref e26). | yes | yes |
| `tap:e27` | Tap circle (button, ref e27). | yes | yes |
| `tap:e28` | Tap Title (text-field, ref e28). | yes | no |
| `tap:e29` | Tap Notes (text-field, ref e29). | yes | no |
| `tap:e32` | Tap Pack batteries, Incomplete (other, ref e32). | yes | yes |
| `tap:e33` | Tap circle (button, ref e33). | yes | yes |
| `tap:e34` | Tap Edit Details (button, ref e34). | yes | yes |
| `tap:e35` | Tap Title (text-field, ref e35). | yes | no |
| `tap:e43` | Tap Notes (text-field, ref e43). | yes | no |
| `tap:e63` | Tap New Reminder (button, ref e63). | yes | yes |
| `tap:e73` | Tap Cancel (button, ref e73). | yes | yes |
| `tap:e75` | Tap Done (button, ref e75). | yes | yes |
| `swipe:e79:up` | Swipe up within ReminderDetail.ID.DetailsTable: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e79). | yes | yes |
| `swipe:e79:down` | Swipe down within ReminderDetail.ID.DetailsTable: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e79). | yes | yes |
| `swipe:e79:left` | Swipe left within ReminderDetail.ID.DetailsTable: move the finger from right to left; content moves left to reveal items farther right (other, ref e79). | yes | yes |
| `swipe:e79:right` | Swipe right within ReminderDetail.ID.DetailsTable: move the finger from left to right; content moves right to reveal items farther left (other, ref e79). | yes | yes |
| `swipe:e83:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e83). | yes | yes |
| `swipe:e83:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e83). | yes | yes |
| `swipe:e83:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e83). | yes | yes |
| `swipe:e83:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e83). | yes | yes |
| `tap:e86` | Tap Title (text-field, ref e86). | yes | no |
| `tap:e92` | Tap Notes (text-field, ref e92). | yes | no |
| `tap:e110` | Tap Date (switch, ref e110). | yes | yes |
| `tap:e119` | Tap Time (switch, ref e119). | yes | yes |
| `tap:e123` | Tap List (button, ref e123). | yes | yes |
| `tap:e143` | Tap Location (switch, ref e143). | yes | yes |
| `tap:e172` | Tap Location (switch, ref e172). | yes | yes |
| `tap:e182` | Tap List (button, ref e182). | yes | yes |
| `tap:e196` | Tap Time (switch, ref e196). | yes | yes |
| `tap:e205` | Tap Date (switch, ref e205). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-r03-pack-batteries-saved-note (heldout; group reminders-notes-save-checkpoints)

Goal: A saved Pack batteries reminder row visibly includes Bring charger.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `saved_row_has_note`=true, `saved_row_note_absent`=false

Evidence: raw/v3-r03-pack-batteries-saved-note.compact.json, raw/v3-r03-pack-batteries-saved-note.full.json, raw/v3-r03-pack-batteries-saved-note.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap Back (button, ref e10). | yes | yes |
| `tap:e11` | Tap More (button, ref e11). | yes | yes |
| `swipe:e20:up` | Swipe up within RemindersList.ID.RemindersTable: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e20). | yes | yes |
| `swipe:e20:down` | Swipe down within RemindersList.ID.RemindersTable: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e20). | yes | yes |
| `swipe:e20:left` | Swipe left within RemindersList.ID.RemindersTable: move the finger from right to left; content moves left to reveal items farther right (other, ref e20). | yes | yes |
| `swipe:e20:right` | Swipe right within RemindersList.ID.RemindersTable: move the finger from left to right; content moves right to reveal items farther left (other, ref e20). | yes | yes |
| `tap:e25` | Tap Pack adapters, Incomplete, Pack the USB adapter (other, ref e25). | yes | yes |
| `tap:e26` | Tap circle (button, ref e26). | yes | yes |
| `tap:e27` | Tap Title (text-field, ref e27). | yes | no |
| `tap:e28` | Tap Notes (text-field, ref e28). | yes | no |
| `tap:e31` | Tap Pack batteries, Incomplete, Bring charger (other, ref e31). | yes | yes |
| `tap:e32` | Tap circle (button, ref e32). | yes | yes |
| `tap:e34` | Tap Title (text-field, ref e34). | yes | no |
| `tap:e42` | Tap Notes (text-field, ref e42). | yes | no |
| `tap:e63` | Tap New Reminder (button, ref e63). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-d01-shop-empty (heldout; group diagnostic-checkpoints)

Goal: Sample Shop visibly says Selected: Apple.

Acceptable action IDs: `tap:e16`

Goal reached: **false**

Assertions: `apple_selected`=false

Evidence: raw/v3-d01-shop-empty.compact.json, raw/v3-d01-shop-empty.full.json, raw/v3-d01-shop-empty.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e16` | Tap Add Apple ($2) (button, ref e16). | yes | yes |
| `tap:e17` | Tap Add Bread ($3) (button, ref e17). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-d02-apple-selected (heldout; group diagnostic-checkpoints)

Goal: Sample Shop visibly says Selected: Apple, Bread.

Acceptable action IDs: `tap:e19`

Goal reached: **false**

Assertions: `both_selected`=false

Evidence: raw/v3-d02-apple-selected.compact.json, raw/v3-d02-apple-selected.full.json, raw/v3-d02-apple-selected.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e19` | Tap Add Bread ($3) (button, ref e19). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-d03-both-selected (heldout; group diagnostic-checkpoints)

Goal: The Order complete confirmation page is visibly open.

Acceptable action IDs: `tap:e22`

Goal reached: **false**

Assertions: `confirmation_visible`=false

Evidence: raw/v3-d03-both-selected.compact.json, raw/v3-d03-both-selected.full.json, raw/v3-d03-both-selected.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e22` | Tap Complete order (button, ref e22). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v3-d04-order-complete-total3 (heldout; group diagnostic-checkpoints)

Goal: The Order complete confirmation page is visibly open.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `confirmation_visible`=true, `total_three_visible`=true, `total_five_visible`=false

Evidence: raw/v3-d04-order-complete-total3.compact.json, raw/v3-d04-order-complete-total3.full.json, raw/v3-d04-order-complete-total3.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e9` | Tap Sample Shop (button, ref e9). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |
