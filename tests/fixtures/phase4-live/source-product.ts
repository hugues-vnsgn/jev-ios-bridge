import { Admission } from '../../../src/device/admission.js';
import { identityProbe } from '../../../src/device/android/probe.js';
import { adbRunner } from '../../../src/device/android/adb.js';
import { adbEnvironment, findAdb } from '../../../src/device/android/tools.js';
import { resolveIdentity } from '../../../src/device/identity.js';
import { ComposedAppiumDriver, productionAppiumHost } from '../../../src/appium/composition.js';
import { createFenceRunner } from '../../../src/appium/fence/runner.js';
import { simctlRunner } from '../../../src/appium/native/simctl.js';
import type { BuiltProduct } from '../../../scripts/phase4/live/backend.js';

/** The product from source, for tests: the live kit loads the built one, which a test run has not built yet. */
export const sourceProduct: BuiltProduct = { Admission, identityProbe, adbRunner, adbEnvironment, findAdb, resolveIdentity,
  ComposedAppiumDriver, productionAppiumHost, createFenceRunner, simctlRunner };
