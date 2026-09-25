# Feasibility corpus label review

Corpus SHA-256: `2d29737b595bff131ebdbd51898b88ac55fba8f2cb70dfadbf4d421c80d0fe54`
Manifest SHA-256: `9ecd716a0f9dfda4bd5df735f7f5e0e4203fcc01a6380217b297229c7e749c22`

Review every acceptable action, completion label, assertion label, case group and partition. The approval file must bind both hashes after the manifest is frozen.

**Coverage gap:** No captured screen supports a truthful `wait` label. The iOS 26.4 simulator has no Software Update entry under General, and no other captured screen showed a transient loading state. Review the [compact case page](case-review.md) for screenshots, supplied values, histories, and assertion claims before approving any label.

## t01-settings-onofflabels-root (tuning; group settings-onofflabels)

Goal: Turn on On/Off Labels in Accessibility.

Acceptable action IDs: `tap:e54`

Goal reached: **false**

Assertions: `labels_enabled`=false

Evidence: raw/t01-settings-onofflabels-root.compact.json, raw/t01-settings-onofflabels-root.full.json, raw/t01-settings-onofflabels-root.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e31` | Tap Apple Account, Sign in to access your iCloud data, the App Store, Apple services, and more. (button, ref e31). | yes |
| `tap:e40` | Tap Ready for Apple Intelligence (button, ref e40). | yes |
| `tap:e47` | Tap General (button, ref e47). | yes |
| `tap:e54` | Tap Accessibility (button, ref e54). | yes |
| `tap:e62` | Tap Action Button (button, ref e62). | yes |
| `tap:e70` | Tap Apple Intelligence & Siri (button, ref e70). | yes |
| `tap:e78` | Tap Camera (button, ref e78). | yes |
| `tap:e86` | Tap Home Screen & App Library (button, ref e86). | yes |
| `tap:e94` | Tap Search (button, ref e94). | yes |
| `tap:e102` | Tap StandBy (button, ref e102). | yes |
| `tap:e111` | Tap Screen Time (button, ref e111). | yes |
| `tap:e137` | Tap text-field (text-field, ref e137). | no |
| `tap:e138` | Tap Dictate (button, ref e138). | yes |
| `tap:e140` | Tap Dictate (button, ref e140). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## t02-settings-onofflabels-accessibility (tuning; group settings-onofflabels)

Goal: Turn on On/Off Labels in Accessibility.

Positional alternate goal (same capture, tuning only): Open the second row in the Vision section of Accessibility.
Alternate acceptable action IDs: `tap:e44`, `tap:e47`, `tap:e166`, `tap:e169`

Acceptable action IDs: `tap:e44`, `tap:e47`, `tap:e166`, `tap:e169`

Goal reached: **false**

Assertions: `labels_enabled`=false

Evidence: raw/t02-settings-onofflabels-accessibility.compact.json, raw/t02-settings-onofflabels-accessibility.full.json, raw/t02-settings-onofflabels-accessibility.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e12` | Tap Settings (button, ref e12). | yes |
| `swipe:e18:up` | Swipe up within AccessibilitySettingsControllerView (other, ref e18). | yes |
| `swipe:e18:down` | Swipe down within AccessibilitySettingsControllerView (other, ref e18). | yes |
| `swipe:e18:left` | Swipe left within AccessibilitySettingsControllerView (other, ref e18). | yes |
| `swipe:e18:right` | Swipe right within AccessibilitySettingsControllerView (other, ref e18). | yes |
| `swipe:e22:up` | Swipe up within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:down` | Swipe down within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:left` | Swipe left within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:right` | Swipe right within scroll-view (scroll-view, ref e22). | yes |
| `tap:e33` | Tap Hover Text, Off (button, ref e33). | yes |
| `tap:e36` | Tap Hover Text, Off (button, ref e36). | yes |
| `tap:e44` | Tap Display & Text Size (button, ref e44). | yes |
| `tap:e47` | Tap Display & Text Size (button, ref e47). | yes |
| `tap:e54` | Tap Motion (button, ref e54). | yes |
| `tap:e57` | Tap Motion (button, ref e57). | yes |
| `tap:e64` | Tap Spoken Content (button, ref e64). | yes |
| `tap:e67` | Tap Spoken Content (button, ref e67). | yes |
| `tap:e74` | Tap Face ID & Attention (button, ref e74). | yes |
| `tap:e77` | Tap Face ID & Attention (button, ref e77). | yes |
| `tap:e84` | Tap Control Nearby Devices (button, ref e84). | yes |
| `tap:e87` | Tap Control Nearby Devices (button, ref e87). | yes |
| `tap:e94` | Tap Subtitles & Captioning (button, ref e94). | yes |
| `tap:e97` | Tap Subtitles & Captioning (button, ref e97). | yes |
| `tap:e116` | Tap Subtitles & Captioning (button, ref e116). | yes |
| `tap:e119` | Tap Subtitles & Captioning (button, ref e119). | yes |
| `tap:e126` | Tap Control Nearby Devices (button, ref e126). | yes |
| `tap:e129` | Tap Control Nearby Devices (button, ref e129). | yes |
| `tap:e136` | Tap Face ID & Attention (button, ref e136). | yes |
| `tap:e139` | Tap Face ID & Attention (button, ref e139). | yes |
| `tap:e146` | Tap Spoken Content (button, ref e146). | yes |
| `tap:e149` | Tap Spoken Content (button, ref e149). | yes |
| `tap:e156` | Tap Motion (button, ref e156). | yes |
| `tap:e159` | Tap Motion (button, ref e159). | yes |
| `tap:e166` | Tap Display & Text Size (button, ref e166). | yes |
| `tap:e169` | Tap Display & Text Size (button, ref e169). | yes |
| `tap:e176` | Tap Hover Text, Off (button, ref e176). | yes |
| `tap:e179` | Tap Hover Text, Off (button, ref e179). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## t03-settings-onofflabels-off (tuning; group settings-onofflabels)

Goal: Turn on On/Off Labels in Accessibility.

Acceptable action IDs: `tap:e35`, `tap:e37`

Goal reached: **false**

Assertions: `labels_enabled`=false

Evidence: raw/t03-settings-onofflabels-off.compact.json, raw/t03-settings-onofflabels-off.full.json, raw/t03-settings-onofflabels-off.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e12` | Tap Accessibility (button, ref e12). | yes |
| `swipe:e22:up` | Swipe up within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:down` | Swipe down within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:left` | Swipe left within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:right` | Swipe right within scroll-view (scroll-view, ref e22). | yes |
| `tap:e24` | Tap Larger Text, Off (button, ref e24). | yes |
| `tap:e27` | Tap Larger Text, Off (button, ref e27). | yes |
| `tap:e35` | Tap On/Off Labels (switch, ref e35). | yes |
| `tap:e37` | Tap On/Off Labels (switch, ref e37). | yes |
| `tap:e62` | Tap Larger Text, Off (button, ref e62). | yes |
| `tap:e65` | Tap Larger Text, Off (button, ref e65). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## t04-settings-onofflabels-on (tuning; group settings-onofflabels)

Goal: Turn on On/Off Labels in Accessibility.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `labels_enabled`=true

Evidence: raw/t04-settings-onofflabels-on.compact.json, raw/t04-settings-onofflabels-on.full.json, raw/t04-settings-onofflabels-on.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e12` | Tap Accessibility (button, ref e12). | yes |
| `swipe:e22:up` | Swipe up within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:down` | Swipe down within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:left` | Swipe left within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:right` | Swipe right within scroll-view (scroll-view, ref e22). | yes |
| `tap:e24` | Tap Larger Text, Off (button, ref e24). | yes |
| `tap:e27` | Tap Larger Text, Off (button, ref e27). | yes |
| `tap:e35` | Tap On/Off Labels (switch, ref e35). | yes |
| `tap:e37` | Tap On/Off Labels (switch, ref e37). | yes |
| `tap:e62` | Tap Larger Text, Off (button, ref e62). | yes |
| `tap:e65` | Tap Larger Text, Off (button, ref e65). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## t05-contacts-create-list (tuning; group contacts-create)

Goal: Create a saved contact named Mira Vale.

Acceptable action IDs: `tap:e89`

Goal reached: **false**

Assertions: `contact_saved`=false

Evidence: raw/t05-contacts-create-list.compact.json, raw/t05-contacts-create-list.full.json, raw/t05-contacts-create-list.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e10` | Tap Back (button, ref e10). | yes |
| `swipe:e17:up` | Swipe up within ContactsListView (other, ref e17). | yes |
| `swipe:e17:down` | Swipe down within ContactsListView (other, ref e17). | yes |
| `swipe:e17:left` | Swipe left within ContactsListView (other, ref e17). | yes |
| `swipe:e17:right` | Swipe right within ContactsListView (other, ref e17). | yes |
| `tap:e26` | Tap Contact photo for John Appleseed (button, ref e26). | yes |
| `tap:e34` | Tap Contact photo for Kate Bell (button, ref e34). | yes |
| `tap:e42` | Tap Contact photo for Anna Haro (button, ref e42). | yes |
| `tap:e47` | Tap Contact photo for Daniel Higgins Jr. (button, ref e47). | yes |
| `tap:e55` | Tap Contact photo for David Taylor (button, ref e55). | yes |
| `tap:e63` | Tap Contact photo for Hank M. Zakroff (button, ref e63). | yes |
| `tap:e81` | Tap text-field (text-field, ref e81). | no |
| `type:e81:firstName` | Replace all text in text-field with the supplied scenario value firstName (text-field, ref e81). | yes |
| `type:e81:lastName` | Replace all text in text-field with the supplied scenario value lastName (text-field, ref e81). | yes |
| `tap:e82` | Tap Dictate (button, ref e82). | yes |
| `tap:e84` | Tap Dictate (button, ref e84). | yes |
| `tap:e89` | Tap Add (button, ref e89). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## t06-contacts-create-blank (tuning; group contacts-create)

Goal: Create a saved contact named Mira Vale.

Acceptable action IDs: `type:e116:firstName`, `type:e119:lastName`

Goal reached: **false**

Assertions: `contact_saved`=false

Evidence: raw/t06-contacts-create-blank.compact.json, raw/t06-contacts-create-blank.full.json, raw/t06-contacts-create-blank.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e11` | Tap Back (button, ref e11). | yes |
| `swipe:e18:up` | Swipe up within ContactsListView (other, ref e18). | yes |
| `swipe:e18:down` | Swipe down within ContactsListView (other, ref e18). | yes |
| `swipe:e18:left` | Swipe left within ContactsListView (other, ref e18). | yes |
| `swipe:e18:right` | Swipe right within ContactsListView (other, ref e18). | yes |
| `tap:e27` | Tap Contact photo for John Appleseed (button, ref e27). | yes |
| `tap:e35` | Tap Contact photo for Kate Bell (button, ref e35). | yes |
| `tap:e43` | Tap Contact photo for Anna Haro (button, ref e43). | yes |
| `tap:e48` | Tap Contact photo for Daniel Higgins Jr. (button, ref e48). | yes |
| `tap:e56` | Tap Contact photo for David Taylor (button, ref e56). | yes |
| `tap:e64` | Tap Contact photo for Hank M. Zakroff (button, ref e64). | yes |
| `tap:e82` | Tap text-field (text-field, ref e82). | no |
| `type:e82:firstName` | Replace all text in text-field with the supplied scenario value firstName (text-field, ref e82). | yes |
| `type:e82:lastName` | Replace all text in text-field with the supplied scenario value lastName (text-field, ref e82). | yes |
| `tap:e83` | Tap Dictate (button, ref e83). | yes |
| `tap:e85` | Tap Dictate (button, ref e85). | yes |
| `tap:e90` | Tap Add (button, ref e90). | yes |
| `tap:e96` | Tap Sheet Grabber (button, ref e96). | no |
| `tap:e101` | Tap close (button, ref e101). | yes |
| `tap:e112` | Tap Add photo (button, ref e112). | yes |
| `swipe:e114:up` | Swipe up within scroll-view (scroll-view, ref e114). | yes |
| `swipe:e114:down` | Swipe down within scroll-view (scroll-view, ref e114). | yes |
| `swipe:e114:left` | Swipe left within scroll-view (scroll-view, ref e114). | yes |
| `swipe:e114:right` | Swipe right within scroll-view (scroll-view, ref e114). | yes |
| `tap:e116` | Tap First name (text-field, ref e116). | no |
| `type:e116:firstName` | Replace all text in First name with the supplied scenario value firstName (text-field, ref e116). | yes |
| `type:e116:lastName` | Replace all text in First name with the supplied scenario value lastName (text-field, ref e116). | yes |
| `tap:e119` | Tap Last name (text-field, ref e119). | no |
| `type:e119:firstName` | Replace all text in Last name with the supplied scenario value firstName (text-field, ref e119). | yes |
| `type:e119:lastName` | Replace all text in Last name with the supplied scenario value lastName (text-field, ref e119). | yes |
| `tap:e122` | Tap Company (text-field, ref e122). | no |
| `type:e122:firstName` | Replace all text in Company with the supplied scenario value firstName (text-field, ref e122). | yes |
| `type:e122:lastName` | Replace all text in Company with the supplied scenario value lastName (text-field, ref e122). | yes |
| `tap:e124` | Tap add phone (button, ref e124). | yes |
| `tap:e125` | Tap Insert add phone (button, ref e125). | yes |
| `tap:e129` | Tap add email (button, ref e129). | yes |
| `tap:e130` | Tap Insert add email (button, ref e130). | yes |
| `tap:e134` | Tap add pronouns (button, ref e134). | yes |
| `tap:e135` | Tap Insert add pronouns (button, ref e135). | yes |
| `tap:e149` | Tap add url (button, ref e149). | yes |
| `tap:e150` | Tap Insert add url (button, ref e150). | yes |
| `tap:e174` | Tap add url (button, ref e174). | yes |
| `tap:e175` | Tap Insert add url (button, ref e175). | yes |
| `tap:e179` | Tap add pronouns (button, ref e179). | yes |
| `tap:e180` | Tap Insert add pronouns (button, ref e180). | yes |
| `tap:e184` | Tap add email (button, ref e184). | yes |
| `tap:e185` | Tap Insert add email (button, ref e185). | yes |
| `tap:e189` | Tap add phone (button, ref e189). | yes |
| `tap:e190` | Tap Insert add phone (button, ref e190). | yes |
| `tap:e194` | Tap Add photo (button, ref e194). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## t07-contacts-create-filled (tuning; group contacts-create)

Goal: Create a saved contact named Mira Vale.

Acceptable action IDs: `tap:e103`

Goal reached: **false**

Assertions: `contact_saved`=false

Evidence: raw/t07-contacts-create-filled.compact.json, raw/t07-contacts-create-filled.full.json, raw/t07-contacts-create-filled.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e11` | Tap Back (button, ref e11). | yes |
| `swipe:e18:up` | Swipe up within ContactsListView (other, ref e18). | yes |
| `swipe:e18:down` | Swipe down within ContactsListView (other, ref e18). | yes |
| `swipe:e18:left` | Swipe left within ContactsListView (other, ref e18). | yes |
| `swipe:e18:right` | Swipe right within ContactsListView (other, ref e18). | yes |
| `tap:e27` | Tap Contact photo for John Appleseed (button, ref e27). | yes |
| `tap:e35` | Tap Contact photo for Kate Bell (button, ref e35). | yes |
| `tap:e43` | Tap Contact photo for Anna Haro (button, ref e43). | yes |
| `tap:e48` | Tap Contact photo for Daniel Higgins Jr. (button, ref e48). | yes |
| `tap:e56` | Tap Contact photo for David Taylor (button, ref e56). | yes |
| `tap:e64` | Tap Contact photo for Hank M. Zakroff (button, ref e64). | yes |
| `tap:e82` | Tap text-field (text-field, ref e82). | no |
| `type:e82:firstName` | Replace all text in text-field with the supplied scenario value firstName (text-field, ref e82). | yes |
| `type:e82:lastName` | Replace all text in text-field with the supplied scenario value lastName (text-field, ref e82). | yes |
| `tap:e83` | Tap Dictate (button, ref e83). | yes |
| `tap:e85` | Tap Dictate (button, ref e85). | yes |
| `tap:e90` | Tap Add (button, ref e90). | yes |
| `tap:e96` | Tap Sheet Grabber (button, ref e96). | no |
| `tap:e101` | Tap close (button, ref e101). | yes |
| `tap:e103` | Tap Done (button, ref e103). | yes |
| `tap:e112` | Tap Add photo (button, ref e112). | yes |
| `swipe:e114:up` | Swipe up within scroll-view (scroll-view, ref e114). | yes |
| `swipe:e114:down` | Swipe down within scroll-view (scroll-view, ref e114). | yes |
| `swipe:e114:left` | Swipe left within scroll-view (scroll-view, ref e114). | yes |
| `swipe:e114:right` | Swipe right within scroll-view (scroll-view, ref e114). | yes |
| `tap:e116` | Tap First name (text-field, ref e116). | no |
| `type:e116:firstName` | Replace all text in First name with the supplied scenario value firstName (text-field, ref e116). | yes |
| `type:e116:lastName` | Replace all text in First name with the supplied scenario value lastName (text-field, ref e116). | yes |
| `tap:e119` | Tap Last name (text-field, ref e119). | no |
| `type:e119:firstName` | Replace all text in Last name with the supplied scenario value firstName (text-field, ref e119). | yes |
| `type:e119:lastName` | Replace all text in Last name with the supplied scenario value lastName (text-field, ref e119). | yes |
| `tap:e120` | Tap Clear text (button, ref e120). | yes |
| `tap:e123` | Tap Company (text-field, ref e123). | no |
| `type:e123:firstName` | Replace all text in Company with the supplied scenario value firstName (text-field, ref e123). | yes |
| `type:e123:lastName` | Replace all text in Company with the supplied scenario value lastName (text-field, ref e123). | yes |
| `tap:e125` | Tap add phone (button, ref e125). | yes |
| `tap:e126` | Tap Insert add phone (button, ref e126). | yes |
| `tap:e130` | Tap add email (button, ref e130). | yes |
| `tap:e131` | Tap Insert add email (button, ref e131). | yes |
| `tap:e135` | Tap add pronouns (button, ref e135). | yes |
| `tap:e136` | Tap Insert add pronouns (button, ref e136). | yes |
| `tap:e150` | Tap add url (button, ref e150). | yes |
| `tap:e151` | Tap Insert add url (button, ref e151). | yes |
| `tap:e175` | Tap add url (button, ref e175). | yes |
| `tap:e176` | Tap Insert add url (button, ref e176). | yes |
| `tap:e180` | Tap add pronouns (button, ref e180). | yes |
| `tap:e181` | Tap Insert add pronouns (button, ref e181). | yes |
| `tap:e185` | Tap add email (button, ref e185). | yes |
| `tap:e186` | Tap Insert add email (button, ref e186). | yes |
| `tap:e190` | Tap add phone (button, ref e190). | yes |
| `tap:e191` | Tap Insert add phone (button, ref e191). | yes |
| `tap:e195` | Tap Add photo (button, ref e195). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## t08-reminders-create-onboarding (tuning; group reminders-create)

Goal: Create a reminder titled Call Mira in the local Reminders list.

Acceptable action IDs: `tap:e78`

Goal reached: **false**

Assertions: `reminder_saved`=false

Evidence: raw/t08-reminders-create-onboarding.compact.json, raw/t08-reminders-create-onboarding.full.json, raw/t08-reminders-create-onboarding.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e11` | Tap Back (button, ref e11). | yes |
| `tap:e12` | Tap More (button, ref e12). | yes |
| `tap:e45` | Tap New Reminder (button, ref e45). | yes |
| `swipe:e57:up` | Swipe up within scroll-view (scroll-view, ref e57). | yes |
| `swipe:e57:down` | Swipe down within scroll-view (scroll-view, ref e57). | yes |
| `swipe:e57:left` | Swipe left within scroll-view (scroll-view, ref e57). | yes |
| `swipe:e57:right` | Swipe right within scroll-view (scroll-view, ref e57). | yes |
| `tap:e78` | Tap Continue (button, ref e78). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## t09-reminders-create-icloud-prompt (tuning; group reminders-create)

Goal: Create a reminder titled Call Mira in the local Reminders list.

Acceptable action IDs: `tap:e71`

Goal reached: **false**

Assertions: `reminder_saved`=false

Evidence: raw/t09-reminders-create-icloud-prompt.compact.json, raw/t09-reminders-create-icloud-prompt.full.json, raw/t09-reminders-create-icloud-prompt.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e10` | Tap Back (button, ref e10). | yes |
| `tap:e11` | Tap More (button, ref e11). | yes |
| `tap:e44` | Tap New Reminder (button, ref e44). | yes |
| `swipe:e50:up` | Swipe up within Enable iCloud Syncing? (other, ref e50). | yes |
| `swipe:e50:down` | Swipe down within Enable iCloud Syncing? (other, ref e50). | yes |
| `swipe:e50:left` | Swipe left within Enable iCloud Syncing? (other, ref e50). | yes |
| `swipe:e50:right` | Swipe right within Enable iCloud Syncing? (other, ref e50). | yes |
| `swipe:e55:up` | Swipe up within scroll-view (scroll-view, ref e55). | yes |
| `swipe:e55:down` | Swipe down within scroll-view (scroll-view, ref e55). | yes |
| `swipe:e55:left` | Swipe left within scroll-view (scroll-view, ref e55). | yes |
| `swipe:e55:right` | Swipe right within scroll-view (scroll-view, ref e55). | yes |
| `swipe:e68:up` | Swipe up within scroll-view (scroll-view, ref e68). | yes |
| `swipe:e68:down` | Swipe down within scroll-view (scroll-view, ref e68). | yes |
| `swipe:e68:left` | Swipe left within scroll-view (scroll-view, ref e68). | yes |
| `swipe:e68:right` | Swipe right within scroll-view (scroll-view, ref e68). | yes |
| `tap:e71` | Tap Not Now (button, ref e71). | yes |
| `tap:e72` | Tap Go to Settings (button, ref e72). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## t10-reminders-create-empty-list (tuning; group reminders-create)

Goal: Create a reminder titled Call Mira in the local Reminders list.

Acceptable action IDs: `tap:e44`

Goal reached: **false**

Assertions: `reminder_saved`=false

Evidence: raw/t10-reminders-create-empty-list.compact.json, raw/t10-reminders-create-empty-list.full.json, raw/t10-reminders-create-empty-list.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e10` | Tap Back (button, ref e10). | yes |
| `tap:e11` | Tap More (button, ref e11). | yes |
| `tap:e44` | Tap New Reminder (button, ref e44). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h01-settings-about-general (heldout; group settings-ios-build)

Goal: Open the detailed iOS version screen and find its build identifier.

Acceptable action IDs: `tap:e32`, `tap:e35`, `tap:e190`, `tap:e193`

Goal reached: **false**

Assertions: `build_shown`=false

Evidence: raw/h01-settings-about-general.compact.json, raw/h01-settings-about-general.full.json, raw/h01-settings-about-general.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e12` | Tap Settings (button, ref e12). | yes |
| `swipe:e22:up` | Swipe up within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:down` | Swipe down within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:left` | Swipe left within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:right` | Swipe right within scroll-view (scroll-view, ref e22). | yes |
| `tap:e32` | Tap About (button, ref e32). | yes |
| `tap:e35` | Tap About (button, ref e35). | yes |
| `tap:e42` | Tap Screen Capture (button, ref e42). | yes |
| `tap:e45` | Tap Screen Capture (button, ref e45). | yes |
| `tap:e52` | Tap AutoFill & Passwords (button, ref e52). | yes |
| `tap:e55` | Tap AutoFill & Passwords (button, ref e55). | yes |
| `tap:e62` | Tap Dictionary (button, ref e62). | yes |
| `tap:e65` | Tap Dictionary (button, ref e65). | yes |
| `tap:e72` | Tap Fonts (button, ref e72). | yes |
| `tap:e75` | Tap Fonts (button, ref e75). | yes |
| `tap:e82` | Tap Keyboard (button, ref e82). | yes |
| `tap:e85` | Tap Keyboard (button, ref e85). | yes |
| `tap:e92` | Tap Language & Region (button, ref e92). | yes |
| `tap:e95` | Tap Language & Region (button, ref e95). | yes |
| `tap:e102` | Tap VPN & Device Management (button, ref e102). | yes |
| `tap:e105` | Tap VPN & Device Management (button, ref e105). | yes |
| `tap:e120` | Tap VPN & Device Management (button, ref e120). | yes |
| `tap:e123` | Tap VPN & Device Management (button, ref e123). | yes |
| `tap:e130` | Tap Language & Region (button, ref e130). | yes |
| `tap:e133` | Tap Language & Region (button, ref e133). | yes |
| `tap:e140` | Tap Keyboard (button, ref e140). | yes |
| `tap:e143` | Tap Keyboard (button, ref e143). | yes |
| `tap:e150` | Tap Fonts (button, ref e150). | yes |
| `tap:e153` | Tap Fonts (button, ref e153). | yes |
| `tap:e160` | Tap Dictionary (button, ref e160). | yes |
| `tap:e163` | Tap Dictionary (button, ref e163). | yes |
| `tap:e170` | Tap AutoFill & Passwords (button, ref e170). | yes |
| `tap:e173` | Tap AutoFill & Passwords (button, ref e173). | yes |
| `tap:e180` | Tap Screen Capture (button, ref e180). | yes |
| `tap:e183` | Tap Screen Capture (button, ref e183). | yes |
| `tap:e190` | Tap About (button, ref e190). | yes |
| `tap:e193` | Tap About (button, ref e193). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h02-settings-about-version-row (heldout; group settings-ios-build)

Goal: Open the detailed iOS version screen and find its build identifier.

Acceptable action IDs: `tap:e32`, `tap:e35`, `tap:e210`, `tap:e213`

Goal reached: **false**

Assertions: `build_shown`=false

Evidence: raw/h02-settings-about-version-row.compact.json, raw/h02-settings-about-version-row.full.json, raw/h02-settings-about-version-row.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e12` | Tap General (button, ref e12). | yes |
| `swipe:e22:up` | Swipe up within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:down` | Swipe down within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:left` | Swipe left within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:right` | Swipe right within scroll-view (scroll-view, ref e22). | yes |
| `tap:e26` | Tap Name, iPhone (button, ref e26). | yes |
| `tap:e32` | Tap iOS Version, 26.4.1 (button, ref e32). | yes |
| `tap:e35` | Tap iOS Version, 26.4.1 (button, ref e35). | yes |
| `tap:e45` | Tap Model Name, iPhone 17 Pro Max (button, ref e45). | yes |
| `tap:e54` | Tap Model Number, A3257SA/A (button, ref e54). | yes |
| `tap:e63` | Tap Serial Number, K2MNVKK265 (button, ref e63). | yes |
| `tap:e72` | Tap Songs, 0 (button, ref e72). | yes |
| `tap:e81` | Tap Videos, 0 (button, ref e81). | yes |
| `tap:e90` | Tap Photos, 6 (button, ref e90). | yes |
| `tap:e99` | Tap Capacity, 494.38 GB (button, ref e99). | yes |
| `tap:e108` | Tap Available, 52.53 GB (button, ref e108). | yes |
| `tap:e114` | Tap Certificate Trust Settings (button, ref e114). | yes |
| `tap:e130` | Tap Certificate Trust Settings (button, ref e130). | yes |
| `tap:e141` | Tap Available, 52.53 GB (button, ref e141). | yes |
| `tap:e150` | Tap Capacity, 494.38 GB (button, ref e150). | yes |
| `tap:e159` | Tap Photos, 6 (button, ref e159). | yes |
| `tap:e168` | Tap Videos, 0 (button, ref e168). | yes |
| `tap:e177` | Tap Songs, 0 (button, ref e177). | yes |
| `tap:e186` | Tap Serial Number, K2MNVKK265 (button, ref e186). | yes |
| `tap:e195` | Tap Model Number, A3257SA/A (button, ref e195). | yes |
| `tap:e204` | Tap Model Name, iPhone 17 Pro Max (button, ref e204). | yes |
| `tap:e210` | Tap iOS Version, 26.4.1 (button, ref e210). | yes |
| `tap:e213` | Tap iOS Version, 26.4.1 (button, ref e213). | yes |
| `tap:e223` | Tap Name, iPhone (button, ref e223). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h03-settings-about-build-detail (heldout; group settings-ios-build)

Goal: Open the detailed iOS version screen and find its build identifier.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `build_shown`=true

Evidence: raw/h03-settings-about-build-detail.compact.json, raw/h03-settings-about-build-detail.full.json, raw/h03-settings-about-build-detail.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e12` | Tap About (button, ref e12). | yes |
| `swipe:e22:up` | Swipe up within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:down` | Swipe down within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:left` | Swipe left within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:right` | Swipe right within scroll-view (scroll-view, ref e22). | yes |
| `tap:e24` | Tap iOS 26.4.1 (23E254a) (button, ref e24). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h04-settings-region-check (heldout; group settings-region-check)

Goal: Verify the device region shown in Language & Region is United States.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `region_us`=true, `region_france`=false

Evidence: raw/h04-settings-region-check.compact.json, raw/h04-settings-region-check.full.json, raw/h04-settings-region-check.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e12` | Tap General (button, ref e12). | yes |
| `tap:e14` | Tap Edit (button, ref e14). | yes |
| `swipe:e23:up` | Swipe up within scroll-view (scroll-view, ref e23). | yes |
| `swipe:e23:down` | Swipe down within scroll-view (scroll-view, ref e23). | yes |
| `swipe:e23:left` | Swipe left within scroll-view (scroll-view, ref e23). | yes |
| `swipe:e23:right` | Swipe right within scroll-view (scroll-view, ref e23). | yes |
| `tap:e24` | Tap English (other, ref e24). | yes |
| `tap:e25` | Tap English (text, ref e25). | yes |
| `tap:e26` | Tap iPhone Language (text, ref e26). | yes |
| `tap:e28` | Tap Reorder English (button, ref e28). | yes |
| `tap:e29` | Tap drag (image, ref e29). | yes |
| `tap:e30` | Tap Tiếng Việt (other, ref e30). | yes |
| `tap:e31` | Tap Tiếng Việt (text, ref e31). | yes |
| `tap:e32` | Tap Vietnamese (text, ref e32). | yes |
| `tap:e34` | Tap Reorder Tiếng Việt (button, ref e34). | yes |
| `tap:e35` | Tap drag (image, ref e35). | yes |
| `tap:e36` | Tap Add Language… (button, ref e36). | yes |
| `tap:e39` | Tap Add Language… (button, ref e39). | yes |
| `tap:e43` | Tap Region, United States (button, ref e43). | yes |
| `tap:e46` | Tap Region, United States (button, ref e46). | yes |
| `tap:e53` | Tap Calendar, Gregorian (button, ref e53). | yes |
| `tap:e56` | Tap Calendar, Gregorian (button, ref e56). | yes |
| `tap:e63` | Tap Temperature, °F (button, ref e63). | yes |
| `tap:e66` | Tap Temperature, °F (button, ref e66). | yes |
| `tap:e73` | Tap Measurement System, US (button, ref e73). | yes |
| `tap:e76` | Tap Measurement System, US (button, ref e76). | yes |
| `tap:e83` | Tap First Day of Week, Sunday (button, ref e83). | yes |
| `tap:e86` | Tap First Day of Week, Sunday (button, ref e86). | yes |
| `tap:e93` | Tap Date Format, 8/19/26 (button, ref e93). | yes |
| `tap:e96` | Tap Date Format, 8/19/26 (button, ref e96). | yes |
| `tap:e103` | Tap Number Format, 1, 234, 567.89 (button, ref e103). | yes |
| `tap:e106` | Tap Number Format, 1,234,567.89 (button, ref e106). | yes |
| `tap:e130` | Tap Number Format, 1, 234, 567.89 (button, ref e130). | yes |
| `tap:e133` | Tap Number Format, 1,234,567.89 (button, ref e133). | yes |
| `tap:e140` | Tap Date Format, 8/19/26 (button, ref e140). | yes |
| `tap:e143` | Tap Date Format, 8/19/26 (button, ref e143). | yes |
| `tap:e150` | Tap First Day of Week, Sunday (button, ref e150). | yes |
| `tap:e153` | Tap First Day of Week, Sunday (button, ref e153). | yes |
| `tap:e160` | Tap Measurement System, US (button, ref e160). | yes |
| `tap:e163` | Tap Measurement System, US (button, ref e163). | yes |
| `tap:e170` | Tap Temperature, °F (button, ref e170). | yes |
| `tap:e173` | Tap Temperature, °F (button, ref e173). | yes |
| `tap:e180` | Tap Calendar, Gregorian (button, ref e180). | yes |
| `tap:e183` | Tap Calendar, Gregorian (button, ref e183). | yes |
| `tap:e190` | Tap Region, United States (button, ref e190). | yes |
| `tap:e193` | Tap Region, United States (button, ref e193). | yes |
| `tap:e200` | Tap Add Language… (button, ref e200). | yes |
| `tap:e203` | Tap Add Language… (button, ref e203). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h05-settings-keyboard-top (heldout; group settings-dictation-languages)

Goal: Open the Dictation Languages list under Keyboard settings.

Acceptable action IDs: `swipe:e22:up`

Goal reached: **false**

Assertions: `languages_shown`=false

Evidence: raw/h05-settings-keyboard-top.compact.json, raw/h05-settings-keyboard-top.full.json, raw/h05-settings-keyboard-top.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e12` | Tap General (button, ref e12). | yes |
| `swipe:e22:up` | Swipe up within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:down` | Swipe down within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:left` | Swipe left within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:right` | Swipe right within scroll-view (scroll-view, ref e22). | yes |
| `tap:e23` | Tap Keyboards, 3 (button, ref e23). | yes |
| `tap:e26` | Tap Keyboards, 3 (button, ref e26). | yes |
| `tap:e33` | Tap Text Replacement (button, ref e33). | yes |
| `tap:e41` | Tap One-Handed Keyboard, Off (button, ref e41). | yes |
| `tap:e44` | Tap One-Handed Keyboard, Off (button, ref e44). | yes |
| `tap:e54` | Tap Hardware Keyboard (button, ref e54). | yes |
| `tap:e77` | Tap Hardware Keyboard (button, ref e77). | yes |
| `tap:e85` | Tap One-Handed Keyboard, Off (button, ref e85). | yes |
| `tap:e88` | Tap One-Handed Keyboard, Off (button, ref e88). | yes |
| `tap:e95` | Tap Text Replacement (button, ref e95). | yes |
| `tap:e103` | Tap Keyboards, 3 (button, ref e103). | yes |
| `tap:e106` | Tap Keyboards, 3 (button, ref e106). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h06-settings-dictation-languages-row (heldout; group settings-dictation-languages)

Goal: Open the Dictation Languages list under Keyboard settings.

Acceptable action IDs: `tap:e54`, `tap:e73`

Goal reached: **false**

Assertions: `languages_shown`=false

Evidence: raw/h06-settings-dictation-languages-row.compact.json, raw/h06-settings-dictation-languages-row.full.json, raw/h06-settings-dictation-languages-row.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e12` | Tap General (button, ref e12). | yes |
| `swipe:e32:up` | Swipe up within scroll-view (scroll-view, ref e32). | yes |
| `swipe:e32:down` | Swipe down within scroll-view (scroll-view, ref e32). | yes |
| `swipe:e32:left` | Swipe left within scroll-view (scroll-view, ref e32). | yes |
| `swipe:e32:right` | Swipe right within scroll-view (scroll-view, ref e32). | yes |
| `tap:e34` | Tap Hardware Keyboard (button, ref e34). | yes |
| `tap:e54` | Tap Dictation Languages (button, ref e54). | yes |
| `tap:e73` | Tap Dictation Languages (button, ref e73). | yes |
| `tap:e81` | Tap Hardware Keyboard (button, ref e81). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h07-settings-dictation-languages-open (heldout; group settings-dictation-languages)

Goal: Open the Dictation Languages list under Keyboard settings.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `languages_shown`=true

Evidence: raw/h07-settings-dictation-languages-open.compact.json, raw/h07-settings-dictation-languages-open.full.json, raw/h07-settings-dictation-languages-open.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e12` | Tap Keyboards (button, ref e12). | yes |
| `swipe:e22:up` | Swipe up within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:down` | Swipe down within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:left` | Swipe left within scroll-view (scroll-view, ref e22). | yes |
| `swipe:e22:right` | Swipe right within scroll-view (scroll-view, ref e22). | yes |
| `tap:e26` | Tap English (US) (button, ref e26). | yes |
| `tap:e34` | Tap Vietnamese (button, ref e34). | yes |
| `tap:e41` | Tap text-field (text-field, ref e41). | no |
| `tap:e57` | Tap Vietnamese (button, ref e57). | yes |
| `tap:e64` | Tap English (US) (button, ref e64). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h08-contacts-find-list (heldout; group contacts-find)

Goal: Open the saved contact Mira Stone.

Acceptable action IDs: `tap:e55`, `type:e89:query`

Goal reached: **false**

Assertions: `contact_open`=false

Evidence: raw/h08-contacts-find-list.compact.json, raw/h08-contacts-find-list.full.json, raw/h08-contacts-find-list.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e10` | Tap Back (button, ref e10). | yes |
| `swipe:e17:up` | Swipe up within ContactsListView (other, ref e17). | yes |
| `swipe:e17:down` | Swipe down within ContactsListView (other, ref e17). | yes |
| `swipe:e17:left` | Swipe left within ContactsListView (other, ref e17). | yes |
| `swipe:e17:right` | Swipe right within ContactsListView (other, ref e17). | yes |
| `tap:e26` | Tap Contact photo for John Appleseed (button, ref e26). | yes |
| `tap:e34` | Tap Contact photo for Kate Bell (button, ref e34). | yes |
| `tap:e42` | Tap Contact photo for Anna Haro (button, ref e42). | yes |
| `tap:e47` | Tap Contact photo for Daniel Higgins Jr. (button, ref e47). | yes |
| `tap:e55` | Tap Contact photo for Mira Stone (button, ref e55). | yes |
| `tap:e63` | Tap Contact photo for David Taylor (button, ref e63). | yes |
| `tap:e71` | Tap Contact photo for Hank M. Zakroff (button, ref e71). | yes |
| `tap:e89` | Tap text-field (text-field, ref e89). | no |
| `type:e89:query` | Replace all text in text-field with the supplied scenario value query (text-field, ref e89). | yes |
| `tap:e90` | Tap Dictate (button, ref e90). | yes |
| `tap:e92` | Tap Dictate (button, ref e92). | yes |
| `tap:e97` | Tap Add (button, ref e97). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h09-contacts-find-results (heldout; group contacts-find)

Goal: Open the saved contact Mira Stone.

Acceptable action IDs: `tap:e88`

Goal reached: **false**

Assertions: `contact_open`=false

Evidence: raw/h09-contacts-find-results.compact.json, raw/h09-contacts-find-results.full.json, raw/h09-contacts-find-results.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `swipe:e14:up` | Swipe up within ContactsListView (other, ref e14). | yes |
| `swipe:e14:down` | Swipe down within ContactsListView (other, ref e14). | yes |
| `swipe:e14:left` | Swipe left within ContactsListView (other, ref e14). | yes |
| `swipe:e14:right` | Swipe right within ContactsListView (other, ref e14). | yes |
| `tap:e23` | Tap Contact photo for John Appleseed (button, ref e23). | yes |
| `tap:e31` | Tap Contact photo for Kate Bell (button, ref e31). | yes |
| `tap:e39` | Tap Contact photo for Anna Haro (button, ref e39). | yes |
| `tap:e44` | Tap Contact photo for Daniel Higgins Jr. (button, ref e44). | yes |
| `tap:e52` | Tap Contact photo for Mira Stone (button, ref e52). | yes |
| `tap:e60` | Tap Contact photo for David Taylor (button, ref e60). | yes |
| `tap:e68` | Tap Contact photo for Hank M. Zakroff (button, ref e68). | yes |
| `swipe:e79:up` | Swipe up within Activate to dismiss (other, ref e79). | yes |
| `swipe:e79:down` | Swipe down within Activate to dismiss (other, ref e79). | yes |
| `swipe:e79:left` | Swipe left within Activate to dismiss (other, ref e79). | yes |
| `swipe:e79:right` | Swipe right within Activate to dismiss (other, ref e79). | yes |
| `swipe:e80:up` | Swipe up within ContactsListView (other, ref e80). | yes |
| `swipe:e80:down` | Swipe down within ContactsListView (other, ref e80). | yes |
| `swipe:e80:left` | Swipe left within ContactsListView (other, ref e80). | yes |
| `swipe:e80:right` | Swipe right within ContactsListView (other, ref e80). | yes |
| `swipe:e81:up` | Swipe up within Search results (other, ref e81). | yes |
| `swipe:e81:down` | Swipe down within Search results (other, ref e81). | yes |
| `swipe:e81:left` | Swipe left within Search results (other, ref e81). | yes |
| `swipe:e81:right` | Swipe right within Search results (other, ref e81). | yes |
| `tap:e88` | Tap Contact photo for Mira Stone (button, ref e88). | yes |
| `tap:e111` | Tap text-field (text-field, ref e111). | no |
| `type:e111:query` | Replace all text in text-field with the supplied scenario value query (text-field, ref e111). | yes |
| `tap:e113` | Tap Clear text (button, ref e113). | yes |
| `tap:e118` | Tap close (button, ref e118). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h10-contacts-find-opened (heldout; group contacts-find)

Goal: Open the saved contact Mira Stone.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `contact_open`=true

Evidence: raw/h10-contacts-find-opened.compact.json, raw/h10-contacts-find-opened.full.json, raw/h10-contacts-find-opened.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e10` | Tap Search (button, ref e10). | yes |
| `tap:e11` | Tap Edit (button, ref e11). | yes |
| `swipe:e22:up` | Swipe up within ContactCardScrollViewReader (scroll-view, ref e22). | yes |
| `swipe:e22:down` | Swipe down within ContactCardScrollViewReader (scroll-view, ref e22). | yes |
| `swipe:e22:left` | Swipe left within ContactCardScrollViewReader (scroll-view, ref e22). | yes |
| `swipe:e22:right` | Swipe right within ContactCardScrollViewReader (scroll-view, ref e22). | yes |
| `swipe:e30:up` | Swipe up within ContactCardScrollViewReader (scroll-view, ref e30). | yes |
| `swipe:e30:down` | Swipe down within ContactCardScrollViewReader (scroll-view, ref e30). | yes |
| `swipe:e30:left` | Swipe left within ContactCardScrollViewReader (scroll-view, ref e30). | yes |
| `swipe:e30:right` | Swipe right within ContactCardScrollViewReader (scroll-view, ref e30). | yes |
| `tap:e62` | Tap Contact Photo & Poster (button, ref e62). | yes |
| `tap:e73` | Tap ContactCardDetailsView (text-field, ref e73). | no |
| `type:e73:query` | Replace all text in ContactCardDetailsView with the supplied scenario value query (text-field, ref e73). | yes |
| `tap:e81` | Tap Share Contact (button, ref e81). | yes |
| `tap:e90` | Tap Add to List (button, ref e90). | yes |
| `tap:e100` | Tap Block Contact (button, ref e100). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h11-contacts-edit-detail (heldout; group contacts-edit)

Goal: Change Mira Vale's last name to Stone and verify the saved contact.

Acceptable action IDs: `tap:e11`

Goal reached: **false**

Assertions: `surname_stone`=false

Evidence: raw/h11-contacts-edit-detail.compact.json, raw/h11-contacts-edit-detail.full.json, raw/h11-contacts-edit-detail.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e10` | Tap Contacts (button, ref e10). | yes |
| `tap:e11` | Tap Edit (button, ref e11). | yes |
| `swipe:e22:up` | Swipe up within ContactCardScrollViewReader (scroll-view, ref e22). | yes |
| `swipe:e22:down` | Swipe down within ContactCardScrollViewReader (scroll-view, ref e22). | yes |
| `swipe:e22:left` | Swipe left within ContactCardScrollViewReader (scroll-view, ref e22). | yes |
| `swipe:e22:right` | Swipe right within ContactCardScrollViewReader (scroll-view, ref e22). | yes |
| `swipe:e30:up` | Swipe up within ContactCardScrollViewReader (scroll-view, ref e30). | yes |
| `swipe:e30:down` | Swipe down within ContactCardScrollViewReader (scroll-view, ref e30). | yes |
| `swipe:e30:left` | Swipe left within ContactCardScrollViewReader (scroll-view, ref e30). | yes |
| `swipe:e30:right` | Swipe right within ContactCardScrollViewReader (scroll-view, ref e30). | yes |
| `tap:e62` | Tap Contact Photo & Poster (button, ref e62). | yes |
| `tap:e73` | Tap ContactCardDetailsView (text-field, ref e73). | no |
| `type:e73:lastName` | Replace all text in ContactCardDetailsView with the supplied scenario value lastName (text-field, ref e73). | yes |
| `tap:e81` | Tap Share Contact (button, ref e81). | yes |
| `tap:e90` | Tap Add to List (button, ref e90). | yes |
| `tap:e100` | Tap Block Contact (button, ref e100). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h12-contacts-edit-form (heldout; group contacts-edit)

Goal: Change Mira Vale's last name to Stone and verify the saved contact.

Acceptable action IDs: `type:e30:lastName`

Goal reached: **false**

Assertions: `surname_stone`=false

Evidence: raw/h12-contacts-edit-form.compact.json, raw/h12-contacts-edit-form.full.json, raw/h12-contacts-edit-form.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e10` | Tap close (button, ref e10). | yes |
| `tap:e23` | Tap Add photo (button, ref e23). | yes |
| `swipe:e25:up` | Swipe up within scroll-view (scroll-view, ref e25). | yes |
| `swipe:e25:down` | Swipe down within scroll-view (scroll-view, ref e25). | yes |
| `swipe:e25:left` | Swipe left within scroll-view (scroll-view, ref e25). | yes |
| `swipe:e25:right` | Swipe right within scroll-view (scroll-view, ref e25). | yes |
| `tap:e27` | Tap First name (text-field, ref e27). | no |
| `type:e27:lastName` | Replace all text in First name with the supplied scenario value lastName (text-field, ref e27). | yes |
| `tap:e30` | Tap Last name (text-field, ref e30). | no |
| `type:e30:lastName` | Replace all text in Last name with the supplied scenario value lastName (text-field, ref e30). | yes |
| `tap:e33` | Tap Company (text-field, ref e33). | no |
| `type:e33:lastName` | Replace all text in Company with the supplied scenario value lastName (text-field, ref e33). | yes |
| `tap:e35` | Tap add phone (button, ref e35). | yes |
| `tap:e36` | Tap Insert add phone (button, ref e36). | yes |
| `tap:e40` | Tap add email (button, ref e40). | yes |
| `tap:e41` | Tap Insert add email (button, ref e41). | yes |
| `tap:e45` | Tap add pronouns (button, ref e45). | yes |
| `tap:e46` | Tap Insert add pronouns (button, ref e46). | yes |
| `tap:e60` | Tap add url (button, ref e60). | yes |
| `tap:e61` | Tap Insert add url (button, ref e61). | yes |
| `tap:e82` | Tap add url (button, ref e82). | yes |
| `tap:e83` | Tap Insert add url (button, ref e83). | yes |
| `tap:e87` | Tap add pronouns (button, ref e87). | yes |
| `tap:e88` | Tap Insert add pronouns (button, ref e88). | yes |
| `tap:e92` | Tap add email (button, ref e92). | yes |
| `tap:e93` | Tap Insert add email (button, ref e93). | yes |
| `tap:e97` | Tap add phone (button, ref e97). | yes |
| `tap:e98` | Tap Insert add phone (button, ref e98). | yes |
| `tap:e102` | Tap Add photo (button, ref e102). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h13-contacts-edit-saved (heldout; group contacts-edit)

Goal: Change Mira Vale's last name to Stone and verify the saved contact.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `surname_stone`=true

Evidence: raw/h13-contacts-edit-saved.compact.json, raw/h13-contacts-edit-saved.full.json, raw/h13-contacts-edit-saved.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e10` | Tap Contacts (button, ref e10). | yes |
| `tap:e11` | Tap Edit (button, ref e11). | yes |
| `swipe:e22:up` | Swipe up within ContactCardScrollViewReader (scroll-view, ref e22). | yes |
| `swipe:e22:down` | Swipe down within ContactCardScrollViewReader (scroll-view, ref e22). | yes |
| `swipe:e22:left` | Swipe left within ContactCardScrollViewReader (scroll-view, ref e22). | yes |
| `swipe:e22:right` | Swipe right within ContactCardScrollViewReader (scroll-view, ref e22). | yes |
| `swipe:e30:up` | Swipe up within ContactCardScrollViewReader (scroll-view, ref e30). | yes |
| `swipe:e30:down` | Swipe down within ContactCardScrollViewReader (scroll-view, ref e30). | yes |
| `swipe:e30:left` | Swipe left within ContactCardScrollViewReader (scroll-view, ref e30). | yes |
| `swipe:e30:right` | Swipe right within ContactCardScrollViewReader (scroll-view, ref e30). | yes |
| `tap:e62` | Tap Contact Photo & Poster (button, ref e62). | yes |
| `tap:e73` | Tap ContactCardDetailsView (text-field, ref e73). | no |
| `type:e73:lastName` | Replace all text in ContactCardDetailsView with the supplied scenario value lastName (text-field, ref e73). | yes |
| `tap:e81` | Tap Share Contact (button, ref e81). | yes |
| `tap:e90` | Tap Add to List (button, ref e90). | yes |
| `tap:e100` | Tap Block Contact (button, ref e100). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h14-reminders-complete-list (heldout; group reminders-complete)

Goal: Complete Call Mira and verify that it appears as Completed.

Acceptable action IDs: `tap:e26`

Goal reached: **false**

Assertions: `reminder_completed`=false

Evidence: raw/h14-reminders-complete-list.compact.json, raw/h14-reminders-complete-list.full.json, raw/h14-reminders-complete-list.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e10` | Tap Back (button, ref e10). | yes |
| `tap:e11` | Tap More (button, ref e11). | yes |
| `swipe:e20:up` | Swipe up within RemindersList.ID.RemindersTable (other, ref e20). | yes |
| `swipe:e20:down` | Swipe down within RemindersList.ID.RemindersTable (other, ref e20). | yes |
| `swipe:e20:left` | Swipe left within RemindersList.ID.RemindersTable (other, ref e20). | yes |
| `swipe:e20:right` | Swipe right within RemindersList.ID.RemindersTable (other, ref e20). | yes |
| `tap:e25` | Tap Call Mira, Incomplete (other, ref e25). | yes |
| `tap:e26` | Tap circle (button, ref e26). | yes |
| `tap:e28` | Tap Title (text-field, ref e28). | no |
| `tap:e36` | Tap Notes (text-field, ref e36). | no |
| `tap:e37` | Tap Vertical scroll bar, 1 page (slider, ref e37). | yes |
| `tap:e56` | Tap New Reminder (button, ref e56). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h15-reminders-complete-call-mira (heldout; group reminders-complete)

Goal: Complete Call Mira and verify that it appears as Completed.

Acceptable action IDs: `tap:e11`

Goal reached: **false**

Assertions: `reminder_completed`=false

Evidence: raw/h15-reminders-complete-call-mira.compact.json, raw/h15-reminders-complete-call-mira.full.json, raw/h15-reminders-complete-call-mira.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e10` | Tap Back (button, ref e10). | yes |
| `tap:e11` | Tap More (button, ref e11). | yes |
| `swipe:e20:up` | Swipe up within RemindersList.ID.RemindersTable (other, ref e20). | yes |
| `swipe:e20:down` | Swipe down within RemindersList.ID.RemindersTable (other, ref e20). | yes |
| `swipe:e20:left` | Swipe left within RemindersList.ID.RemindersTable (other, ref e20). | yes |
| `swipe:e20:right` | Swipe right within RemindersList.ID.RemindersTable (other, ref e20). | yes |
| `tap:e45` | Tap New Reminder (button, ref e45). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h16-reminders-complete-menu (heldout; group reminders-complete)

Goal: Complete Call Mira and verify that it appears as Completed.

Acceptable action IDs: `tap:e67`

Goal reached: **false**

Assertions: `reminder_completed`=false

Evidence: raw/h16-reminders-complete-menu.compact.json, raw/h16-reminders-complete-menu.full.json, raw/h16-reminders-complete-menu.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e11` | Tap Back (button, ref e11). | yes |
| `tap:e12` | Tap More (button, ref e12). | yes |
| `swipe:e21:up` | Swipe up within RemindersList.ID.RemindersTable (other, ref e21). | yes |
| `swipe:e21:down` | Swipe down within RemindersList.ID.RemindersTable (other, ref e21). | yes |
| `swipe:e21:left` | Swipe left within RemindersList.ID.RemindersTable (other, ref e21). | yes |
| `swipe:e21:right` | Swipe right within RemindersList.ID.RemindersTable (other, ref e21). | yes |
| `tap:e46` | Tap New Reminder (button, ref e46). | yes |
| `tap:e57` | Tap Show List Info (button, ref e57). | yes |
| `tap:e60` | Tap Select Reminders (button, ref e60). | yes |
| `tap:e63` | Tap Sort By, Manual (button, ref e63). | yes |
| `tap:e67` | Tap Show Completed (button, ref e67). | yes |
| `tap:e70` | Tap Print (button, ref e70). | yes |
| `tap:e73` | Tap Delete List (button, ref e73). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h17-reminders-complete-confirmed (heldout; group reminders-complete)

Goal: Complete Call Mira and verify that it appears as Completed.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `reminder_completed`=true

Evidence: raw/h17-reminders-complete-confirmed.compact.json, raw/h17-reminders-complete-confirmed.full.json, raw/h17-reminders-complete-confirmed.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e10` | Tap Back (button, ref e10). | yes |
| `tap:e11` | Tap More (button, ref e11). | yes |
| `swipe:e20:up` | Swipe up within RemindersList.ID.RemindersTable (other, ref e20). | yes |
| `swipe:e20:down` | Swipe down within RemindersList.ID.RemindersTable (other, ref e20). | yes |
| `swipe:e20:left` | Swipe left within RemindersList.ID.RemindersTable (other, ref e20). | yes |
| `swipe:e20:right` | Swipe right within RemindersList.ID.RemindersTable (other, ref e20). | yes |
| `tap:e28` | Tap Clear (button, ref e28). | yes |
| `tap:e31` | Tap Call Mira, Completed (other, ref e31). | yes |
| `tap:e32` | Tap circle.inset.filled (button, ref e32). | yes |
| `tap:e33` | Tap Title (text-field, ref e33). | no |
| `tap:e60` | Tap New Reminder (button, ref e60). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h18-reminders-missing-lists (heldout; group reminders-missing)

Goal: Open the pre-existing reminder titled Follow up with Nia without creating a new reminder.

Acceptable action IDs: `tap:e10`

Goal reached: **false**

Assertions: `target_open`=false

Evidence: raw/h18-reminders-missing-lists.compact.json, raw/h18-reminders-missing-lists.full.json, raw/h18-reminders-missing-lists.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `tap:e10` | Tap Search (button, ref e10). | yes |
| `tap:e11` | Tap Add List (button, ref e11). | yes |
| `tap:e12` | Tap Edit (button, ref e12). | yes |
| `swipe:e16:up` | Swipe up within AccountsList.ID.AccountsListTable (other, ref e16). | yes |
| `swipe:e16:down` | Swipe down within AccountsList.ID.AccountsListTable (other, ref e16). | yes |
| `swipe:e16:left` | Swipe left within AccountsList.ID.AccountsListTable (other, ref e16). | yes |
| `swipe:e16:right` | Swipe right within AccountsList.ID.AccountsListTable (other, ref e16). | yes |
| `tap:e22` | Tap Today, 0 reminders, September 24 (button, ref e22). | yes |
| `tap:e23` | Tap Scheduled, 0 reminders (button, ref e23). | yes |
| `tap:e24` | Tap All, 0 reminders (button, ref e24). | yes |
| `tap:e25` | Tap Completed (button, ref e25). | yes |
| `tap:e34` | Tap Go to Settings (button, ref e34). | yes |
| `tap:e35` | Tap Close (button, ref e35). | yes |
| `tap:e39` | Tap Reminders, 0 reminders (button, ref e39). | yes |
| `tap:e40` | Tap Blue (other, ref e40). | yes |
| `tap:e41` | Tap ListBadgeDefault (image, ref e41). | yes |
| `tap:e42` | Tap Reminders (text, ref e42). | yes |
| `tap:e43` | Tap 0 (text, ref e43). | yes |
| `tap:e62` | Tap New Reminder (button, ref e62). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h19-reminders-missing-search (heldout; group reminders-missing)

Goal: Open the pre-existing reminder titled Follow up with Nia without creating a new reminder.

Acceptable action IDs: `type:e66:query`

Goal reached: **false**

Assertions: `target_open`=false

Evidence: raw/h19-reminders-missing-search.compact.json, raw/h19-reminders-missing-search.full.json, raw/h19-reminders-missing-search.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `swipe:e12:up` | Swipe up within AccountsList.ID.AccountsListTable (other, ref e12). | yes |
| `swipe:e12:down` | Swipe down within AccountsList.ID.AccountsListTable (other, ref e12). | yes |
| `swipe:e12:left` | Swipe left within AccountsList.ID.AccountsListTable (other, ref e12). | yes |
| `swipe:e12:right` | Swipe right within AccountsList.ID.AccountsListTable (other, ref e12). | yes |
| `tap:e18` | Tap Today, 0 reminders, September 24 (button, ref e18). | yes |
| `tap:e19` | Tap Scheduled, 0 reminders (button, ref e19). | yes |
| `tap:e20` | Tap All, 0 reminders (button, ref e20). | yes |
| `tap:e21` | Tap Completed (button, ref e21). | yes |
| `tap:e30` | Tap Go to Settings (button, ref e30). | yes |
| `tap:e31` | Tap Close (button, ref e31). | yes |
| `tap:e35` | Tap Reminders, 0 reminders (button, ref e35). | yes |
| `tap:e36` | Tap Blue (other, ref e36). | yes |
| `tap:e37` | Tap ListBadgeDefault (image, ref e37). | yes |
| `tap:e38` | Tap Reminders (text, ref e38). | yes |
| `tap:e39` | Tap 0 (text, ref e39). | yes |
| `tap:e58` | Tap New Reminder (button, ref e58). | yes |
| `tap:e66` | Tap text-field (text-field, ref e66). | no |
| `type:e66:query` | Replace all text in text-field with the supplied scenario value query (text-field, ref e66). | yes |
| `tap:e67` | Tap Dictate (button, ref e67). | yes |
| `tap:e69` | Tap Dictate (button, ref e69). | yes |
| `tap:e71` | Tap Close (button, ref e71). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |

## h20-reminders-missing-no-results (heldout; group reminders-missing)

Goal: Open the pre-existing reminder titled Follow up with Nia without creating a new reminder.

Acceptable action IDs: `stop-blocked`

Goal reached: **false**

Assertions: `target_open`=false

Evidence: raw/h20-reminders-missing-no-results.compact.json, raw/h20-reminders-missing-no-results.full.json, raw/h20-reminders-missing-no-results.jpg

| Action ID | Full-snapshot description | In compact capture |
| --- | --- | --- |
| `swipe:e12:up` | Swipe up within AccountsList.ID.AccountsListTable (other, ref e12). | yes |
| `swipe:e12:down` | Swipe down within AccountsList.ID.AccountsListTable (other, ref e12). | yes |
| `swipe:e12:left` | Swipe left within AccountsList.ID.AccountsListTable (other, ref e12). | yes |
| `swipe:e12:right` | Swipe right within AccountsList.ID.AccountsListTable (other, ref e12). | yes |
| `tap:e18` | Tap Today, 0 reminders, September 24 (button, ref e18). | yes |
| `tap:e19` | Tap Scheduled, 0 reminders (button, ref e19). | yes |
| `tap:e20` | Tap All, 0 reminders (button, ref e20). | yes |
| `tap:e21` | Tap Completed (button, ref e21). | yes |
| `tap:e30` | Tap Go to Settings (button, ref e30). | yes |
| `tap:e31` | Tap Close (button, ref e31). | yes |
| `tap:e35` | Tap Reminders, 0 reminders (button, ref e35). | yes |
| `tap:e36` | Tap Blue (other, ref e36). | yes |
| `tap:e37` | Tap ListBadgeDefault (image, ref e37). | yes |
| `tap:e38` | Tap Reminders (text, ref e38). | yes |
| `tap:e39` | Tap 0 (text, ref e39). | yes |
| `tap:e58` | Tap New Reminder (button, ref e58). | yes |
| `swipe:e62:up` | Swipe up within Activate to dismiss (other, ref e62). | yes |
| `swipe:e62:down` | Swipe down within Activate to dismiss (other, ref e62). | yes |
| `swipe:e62:left` | Swipe left within Activate to dismiss (other, ref e62). | yes |
| `swipe:e62:right` | Swipe right within Activate to dismiss (other, ref e62). | yes |
| `swipe:e66:up` | Swipe up within Search results (other, ref e66). | yes |
| `swipe:e66:down` | Swipe down within Search results (other, ref e66). | yes |
| `swipe:e66:left` | Swipe left within Search results (other, ref e66). | yes |
| `swipe:e66:right` | Swipe right within Search results (other, ref e66). | yes |
| `tap:e74` | Tap Show (button, ref e74). | yes |
| `tap:e88` | Tap text-field (text-field, ref e88). | no |
| `type:e88:query` | Replace all text in text-field with the supplied scenario value query (text-field, ref e88). | yes |
| `tap:e90` | Tap Clear text (button, ref e90). | yes |
| `tap:e92` | Tap Close (button, ref e92). | yes |
| `wait` | Wait for the current screen to change. | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes |
| `none` | No listed action fits the current observation. | yes |
