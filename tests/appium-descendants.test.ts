import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const fixture = fileURLToPath(new URL('./fixtures/appium-descendant-cases.py', import.meta.url));
for (const name of [
  'test_bound_private_device_tree_excludes_only_device_internals',
  'test_escaped_double_fork_is_found_stopped_and_foreign_process_survives',
  'test_platform_binary_with_recorded_link_is_marker_unreadable_and_quarantined',
  'test_completed_scan_can_verify_positive_absence_after_native_fence',
  'test_group_signals_refuse_shared_or_unattested_members',
  'test_recorded_shared_service_is_not_individually_signalled',
  'test_original_reproducer_without_launch_attestation_is_not_verified',
  'test_unverifiable_leftover_is_quarantined_and_not_signalled',
  'test_inspection_timeout_retains_quarantine',
]) {
  test(name, () => {
    const result = spawnSync('python3', ['-B', fixture, 'DescendantCases.' + name], {
      encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
}
