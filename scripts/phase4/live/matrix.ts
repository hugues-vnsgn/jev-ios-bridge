import { DEVICE_SCOPES, type DeviceScope, type LiveMatrix, type LiveRow } from './row.js';

const ACCEPTANCE = '.scratch/appium-mcp-migration/phases/phase-4-acceptance.md';
const PHASE3 = '.scratch/appium-mcp-migration/phases/phase-3-adapter.md';
const HANDOVER = '~/.codex/reports/jev-ios-bridge/phase3-build';
const RESUME = `${HANDOVER}/RESUME.md:14`;
const FOLLOW_UPS = `${HANDOVER}/FOLLOW-UPS.md`;
const BASELINE = '21fce4965:.scratch/observed-action-rollout/next-work.md';
const IOS_APP = 'examples/diagnostic-app';
const ANDROID_APP = 'examples/diagnostic-app-android';
const WEATHER = 'spikes/benchmarks/vendor/weather';
const PROBE = '.scratch/android-support/findings/05-assets/probe-app';
const LOG_PROBE = '.scratch/android-support/findings/06-assets/logprobe';
const FAULTS = '.scratch/appium-mcp-migration/phase-1-live.md:46-52';
const DRIVEN_ON = 'Turn driven mode on ("drivenMode": true in .jev/config.json and JEV_EXPERIMENTAL_DRIVEN=1).';

const E = {
  commands: 'Commands with stdout, stderr and exit codes',
  report: 'report.json and run.jsonl',
  screenshots: 'Step screenshots',
  versions: 'Versions: app build, OS, toolchain, Node and stack',
  admission: 'Admission generation: components, commands and fence proofs',
  artifacts: 'Artifact paths',
  mcp: 'MCP requests and replies',
  logs: 'Log pane text, `logs` output and the app log files',
  observed: 'Observed replies with allocation and action records',
  cycles: 'Per-cycle records from the cycles harness',
  covering: 'Results of the covering rows',
};
const RUN = [E.commands, E.report, E.screenshots, E.versions, E.admission, E.artifacts];

type Needs = LiveRow['needs'];
type Spec = Pick<LiveRow, 'steps' | 'expected' | 'evidence'> & { jevKey: boolean; storeActivation?: false };
type Category = { slug: string; title: string; line: number; executor: LiveRow['executor']; ios: Spec; android: Spec; phone?: Spec };
/** A requirement the evidence index lists beside the live matrix; no `devices` means a host-only check. */
export type IndexEntry = Pick<LiveRow, 'id' | 'source' | 'evidence'> & { requirement: string; devices: DeviceScope[]; needs: Needs };

const DEVICE_NAMES: Record<DeviceScope, string> = { 'ios-simulator': 'iOS simulator', 'android-emulator': 'Android emulator', 'android-phone': 'Android phone' };
const needs = (devices: readonly DeviceScope[], jevKey: boolean, storeActivation = true): Needs =>
  ({ storeActivation, phone: devices.length === 1 && devices[0] === 'android-phone', jevKey });
const HOST: Needs = needs([], false, false);
const KEYED = (devices: DeviceScope[]) => needs(devices, true);
const KEY_FREE = (devices: DeviceScope[]) => needs(devices, false);

const CATEGORIES: Category[] = [
  { slug: 'launch-options', title: 'Launch and options', line: 69, executor: 'operator',
    ios: { jevKey: true, evidence: RUN,
      steps: [`Run a copy of ${IOS_APP}/scenario.json with \`app.launchArgs\` and \`preconditions\` added, through CLI \`run\` and through MCP \`start_scenario\`.`,
        'Run a version 2 copy with `start: "attach"` while the app is in front.'],
      expected: 'The app launches fresh with the authored launch args, and the report keeps the preconditions as written. The attach run ends INCONCLUSIVE with UNSUPPORTED_ACTION before the simulator is touched.' },
    android: { jevKey: true, evidence: RUN,
      steps: [`Run a copy of ${ANDROID_APP}/scenario.json with \`app.activity\`, \`app.intentExtras\` and \`preconditions\` added, through CLI \`run\` and through MCP \`start_scenario\`.`,
        'With the diagnostic app in front, run a version 2 copy with `start: "attach"`.', 'Repeat the attach with the launcher in front.'],
      expected: 'The app starts at the authored activity with its intent extras, and the report keeps the preconditions as written. Attach starts from the screen already showing, without a relaunch, and leaves the app running. With the launcher in front, attach ends INCONCLUSIVE with APP_NOT_IN_FOREGROUND.' } },
  { slug: 'observation-actions', title: 'Observation and actions', line: 70, executor: 'operator',
    ios: { jevKey: true, evidence: RUN,
      steps: [`Run ${IOS_APP}/scenario.json through CLI \`run\`.`,
        `Install ${WEATHER} and run a script that replaces the location search text, swipes the results and waits for a result row before its checkpoint.`,
        DRIVEN_ON, 'Run a `do` step that needs a scroll and a back through MCP `start_scenario`.'],
      expected: 'Each step reads a fresh capture and taps only its unique target. The diagnostic run fails with ASSERTION_FALSE on the planted $3 total. The search field reports its own shown value. Swipe, scroll and back move the screen, each wait ends on its until-guard, and each checkpoint is judged once.' },
    android: { jevKey: true, evidence: RUN,
      steps: [`Run ${ANDROID_APP}/scenario.json through CLI \`run\`.`,
        `Install ${PROBE} and run a script that replaces the text of its phone field, which filters what it shows, swipes a list and waits for the scroll echo before its checkpoint.`,
        DRIVEN_ON, 'Run a `do` step that needs a scroll and a back through MCP `start_scenario`.'],
      expected: 'Each step reads a fresh capture and taps only its unique target. The diagnostic run fails with ASSERTION_FALSE on the planted $3 total. The phone field reports its transformed shown value with masked evidence, and the mismatch does not fail the run. Swipe, scroll and back move the screen, each wait ends on its until-guard, and each checkpoint is judged once.' } },
  { slug: 'unsafe-targeting', title: 'Unsafe targeting', line: 71, executor: 'operator',
    ios: { jevKey: true, evidence: RUN,
      steps: ['Through CLI `run`, tap with a selector of role button alone, with a selector that matches nothing, and on Complete order before any item is chosen.',
        'Run a script whose guard no longer holds when its step starts.',
        `On ${WEATHER}, tap a target hidden behind the open keyboard, and act while the results list is still changing.`],
      expected: 'Each refused step sends no input. The run ends with TARGET_AMBIGUOUS, TARGET_MISSING, TARGET_UNAVAILABLE, GUARD_MISSING or SCREEN_CHANGED as fits. No tap reaches a stale reference.' },
    android: { jevKey: true, evidence: RUN,
      steps: ['Through CLI `run`, tap with a selector of role button alone, with a selector that matches nothing, and on Complete order before any item is chosen.',
        'Run a script whose guard no longer holds when its step starts.',
        `On ${PROBE}, tap a target hidden behind the open keyboard, and act during the animation screen's slide-in panel.`],
      expected: 'Each refused step sends no input. The run ends with TARGET_AMBIGUOUS, TARGET_MISSING, TARGET_UNAVAILABLE, GUARD_MISSING or SCREEN_CHANGED as fits. No tap reaches a stale reference.' } },
  { slug: 'driven-interaction', title: 'Driven interaction', line: 72, executor: 'operator',
    ios: { jevKey: true, evidence: [...RUN, E.mcp],
      steps: [DRIVEN_ON, 'Start a version 2 script whose `do` step hands back, through MCP `start_scenario`.',
        'Answer the pause with MCP `resolve_step` from a second MCP server, then from the owning one.',
        'Change the screen during a pause, then answer.', 'Answer one pause with `tapAt`.'],
      expected: 'Only the owning server\'s first answer is accepted. After a screen change the late answer does nothing, and the step pauses again with SCREEN_CHANGED. An accepted answer acts on a fresh capture. iOS refuses `tapAt` with UNSUPPORTED_ACTION before any input, and the pause stays open.' },
    android: { jevKey: true, evidence: [...RUN, E.mcp],
      steps: [DRIVEN_ON, 'Start a version 2 script whose `do` step hands back, through MCP `start_scenario`.',
        'Answer the pause with MCP `resolve_step` from a second MCP server, then from the owning one.',
        'Change the screen during a pause, then answer.', 'Answer pauses with `tapAt` on two emulator screen sizes.',
        'Answer `tapAt` with a point outside the screenshot, after rotating the device, and for a screenshot whose frame the screen cannot explain.'],
      expected: 'Only the owning server\'s first answer is accepted. After a screen change the late answer does nothing, and the step pauses again with SCREEN_CHANGED. An accepted answer acts on a fresh capture. Coordinate scaling lands each `tapAt` on its target on both screen sizes. An invalid point, a rotated device and an unknown geometry send no input.' },
    phone: { jevKey: true, evidence: [...RUN, E.mcp],
      steps: [DRIVEN_ON, 'Start a version 2 script whose `do` step hands back, through MCP `start_scenario`.',
        'Answer the pause with MCP `resolve_step` from a second MCP server, then from the owning one.',
        'Change the screen during a pause, then answer.', 'Answer pauses with `tapAt` on the phone, whose screen size differs from the emulator\'s.',
        'Answer `tapAt` with a point outside the screenshot, after rotating the phone, and for a screenshot whose frame the screen cannot explain.'],
      expected: 'Only the owning server\'s first answer is accepted. After a screen change the late answer does nothing, and the step pauses again with SCREEN_CHANGED. An accepted answer acts on a fresh capture. Coordinate scaling lands each `tapAt` on its target at the phone\'s screen size. An invalid point, a rotated phone and an unknown geometry send no input.' } },
  { slug: 'logs-health', title: 'Logs and health', line: 73, executor: 'operator',
    ios: { jevKey: true, evidence: [...RUN, E.logs],
      steps: [`Run ${WEATHER}, whose Logger lines carry its bundle ID, with a supplied value through CLI \`run\`, once with the log pane and once with \`--no-log-pane\`, then follow it with CLI \`logs\`.`,
        'Kill the app process with SIGSEGV partway through one run.', 'Kill the run\'s owned `log stream` process partway through another run.'],
      expected: 'The app\'s prints and Logger lines reach the log pane, `logs` and step tails, with supplied values masked as [value:<key>]. A run with no app output reads empty, and a lost source reads unavailable. The killed app ends the run APP_EXITED. The normal stop at the end of a run and the lost log stream produce no app diagnosis.' },
    android: { jevKey: true, evidence: [...RUN, E.logs],
      steps: [`Run ${LOG_PROBE} with a supplied value through CLI \`run\`, once with the log pane and once with \`--no-log-pane\`, then follow it with CLI \`logs\`.`,
        `Send \`adb shell am crash dev.jevbridge.diagnostic\` partway through a run of ${ANDROID_APP}.`,
        `Run ${LOG_PROBE} with intent extra \`mode\` set to \`anr\`.`, 'Kill the run\'s owned logcat process partway through another run.'],
      expected: 'System.out, System.err and logcat lines for the app\'s uid reach the log pane, `logs` and step tails, with supplied values masked as [value:<key>]. Empty output differs from an unavailable source. The crash ends the run APP_EXITED and the ANR ends it APP_NOT_RESPONDING, each named in the pane. The normal stop at the end of a run and the lost logcat stream produce no app diagnosis.' } },
  { slug: 'capture', title: 'Capture', line: 74, executor: 'operator',
    ios: { jevKey: false, storeActivation: false, evidence: [E.commands, 'Simulator screenshots before and after'],
      steps: ['With the diagnostic app open, run CLI `capture --profile <iOS profile>`, then CLI `capture` with no Android device configured.'],
      expected: 'Capture stays Android-only. It refuses the iOS profile with PROFILE_CONFLICT and the missing device with NO_DEVICE, both with exit 3, before any device work. The simulator and its app do not change.' },
    android: { jevKey: false, evidence: [E.commands, E.versions, E.admission, 'Device screenshots before and after'],
      steps: ['Open the diagnostic app on its confirmation screen.',
        'Without TYPESAFE_API_KEY in the environment, run CLI `capture`, then CLI `capture --jev`.', 'Start a second CLI `capture` while one holds the device.'],
      expected: 'Capture prints the current screen\'s elements, or Jev\'s text from the production renderer, and exits 0. It never launches, resets or stops the app, takes no screenshot, sends no Jev request and needs no key. The app stays on the same screen. The second capture refuses with DEVICE_BUSY and exit 3.' } },
  { slug: 'ownership-faults', title: 'Ownership and faults', line: 75, executor: 'operator',
    ios: { jevKey: true, evidence: [...RUN, E.mcp],
      steps: ['While CLI `run` holds the simulator, start MCP `start_scenario` on it.',
        'Cancel runs with MCP `cancel_run`, with SIGINT on CLI `run`, and by closing the MCP server.',
        `Repeat the Phase 1 fault experiments: a lost session-create reply, a lost action reply and a late action reply (${FAULTS}).`,
        'Kill the bridge process with SIGKILL mid-action, and shut the simulator down mid-run.', 'Start a new run after each fault.'],
      expected: 'The competing start refuses with DEVICE_BUSY. A cancelled run ends CANCELLED after cleanup. No fault replays a mutation, and no late reply revises a recorded outcome. A device that cannot be proven clean is quarantined with readable records. Recovery stops every owned component before the next run acquires the device.' },
    android: { jevKey: true, evidence: [...RUN, E.mcp],
      steps: ['While CLI `run` holds the device, start MCP `start_scenario` and CLI `capture` on it.',
        'Cancel runs with MCP `cancel_run`, with SIGINT on CLI `run`, and by closing the MCP server.',
        `Repeat the Phase 1 fault experiments: a lost session-create reply, a lost action reply and a late action reply (${FAULTS}).`,
        'Kill the bridge process with SIGKILL mid-action, and close the emulator mid-run.', 'Start a new run after each fault.'],
      expected: 'The competing start and capture refuse with DEVICE_BUSY. A cancelled run ends CANCELLED after cleanup. No fault replays a mutation, and no late reply revises a recorded outcome. A device that cannot be proven clean is quarantined with readable records. Recovery stops every owned component before the next run acquires the device.' },
    phone: { jevKey: true, evidence: [...RUN, E.mcp],
      steps: ['While CLI `run` holds the phone, start MCP `start_scenario` and CLI `capture` on it.',
        'Cancel runs with MCP `cancel_run`, with SIGINT on CLI `run`, and by closing the MCP server.',
        `Repeat the Phase 1 fault experiments: a lost session-create reply, a lost action reply and a late action reply (${FAULTS}).`,
        'Kill the bridge process with SIGKILL mid-action, and unplug the phone\'s USB cable mid-run.', 'Start a new run after each fault.'],
      expected: 'The competing start and capture refuse with DEVICE_BUSY. A cancelled run ends CANCELLED after cleanup. No fault replays a mutation, and no late reply revises a recorded outcome. A phone that cannot be proven clean is quarantined with readable records. Recovery stops every owned component before the next run acquires the phone.' } },
  { slug: 'public-evidence', title: 'Public evidence', line: 76, executor: 'operator',
    ios: { jevKey: true, evidence: [...RUN, E.mcp],
      steps: [`Run ${IOS_APP}/scenario.json through CLI \`run\`, CLI \`run --json\` and MCP \`start_scenario\`, then read each with CLI \`report\` and MCP \`get_report\`.`,
        'Open the watch URL with its token, with another run\'s token, and after the bridge exits.',
        'Compare the diagnostic failure with an automation fault, an unsupported attach and an unconfirmed action.'],
      expected: 'Reports, report.json fields, run.jsonl events, evidence file names and exit codes match the frozen goldens. The planted bug fails the run with exit 1. The automation fault, unsupported action and unknown outcome end INCONCLUSIVE with exit 2 and their own reasons, never as an app failure. The watch page opens only its own run, and only while the bridge runs. Evidence files stay private to the user.' },
    android: { jevKey: true, evidence: [...RUN, E.mcp],
      steps: [`Run ${ANDROID_APP}/scenario.json through CLI \`run\`, CLI \`run --json\` and MCP \`start_scenario\`, then read each with CLI \`report\` and MCP \`get_report\`.`,
        'Open the watch URL with its token, with another run\'s token, and after the bridge exits.',
        'Compare the diagnostic failure with an automation fault, an attach with another app in front and an unconfirmed action.'],
      expected: 'Reports, report.json fields, run.jsonl events, evidence file names and exit codes match the frozen goldens. The planted bug fails the run with exit 1. The automation fault, refused attach and unknown outcome end INCONCLUSIVE with exit 2 and their own reasons, never as an app failure. The watch page opens only its own run, and only while the bridge runs. Evidence files stay private to the user.' } },
  { slug: 'repeated-cleanup', title: 'Repeated cleanup', line: 77, executor: 'cycles',
    ios: { jevKey: true, evidence: [E.cycles, E.commands, E.versions, E.admission, E.artifacts],
      steps: ['Run at least 20 independent scenario cycles through scripts/phase4/live/run.ts. Each cycle is one scripted run with no `do` step that ends at its only checkpoint.',
        'Read the fence inventory after every cycle.'],
      expected: 'After every cycle the simulator is available with no owner and the attempt is released. The fence\'s read inventory holds no owned WDA runner, Appium process group or native helper. Each next run starts normally.' },
    android: { jevKey: true, evidence: [E.cycles, E.commands, E.versions, E.admission, E.artifacts],
      steps: ['Run at least 20 independent scenario cycles through scripts/phase4/live/run.ts. Each cycle is one scripted run with no `do` step that ends at its only checkpoint.',
        'Read the fence inventory after every cycle.'],
      expected: 'After every cycle the device is available with no owner and the attempt is released. The fence\'s read inventory holds no owned UiAutomator2 processes, forward, changed settings, Appium process group or native helper. Each next run starts normally.' } },
];

const categoryId = (index: number, slug: string, device: DeviceScope) => `B${index + 1}-${slug}-${device}`;
const covering = (slug: string, devices: readonly DeviceScope[] = DEVICE_SCOPES) => {
  const index = CATEGORIES.findIndex(category => category.slug === slug);
  return `Covered by ${devices.map(device => categoryId(index, slug, device)).join(', ')}.`;
};

const CATEGORY_ROWS: LiveRow[] = CATEGORIES.flatMap((category, index) => DEVICE_SCOPES.map((device): LiveRow => {
  const spec = device === 'ios-simulator' ? category.ios : device === 'android-phone' ? category.phone ?? category.android : category.android;
  const name = DEVICE_NAMES[device];
  return { id: categoryId(index, category.slug, device), group: 'category', title: `${category.title} on the ${name}`, source: `${ACCEPTANCE}:${category.line}`,
    devices: [device], steps: [`Build and install ${device === 'ios-simulator' ? IOS_APP : ANDROID_APP} on the assigned ${name}.`, ...spec.steps],
    expected: spec.expected, evidence: spec.evidence, needs: needs([device], spec.jevKey, spec.storeActivation ?? true), executor: category.executor, status: 'untested' };
}));

const OBSERVED_ROW: LiveRow = { id: 'B10-observed-single-tap-preparation-ios-simulator', group: 'observed', title: 'Observed single-tap and preparation on the iOS simulator',
  source: `${ACCEPTANCE}:64-65`, devices: ['ios-simulator'],
  steps: ['Complete the offline migration in docs/guide/admission-activation.md, then set JEV_EXPERIMENTAL_OBSERVED=1.',
    'Prepare an allocation with CLI `observed-allocate` and MCP `prepare_observed_allocation`, and read it with `observed-allocation` and `get_observed_allocation`.',
    'Start one authored tap with CLI `observed-action` and MCP `start_observed_action`, and read it with `observed-report` and `get_observed_action`.',
    'Repeat an identical request, send a changed request under the same identity, then cancel and retire through the CLI and MCP equivalents.'],
  expected: 'Preparation reserves, readies and parks one dedicated simulator. The tap returns its observed outcome with before and after predicates and sends no Jev request. An identical request returns the same result with no new device work. A changed request conflicts without touching the device. Allocations stay retained within the limit of eight.',
  evidence: [E.commands, E.observed, E.mcp, E.screenshots, E.versions, E.admission, E.artifacts], needs: KEY_FREE(['ios-simulator']), executor: 'operator', status: 'untested' };

type Claim = { slug: string; title: string; source: string; devices: DeviceScope[]; steps: string[]; expected: string; evidence: string[] };
const BOTH: DeviceScope[] = ['ios-simulator', 'android-emulator'];
const ANDROID: DeviceScope[] = ['android-emulator', 'android-phone'];
/** Each Phase 4 live claim the Phase 3 exit handed over; a claim with its own FOLLOW-UPS entry cites that entry. Every claim starts a scripted run, so each needs the key. */
const CLAIMS: Claim[] = [
  { slug: 'two-screen-sizes', title: 'Two screen sizes', source: RESUME, devices: ANDROID,
    steps: [covering('driven-interaction', ANDROID), 'Record both screen sizes and the scaled tap points beside those rows.'],
    expected: 'A `tapAt` answer lands on its target on two different screen sizes, scaled from screenshot pixels.', evidence: [E.covering, E.screenshots, E.versions] },
  { slug: 'live-console-logcat-exit-watch', title: 'iOS console and Android logcat and exit watch live', source: RESUME, devices: [...DEVICE_SCOPES],
    steps: [covering('logs-health')],
    expected: 'The iOS console and log stream, and the Android logcat stream and exit watch, deliver app output and exits live during real runs.', evidence: [E.covering, E.logs] },
  { slug: 'twenty-cycles', title: '20 cycles', source: RESUME, devices: [...DEVICE_SCOPES],
    steps: [covering('repeated-cleanup')],
    expected: 'At least 20 independent cycles pass on each device category with no owned component left behind.', evidence: [E.covering, E.cycles] },
  { slug: 'the-phone', title: 'The phone', source: RESUME, devices: ['android-phone'],
    steps: [`Covered by ${CATEGORIES.map((category, index) => categoryId(index, category.slug, 'android-phone')).join(', ')}.`, 'Use only the exclusively assigned phone. Never borrow a connected phone.'],
    expected: 'Every category passes on the assigned physical phone. Emulator results do not stand in for it.', evidence: [E.covering, E.versions] },
  { slug: 'node-24', title: 'Node 24', source: RESUME, devices: BOTH,
    steps: ['Install Node 24.0.0, the minimum that package.json engines allow.', 'Run each diagnostic scenario through CLI `run` and MCP `start_scenario` under Node 24.0.0.'],
    expected: 'Runs, reports and cleanup under Node 24.0.0 behave as under the current Node.', evidence: [...RUN, E.mcp] },
  { slug: 'real-home-fresh-keyboard', title: 'Real-HOME and fresh-keyboard effects', source: RESUME, devices: ['ios-simulator'],
    steps: ['Read the user\'s Simulator and DeviceHub preferences under the real ~/Library.', `Run ${WEATHER} through CLI \`run\` on a freshly created simulator, typing into its search field.`,
      'Read the real preferences and the fresh simulator\'s keyboard settings again.'],
    expected: 'The Appium child writes Simulator and DeviceHub preferences only under the bridge\'s private HOME. The real ~/Library preferences are unchanged. The fresh simulator keeps the hardware keyboard off, and typing works.', evidence: [...RUN, 'Preference reads before and after'] },
  { slug: 'simulator-presentation', title: 'Simulator window presentation and the presentation read', source: `${FOLLOW_UPS}:97`, devices: ['ios-simulator'],
    steps: [`Run ${IOS_APP}/scenario.json through CLI \`run\` with the simulator shown in Simulator.app, then with it headless.`, 'Toggle the window once while a run starts.'],
    expected: 'A shown simulator\'s window comes to the front, and a headless one stays headless. The presentation read and the stack\'s own check agree, or the run records the mismatch. No run restarts the simulator or quits Simulator.app.', evidence: [...RUN, 'Window state before and after'] },
  { slug: 'terminate-before-android-restart', title: '`jev_terminate_app` before an Android restart', source: `${FOLLOW_UPS}:96`, devices: ANDROID,
    steps: ['Leave the diagnostic app running in front.', `Run ${ANDROID_APP}/scenario.json through CLI \`run\` with the default restart, several times in a row.`],
    expected: 'Each restart stops the old app process before the relaunch. No run quarantines the device because the old pid outlived force-stop.', evidence: RUN },
  { slug: 'plugin-install-real-release', title: 'Plugin install from a real release', source: RESUME, devices: BOTH,
    steps: ['Install the Claude Code plugin from a published release, not from this checkout.', 'Run each diagnostic scenario through the plugin\'s MCP `start_scenario`.'],
    expected: 'The released plugin installs cleanly and its MCP server starts. Each diagnostic run fails on the planted $3 total.', evidence: [...RUN, E.mcp, 'Release tag and plugin version'] },
  { slug: 'non-us-keyboard-layouts', title: 'Non-US keyboard layouts', source: RESUME, devices: ['ios-simulator'],
    steps: ['Add a non-US keyboard layout, such as German or Japanese, to the simulator.', `On ${WEATHER}, type a supplied value with that layout's characters and a leading hyphen through CLI \`run\`.`],
    expected: 'The field shows the typed value exactly. The run neither refuses it nor raises UNSUPPORTED_LEADING_DASH_TEXT.', evidence: RUN },
  { slug: 'ios-xcode-warning-doctor', title: 'Unsupported iOS runtime or Xcode warning and `doctor`', source: `${FOLLOW_UPS}:89`, devices: ['ios-simulator'],
    steps: [`Run ${IOS_APP}/scenario.json through CLI \`run\` on a simulator runtime and Xcode pair outside the stack's supported list.`, 'Run the `doctor` command the Phase 3 spec names.'],
    expected: 'The run warns and continues, and the report names the unsupported pair. `doctor` reports the same pair. Phase 3 left both unwired.', evidence: RUN },
  { slug: 'private-simulator-set', title: 'Private simulator set support', source: `${FOLLOW_UPS}:94`, devices: ['ios-simulator'],
    steps: ['Create a simulator in a non-default device set and point SIMCTL_DEVICE_SET_PATH at it.', `Run ${IOS_APP}/scenario.json on it through CLI \`run\`.`],
    expected: 'Unless Phase 4 decides to support private sets, the run refuses with DEVICE_IDENTITY_UNAVAILABLE and NONDEFAULT_DEVICE_SET before any device effect. The decision is recorded beside the result.', evidence: [E.commands, E.report, E.versions, E.admission] },
  { slug: 'two-devices-at-once', title: 'Two devices at once', source: `${FOLLOW_UPS}:15`, devices: BOTH,
    steps: ['Start the diagnostic scenario on the iOS simulator and on the Android emulator at the same time, each through its own CLI `run`.', 'Repeat with two assigned simulators at once.'],
    expected: 'Every run reaches its verdict. Each session gets its own host ports, and no session create fails on a port collision.', evidence: RUN },
  { slug: 'replace-text-locator', title: 'Replace-text locator without identifiers', source: `${FOLLOW_UPS}:29`, devices: BOTH,
    steps: [`On ${WEATHER}, replace the text of a field found by label alone through CLI \`run\`, then of a field that has neither identifier nor label.`,
      `On Android, replace the text of a Compose field with no resource id, and of a classic EditText in ${PROBE}.`],
    expected: 'A field with a unique identifier or label is replaced and its shown value read back. An iOS field with neither, or one that shares its name with another text field, is refused before input. The Android fields without a resource id are found by their bounds and replaced.', evidence: RUN },
  { slug: 'settle-deadline-close', title: 'Close after an observe that hits the settle deadline', source: `${FOLLOW_UPS}:102`, devices: BOTH,
    steps: [`Through CLI \`run\`, observe a screen that keeps changing past the settle deadline while its page source is pending, such as the infinite spinner in ${PROBE}.`,
      'Read the device state after close, then start a new run.'],
    expected: 'If close throws UI_ACTION_UNCONFIRMED, the device is quarantined with readable records, and recovery leaves no owned component. The device end state is recorded, and the next run either acquires the device or refuses truthfully.', evidence: RUN },
];

const CARRY_OVER_ROWS: LiveRow[] = CLAIMS.map(({ slug, ...claim }): LiveRow =>
  ({ id: `P3-${slug}`, group: 'carry-over', ...claim, needs: KEYED(claim.devices), executor: 'operator', status: 'untested' }));

const PREPARATION_RULES = [
  'Before allocation, verify store authority, capacity and storage, and build the unchanged fixture app in isolated DerivedData.',
  'Each preparation uses exactly one create, boot, install and launch, with fresh unique declared IDs. Count every listing, readiness and action capture and every backend call.',
  'Retain the device, refusal and quarantine included, within eight held allocations. Stop on uncertainty, unknown creation, exhausted capacity or unexplained effects. Never replay, replace, erase, delete, shut down or reset.',
];
const BASELINE_CASES: { id: string; line: number; title: string; sequence: string[]; expected: string }[] = [
  { id: 'L01', line: 118, title: 'CLI prepare, CLI action and MCP get', sequence: ['Prepare with CLI `observed-allocate`.', 'Act with CLI `observed-action`.', 'Read the action with MCP `get_observed_action`.'],
    expected: 'The fixture moves from Home to Details. The outcome is outcome_observed with attempted and acknowledged true, one touch, no relaunch and at least two captures.' },
  { id: 'L02', line: 119, title: 'MCP prepare and start, CLI report', sequence: ['Prepare with MCP `prepare_observed_allocation`.', 'Start with MCP `start_observed_action`.', 'Read the action with CLI `observed-report`.'],
    expected: 'Home is already satisfied. Attempted and acknowledged are false, with no input and one capture.' },
  { id: 'L03', line: 120, title: 'CLI prepare, MCP start and CLI report', sequence: ['Prepare with CLI `observed-allocate`.', 'Start with MCP `start_observed_action`.', 'Read the action with CLI `observed-report`.'],
    expected: 'The Details precondition is absent. The action ends PRECONDITION_NOT_MET with attempted and acknowledged false, no input and one capture, and the allocation is retained.' },
  { id: 'L04', line: 121, title: 'Recording MCP harness prepare and start, fresh CLI retrieval, conflict and legacy successor',
    sequence: ['Prepare and start through the recording MCP harness, withholding one successful real touch reply before acknowledgement.', 'Retrieve with a fresh CLI `observed-report`, send a conflicting request, and run the legacy successor.'],
    expected: 'The action ends UI_ACTION_UNCONFIRMED with attempted and acknowledged persisted as null, and the device is quarantined. The raw success is retained. The successors, the retrieval and the conflict make no backend calls. The synthetic loss covers only that scope.' },
  { id: 'L05', line: 122, title: 'MCP prepare, separate CLI action and MCP get', sequence: ['Prepare with MCP `prepare_observed_allocation`.', 'Act with a separate CLI `observed-action`.', 'Read the action with MCP `get_observed_action`.'],
    expected: 'The Weather Settings sheet is unchanged. The outcome is outcome_observed with one touch, no relaunch and at least two captures, and the snapshot and JPEG agree.' },
];
const BASELINE_ROWS: LiveRow[] = BASELINE_CASES.map(({ id, line, title, sequence, expected }): LiveRow => ({ id, group: 'baseline', title: `${id} ${title}`,
  source: `${BASELINE}:${line}`, devices: ['ios-simulator'], steps: [PREPARATION_RULES[0]!, ...sequence, ...PREPARATION_RULES.slice(1)], expected,
  evidence: [E.commands, E.observed, E.mcp, 'Backend call and capture counts', E.versions, E.admission, E.artifacts], needs: KEY_FREE(['ios-simulator']), executor: 'operator', status: 'untested' }));

export const LIVE_MATRIX: LiveMatrix = { version: 1, spec: `${ACCEPTANCE}:61-86`, rows: [...CATEGORY_ROWS, OBSERVED_ROW, ...CARRY_OVER_ROWS, ...BASELINE_ROWS] };

const ALL = [...DEVICE_SCOPES];
const IOS: DeviceScope[] = ['ios-simulator'];
const LIVE_PROOF = 'A passing live matrix row that uses it';
const mode = (id: string, source: string, devices: DeviceScope[], modeNeeds: Needs, requirement: string): IndexEntry =>
  ({ id: `M-${id}`, requirement, source, devices, needs: modeNeeds, evidence: [LIVE_PROOF] });
const observedCli = (name: string, line: number, does: string) => mode(`cli-${name}`, `src/cli.ts:${line}`, IOS, KEY_FREE(IOS), `CLI \`${name}\` ${does}, with no Jev key.`);
const observedMcp = (name: string, line: number, does: string) => mode(`mcp-${name.replaceAll('_', '-')}`, `src/mcp/observed.ts:${line}`, IOS, KEY_FREE(IOS), `MCP \`${name}\` ${does}, with no Jev key.`);

export const PUBLIC_MODES: IndexEntry[] = [
  mode('scripted-v1', `${PHASE3}:520`, ALL, KEYED(ALL), 'Scripted version 1 keeps its defaults, selectors and guards, actions, waits, checkpoints, typed values, false-wins verdict and stable reports and exits.'),
  mode('driven-v2', `${PHASE3}:521`, ALL, KEYED(ALL), 'Driven version 2 keeps its enablement, preflight and local-only policy, budgets, search decisions, hand-back package and pause ownership.'),
  mode('cli-run', 'src/cli.ts:32', ALL, KEYED(ALL), 'CLI `run` keeps its options, prose and `--json` reports and exit codes 0 to 3, 130 and 143.'),
  mode('cli-report', 'src/cli.ts:33', ALL, KEYED(ALL), 'CLI `report` prints a recorded run\'s report again and returns the run\'s exit code.'),
  mode('cli-logs', 'src/cli.ts:34', ALL, KEYED(ALL), 'CLI `logs` follows a live run\'s app output with supplied values masked.'),
  mode('cli-capture', 'src/cli.ts:35', ANDROID, KEY_FREE(ANDROID), 'CLI `capture` prints the current Android screen, one JSON line per element, with no launch, restart, screenshot or Jev key.'),
  mode('cli-capture-jev', 'src/cli.ts:53-54', ANDROID, KEY_FREE(ANDROID), 'CLI `capture --jev` prints Jev\'s text for the current Android screen from the production renderer, with no Jev request.'),
  mode('cli-mcp', 'src/cli.ts:36', ALL, KEYED(ALL), 'CLI `mcp` starts the stdio MCP server, and closing it cancels its runs.'),
  observedCli('observed-allocate', 37, 'prepares one dedicated simulator allocation'),
  observedCli('observed-allocation', 38, 'reads an allocation, waiting up to `--wait-ms`'),
  observedCli('observed-retire', 39, 'retires an allocation'),
  observedCli('observed-allocation-cancel', 40, 'cancels an allocation\'s preparation'),
  observedCli('observed-action', 41, 'starts one observed tap'),
  observedCli('observed-report', 42, 'reads an action\'s outcome, waiting up to `--wait-ms`'),
  observedCli('observed-cancel', 43, 'cancels an action'),
  mode('mcp-start-scenario', 'src/mcp/index.ts:35', ALL, KEYED(ALL), 'MCP `start_scenario` starts one run and returns its runId, watchUrl and logsCommand.'),
  mode('mcp-get-report', 'src/mcp/index.ts:48', ALL, KEYED(ALL), 'MCP `get_report` returns progress while a run is going and the full report when it ends, waiting up to 45000 ms.'),
  mode('mcp-cancel-run', 'src/mcp/index.ts:60', ALL, KEYED(ALL), 'MCP `cancel_run` stops a run and waits for its inconclusive verdict and device cleanup.'),
  mode('mcp-resolve-step', 'src/mcp/index.ts:66', ALL, KEYED(ALL), 'MCP `resolve_step` answers a paused `do` step and is published only with driven mode on.'),
  observedMcp('start_observed_action', 37, 'starts one observed tap on a prepared allocation'),
  observedMcp('prepare_observed_allocation', 39, 'prepares one dedicated simulator'),
  observedMcp('get_observed_action', 42, 'reads an action\'s outcome'),
  observedMcp('cancel_observed_action', 45, 'cancels an action'),
  observedMcp('get_observed_allocation', 46, 'reads an allocation'),
  observedMcp('cancel_observed_allocation', 49, 'cancels an allocation\'s preparation'),
  observedMcp('retire_observed_allocation', 50, 'retires an allocation'),
  mode('watch-url', 'docs/guide/06-running.md:137', ALL, KEYED(ALL), 'The watch URL opens a local page with each step, screenshot, judgment and verdict, for its own run only and only while the bridge runs.'),
  mode('log-pane', 'docs/guide/06-running.md:138-149', ALL, KEYED(ALL), 'The log pane shows the app\'s own output with supplied values masked, says when the app dies, and ends with the verdict and the evidence path.'),
  mode('headless-logs', 'docs/guide/06-running.md:152', ALL, KEYED(ALL), 'With `--no-log-pane`, JEV_LOG_PANE=off or no desktop session, the bridge prints a `logs` command instead, and MCP returns it as logsCommand.'),
  mode('device-window', 'docs/guide/06-running.md:136', IOS, KEYED(IOS), 'An iOS run brings its simulator window to the front unless `--no-device-window` or JEV_DEVICE_WINDOW=off, and never boots a simulator.'),
];

const cutover = (id: string, line: string, requirement: string, evidence: string[], devices: DeviceScope[] = []): IndexEntry =>
  ({ id: `CUT${id}`, requirement, source: `${ACCEPTANCE}:${line}`, devices, needs: devices.length ? KEYED(devices) : HOST, evidence });

export const CUTOVER_STEPS: IndexEntry[] = [
  cutover('1-appium-routes', '92-94', 'Route all public device work through the shared Appium composition. Audit CLI and MCP, the scenario factory, Android capture, observed preparation and action, direct native commands, logs and health, and presentation exceptions.',
    ['Route audit with file and line references', 'A test that fails on any legacy route']),
  cutover('2-legacy-removal', '95-98', 'Remove MobileBuildMCP and mobilecli UI execution, their runtime dependencies, vendor-only settings, setup and plugin references, and AXe input. Keep historical readers, device-selection migration, bounded helpers and native-study exclusions. No fallback remains.',
    ['Dependency and source audit of the packaged artifact', 'List of retained historical readers']),
  cutover('3-adr-notes', '99-101', 'Write the ADR supersession notes for the provider and AXe choices, keep the bounded creation and presentation constraints, and document only tested categories and exclusivity with old binaries and external tools.',
    ['ADR diffs', 'Documentation diff naming the tested categories']),
  cutover('4a-full-checks', '102', 'Repeat the affected contract checks and the full checks.', ['Typecheck, full check and golden results with pass counts']),
  cutover('4b-clean-install', '102-103', 'Build the package and the plugin, and verify a clean installation of each.', ['Build and install commands with outputs', 'Clean environment description']),
  cutover('4c-shipped-docs', '103', 'Check the shipped documentation and its links in the installed artifact.', ['Link check output over the packaged docs']),
  cutover('4d-prerequisites-entry-points', '103-104', 'Verify the pinned runtime prerequisites and that every public entry point is usable from the installed artifact.', ['Prerequisite versions', 'Entry point commands with outputs']),
  cutover('4e-node-minimum', '104-105', 'Validate behaviour on the minimum Node runtime where the SDK, SQLite or runtime APIs require it.', ['Node version and check results on the minimum runtime']),
  cutover('4f-quickstart', '105-106', 'Run the documented quickstart against the built artifact installed in the clean environment.', [E.commands, E.report, E.versions], BOTH),
  cutover('4g-artifact-record', '106-108', 'Record the artifact hash, the installation and quickstart commands, their results and the evidence paths.', ['Artifact SHA-256', E.commands, E.artifacts]),
  cutover('4h-provenance-match', '108-109', 'Verify that the reported runtime provenance and the package and plugin release metadata match the built artifact, and keep the comparison in this index.',
    ['Provenance from a quickstart report.json', 'Package and plugin metadata', 'The comparison']),
];
