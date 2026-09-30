import type { ScriptedScenarioAndroid } from '../../src/scripted/contracts.js';

type AndroidScriptOverrides = Partial<Omit<ScriptedScenarioAndroid, 'app'>> & {
  app?: Partial<ScriptedScenarioAndroid['app']>;
};

/**
 * A minimal Android script: package `com.example.android`, no values, no steps. `overrides.app` merges
 * onto the default app identity instead of replacing it, so a caller only names what it changes; every
 * other field replaces the default, as `steps` and `values` usually do.
 */
export function androidScript(overrides: AndroidScriptOverrides = {}): ScriptedScenarioAndroid {
  const { app, ...rest } = overrides;
  return {
    version: 1,
    platform: 'android',
    app: { package: 'com.example.android', ...app },
    values: {},
    steps: [],
    ...rest,
  } as ScriptedScenarioAndroid;
}
