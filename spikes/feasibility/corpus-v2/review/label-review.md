# Feasibility corpus label review

Corpus SHA-256: `683121f8cb2da5b85184a92176a32ef36f61fb33cb0ca4c308c8c9cfc5b16bc2`
Manifest SHA-256: `34def455331e6cf2283fd83dc1439e4512ffc0e28423fd55d5e20cb9e14caa98`

Review every acceptable action, completion label, assertion label, case group and partition. The approval file must bind both hashes after the manifest is frozen.

**Review context:** This v2 corpus retains 10 tuning screens for development and uses 20 fresh held-out screens. The original Settings slots were replaced before any v2 Jev request with Sentry mock Weather screens because their controls were unavailable on the dedicated simulator. No capture justifies a `wait` label. The frozen manifest sets `maxCandidates: 96` for the crowded real Contacts form; all 124 offline observation and Jev request builds pass, with at most 84 action options. Read [the concise case page](case-review.md) for screenshots, supplied values, histories, and assertion claims, and [the corpus notes](../README.md) for synthetic setup and observation limits.

## t01-settings-onofflabels-root (tuning; group settings-onofflabels)

Goal: Turn on On/Off Labels in Accessibility.

Acceptable action IDs: `tap:e54`

Goal reached: **false**

Assertions: `labels_enabled`=false

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

## t02-settings-onofflabels-accessibility (tuning; group settings-onofflabels)

Goal: Turn on On/Off Labels in Accessibility.

Positional alternate goal (same capture, tuning only): Open the second row in the Vision section of Accessibility.
Alternate acceptable action IDs: `tap:e44`, `tap:e166`, `tap:e47`, `tap:e169`

Acceptable action IDs: `tap:e44`, `tap:e166`, `tap:e47`, `tap:e169`

Goal reached: **false**

Assertions: `labels_enabled`=false

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

## t03-settings-onofflabels-off (tuning; group settings-onofflabels)

Goal: Turn on On/Off Labels in Accessibility.

Acceptable action IDs: `tap:e35`, `tap:e37`

Goal reached: **false**

Assertions: `labels_enabled`=false

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

## t04-settings-onofflabels-on (tuning; group settings-onofflabels)

Goal: Turn on On/Off Labels in Accessibility.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `labels_enabled`=true

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

## t05-contacts-create-list (tuning; group contacts-create)

Goal: Create a saved contact named Mira Vale.

Acceptable action IDs: `tap:e89`

Goal reached: **false**

Assertions: `contact_saved`=false

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
| `type:e81:firstName` | Replace all text in text-field with the supplied scenario value firstName (text-field, ref e81). | yes | yes |
| `type:e81:lastName` | Replace all text in text-field with the supplied scenario value lastName (text-field, ref e81). | yes | yes |
| `tap:e82` | Tap Dictate (button, ref e82). | yes | yes |
| `tap:e89` | Tap Add (button, ref e89). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |
| `tap:e84` | Tap Dictate (button, ref e84). | no | yes |

## t06-contacts-create-blank (tuning; group contacts-create)

Goal: Create a saved contact named Mira Vale.

Acceptable action IDs: `type:e116:firstName`, `type:e119:lastName`

Goal reached: **false**

Assertions: `contact_saved`=false

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
| `type:e82:lastName` | Replace all text in text-field with the supplied scenario value lastName (text-field, ref e82). | yes | yes |
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
| `type:e116:lastName` | Replace all text in First name with the supplied scenario value lastName (text-field, ref e116). | yes | yes |
| `type:e119:firstName` | Replace all text in Last name with the supplied scenario value firstName (text-field, ref e119). | yes | yes |
| `type:e119:lastName` | Replace all text in Last name with the supplied scenario value lastName (text-field, ref e119). | yes | yes |
| `type:e122:firstName` | Replace all text in Company with the supplied scenario value firstName (text-field, ref e122). | yes | yes |
| `type:e122:lastName` | Replace all text in Company with the supplied scenario value lastName (text-field, ref e122). | yes | yes |
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

## t07-contacts-create-filled (tuning; group contacts-create)

Goal: Create a saved contact named Mira Vale.

Acceptable action IDs: `tap:e103`

Goal reached: **false**

Assertions: `contact_saved`=false

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
| `type:e82:firstName` | Replace all text in text-field with the supplied scenario value firstName (text-field, ref e82). | yes | yes |
| `type:e82:lastName` | Replace all text in text-field with the supplied scenario value lastName (text-field, ref e82). | yes | yes |
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
| `type:e116:firstName` | Replace all text in First name with the supplied scenario value firstName (text-field, ref e116). | yes | yes |
| `type:e116:lastName` | Replace all text in First name with the supplied scenario value lastName (text-field, ref e116). | yes | yes |
| `type:e119:firstName` | Replace all text in Last name with the supplied scenario value firstName (text-field, ref e119). | yes | yes |
| `type:e119:lastName` | Replace all text in Last name with the supplied scenario value lastName (text-field, ref e119). | yes | yes |
| `tap:e120` | Tap Clear text (button, ref e120). | yes | yes |
| `type:e123:firstName` | Replace all text in Company with the supplied scenario value firstName (text-field, ref e123). | yes | yes |
| `type:e123:lastName` | Replace all text in Company with the supplied scenario value lastName (text-field, ref e123). | yes | yes |
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

## t08-reminders-create-onboarding (tuning; group reminders-create)

Goal: Create a reminder titled Call Mira in the local Reminders list.

Acceptable action IDs: `tap:e78`

Goal reached: **false**

Assertions: `reminder_saved`=false

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

## t09-reminders-create-icloud-prompt (tuning; group reminders-create)

Goal: Create a reminder titled Call Mira in the local Reminders list.

Acceptable action IDs: `tap:e71`

Goal reached: **false**

Assertions: `reminder_saved`=false

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

## t10-reminders-create-empty-list (tuning; group reminders-create)

Goal: Create a reminder titled Call Mira in the local Reminders list.

Acceptable action IDs: `tap:e44`

Goal reached: **false**

Assertions: `reminder_saved`=false

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

## v2-w01-celsius-main (heldout; group weather-temperature)

Goal: Set Weather temperature units to Fahrenheit and verify Fahrenheit is selected in Settings.

Acceptable action IDs: `tap:e89`

Goal reached: **false**

Assertions: `fahrenheit_selected`=false, `celsius_selected`=false

Evidence: raw/v2-w01-celsius-main.compact.json, raw/v2-w01-celsius-main.full.json, raw/v2-w01-celsius-main.jpg

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
| `tap:e85` | Tap San Francisco (button, ref e85). | yes | yes |
| `tap:e89` | Tap Settings (button, ref e89). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v2-w02-celsius-settings (heldout; group weather-temperature)

Goal: Set Weather temperature units to Fahrenheit and verify Fahrenheit is selected in Settings.

Acceptable action IDs: `tap:e105`

Goal reached: **false**

Assertions: `fahrenheit_selected`=false, `celsius_selected`=true

Evidence: raw/v2-w02-celsius-settings.compact.json, raw/v2-w02-celsius-settings.full.json, raw/v2-w02-celsius-settings.jpg

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

## v2-w03-fahrenheit-selected (heldout; group weather-temperature)

Goal: Set Weather temperature units to Fahrenheit and verify Fahrenheit is selected in Settings.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `fahrenheit_selected`=true, `celsius_selected`=false

Evidence: raw/v2-w03-fahrenheit-selected.compact.json, raw/v2-w03-fahrenheit-selected.full.json, raw/v2-w03-fahrenheit-selected.jpg

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

## v2-w04-fahrenheit-main (heldout; group weather-wind-pressure)

Goal: Set Weather wind speed to km/h and pressure to inHg, then verify both selections in Settings.

Acceptable action IDs: `tap:e89`

Goal reached: **false**

Assertions: `wind_kmh_selected`=false, `pressure_inhg_selected`=false, `pressure_mb_selected`=false

Evidence: raw/v2-w04-fahrenheit-main.compact.json, raw/v2-w04-fahrenheit-main.full.json, raw/v2-w04-fahrenheit-main.jpg

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
| `tap:e85` | Tap San Francisco (button, ref e85). | yes | yes |
| `tap:e89` | Tap Settings (button, ref e89). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v2-w05-wind-pressure-defaults (heldout; group weather-wind-pressure)

Goal: Set Weather wind speed to km/h and pressure to inHg, then verify both selections in Settings.

Acceptable action IDs: `tap:e109`, `tap:e113`

Goal reached: **false**

Assertions: `wind_kmh_selected`=false, `pressure_inhg_selected`=false, `pressure_mb_selected`=true

Evidence: raw/v2-w05-wind-pressure-defaults.compact.json, raw/v2-w05-wind-pressure-defaults.full.json, raw/v2-w05-wind-pressure-defaults.jpg

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

## v2-w06-wind-only-changed (heldout; group weather-wind-pressure)

Goal: Set Weather wind speed to km/h and pressure to inHg, then verify both selections in Settings.

Acceptable action IDs: `tap:e113`

Goal reached: **false**

Assertions: `wind_kmh_selected`=true, `pressure_inhg_selected`=false, `pressure_mb_selected`=true

Evidence: raw/v2-w06-wind-only-changed.compact.json, raw/v2-w06-wind-only-changed.full.json, raw/v2-w06-wind-only-changed.jpg

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

## v2-w07-wind-pressure-selected (heldout; group weather-wind-pressure)

Goal: Set Weather wind speed to km/h and pressure to inHg, then verify both selections in Settings.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `wind_kmh_selected`=true, `pressure_inhg_selected`=true, `pressure_mb_selected`=false

Evidence: raw/v2-w07-wind-pressure-selected.compact.json, raw/v2-w07-wind-pressure-selected.full.json, raw/v2-w07-wind-pressure-selected.jpg

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

## v2-c01-two-noah-rows (heldout; group contacts-update-email)

Goal: Find the Noah Reed contact with noah.old@example.test, replace that address with noah.new@example.test, and verify the saved card.

Acceptable action IDs: `tap:e69`, `tap:e74`

Goal reached: **false**

Assertions: `new_email_saved`=false, `old_email_visible`=false

Evidence: raw/v2-c01-two-noah-rows.compact.json, raw/v2-c01-two-noah-rows.full.json, raw/v2-c01-two-noah-rows.jpg

Full-only collapsed tap refs: `e108` ← `e110`

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap Back (button, ref e10). | yes | yes |
| `swipe:e17:up` | Swipe up within ContactsListView: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e17). | yes | yes |
| `swipe:e17:down` | Swipe down within ContactsListView: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e17). | yes | yes |
| `swipe:e17:left` | Swipe left within ContactsListView: move the finger from right to left; content moves left to reveal items farther right (other, ref e17). | yes | yes |
| `swipe:e17:right` | Swipe right within ContactsListView: move the finger from left to right; content moves right to reveal items farther left (other, ref e17). | yes | yes |
| `tap:e32` | Tap View Duplicates (button, ref e32). | yes | yes |
| `tap:e34` | Tap Close (button, ref e34). | yes | yes |
| `tap:e40` | Tap Contact photo for John Appleseed (button, ref e40). | yes | yes |
| `tap:e48` | Tap Contact photo for Kate Bell (button, ref e48). | yes | yes |
| `tap:e56` | Tap Contact photo for Anna Haro (button, ref e56). | yes | yes |
| `tap:e61` | Tap Contact photo for Daniel Higgins Jr. (button, ref e61). | yes | yes |
| `tap:e69` | Tap Contact photo for Noah Reed (button, ref e69). | yes | yes |
| `tap:e74` | Tap Contact photo for Noah Reed (button, ref e74). | yes | yes |
| `tap:e82` | Tap Contact photo for Mira Stone (button, ref e82). | yes | yes |
| `type:e107:email` | Replace all text in text-field with the supplied scenario value email (text-field, ref e107). | yes | yes |
| `tap:e108` | Tap Dictate (button, ref e108). | yes | yes |
| `tap:e115` | Tap Add (button, ref e115). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |
| `tap:e110` | Tap Dictate (button, ref e110). | no | yes |

## v2-c02-northstar-card-old-email (heldout; group contacts-update-email)

Goal: Find the Noah Reed contact with noah.old@example.test, replace that address with noah.new@example.test, and verify the saved card.

Acceptable action IDs: `tap:e11`

Goal reached: **false**

Assertions: `new_email_saved`=false, `old_email_visible`=true

Evidence: raw/v2-c02-northstar-card-old-email.compact.json, raw/v2-c02-northstar-card-old-email.full.json, raw/v2-c02-northstar-card-old-email.jpg

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
| `tap:e58` | Tap Mail (button, ref e58). | yes | yes |
| `tap:e59` | Tap button (button, ref e59). | yes | yes |
| `tap:e67` | Tap Contact Photo & Poster (button, ref e67). | yes | yes |
| `tap:e77` | Tap home, noah.old@example.test (button, ref e77). | yes | yes |
| `type:e87:email` | Replace all text in ContactCardDetailsView with the supplied scenario value email (text-field, ref e87). | yes | yes |
| `tap:e96` | Tap Share Contact (button, ref e96). | yes | yes |
| `tap:e104` | Tap Add to Favorites (button, ref e104). | yes | yes |
| `tap:e105` | Tap button (button, ref e105). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v2-c03-email-offscreen (heldout; group contacts-update-email)

Goal: Find the Noah Reed contact with noah.old@example.test, replace that address with noah.new@example.test, and verify the saved card.

Acceptable action IDs: `swipe:e25:up`

Goal reached: **false**

Assertions: `new_email_saved`=false, `old_email_visible`=false

Evidence: raw/v2-c03-email-offscreen.compact.json, raw/v2-c03-email-offscreen.full.json, raw/v2-c03-email-offscreen.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap close (button, ref e10). | yes | yes |
| `tap:e23` | Tap Add photo (button, ref e23). | yes | yes |
| `swipe:e25:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e25). | yes | yes |
| `swipe:e25:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e25). | yes | yes |
| `swipe:e25:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e25). | yes | yes |
| `swipe:e25:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e25). | yes | yes |
| `type:e27:email` | Replace all text in First name with the supplied scenario value email (text-field, ref e27). | yes | yes |
| `type:e30:email` | Replace all text in Last name with the supplied scenario value email (text-field, ref e30). | yes | yes |
| `type:e33:email` | Replace all text in Company with the supplied scenario value email (text-field, ref e33). | yes | yes |
| `tap:e35` | Tap mobile (other, ref e35). | yes | yes |
| `tap:e36` | Tap Remove mobile (button, ref e36). | yes | yes |
| `tap:e37` | Tap remove (image, ref e37). | yes | yes |
| `tap:e38` | Tap mobile (button, ref e38). | yes | yes |
| `tap:e39` | Tap mobile (text, ref e39). | yes | yes |
| `tap:e42` | Tap Forward (image, ref e42). | yes | yes |
| `type:e43:email` | Replace all text in mobile with the supplied scenario value email (text-field, ref e43). | yes | yes |
| `tap:e44` | Tap home (other, ref e44). | yes | yes |
| `tap:e45` | Tap Remove home (button, ref e45). | yes | yes |
| `tap:e46` | Tap remove (image, ref e46). | yes | yes |
| `tap:e47` | Tap home (button, ref e47). | yes | yes |
| `tap:e48` | Tap home (text, ref e48). | yes | yes |
| `tap:e51` | Tap Forward (image, ref e51). | yes | yes |
| `type:e52:email` | Replace all text in home with the supplied scenario value email (text-field, ref e52). | yes | yes |
| `tap:e53` | Tap work (other, ref e53). | yes | yes |
| `tap:e54` | Tap Remove work (button, ref e54). | yes | yes |
| `tap:e55` | Tap remove (image, ref e55). | yes | yes |
| `tap:e56` | Tap work (button, ref e56). | yes | yes |
| `tap:e57` | Tap work (text, ref e57). | yes | yes |
| `tap:e60` | Tap Forward (image, ref e60). | yes | yes |
| `type:e61:email` | Replace all text in work with the supplied scenario value email (text-field, ref e61). | yes | yes |
| `tap:e62` | Tap school (other, ref e62). | yes | yes |
| `tap:e63` | Tap Remove school (button, ref e63). | yes | yes |
| `tap:e64` | Tap remove (image, ref e64). | yes | yes |
| `tap:e65` | Tap school (button, ref e65). | yes | yes |
| `tap:e66` | Tap school (text, ref e66). | yes | yes |
| `tap:e69` | Tap Forward (image, ref e69). | yes | yes |
| `type:e70:email` | Replace all text in school with the supplied scenario value email (text-field, ref e70). | yes | yes |
| `tap:e71` | Tap iPhone (other, ref e71). | yes | yes |
| `tap:e72` | Tap Remove iPhone (button, ref e72). | yes | yes |
| `tap:e73` | Tap remove (image, ref e73). | yes | yes |
| `tap:e74` | Tap iPhone (button, ref e74). | yes | yes |
| `tap:e75` | Tap iPhone (text, ref e75). | yes | yes |
| `tap:e78` | Tap Forward (image, ref e78). | yes | yes |
| `type:e79:email` | Replace all text in iPhone with the supplied scenario value email (text-field, ref e79). | yes | yes |
| `tap:e80` | Tap Apple Watch (other, ref e80). | yes | yes |
| `tap:e81` | Tap Remove Apple Watch (button, ref e81). | yes | yes |
| `tap:e82` | Tap remove (image, ref e82). | yes | yes |
| `tap:e83` | Tap Apple Watch (button, ref e83). | yes | yes |
| `tap:e84` | Tap Apple Watch (text, ref e84). | yes | yes |
| `tap:e87` | Tap Forward (image, ref e87). | yes | yes |
| `type:e88:email` | Replace all text in Apple Watch with the supplied scenario value email (text-field, ref e88). | yes | yes |
| `tap:e89` | Tap add phone (button, ref e89). | yes | yes |
| `tap:e90` | Tap Insert add phone (button, ref e90). | yes | yes |
| `tap:e120` | Tap add phone (button, ref e120). | yes | yes |
| `tap:e121` | Tap Insert add phone (button, ref e121). | yes | yes |
| `tap:e125` | Tap Add photo (button, ref e125). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v2-c04-old-email-visible (heldout; group contacts-update-email)

Goal: Find the Noah Reed contact with noah.old@example.test, replace that address with noah.new@example.test, and verify the saved card.

Acceptable action IDs: `type:e96:email`

Goal reached: **false**

Assertions: `new_email_saved`=false, `old_email_visible`=true

Evidence: raw/v2-c04-old-email-visible.compact.json, raw/v2-c04-old-email-visible.full.json, raw/v2-c04-old-email-visible.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap close (button, ref e10). | yes | no |
| `swipe:e25:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e25). | yes | yes |
| `swipe:e25:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e25). | yes | yes |
| `swipe:e25:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e25). | yes | yes |
| `swipe:e25:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e25). | yes | yes |
| `tap:e29` | Tap mobile (other, ref e29). | yes | yes |
| `tap:e30` | Tap Remove mobile (button, ref e30). | yes | yes |
| `tap:e31` | Tap remove (image, ref e31). | yes | no |
| `tap:e32` | Tap mobile (button, ref e32). | yes | yes |
| `tap:e33` | Tap mobile (text, ref e33). | yes | yes |
| `tap:e36` | Tap Forward (image, ref e36). | yes | yes |
| `type:e37:email` | Replace all text in mobile with the supplied scenario value email (text-field, ref e37). | yes | yes |
| `tap:e38` | Tap home (other, ref e38). | yes | yes |
| `tap:e39` | Tap Remove home (button, ref e39). | yes | yes |
| `tap:e40` | Tap remove (image, ref e40). | yes | no |
| `tap:e41` | Tap home (button, ref e41). | yes | yes |
| `tap:e42` | Tap home (text, ref e42). | yes | yes |
| `tap:e45` | Tap Forward (image, ref e45). | yes | yes |
| `type:e46:email` | Replace all text in home with the supplied scenario value email (text-field, ref e46). | yes | yes |
| `tap:e47` | Tap work (other, ref e47). | yes | yes |
| `tap:e48` | Tap Remove work (button, ref e48). | yes | yes |
| `tap:e49` | Tap remove (image, ref e49). | yes | no |
| `tap:e50` | Tap work (button, ref e50). | yes | yes |
| `tap:e51` | Tap work (text, ref e51). | yes | yes |
| `tap:e54` | Tap Forward (image, ref e54). | yes | yes |
| `type:e55:email` | Replace all text in work with the supplied scenario value email (text-field, ref e55). | yes | yes |
| `tap:e56` | Tap school (other, ref e56). | yes | yes |
| `tap:e57` | Tap Remove school (button, ref e57). | yes | yes |
| `tap:e58` | Tap remove (image, ref e58). | yes | no |
| `tap:e59` | Tap school (button, ref e59). | yes | yes |
| `tap:e60` | Tap school (text, ref e60). | yes | yes |
| `tap:e63` | Tap Forward (image, ref e63). | yes | yes |
| `type:e64:email` | Replace all text in school with the supplied scenario value email (text-field, ref e64). | yes | yes |
| `tap:e65` | Tap iPhone (other, ref e65). | yes | yes |
| `tap:e66` | Tap Remove iPhone (button, ref e66). | yes | yes |
| `tap:e67` | Tap remove (image, ref e67). | yes | no |
| `tap:e68` | Tap iPhone (button, ref e68). | yes | yes |
| `tap:e69` | Tap iPhone (text, ref e69). | yes | yes |
| `tap:e72` | Tap Forward (image, ref e72). | yes | yes |
| `type:e73:email` | Replace all text in iPhone with the supplied scenario value email (text-field, ref e73). | yes | yes |
| `tap:e74` | Tap Apple Watch (other, ref e74). | yes | yes |
| `tap:e75` | Tap Remove Apple Watch (button, ref e75). | yes | yes |
| `tap:e76` | Tap remove (image, ref e76). | yes | no |
| `tap:e77` | Tap Apple Watch (button, ref e77). | yes | yes |
| `tap:e78` | Tap Apple Watch (text, ref e78). | yes | yes |
| `tap:e81` | Tap Forward (image, ref e81). | yes | yes |
| `type:e82:email` | Replace all text in Apple Watch with the supplied scenario value email (text-field, ref e82). | yes | yes |
| `tap:e83` | Tap add phone (button, ref e83). | yes | yes |
| `tap:e84` | Tap Insert add phone (button, ref e84). | yes | yes |
| `tap:e88` | Tap home (other, ref e88). | yes | yes |
| `tap:e89` | Tap Remove home (button, ref e89). | yes | yes |
| `tap:e90` | Tap remove (image, ref e90). | yes | no |
| `tap:e91` | Tap home (button, ref e91). | yes | yes |
| `tap:e92` | Tap home (text, ref e92). | yes | yes |
| `tap:e95` | Tap Forward (image, ref e95). | yes | yes |
| `type:e96:email` | Replace all text in home with the supplied scenario value email (text-field, ref e96). | yes | yes |
| `tap:e97` | Tap add email (button, ref e97). | yes | yes |
| `tap:e98` | Tap Insert add email (button, ref e98). | yes | yes |
| `tap:e102` | Tap add pronouns (button, ref e102). | yes | yes |
| `tap:e103` | Tap Insert add pronouns (button, ref e103). | yes | yes |
| `tap:e117` | Tap add url (button, ref e117). | yes | yes |
| `tap:e118` | Tap Insert add url (button, ref e118). | yes | yes |
| `tap:e122` | Tap add address (button, ref e122). | yes | yes |
| `tap:e123` | Tap Insert add address (button, ref e123). | yes | yes |
| `tap:e127` | Tap add birthday (button, ref e127). | yes | yes |
| `tap:e128` | Tap Insert add birthday (button, ref e128). | yes | yes |
| `tap:e159` | Tap add birthday (button, ref e159). | yes | yes |
| `tap:e160` | Tap Insert add birthday (button, ref e160). | yes | yes |
| `tap:e164` | Tap add address (button, ref e164). | yes | yes |
| `tap:e165` | Tap Insert add address (button, ref e165). | yes | yes |
| `tap:e169` | Tap add url (button, ref e169). | yes | yes |
| `tap:e170` | Tap Insert add url (button, ref e170). | yes | yes |
| `tap:e174` | Tap add pronouns (button, ref e174). | yes | yes |
| `tap:e175` | Tap Insert add pronouns (button, ref e175). | yes | yes |
| `tap:e179` | Tap add email (button, ref e179). | yes | yes |
| `tap:e180` | Tap Insert add email (button, ref e180). | yes | yes |
| `tap:e184` | Tap add phone (button, ref e184). | yes | no |
| `tap:e185` | Tap Insert add phone (button, ref e185). | yes | no |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v2-c05-new-email-unsaved (heldout; group contacts-update-email)

Goal: Find the Noah Reed contact with noah.old@example.test, replace that address with noah.new@example.test, and verify the saved card.

Acceptable action IDs: `tap:e11`

Goal reached: **false**

Assertions: `new_email_saved`=false, `old_email_visible`=false

Evidence: raw/v2-c05-new-email-unsaved.compact.json, raw/v2-c05-new-email-unsaved.full.json, raw/v2-c05-new-email-unsaved.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap close (button, ref e10). | yes | no |
| `tap:e11` | Tap Done (button, ref e11). | yes | yes |
| `swipe:e25:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e25). | yes | yes |
| `swipe:e25:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e25). | yes | yes |
| `swipe:e25:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e25). | yes | yes |
| `swipe:e25:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e25). | yes | yes |
| `tap:e29` | Tap mobile (other, ref e29). | yes | yes |
| `tap:e30` | Tap Remove mobile (button, ref e30). | yes | yes |
| `tap:e31` | Tap remove (image, ref e31). | yes | no |
| `tap:e32` | Tap mobile (button, ref e32). | yes | yes |
| `tap:e33` | Tap mobile (text, ref e33). | yes | yes |
| `tap:e36` | Tap Forward (image, ref e36). | yes | yes |
| `type:e37:email` | Replace all text in mobile with the supplied scenario value email (text-field, ref e37). | yes | yes |
| `tap:e38` | Tap home (other, ref e38). | yes | yes |
| `tap:e39` | Tap Remove home (button, ref e39). | yes | yes |
| `tap:e40` | Tap remove (image, ref e40). | yes | no |
| `tap:e41` | Tap home (button, ref e41). | yes | yes |
| `tap:e42` | Tap home (text, ref e42). | yes | yes |
| `tap:e45` | Tap Forward (image, ref e45). | yes | yes |
| `type:e46:email` | Replace all text in home with the supplied scenario value email (text-field, ref e46). | yes | yes |
| `tap:e47` | Tap work (other, ref e47). | yes | yes |
| `tap:e48` | Tap Remove work (button, ref e48). | yes | yes |
| `tap:e49` | Tap remove (image, ref e49). | yes | no |
| `tap:e50` | Tap work (button, ref e50). | yes | yes |
| `tap:e51` | Tap work (text, ref e51). | yes | yes |
| `tap:e54` | Tap Forward (image, ref e54). | yes | yes |
| `type:e55:email` | Replace all text in work with the supplied scenario value email (text-field, ref e55). | yes | yes |
| `tap:e56` | Tap school (other, ref e56). | yes | yes |
| `tap:e57` | Tap Remove school (button, ref e57). | yes | yes |
| `tap:e58` | Tap remove (image, ref e58). | yes | no |
| `tap:e59` | Tap school (button, ref e59). | yes | yes |
| `tap:e60` | Tap school (text, ref e60). | yes | yes |
| `tap:e63` | Tap Forward (image, ref e63). | yes | yes |
| `type:e64:email` | Replace all text in school with the supplied scenario value email (text-field, ref e64). | yes | yes |
| `tap:e65` | Tap iPhone (other, ref e65). | yes | yes |
| `tap:e66` | Tap Remove iPhone (button, ref e66). | yes | yes |
| `tap:e67` | Tap remove (image, ref e67). | yes | no |
| `tap:e68` | Tap iPhone (button, ref e68). | yes | yes |
| `tap:e69` | Tap iPhone (text, ref e69). | yes | yes |
| `tap:e72` | Tap Forward (image, ref e72). | yes | yes |
| `type:e73:email` | Replace all text in iPhone with the supplied scenario value email (text-field, ref e73). | yes | yes |
| `tap:e74` | Tap Apple Watch (other, ref e74). | yes | yes |
| `tap:e75` | Tap Remove Apple Watch (button, ref e75). | yes | yes |
| `tap:e76` | Tap remove (image, ref e76). | yes | no |
| `tap:e77` | Tap Apple Watch (button, ref e77). | yes | yes |
| `tap:e78` | Tap Apple Watch (text, ref e78). | yes | yes |
| `tap:e81` | Tap Forward (image, ref e81). | yes | yes |
| `type:e82:email` | Replace all text in Apple Watch with the supplied scenario value email (text-field, ref e82). | yes | yes |
| `tap:e83` | Tap add phone (button, ref e83). | yes | yes |
| `tap:e84` | Tap Insert add phone (button, ref e84). | yes | yes |
| `tap:e88` | Tap home (other, ref e88). | yes | yes |
| `tap:e89` | Tap Remove home (button, ref e89). | yes | yes |
| `tap:e90` | Tap remove (image, ref e90). | yes | no |
| `tap:e91` | Tap home (button, ref e91). | yes | yes |
| `tap:e92` | Tap home (text, ref e92). | yes | yes |
| `tap:e95` | Tap Forward (image, ref e95). | yes | yes |
| `type:e96:email` | Replace all text in home with the supplied scenario value email (text-field, ref e96). | yes | yes |
| `tap:e97` | Tap Clear text (button, ref e97). | yes | yes |
| `tap:e98` | Tap add email (button, ref e98). | yes | yes |
| `tap:e99` | Tap Insert add email (button, ref e99). | yes | yes |
| `tap:e103` | Tap add pronouns (button, ref e103). | yes | yes |
| `tap:e104` | Tap Insert add pronouns (button, ref e104). | yes | yes |
| `tap:e118` | Tap add url (button, ref e118). | yes | yes |
| `tap:e119` | Tap Insert add url (button, ref e119). | yes | yes |
| `tap:e123` | Tap add address (button, ref e123). | yes | yes |
| `tap:e124` | Tap Insert add address (button, ref e124). | yes | yes |
| `tap:e128` | Tap add birthday (button, ref e128). | yes | yes |
| `tap:e129` | Tap Insert add birthday (button, ref e129). | yes | yes |
| `tap:e160` | Tap add birthday (button, ref e160). | yes | yes |
| `tap:e161` | Tap Insert add birthday (button, ref e161). | yes | yes |
| `tap:e165` | Tap add address (button, ref e165). | yes | yes |
| `tap:e166` | Tap Insert add address (button, ref e166). | yes | yes |
| `tap:e170` | Tap add url (button, ref e170). | yes | yes |
| `tap:e171` | Tap Insert add url (button, ref e171). | yes | yes |
| `tap:e175` | Tap add pronouns (button, ref e175). | yes | yes |
| `tap:e176` | Tap Insert add pronouns (button, ref e176). | yes | yes |
| `tap:e180` | Tap add email (button, ref e180). | yes | no |
| `tap:e181` | Tap Insert add email (button, ref e181). | yes | no |
| `tap:e185` | Tap add phone (button, ref e185). | yes | no |
| `tap:e186` | Tap Insert add phone (button, ref e186). | yes | no |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v2-c06-northstar-card-new-email (heldout; group contacts-update-email)

Goal: Find the Noah Reed contact with noah.old@example.test, replace that address with noah.new@example.test, and verify the saved card.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `new_email_saved`=true, `old_email_visible`=false

Evidence: raw/v2-c06-northstar-card-new-email.compact.json, raw/v2-c06-northstar-card-new-email.full.json, raw/v2-c06-northstar-card-new-email.jpg

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
| `tap:e79` | Tap mobile, (555) 010-1001 (button, ref e79). | yes | yes |
| `tap:e88` | Tap home, (555) 010-1002 (button, ref e88). | yes | yes |
| `tap:e98` | Tap work, (555) 010-1003 (button, ref e98). | yes | yes |
| `tap:e108` | Tap school, (555) 010-1004 (button, ref e108). | yes | yes |
| `tap:e118` | Tap iPhone, (555) 010-1005 (button, ref e118). | yes | yes |
| `tap:e128` | Tap Apple Watch, (555) 010-1006 (button, ref e128). | yes | yes |
| `tap:e138` | Tap home, noah.new@example.test (button, ref e138). | yes | yes |
| `type:e149:email` | Replace all text in ContactCardDetailsView with the supplied scenario value email (text-field, ref e149). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v2-c07-lena-search-ready (heldout; group contacts-missing)

Goal: Open an existing Lena Quill contact without creating a new contact.

Acceptable action IDs: `type:e111:query`

Goal reached: **false**

Assertions: `lena_open`=false

Evidence: raw/v2-c07-lena-search-ready.compact.json, raw/v2-c07-lena-search-ready.full.json, raw/v2-c07-lena-search-ready.jpg

Full-only collapsed tap refs: `e112` ← `e114`

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
| `tap:e66` | Tap Contact photo for Noah Reed (button, ref e66). | yes | yes |
| `tap:e71` | Tap Contact photo for Noah Reed (button, ref e71). | yes | yes |
| `tap:e79` | Tap Contact photo for Mira Stone (button, ref e79). | yes | yes |
| `tap:e87` | Tap Contact photo for David Taylor (button, ref e87). | yes | yes |
| `type:e111:query` | Replace all text in text-field with the supplied scenario value query (text-field, ref e111). | yes | yes |
| `tap:e112` | Tap Dictate (button, ref e112). | yes | yes |
| `tap:e119` | Tap close (button, ref e119). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |
| `tap:e114` | Tap Dictate (button, ref e114). | no | yes |

## v2-c08-lena-no-results (heldout; group contacts-missing)

Goal: Open an existing Lena Quill contact without creating a new contact.

Acceptable action IDs: `stop-blocked`

Goal reached: **false**

Assertions: `lena_open`=false

Evidence: raw/v2-c08-lena-no-results.compact.json, raw/v2-c08-lena-no-results.full.json, raw/v2-c08-lena-no-results.jpg

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
| `tap:e66` | Tap Contact photo for Noah Reed (button, ref e66). | yes | yes |
| `tap:e71` | Tap Contact photo for Noah Reed (button, ref e71). | yes | yes |
| `tap:e79` | Tap Contact photo for Mira Stone (button, ref e79). | yes | yes |
| `tap:e87` | Tap Contact photo for David Taylor (button, ref e87). | yes | yes |
| `swipe:e100:up` | Swipe up within Activate to dismiss: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e100). | yes | yes |
| `swipe:e100:down` | Swipe down within Activate to dismiss: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e100). | yes | yes |
| `swipe:e100:left` | Swipe left within Activate to dismiss: move the finger from right to left; content moves left to reveal items farther right (other, ref e100). | yes | yes |
| `swipe:e100:right` | Swipe right within Activate to dismiss: move the finger from left to right; content moves right to reveal items farther left (other, ref e100). | yes | yes |
| `swipe:e101:up` | Swipe up within ContactsListView: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e101). | yes | yes |
| `swipe:e101:down` | Swipe down within ContactsListView: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e101). | yes | yes |
| `swipe:e101:left` | Swipe left within ContactsListView: move the finger from right to left; content moves left to reveal items farther right (other, ref e101). | yes | yes |
| `swipe:e101:right` | Swipe right within ContactsListView: move the finger from left to right; content moves right to reveal items farther left (other, ref e101). | yes | yes |
| `swipe:e107:up` | Swipe up within Search results: move the finger from bottom to top; content moves up to reveal later, lower items (other, ref e107). | yes | yes |
| `swipe:e107:down` | Swipe down within Search results: move the finger from top to bottom; content moves down to reveal earlier, higher items (other, ref e107). | yes | yes |
| `swipe:e107:left` | Swipe left within Search results: move the finger from right to left; content moves left to reveal items farther right (other, ref e107). | yes | yes |
| `swipe:e107:right` | Swipe right within Search results: move the finger from left to right; content moves right to reveal items farther left (other, ref e107). | yes | yes |
| `type:e130:query` | Replace all text in text-field with the supplied scenario value query (text-field, ref e130). | yes | yes |
| `tap:e132` | Tap Clear text (button, ref e132). | yes | yes |
| `tap:e137` | Tap close (button, ref e137). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v2-r01-weekend-list (heldout; group reminders-rename-list)

Goal: Rename the saved Weekend Errands list to Market Errands and verify the saved list title.

Acceptable action IDs: `tap:e11`

Goal reached: **false**

Assertions: `market_saved`=false

Evidence: raw/v2-r01-weekend-list.compact.json, raw/v2-r01-weekend-list.full.json, raw/v2-r01-weekend-list.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap Back (button, ref e10). | yes | yes |
| `tap:e11` | Tap More (button, ref e11). | yes | yes |
| `tap:e44` | Tap New Reminder (button, ref e44). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v2-r02-more-menu (heldout; group reminders-rename-list)

Goal: Rename the saved Weekend Errands list to Market Errands and verify the saved list title.

Acceptable action IDs: `tap:e56`

Goal reached: **false**

Assertions: `market_saved`=false

Evidence: raw/v2-r02-more-menu.compact.json, raw/v2-r02-more-menu.full.json, raw/v2-r02-more-menu.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e11` | Tap Back (button, ref e11). | yes | yes |
| `tap:e12` | Tap More (button, ref e12). | yes | yes |
| `tap:e45` | Tap New Reminder (button, ref e45). | yes | yes |
| `tap:e56` | Tap Show List Info (button, ref e56). | yes | yes |
| `tap:e59` | Tap Select Reminders (button, ref e59). | yes | yes |
| `tap:e62` | Tap Sort By, Manual (button, ref e62). | yes | yes |
| `tap:e66` | Tap Show Completed (button, ref e66). | yes | yes |
| `tap:e69` | Tap Print (button, ref e69). | yes | yes |
| `tap:e72` | Tap Delete List (button, ref e72). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v2-r03-list-info-old-name (heldout; group reminders-rename-list)

Goal: Rename the saved Weekend Errands list to Market Errands and verify the saved list title.

Acceptable action IDs: `type:e71:newName`

Goal reached: **false**

Assertions: `market_saved`=false

Evidence: raw/v2-r03-list-info-old-name.compact.json, raw/v2-r03-list-info-old-name.full.json, raw/v2-r03-list-info-old-name.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e11` | Tap Back (button, ref e11). | yes | yes |
| `tap:e12` | Tap More (button, ref e12). | yes | yes |
| `tap:e45` | Tap New Reminder (button, ref e45). | yes | yes |
| `tap:e55` | Tap Cancel (button, ref e55). | yes | yes |
| `tap:e57` | Tap Done (button, ref e57). | yes | yes |
| `swipe:e64:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e64). | yes | yes |
| `swipe:e64:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e64). | yes | yes |
| `swipe:e64:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e64). | yes | yes |
| `swipe:e64:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e64). | yes | yes |
| `type:e71:newName` | Replace all text in List Name with the supplied scenario value newName (text-field, ref e71). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v2-r04-list-info-new-name (heldout; group reminders-rename-list)

Goal: Rename the saved Weekend Errands list to Market Errands and verify the saved list title.

Acceptable action IDs: `tap:e57`

Goal reached: **false**

Assertions: `market_saved`=false

Evidence: raw/v2-r04-list-info-new-name.compact.json, raw/v2-r04-list-info-new-name.full.json, raw/v2-r04-list-info-new-name.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e11` | Tap Back (button, ref e11). | yes | yes |
| `tap:e12` | Tap More (button, ref e12). | yes | yes |
| `tap:e45` | Tap New Reminder (button, ref e45). | yes | yes |
| `tap:e55` | Tap Cancel (button, ref e55). | yes | yes |
| `tap:e57` | Tap Done (button, ref e57). | yes | yes |
| `swipe:e64:up` | Swipe up within scroll-view: move the finger from bottom to top; content moves up to reveal later, lower items (scroll-view, ref e64). | yes | yes |
| `swipe:e64:down` | Swipe down within scroll-view: move the finger from top to bottom; content moves down to reveal earlier, higher items (scroll-view, ref e64). | yes | yes |
| `swipe:e64:left` | Swipe left within scroll-view: move the finger from right to left; content moves left to reveal items farther right (scroll-view, ref e64). | yes | yes |
| `swipe:e64:right` | Swipe right within scroll-view: move the finger from left to right; content moves right to reveal items farther left (scroll-view, ref e64). | yes | yes |
| `type:e71:newName` | Replace all text in List Name with the supplied scenario value newName (text-field, ref e71). | yes | yes |
| `tap:e72` | Tap Clear text (button, ref e72). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |

## v2-r05-renamed-list-saved (heldout; group reminders-rename-list)

Goal: Rename the saved Weekend Errands list to Market Errands and verify the saved list title.

Acceptable action IDs: `stop-goal`

Goal reached: **true**

Assertions: `market_saved`=true, `weekend_still_saved`=false

Evidence: raw/v2-r05-renamed-list-saved.compact.json, raw/v2-r05-renamed-list-saved.full.json, raw/v2-r05-renamed-list-saved.jpg

| Action ID | Description | In full | In compact |
| --- | --- | --- | --- |
| `tap:e10` | Tap Back (button, ref e10). | yes | yes |
| `tap:e11` | Tap More (button, ref e11). | yes | yes |
| `tap:e44` | Tap New Reminder (button, ref e44). | yes | yes |
| `wait` | Wait for the current screen to change. | yes | yes |
| `stop-goal` | Stop because the scenario goal is already reached. | yes | yes |
| `stop-blocked` | Stop because an observed blocker prevents progress. | yes | yes |
| `none` | No listed action fits the current observation. | yes | yes |
