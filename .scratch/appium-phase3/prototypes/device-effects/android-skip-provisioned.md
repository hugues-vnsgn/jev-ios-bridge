# android skip-provisioned

Readings `/Users/hugues_mini/.codex/reports/jev-ios-bridge/phase3-build/P17-evidence/android/skip-provisioned/{before,active,after}/readings.json`.

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
  "unclean": false
}
```

## global settings

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| Phenotype_flags | ABSENT | activity_starts_logging_enabled:alarm_manager_constants:alarm_manager_dummy_flags:always_on_display_constants:anomaly_config:anomaly_config_version:anomaly_detection_constants:app_idle_constants:app_standby_enabled:backup_agent_timeout_parameters:battery_stats_constants:battery_tip_constants:binder_calls_stats:ble_scan_balanced_interval_ms:ble_scan_balanced_window_ms:ble_scan_low_power_interval_ms:ble_scan_low_power_window_ms:blocking_helper_dismiss_to_view_ratio:blocking_helper_streak_limit:emergency_call_codes_data:emergency_gesture_power_button_cooldown_period_ms:gnss_satellite_blocklist:hybrid_sysui_battery_warning_flags:job_scheduler_constants:job_scheduler_quota_controller_constants:job_scheduler_time_controller_constants:location_background_throttle_interval_ms:location_ignore_settings_package_whitelist:network_watchlist_enabled:night_display_forced_auto_mode_available:notification_snooze_options:phenotype_test_setting:settings_use_external_provider_api:settings_use_psd_api:smart_replies_in_notifications_flags:sqlite_compatibility_wal_flags:sys_uidcpupower:text_classifier_constants:zram_enabled | activity_starts_logging_enabled:alarm_manager_constants:alarm_manager_dummy_flags:always_on_display_constants:anomaly_config:anomaly_config_version:anomaly_detection_constants:app_idle_constants:app_standby_enabled:backup_agent_timeout_parameters:battery_stats_constants:battery_tip_constants:binder_calls_stats:ble_scan_balanced_interval_ms:ble_scan_balanced_window_ms:ble_scan_low_power_interval_ms:ble_scan_low_power_window_ms:blocking_helper_dismiss_to_view_ratio:blocking_helper_streak_limit:emergency_call_codes_data:emergency_gesture_power_button_cooldown_period_ms:gnss_satellite_blocklist:hybrid_sysui_battery_warning_flags:job_scheduler_constants:job_scheduler_quota_controller_constants:job_scheduler_time_controller_constants:location_background_throttle_interval_ms:location_ignore_settings_package_whitelist:network_watchlist_enabled:night_display_forced_auto_mode_available:notification_snooze_options:phenotype_test_setting:settings_use_external_provider_api:settings_use_psd_api:smart_replies_in_notifications_flags:sqlite_compatibility_wal_flags:sys_uidcpupower:text_classifier_constants:zram_enabled |
| activity_starts_logging_enabled | ABSENT | 1 | 1 |
| alarm_manager_constants | ABSENT |  |  |
| alarm_manager_dummy_flags | ABSENT | null | null |
| always_on_display_constants | ABSENT | null | null |
| anomaly_config | ABSENT |  |  |
| anomaly_config_version | ABSENT | 11 | 11 |
| anomaly_detection_constants | ABSENT | null | null |
| app_idle_constants | ABSENT |  |  |
| app_standby_enabled | ABSENT | 1 | 1 |
| backup_agent_timeout_parameters | ABSENT |  |  |
| battery_stats_constants | ABSENT | track_cpu_times_by_proc_state=false | track_cpu_times_by_proc_state=false |
| battery_tip_constants | ABSENT | app_restriction_enabled=true | app_restriction_enabled=true |
| binder_calls_stats | ABSENT | latency_observer_sharding_modulo=100 | latency_observer_sharding_modulo=100 |
| ble_scan_balanced_interval_ms | ABSENT | 730 | 730 |
| ble_scan_balanced_window_ms | ABSENT | 183 | 183 |
| ble_scan_low_power_interval_ms | ABSENT | 1400 | 1400 |
| ble_scan_low_power_window_ms | ABSENT | 140 | 140 |
| blocking_helper_dismiss_to_view_ratio | ABSENT | null | null |
| blocking_helper_streak_limit | ABSENT | null | null |
| emergency_call_codes_data | ABSENT | null | null |
| emergency_gesture_power_button_cooldown_period_ms | ABSENT | 3000 | 3000 |
| gnss_satellite_blocklist | ABSENT |  |  |
| hidden_api_policy | ABSENT | 1 | ABSENT |
| hidden_api_policy_p_apps | ABSENT | 1 | ABSENT |
| hidden_api_policy_pre_p_apps | ABSENT | 1 | ABSENT |
| hybrid_sysui_battery_warning_flags | ABSENT |  |  |
| job_scheduler_constants | ABSENT |  |  |
| job_scheduler_quota_controller_constants | ABSENT | max_job_count_per_rate_limiting_window=10,rate_limiting_window_ms=60000,max_job_count_active=75,max_session_count_active=75 | max_job_count_per_rate_limiting_window=10,rate_limiting_window_ms=60000,max_job_count_active=75,max_session_count_active=75 |
| job_scheduler_time_controller_constants | ABSENT |  |  |
| location_background_throttle_interval_ms | ABSENT | 600000 | 600000 |
| location_ignore_settings_package_whitelist | ABSENT | com.google.android.gms,com.google.android.dialer | com.google.android.gms,com.google.android.dialer |
| network_watchlist_enabled | ABSENT |  |  |
| night_display_forced_auto_mode_available | ABSENT | 0 | 0 |
| notification_snooze_options | ABSENT | null | null |
| phenotype_test_setting | ABSENT | V15AboveInEnglish | V15AboveInEnglish |
| settings_use_external_provider_api | ABSENT | 1 | 1 |
| settings_use_psd_api | ABSENT | 1 | 1 |
| smart_replies_in_notifications_flags | ABSENT | enabled=true,max_squeeze_remeasure_attempts=3,requires_targeting_p=true | enabled=true,max_squeeze_remeasure_attempts=3,requires_targeting_p=true |
| sqlite_compatibility_wal_flags | ABSENT |  |  |
| sys_uidcpupower | ABSENT |  |  |
| text_classifier_constants | ABSENT | null | null |
| zram_enabled | ABSENT | 1 | 1 |

## secure settings

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| accessibility_enabled | 0 | 1 | 0 |
| nearby_sharing_component | com.google.android.gms/com.google.android.gms.nearby.sharing.send.SendActivity | com.google.android.gms/com.google.android.gms.nearby.sharing.send.SendActivity | com.google.android.gms/com.google.android.gms.nearby.sharing.main.MainActivity |
| now_playing_enabled | ABSENT | 0 | 0 |
| odi_captions_volume_ui_enabled | ABSENT | ABSENT | 1 |
| systemui.google.opa_enabled | ABSENT | 1 | 1 |

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
| emulator-5570 tcp:18200 tcp:6790 | ABSENT | present | ABSENT |

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
| processes | absent | 5204  1388 app_process                 app_process /system/bin com.android.commands.am.Am instrument -w -e disableAnalytics true io.appium.uiautomator2.server.test/androidx.test.runner.AndroidJUnitRunner<br>5238   484 io.appium.uiautomator2.server io.appium.uiautomator2.server | absent |

## helper appops

| Device or host path | Before create | Active session | After delete or kill |
| --- | --- | --- | --- |
| raw | Error: No UID for io.appium.settings in user 0<br> | Error: No UID for io.appium.settings in user 0<br> | Error: No UID for io.appium.settings in user 0<br> |
