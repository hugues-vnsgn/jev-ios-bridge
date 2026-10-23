# android unclean-child

Readings `/Users/hugues_mini/.codex/reports/jev-ios-bridge/phase3-build/P17-evidence/android/unclean-child/{before,active,after}/readings.json`.

Capabilities sent to the public core.

```json
{
  "platform": "android",
  "caps": {
    "platformName": "Android",
    "appium:automationName": "UiAutomator2",
    "appium:udid": "emulator-5570",
    "appium:systemPort": 18200,
    "appium:mjpegServerPort": 0,
    "appium:autoLaunch": false,
    "appium:noReset": true,
    "appium:dontStopAppOnReset": true,
    "appium:shouldTerminateApp": false,
    "appium:forceAppLaunch": false,
    "appium:skipDeviceInitialization": true,
    "appium:skipUnlock": true,
    "appium:skipLogcatCapture": true,
    "appium:suppressKillServer": true,
    "appium:autoGrantPermissions": false,
    "appium:adbExecTimeout": 120000,
    "appium:uiautomator2ServerInstallTimeout": 120000,
    "appium:skipServerInstallation": true
  },
  "unclean": true
}
```

## global settings

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| hidden_api_policy | ABSENT | 1 | 1 |
| hidden_api_policy_p_apps | ABSENT | 1 | 1 |
| hidden_api_policy_pre_p_apps | ABSENT | 1 | 1 |

## secure settings

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| accessibility_enabled | 0 | 1 | 1 |

## packages

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| All 257 recorded entries | Same | Same | Same |

## doze

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| All 26 recorded entries | Same | Same | Same |

## forwards

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| emulator-5570 tcp:18200 tcp:6790 | ABSENT | present | present |

## package grants

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| All 2864 recorded entries | Same | Same | Same |

## foreground

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| topResumedActivity | ActivityRecord{145801708 u0 dev.jevbridge.diagnostic/.MainActivity t7} | ActivityRecord{145801708 u0 dev.jevbridge.diagnostic/.MainActivity t7} | ActivityRecord{145801708 u0 dev.jevbridge.diagnostic/.MainActivity t7} |

## native automation

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| processes | absent | 5653  1388 app_process                 app_process /system/bin com.android.commands.am.Am instrument -w -e disableAnalytics true io.appium.uiautomator2.server.test/androidx.test.runner.AndroidJUnitRunner<br>5671   484 io.appium.uiautomator2.server io.appium.uiautomator2.server | 5653  1388 app_process                 app_process /system/bin com.android.commands.am.Am instrument -w -e disableAnalytics true io.appium.uiautomator2.server.test/androidx.test.runner.AndroidJUnitRunner<br>5671   484 io.appium.uiautomator2.server io.appium.uiautomator2.server |

## helper appops

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| raw | Error: No UID for io.appium.settings in user 0<br> | Error: No UID for io.appium.settings in user 0<br> | Error: No UID for io.appium.settings in user 0<br> |
