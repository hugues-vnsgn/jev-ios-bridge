# android first-minimum

Readings `/Users/hugues_mini/.codex/reports/jev-ios-bridge/phase3-build/P17-evidence/android/first-minimum/{before,active,after}/readings.json`.

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
    "appium:uiautomator2ServerInstallTimeout": 120000
  },
  "unclean": false
}
```

## global settings

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| content_capture_service_explicitly_enabled | ABSENT | ABSENT | default |
| hidden_api_policy | ABSENT | 1 | ABSENT |
| hidden_api_policy_p_apps | ABSENT | 1 | ABSENT |
| hidden_api_policy_pre_p_apps | ABSENT | 1 | ABSENT |
| multi_sim_data_call | ABSENT | 1 | 1 |
| multi_sim_sms | ABSENT | 1 | 1 |
| multi_sim_voice_call | ABSENT | 1 | 1 |
| network_scoring_ui_enabled | ABSENT | ABSENT | 1 |
| package_verifier_user_consent | ABSENT | 0 | 0 |
| sysui_demo_allowed | ABSENT | 0 | 0 |
| watch_ranging_supported_by_primary_device | ABSENT | ABSENT | 0 |
| zen_mode_config_etag | 1578468494 | 1043166784 | 1043166784 |

## secure settings

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| accessibility_display_inversion_enabled | ABSENT | null | null |
| accessibility_enabled | 0 | 1 | 0 |
| accessibility_hct_rect_prompt_status | ABSENT | 2 | 2 |
| adaptive_charging_enabled | ABSENT | null | null |
| autofill_field_classification | ABSENT | ABSENT | 1 |
| autofill_service_search_uri | ABSENT | ABSENT | https://play.google.com/store/apps/collection/promotion_30029f7_autofillservices_apps |
| autofill_user_data_max_category_count | ABSENT | ABSENT | 20 |
| backup_manager_constants | ABSENT | key_value_backup_interval_milliseconds=43200000 | key_value_backup_interval_milliseconds=43200000 |
| clock_seconds | ABSENT | null | null |
| config_update_certificate | ABSENT | ABSENT | MIID4TCCAsmgAwIBAgIJAMsyDT+FwMuvMA0GCSqGSIb3DQEBBQUAMIGGMQswCQYDVQQGEwJVUzETMBEGA1UECAwKQ2FsaWZvcm5pYTEWMBQGA1UEBwwNTW91bnRhaW4gVmlldzETMBEGA1UECgwKR29vZ2xlIEluYzEQMA4GA1UECwwHQW5kcm9pZDEjMCEGCSqGSIb3DQEJARYUc2VjdXJpdHlAYW5kcm9pZC5jb20wHhcNMTIwOTEwMjA0NDQxWhcNMTIxMDEwMjA0NDQxWjCBhjELMAkGA1UEBhMCVVMxEzARBgNVBAgMCkNhbGlmb3JuaWExFjAUBgNVBAcMDU1vdW50YWluIFZpZXcxEzARBgNVBAoMCkdvb2dsZSBJbmMxEDAOBgNVBAsMB0FuZHJvaWQxIzAhBgkqhkiG9w0BCQEWFHNlY3VyaXR5QGFuZHJvaWQuY29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwuFNNPal1QpUSH8MU5T+BSSbCv/jTU8pbRKwYfq4ZmsjG1BxX8GJS/itdHr5IgG5YGSRpB9JkWJTAne54Qv2xX3ck8yMySjOKbsCuF3Qnrv1HiM1w0PmMvPC5GvDJz9alrrsq6uj40Hd5ina8pTKieYO1PNIf1MByBnrq/615cPOwb4UAYUwx4ChFG8aUNoChgYk0Ain7YoX4Pw7/tXIiVArsPWRbtzXVaMNWONRUM3SGVT5NO67LEEk0vIkDVjmGnJaDkkF+yqAr24ekl2qdMQb9cEnc1wNCMtVdyxUelZoVxFnot3m4ZhYIPzGI2E88TJ6c30Qs1ocHuPXW8KfGQIDAQABo1AwTjAdBgNVHQ4EFgQUXlT7Zj4V/hHVbyL54kmRYizK/powHwYDVR0jBBgwFoAUXlT7Zj4V/hHVbyL54kmRYizK/powDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQUFAAOCAQEAE5D6pMFMJMwVTtrzZXExgn6r2q7LugmdIpaoFjiU/Iv/bk3VvhDU5jjE54G/fqi/g415yowkFQ02/ZkrTm/q3anvWsppN3NEns2YDi4moEhwLZcCVBzhjkppHGgkLHadzlJZdUFLnzZbDuiZrDNPEkjldVejF1qGt6LbW6d8xNmscerUdKJSUqryOi3U8SXjlTWu5d/hmajQLEe7VJ3y8q5rEsCfsb15EyYxNLfTZuf4PXVU/+kSciTyJxkPZAaz2J1zXQegzC+k3gzNnovlHYlDc5EaVnprsBgOCkaWQfjr6/5YyJysM96WMjndIjyFZSHnj9yF4j7JDwB9qEfxvA== |
| dark_theme_custom_end_time | ABSENT | 21600000000 | 21600000000 |
| dark_theme_custom_start_time | ABSENT | 79200000000 | 79200000000 |
| doze_pulse_on_double_tap | ABSENT | null | null |
| doze_tap_gesture | ABSENT | null | null |
| dropbox:data_app_anr | ABSENT | ABSENT | disabled |
| dropbox:data_app_crash | ABSENT | ABSENT | disabled |
| dropbox:data_app_wtf | ABSENT | ABSENT | disabled |
| facelock_detection_threshold | ABSENT | ABSENT | 0.0 |
| facelock_liveliness_recognition_threshold | ABSENT | ABSENT | 2.2 |
| facelock_max_center_movement | ABSENT | ABSENT | 10.0 |
| high_priority | ABSENT | null | null |
| icon_blacklist | ABSENT | null | null |
| lockscreen.options | ABSENT | ABSENT | enable_facelock |
| nearby_sharing_component | ABSENT | com.google.android.gms/com.google.android.gms.nearby.sharing.send.SendActivity | com.google.android.gms/com.google.android.gms.nearby.sharing.send.SendActivity |
| notification_history_enabled | ABSENT | null | null |
| pai_selection_page_complete | ABSENT | 1 | 1 |
| print_service_search_uri | ABSENT | ABSENT | https://play.google.com/store/apps/collection/promotion_3000abc_print_services |
| pubkey_blacklist | ABSENT | ABSENT | 410f36363258f30b347d12ce4863e433437806a8,c4f9663716cd5e71d6950b5f33ce041c95b435d1,e23b8d105f87710a68d9248050ebefc627be4ca6,7b2e16bc39bcd72b456e9f055d1de615b74945db,e8f91200c65cee16e039b9f883841661635f81c5,0129bcd5b448ae8d2496d1c3e19723919088e152,d33c5b41e45cc4b3be9ad6952c4ecc2528032981,e12d89f56d2276f830e6ceafa66c725c0b41a932,d9f5c6ce57ffaa39cc7ed172bd53e0d307834bd1,3ecf4bbbe46096d514bb539bb913d77aa4ef31bf,685eec0a39f668ae8fd8964f987476b4504fd2be,0e502d4dd1e160368a31f06a810431ba6f72c041,93d1532229cc2abd21dff597ee320fe4246f3d0c,f57179faea10c5438cb0c6e1cc277b6e0db2ff54,077ac7de8da558643a06c5369e554faeb3dfa166,e58e315baaeeaac6e72ec9573670ca2f254ec347,384d0c1dc477a7b3f86786d018519f589f1e9e25,c1f9f2894f2e8521507c089f362d5cd9feff7e21,11f75f354126c2c849f53f29cf929604233cf869,e0e90e95afab970b897bfb503f72cb4c06cfb4f3,7923d58d0fe03ce6abadae271a6d94f414d1a873,63eeebbaed8e3592d2c87d40eb320edf75ea6494,c680d2f20aa19fc39379296fa5010dc39f8d0709,b1a1d1dd01491b94c2a71e60033f6d5fe9d72fdf,3145de03c55164ac86342b924f45862b5f645969,ea337b1e0176d3e21e1296fb988239371312536b,61d55d09fba074c672c09461b89dddd079ee4abf,385698c49f182af28d29231fabb11f76bf32675c,21ba2f50e6811f19f00918e31e449c50683bee2e |
| qs_auto_tiles | wallet,cast | wallet,cast,custom(com.google.android.apps.wellbeing/.screen.ui.GrayscaleTileService) | wallet,cast,custom(com.google.android.apps.wellbeing/.screen.ui.GrayscaleTileService) |
| send_action_app_error | ABSENT | ABSENT | 1 |
| serial_blacklist | ABSENT | ABSENT |  |
| ssl_session_cache | ABSENT | ABSENT | file |
| sysui_do_not_disturb | ABSENT | null | null |
| sysui_qs_tiles | internet,bt,dnd,custom(com.google.android.gms/.nearby.sharing.SharingTileService),flashlight,airplane,rotation,wallet,cast,alarm,controls,screenrecord | internet,bt,dnd,custom(com.google.android.gms/.nearby.sharing.SharingTileService),flashlight,airplane,rotation,wallet,cast,alarm,controls,screenrecord,custom(com.google.android.apps.wellbeing/.screen.ui.GrayscaleTileService) | internet,bt,dnd,custom(com.google.android.gms/.nearby.sharing.SharingTileService),flashlight,airplane,rotation,wallet,cast,alarm,controls,screenrecord,custom(com.google.android.apps.wellbeing/.screen.ui.GrayscaleTileService) |
| sysui_volume_down_silent | ABSENT | null | null |
| sysui_volume_up_silent | ABSENT | null | null |
| ui_night_mode | ABSENT | 3 | 1 |
| ui_night_mode_custom_type | ABSENT | 1 | -1 |
| wind_down_first_time_setup | ABSENT | 1 | 1 |

## packages

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| package:/data/app/~~SPKg7kHJvq2sTyqGedqW_A==/io.appium.uiautomator2.server-eX0tEXvgWpo5eiylZd-0eQ==/base.apk=io.appium.uiautomator2.server versionCode:278 uid:10226 | ABSENT | present | present |
| package:/data/app/~~TC9Pq9RX58CMBS5vKYCJWg==/io.appium.uiautomator2.server.test-LTCDtnfAGu2YdBiMqyn0Dg==/base.apk=io.appium.uiautomator2.server.test versionCode:0 uid:10225 | ABSENT | present | present |

## doze

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| user,io.appium.uiautomator2.server,10226 | ABSENT | present | present |
| user,io.appium.uiautomator2.server.test,10225 | ABSENT | present | present |

## forwards

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| emulator-5570 tcp:18200 tcp:6790 | ABSENT | present | ABSENT |

## package grants

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| io.appium.uiautomator2.server/android.permission.ACCESS_NETWORK_STATE | ABSENT | granted=true | granted=true |
| io.appium.uiautomator2.server/android.permission.ACCESS_WIFI_STATE | ABSENT | granted=true | granted=true |
| io.appium.uiautomator2.server/android.permission.BLUETOOTH_SCAN | ABSENT | granted=false, flags=[ USER_SENSITIVE_WHEN_GRANTED&#124;USER_SENSITIVE_WHEN_DENIED] | granted=false, flags=[ USER_SENSITIVE_WHEN_GRANTED&#124;USER_SENSITIVE_WHEN_DENIED] |
| io.appium.uiautomator2.server/android.permission.CHANGE_WIFI_STATE | ABSENT | granted=true | granted=true |
| io.appium.uiautomator2.server/android.permission.INTERNET | ABSENT | granted=true | granted=true |
| io.appium.uiautomator2.server/android.permission.QUERY_ALL_PACKAGES | ABSENT | granted=true | granted=true |
| io.appium.uiautomator2.server/android.permission.REORDER_TASKS | ABSENT | granted=true | granted=true |
| io.appium.uiautomator2.server/android.permission.WAKE_LOCK | ABSENT | granted=true | granted=true |

## foreground

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| topResumedActivity | ActivityRecord{145801708 u0 dev.jevbridge.diagnostic/.MainActivity t7} | ActivityRecord{145801708 u0 dev.jevbridge.diagnostic/.MainActivity t7} | ActivityRecord{145801708 u0 dev.jevbridge.diagnostic/.MainActivity t7} |

## native automation

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| processes | absent | 3193  1388 app_process                 app_process /system/bin com.android.commands.am.Am instrument -w -e disableAnalytics true io.appium.uiautomator2.server.test/androidx.test.runner.AndroidJUnitRunner<br>3234   484 io.appium.uiautomator2.server io.appium.uiautomator2.server | absent |

## helper appops

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| raw | Error: No UID for io.appium.settings in user 0<br> | Error: No UID for io.appium.settings in user 0<br> | Error: No UID for io.appium.settings in user 0<br> |
