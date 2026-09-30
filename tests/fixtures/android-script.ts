import type { ScriptedScenarioAndroid, ScriptedStep } from '../../src/scripted/contracts.js';

type AndroidScriptOverrides = Partial<Omit<ScriptedScenarioAndroid, 'app'>> & {
  app?: Partial<ScriptedScenarioAndroid['app']>;
};

/** A checkpoint every default `androidScript()` can end at, so the default script is itself a valid one
 *  (a script must end at a checkpoint), not just a fragment a caller is required to complete. */
const defaultSteps: ScriptedStep[] = [{ id: 'verify', kind: 'checkpoint',
  guard: { present: [{ role: 'text', label: 'Marker' }] },
  assertions: [{ id: 'shown', claim: 'The marker is visible.' }] }];

/**
 * A minimal, valid Android script: package `com.example.android`, no values, one checkpoint step.
 * `overrides.app` merges onto the default app identity instead of replacing it, so a caller only names
 * what it changes; every other field replaces the default, as `steps` and `values` usually do.
 */
export function androidScript(overrides: AndroidScriptOverrides = {}): ScriptedScenarioAndroid {
  const { app, ...rest } = overrides;
  return {
    version: 1,
    platform: 'android',
    app: { package: 'com.example.android', ...app },
    values: {},
    steps: defaultSteps,
    ...rest,
  };
}
