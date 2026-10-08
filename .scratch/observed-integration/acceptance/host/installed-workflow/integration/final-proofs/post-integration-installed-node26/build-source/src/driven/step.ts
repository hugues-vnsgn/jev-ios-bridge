// The driven step loop: performs one `do` step by asking Jev for each action, with code-owned rules around it.
//
// Per observation, in order: a localOnly step goes to Claude (no Jev call); a destructive step goes to Claude
// without asking Jev until Claude has acted in it; after that Jev is asked as usual on each screen, but its pick is
// never taken (acceptDecision hands it back), so only its done check counts; a back-and-forth between two screens
// (A→B→A→B) goes to Claude; past DECISIONS_PER_STEP Jev decisions the step goes to Claude once, and after Claude's
// action one last Jev call checks completion, else the step ends STEP_NOT_DONE. Otherwise Jev is asked, unless the
// screen is a system permission dialog (C17) or a local-only screen (E14): those go to Claude unasked. The step
// is done when the "step done" Noul reads yes on that observation (C4): every observation is taken after the
// step's last action, so it is fresh. Jev's choice alone never completes a step.
//
// A pick that `acceptDecision` (policy.ts) sends back as NONE_FITS or LOW_CONFIDENCE first gets a look again, at most
// LATE_SCREEN_LOOKS per step: after LATE_SCREEN_WAIT_MS the screen is captured again, and if it changed by itself
// (a launch screen, a list still loading) Jev is asked about it instead. Otherwise the miss starts the target search
// from that new capture, since a driver acts only on its latest one (E9): scroll down up to SEARCH_SCROLLS times, then up, asking Jev again after each scroll that changed the
// screen, while the screen has a scrollable element or no scroll was tried yet; its screens count toward A→B→A→B.
// A screen without a scrollable element whose search scroll changed nothing isn't scrolled to search again in the
// run (`DrivenSearchMemory`, keyed by `searchScreenKey`); a new screen still gets its one try.
// A test_write step without a passed preflight never searches: its actions all go to Claude (E12). An accepted pick
// is performed, unless it is a test write without a passed preflight, a `back` the iOS driver would carry out on a
// risky control, or the same action's third pick in the step (E10); a screen the action left unchanged gets one
// retry, then goes to Claude (E10).
//
// Going to Claude calls the injected `handback` (Issue 08's gate) with Jev's numbers on the paused screen (its
// choice, the Choice confidence the floor is compared with, and the done Noul) and the run's own copy of the
// screenshot, then performs its answer: an action
// (`decidedBy: "claude"`), after which the stuck history and the target search start over, `revise`, or `stop`.
// The run log gets `decision`, `search`, `handback` and `handback_answer` events beside the run's own `step` and
// `action` events; none carries screen text. Nothing here reads a key or the clock beyond what the context gives.
import { createHash, randomUUID } from 'node:crypto';
import type { Action, ActPath, Element, Platform, RunLog, Snapshot } from '../contracts/index.js';
import { backButtonOf, StaleSnapshotError } from '../device/index.js';
import type { DoStep, ScriptedStep } from '../scripted/contracts.js';
import { ScriptedJevError } from '../scripted/jev.js';
import { renderAssertionState, ScriptedObservationError } from '../scripted/observe.js';
import { describeElement, isAppErrorDialog, isPermissionDialog } from './candidates.js';
import { maskElement, maskSnapshot, prepareDecision, topChoices, type DrivenDecision, type PreparedDecision }
  from './decide.js';
import { acceptDecision, CONFIDENCE_FLOOR, doneVerdict, type HandBackReason } from './policy.js';

/** E10: at most this many Jev decisions per step. */
export const DECISIONS_PER_STEP = 8;
/** E9: the target search scrolls at most this many times each way. */
export const SEARCH_SCROLLS = 3;
/** E10: Jev picking the same action this many times in a step goes to Claude instead. */
export const SAME_ACTION_PICKS = 3;
/** A screen still loading (a launch screen, a list filling in) looks like a miss: before the target search, the step
 *  waits this long and captures again, and a screen that changed by itself goes back to Jev instead of being scrolled. */
export const LATE_SCREEN_WAIT_MS = 1_000;
/** At most this many such looks per step, so a screen that keeps changing (a timer) can't hold a step. */
export const LATE_SCREEN_LOOKS = 3;
/** How many of Jev's picks a hand-back package carries. */
export const TOP_CHOICES = 3;

/** Why a step went to Claude. */
export type PauseReason = HandBackReason
  /** C17: the screen is a system permission dialog, which Jev never answers. */
  | 'PERMISSION_DIALOG'
  /** C17: the screen is Android's app error dialog ("isn't responding", "keeps stopping"), which Jev never answers. */
  | 'APP_ERROR_DIALOG'
  /** The step is `localOnly`: none of its screens goes to Jev. */
  | 'LOCAL_ONLY_STEP'
  /** A test write Jev picked, with no passed preflight (E12). */
  | 'NO_PREFLIGHT'
  /** The screen couldn't be rendered for Jev (truncated, empty, too large). */
  | 'UNREADABLE_SCREEN'
  /** E10: an action left the screen unchanged, and so did its retry. */
  | 'SCREEN_UNCHANGED'
  /** E10: Jev picked the same action a third time in the step. */
  | 'REPEATED_ACTION'
  /** E10: the screens went A→B→A→B. */
  | 'SCREEN_LOOP'
  /** E10: the step used its Jev decisions. */
  | 'DECISION_BUDGET'
  /** E14: an element on the screen matches a project `localOnlyScreens` rule, so the screen isn't sent to Jev. */
  | 'LOCAL_ONLY_SCREEN'
  /** Claude's element action was for a screen that changed before it could be performed. */
  | 'SCREEN_CHANGED';

/** What Claude sees while the step waits for an answer. `snapshot` is for checking the answer, not for display. */
export interface HandbackPacket {
  pauseId: string;
  reason: PauseReason;
  stepId: string;
  intent: string;
  doneWhen: string;
  /** The screen as Jev reads it, typed values masked; empty when the screen can't be rendered. */
  screen: string;
  /** The run's own copy of the paused screenshot (`screen-N.jpg` in the run folder), as the run log names it. */
  screenshotPath?: string;
  /** Jev's likeliest picks on this screen by each option's probability, highest first; empty when Jev wasn't asked
   *  about it. An option's probability is not the confidence the bridge compares with the floor. */
  topChoices: { key: string; probability: number }[];
  /** The numbers the bridge decided with on this screen: Jev's choice, its Choice confidence and the "step done"
   *  Noul. Absent when Jev wasn't asked about the screen. */
  jevDecision?: JevNumbers;
  /** The confidence Jev's pick needs in this step (CONFIDENCE_FLOOR); null when the bridge never takes Jev's pick
   *  here (a destructive step, or a test write without a passed preflight). */
  confidenceFloor?: number | null;
  /** The value keys this step may type. */
  valueKeys: string[];
  /** The paused screen: answer refs name its elements. */
  snapshot: Snapshot;
}

/** Claude's answer: exactly one action, or `revise` (validated like a script, ending at a checkpoint), `done` (Claude
 *  declares the step done), or `stop`. */
export type HandbackAnswer =
  | { kind: 'tap'; ref: string }
  | { kind: 'tapAt'; x: number; y: number }
  | { kind: 'type'; ref: string; valueKey: string }
  | { kind: 'scroll'; direction: 'up' | 'down' }
  | { kind: 'back' }
  | { kind: 'revise'; steps: ScriptedStep[] }
  | { kind: 'done' }
  | { kind: 'stop' };

/** Jev's choice, its Choice confidence and the "step done" Noul: the numbers the bridge decides with. */
export type JevNumbers = Pick<DrivenDecision, 'choice' | 'confidence' | 'done'>;

/** What the target search learned in this run, shared by its `do` steps. */
export interface DrivenSearchMemory {
  /** Screens (by `searchScreenKey`) with no scrollable element that a search scroll left unchanged: they aren't
   *  scrolled to search again. */
  unchangedFlatScreens: Set<string>;
}

export function createSearchMemory(): DrivenSearchMemory {
  return { unchangedFlatScreens: new Set() };
}

/** The screen the search memory keys on: its hash, else a hash of its visible elements' role, label and identifier
 *  (refs and frames change between captures of the same screen). */
export function searchScreenKey(snapshot: Snapshot): string {
  if (snapshot.screenHash !== undefined) return `hash:${snapshot.screenHash}`;
  const visible = snapshot.elements.filter(element => element.state?.visible !== false)
    .map(({ role, label, identifier }) => [role, label ?? null, identifier ?? null]);
  return `elements:${createHash('sha256').update(JSON.stringify(visible)).digest('hex')}`;
}

/** The seam Issue 08's gate implements: pause holding the device, return Claude's answer. */
export type Handback = (packet: HandbackPacket, signal: AbortSignal) => Promise<HandbackAnswer>;

export interface DrivenStepContext {
  step: DoStep;
  /** The run's step number, for the log. */
  stepNumber: number;
  /** The script's goal, if it has one. */
  goal?: string;
  platform: Platform;
  /** Every value the script may type, by key: masked in everything Jev reads. */
  values: Readonly<Record<string, string>>;
  /** Whether the project preflight passed, so Jev may perform a `test_write` step's actions (E12). */
  testWritesAllowed: boolean;
  /** The run's search memory, shared across its `do` steps; a step without one starts fresh. */
  searchMemory?: DrivenSearchMemory;
  /** E14: whether the screen must not be sent to Jev; checked before every Jev call. */
  localOnlyScreen?(snapshot: Snapshot): boolean;
  log: RunLog;
  /** The next screen: the last action's settled screen, else a fresh capture. Logs the run's `step` event. */
  observe(): Promise<Snapshot>;
  /** Asks Jev, timed and abortable; the run adds the tokens. */
  decide(prepared: PreparedDecision): Promise<DrivenDecision>;
  /** Performs one action on `snapshot`; counts toward the run's maxSteps. Throws StaleSnapshotError untouched. */
  act(action: Action, snapshot: Snapshot): Promise<{ actDurationMs: number }>;
  /** How the driver performed the last back or scroll. */
  actPath(): ActPath | undefined;
  /** Waits, abortably, before looking again at a screen that may still be loading; absent, no wait. */
  pause?(milliseconds: number): Promise<void>;
  /** The hand-back gate (a {@link Handback}), called abortably: waits for Claude's answer. */
  awaitAnswer(packet: HandbackPacket): Promise<HandbackAnswer>;
}

export type DrivenStepOutcome =
  | { kind: 'done' }
  /** Claude replaced the steps after this one; this step ends here. */
  | { kind: 'revised'; steps: ScriptedStep[] }
  | { kind: 'stopped' }
  /** The step ended without its done evidence. */
  | { kind: 'notDone' };

const SEARCH_REASONS: ReadonlySet<PauseReason> = new Set(['NONE_FITS', 'LOW_CONFIDENCE']);

/** The same screen, as the run compares them: its hash, else its elements without refs. */
function screenIdentity(snapshot: Snapshot): string {
  return snapshot.screenHash ?? JSON.stringify(snapshot.elements.map(withoutRef));
}

function scrollable(snapshot: Snapshot): boolean {
  return snapshot.elements.some(element => element.state?.visible === true && element.actions.includes('swipeWithin'));
}

function withoutRef({ ref: _ref, ...element }: Element): Omit<Element, 'ref'> {
  return element;
}

function elementIdentity(element: Element): string {
  return JSON.stringify(withoutRef(element));
}

/** The run-log fields for how the driver carried out a back or scroll. */
function pathFields(path: ActPath | undefined): Record<string, unknown> {
  if (!path) return {};
  return { actPath: path.path, ...('targetRef' in path ? { actPathRef: path.targetRef } : {}) };
}

const SCROLL_LINES = { up: 'Scroll toward the top', down: 'Scroll toward the bottom' } as const;

/** The element an element action targets on `snapshot`. */
function targetOf(action: Action, snapshot: Snapshot): Element | undefined {
  return action.targetRef === undefined ? undefined
    : snapshot.elements.find(candidate => candidate.ref === action.targetRef);
}

/** The action pointed at the same element on another capture of the same screen; undefined when the screen changed
 *  or the element isn't there. Refs can change between captures, so an element is matched by everything but its ref. */
function onScreen(action: Action, from: Snapshot, to: Snapshot): Action | undefined {
  // A changed screen hands back, even for an action with no target (back, scroll).
  if (screenIdentity(to) !== screenIdentity(from)) return undefined;
  const target = targetOf(action, from);
  if (!target) return action.targetRef === undefined ? action : undefined;
  const match = to.elements.find(element => elementIdentity(element) === elementIdentity(target));
  return match ? { ...action, targetRef: match.ref } as Action : undefined;
}

/** Jev's decision about `from`, its keys pointed at the same elements on `to`, another capture of the same screen: refs
 *  can change between captures. A key whose element isn't found on `to` keeps its ref. */
function carryDecision(decision: DrivenDecision, from: Snapshot, to: Snapshot): DrivenDecision {
  const refs = new Map<string, string>();
  const unmatched = [...to.elements];
  for (const element of from.elements) {
    const index = unmatched.findIndex(candidate => elementIdentity(candidate) === elementIdentity(element));
    if (index >= 0) refs.set(element.ref, unmatched.splice(index, 1)[0]!.ref);
  }
  const rekey = (key: string) => key.replace(/^(tap|type):([^:]+)/, (whole, kind: string, ref: string) =>
    refs.has(ref) ? `${kind}:${refs.get(ref)!}` : whole);
  return { ...decision, choice: rekey(decision.choice),
    probabilities: Object.fromEntries(Object.entries(decision.probabilities).map(([key, probability]) => [rekey(key), probability])) };
}

/** A plain-language line for Jev's recent actions; prepareDecision masks typed values in it. */
function describeAction(action: Action, snapshot: Snapshot): string {
  const element = targetOf(action, snapshot);
  const target = element ? `the ${describeElement(element)}` : 'an element';
  switch (action.kind) {
    case 'tap': return `Tap ${target}`;
    case 'type': return `Replace the text of ${target} with the plan value ${action.valueKey}`;
    case 'swipe': return `Swipe ${action.direction} within ${target}`;
    case 'scroll': return SCROLL_LINES[action.direction];
    case 'back': return 'Go back';
    case 'tapAt': return `Tap at x ${action.x}, y ${action.y} on the screenshot`;
  }
}

function answerAction(answer: Exclude<HandbackAnswer, { kind: 'revise' | 'done' | 'stop' }>): Action {
  switch (answer.kind) {
    case 'tap': return { kind: 'tap', targetRef: answer.ref };
    case 'type': return { kind: 'type', targetRef: answer.ref, valueKey: answer.valueKey };
    case 'scroll': return { kind: 'scroll', direction: answer.direction };
    case 'back': return { kind: 'back' };
    case 'tapAt': return { kind: 'tapAt', x: answer.x, y: answer.y };
  }
}

/** The action's fields for the log: its kind and target, never a typed value. */
function actionFields(action: Action): Record<string, unknown> {
  switch (action.kind) {
    case 'tap': return { action: 'tap', resolvedRef: action.targetRef };
    case 'type': return { action: 'type', resolvedRef: action.targetRef, valueKey: action.valueKey };
    case 'swipe': return { action: 'swipe', resolvedRef: action.targetRef, direction: action.direction };
    case 'scroll': return { action: 'scroll', direction: action.direction };
    case 'back': return { action: 'back' };
    case 'tapAt': return { action: 'tapAt', x: action.x, y: action.y };
  }
}

/** The action's target as reports and run logs name it, by role, label and identifier with typed values masked
 *  (ADR-0002): its ref is only a position in one capture. Nothing for an action with no target. */
function targetFields(action: Action, snapshot: Snapshot, values: Readonly<Record<string, string>>): Record<string, unknown> {
  const element = targetOf(action, snapshot);
  if (!element) return {};
  const { role, label, identifier } = maskElement(element, values);
  return { target: { role, ...(label ? { label } : {}), ...(identifier ? { identifier } : {}) } };
}

type Asked =
  | { kind: 'unreadable' }
  | { kind: 'localOnly' }
  | { kind: 'permission' }
  | { kind: 'appError' }
  | { kind: 'asked'; decision: DrivenDecision; prepared: PreparedDecision };

/** Why Jev wasn't asked about a screen. */
function unasked(asked: Exclude<Asked, { kind: 'asked' }>): PauseReason {
  switch (asked.kind) {
    case 'localOnly': return 'LOCAL_ONLY_SCREEN';
    case 'permission': return 'PERMISSION_DIALOG';
    case 'appError': return 'APP_ERROR_DIALOG';
    case 'unreadable': return 'UNREADABLE_SCREEN';
  }
}

export async function runDrivenStep(ctx: DrivenStepContext): Promise<DrivenStepOutcome> {
  const { step } = ctx;
  const where = { step: ctx.stepNumber, stepId: step.id };
  const valueKeys = step.values ?? [];
  // E12: without a passed preflight, every action of a test_write step is Claude's, scrolls to search included.
  const writesBlocked = step.effect === 'test_write' && !ctx.testWritesAllowed;
  const confidenceFloor = step.effect === 'destructive' || writesBlocked ? null : CONFIDENCE_FLOOR[step.effect];
  const searchMemory = ctx.searchMemory ?? createSearchMemory();
  const recentActions: string[] = [];
  let decisions = 0;
  let claudeActed = false;
  // Claude acted since Jev was last asked: past the budget, that action gets its completion check.
  let claudeJustActed = false;
  let budgetHandedBack = false;
  let scrollTried = false;
  let lateLooks = 0;
  // Stuck history, cleared after each of Claude's actions: Jev's picks per key, the screens since, the search.
  let picks = new Map<string, number>();
  let screens: string[] = [];
  let searched = false;
  const resetStuck = (snapshot: Snapshot) => { picks = new Map(); screens = [screenIdentity(snapshot)]; searched = false; };

  const seeScreen = (snapshot: Snapshot) => {
    const identity = screenIdentity(snapshot);
    if (screens.at(-1) !== identity) screens.push(identity);
  };
  const looping = (): boolean => {
    const [a, b, c, d] = screens.slice(-4);
    return screens.length >= 4 && a === c && b === d && a !== b;
  };

  const ask = async (snapshot: Snapshot): Promise<Asked> => {
    if (isPermissionDialog(snapshot.elements, ctx.platform)) return { kind: 'permission' };
    if (isAppErrorDialog(snapshot.elements, ctx.platform)) return { kind: 'appError' };
    if (ctx.localOnlyScreen?.(snapshot)) return { kind: 'localOnly' };
    let prepared: PreparedDecision;
    try {
      prepared = prepareDecision({ ...(ctx.goal === undefined ? {} : { goal: ctx.goal }), intent: step.intent,
        doneWhen: step.doneWhen, snapshot, platform: ctx.platform, valueKeys, values: ctx.values, recentActions });
    } catch (error) {
      if (error instanceof ScriptedObservationError ||
          (error instanceof ScriptedJevError && error.code === 'REQUEST_BUDGET')) return { kind: 'unreadable' };
      throw error;
    }
    const decision = await ctx.decide(prepared);
    decisions++;
    const stepDone = doneVerdict(decision.done) === 'yes';
    await ctx.log.append('decision', { ...where, decision: decisions, options: decision.options,
      choice: decision.choice, confidence: decision.confidence, done: decision.done,
      inputTokens: decision.inputTokens, latencyMs: decision.latencyMs, ...(stepDone ? { stepDone: true } : {}) });
    return { kind: 'asked', decision, prepared };
  };

  /** Jev's decision on `snapshot`, the screen it was asked about. A `back` is checked against the button the iOS
   *  driver would tap for it (the same helper); Android's Back key has no control. */
  const judge = (asked: Extract<Asked, { kind: 'asked' }>, snapshot: Snapshot) => {
    const backTarget = ctx.platform === 'ios' ? backButtonOf(snapshot) : undefined;
    return acceptDecision({ effect: step.effect, choice: asked.decision.choice, confidence: asked.decision.confidence,
      done: asked.decision.done, set: asked.prepared.set, ...(backTarget ? { backTarget } : {}) });
  };

  /** Carries out an action on `snapshot` and adds it to Jev's history: every device action of the step, the target
   *  search's scrolls included, goes through here. Undefined, having acted on nothing, when the snapshot went stale. */
  const carryOut = async (action: Action, snapshot: Snapshot): Promise<{ actDurationMs: number; path?: ActPath } | undefined> => {
    let actDurationMs: number;
    try { ({ actDurationMs } = await ctx.act(action, snapshot)); }
    catch (error) {
      if (error instanceof StaleSnapshotError) return undefined;
      throw error;
    }
    if (action.kind === 'scroll') scrollTried = true;
    recentActions.push(describeAction(action, snapshot));
    const path = action.kind === 'back' || action.kind === 'scroll' ? ctx.actPath() : undefined;
    return { actDurationMs, ...(path ? { path } : {}) };
  };

  /** Performs an action and returns the screen after it; a stale snapshot returns undefined, having acted on none. */
  const perform = async (action: Action, snapshot: Snapshot, fields: Record<string, unknown>): Promise<Snapshot | undefined> => {
    const carried = await carryOut(action, snapshot);
    if (!carried) return undefined;
    await ctx.log.append('action', { ...where, ...actionFields(action), ...targetFields(action, snapshot, ctx.values), ...fields,
      ...pathFields(carried.path), actDurationMs: carried.actDurationMs });
    return ctx.observe();
  };

  const screenText = (snapshot: Snapshot): string => {
    try {
      return renderAssertionState(maskSnapshot(snapshot, ctx.values), ctx.platform);
    } catch (error) {
      if (error instanceof ScriptedObservationError) return '';
      throw error;
    }
  };

  type Resolution = { kind: 'acted'; snapshot: Snapshot } | { kind: 'end'; outcome: DrivenStepOutcome };

  /** The run's own copy of the snapshot's screenshot, as the `step` event that observed it names it; the snapshot's
   *  own path only when no step event logged it. A driver's temp file can be cleaned up and isn't evidence. */
  const evidenceScreenshot = async (snapshot: Snapshot): Promise<string | undefined> => {
    const logged = (await ctx.log.read()).findLast(event => event.type === 'step' && event.data.step === ctx.stepNumber &&
      event.data.snapshotSequence === snapshot.sequence);
    if (!logged) return snapshot.screenshotPath;
    return typeof logged.data.screenshotPath === 'string' ? logged.data.screenshotPath : undefined;
  };

  /** Pauses for Claude, with Jev's decision on `snapshot` if it was asked, then performs the answer. */
  const handBack = async (reason: PauseReason, snapshot: Snapshot, decision?: DrivenDecision): Promise<Resolution> => {
    const pauseId = randomUUID();
    if (reason === 'DECISION_BUDGET') budgetHandedBack = true;
    await ctx.log.append('handback', { ...where, reason, pauseId });
    const screenshotPath = await evidenceScreenshot(snapshot);
    const answer = await ctx.awaitAnswer({ pauseId, reason, stepId: step.id, intent: step.intent,
      doneWhen: step.doneWhen, screen: screenText(snapshot), ...(screenshotPath ? { screenshotPath } : {}),
      topChoices: decision ? topChoices(decision.probabilities, TOP_CHOICES) : [],
      ...(decision ? { jevDecision: { choice: decision.choice, confidence: decision.confidence, done: decision.done } } : {}),
      confidenceFloor, valueKeys: [...valueKeys], snapshot });
    await ctx.log.append('handback_answer', { ...where, pauseId, kind: answer.kind,
      ...(answer.kind === 'done' ? { stepDone: true, decidedBy: 'claude' } : {}),
      ...(answer.kind === 'revise' ? { steps: answer.steps.map(revised => ({ id: revised.id, kind: revised.kind })) } : {}) });
    if (answer.kind === 'stop') return { kind: 'end', outcome: { kind: 'stopped' } };
    if (answer.kind === 'done') return { kind: 'end', outcome: { kind: 'done' } };
    if (answer.kind === 'revise') return { kind: 'end', outcome: { kind: 'revised', steps: answer.steps } };
    // A pause can last minutes and nothing watches the screen meanwhile, and a driver can't always tell its capture
    // went stale (Android's can't). So capture the screen again first: on the same screen the answer acts on the new
    // capture, its element found again; on a changed one nothing is done and Claude answers for it (ADR-0007).
    const action = answerAction(answer);
    const fresh = await ctx.observe();
    const moved = onScreen(action, snapshot, fresh);
    if (!moved) return handBack('SCREEN_CHANGED', fresh);
    const after = await perform(moved, fresh, { decidedBy: 'claude' });
    // Even the new capture went stale: the screen is still changing. A point or an element is never tried again.
    if (!after) return handBack('SCREEN_CHANGED', await ctx.observe());
    claudeActed = true;
    claudeJustActed = true;
    resetStuck(after);
    return { kind: 'acted', snapshot: after };
  };

  type Look =
    | { kind: 'changed'; snapshot: Snapshot }
    | { kind: 'same'; snapshot: Snapshot; decision: DrivenDecision };

  /** A miss may be a screen still loading: wait, then capture it again. */
  const lookAgain = async (shown: Snapshot, decision: DrivenDecision): Promise<Look> => {
    lateLooks++;
    await ctx.pause?.(LATE_SCREEN_WAIT_MS);
    const fresh = await ctx.observe();
    if (screenIdentity(fresh) !== screenIdentity(shown)) return { kind: 'changed', snapshot: fresh };
    // The same screen, in a new capture. A driver acts only on its latest capture (Android refuses an older one), so
    // the search starts from this one, with Jev's picks pointed at its refs.
    return { kind: 'same', snapshot: fresh, decision: carryDecision(decision, shown, fresh) };
  };

  type Found =
    | { kind: 'found'; snapshot: Snapshot; asked: Extract<Asked, { kind: 'asked' }> }
    | { kind: 'done' }
    | { kind: 'handBack'; reason: PauseReason; snapshot: Snapshot; decision?: DrivenDecision };

  /** E9: scrolls and asks again until Jev accepts a pick, the step is done, or the search runs out. */
  const search = async (start: Snapshot, reason: PauseReason, decision: DrivenDecision): Promise<Found> => {
    searched = true;
    let current = start;
    // Where the search would hand back: `current`, with Jev's decision about it (asked after each changed scroll).
    let last: Extract<Found, { kind: 'handBack' }> = { kind: 'handBack', reason, snapshot: start, decision };
    for (const direction of ['down', 'up'] as const) {
      for (let attempt = 1; attempt <= SEARCH_SCROLLS; attempt++) {
        const flat = !scrollable(current);
        if (flat && (scrollTried || searchMemory.unchangedFlatScreens.has(searchScreenKey(current)))) return last;
        // The budget ran out on a screen Jev was just asked about: the pause keeps that decision.
        if (decisions >= DECISIONS_PER_STEP) return { ...last, reason: 'DECISION_BUDGET' };
        const carried = await carryOut({ kind: 'scroll', direction }, current);
        if (!carried) return last;
        // The search event records whether the scroll changed the screen, so it follows the capture after it.
        const after = await ctx.observe();
        const changed = screenIdentity(after) !== screenIdentity(current);
        if (flat && !changed) searchMemory.unchangedFlatScreens.add(searchScreenKey(current));
        await ctx.log.append('search', { ...where, direction, attempt, changed,
          ...pathFields(carried.path), actDurationMs: carried.actDurationMs });
        // The hand-back names refs on the screen it shows: Jev's picks follow to the new capture.
        last = { ...last, snapshot: after, ...(last.decision ? { decision: carryDecision(last.decision, current, after) } : {}) };
        current = after;
        seeScreen(current);
        if (looping()) return { kind: 'handBack', reason: 'SCREEN_LOOP', snapshot: current };
        if (!changed) break;
        const asked = await ask(current);
        if (asked.kind !== 'asked') return { kind: 'handBack', reason: unasked(asked), snapshot: current };
        if (doneVerdict(asked.decision.done) === 'yes') return { kind: 'done' };
        const accepted = judge(asked, current);
        if (accepted.kind === 'accept') return { kind: 'found', snapshot: current, asked };
        if (accepted.kind === 'stepDone') return { kind: 'done' };
        last = { kind: 'handBack', reason: accepted.reason, snapshot: current, decision: asked.decision };
        if (!SEARCH_REASONS.has(accepted.reason)) return last;
      }
    }
    return last;
  };

  let snapshot = await ctx.observe();
  resetStuck(snapshot);
  while (true) {
    let resolution: Resolution | undefined;
    if (step.localOnly) resolution = await handBack('LOCAL_ONLY_STEP', snapshot);
    else if (step.effect === 'destructive' && !claudeActed) resolution = await handBack('DESTRUCTIVE_STEP', snapshot);
    else if (looping()) resolution = await handBack('SCREEN_LOOP', snapshot);
    else if (decisions >= DECISIONS_PER_STEP && !budgetHandedBack) {
      // Claude already answered another hand-back on the last decision: check that answer instead of asking again.
      if (claudeJustActed) budgetHandedBack = true;
      else resolution = await handBack('DECISION_BUDGET', snapshot);
    }
    if (resolution) {
      if (resolution.kind === 'end') return resolution.outcome;
      snapshot = resolution.snapshot;
      continue;
    }

    let asked = await ask(snapshot);
    claudeJustActed = false;
    if (asked.kind !== 'asked') {
      if (budgetHandedBack) return { kind: 'notDone' };
      const resolved = await handBack(unasked(asked), snapshot);
      if (resolved.kind === 'end') return resolved.outcome;
      snapshot = resolved.snapshot;
      continue;
    }
    if (doneVerdict(asked.decision.done) === 'yes') return { kind: 'done' };
    // Past the budget, the one Jev call after Claude's action only checks completion.
    if (budgetHandedBack) return { kind: 'notDone' };

    let accepted = judge(asked, snapshot);
    let decision: DrivenDecision | undefined = asked.decision;
    let reason: PauseReason | undefined = accepted.kind === 'handBack' ? accepted.reason : undefined;
    const searchFor = accepted.kind === 'handBack' && SEARCH_REASONS.has(accepted.reason) ? accepted.reason : undefined;
    if (searchFor && writesBlocked) reason = 'NO_PREFLIGHT';
    else if (searchFor && !searched) {
      let searchDecision = asked.decision;
      if (lateLooks < LATE_SCREEN_LOOKS) {
        // A screen that changed by itself goes back to Jev; an unchanged one is searched from the new capture.
        const look = await lookAgain(snapshot, asked.decision);
        snapshot = look.snapshot;
        if (look.kind === 'changed') {
          seeScreen(snapshot);
          continue;
        }
        searchDecision = look.decision;
      }
      const found = await search(snapshot, searchFor, searchDecision);
      if (found.kind === 'done') return { kind: 'done' };
      snapshot = found.snapshot;
      if (found.kind === 'handBack') {
        reason = found.reason;
        decision = found.decision;
      } else {
        asked = found.asked;
        decision = asked.decision;
        accepted = judge(asked, snapshot);
        reason = undefined;
      }
    }
    if (accepted.kind === 'stepDone') return { kind: 'done' };
    if (accepted.kind === 'accept' && reason === undefined) {
      const count = (picks.get(accepted.key) ?? 0) + 1;
      picks.set(accepted.key, count);
      if (writesBlocked) reason = 'NO_PREFLIGHT';
      else if (count >= SAME_ACTION_PICKS) reason = 'REPEATED_ACTION';
    }
    if (reason !== undefined || accepted.kind !== 'accept') {
      const resolved = await handBack(reason ?? 'NONE_FITS', snapshot, decision);
      if (resolved.kind === 'end') return resolved.outcome;
      snapshot = resolved.snapshot;
      continue;
    }

    const fields = { decidedBy: 'jev', key: accepted.key, confidence: asked.decision.confidence };
    const before = snapshot;
    const after = await perform(accepted.action, before, fields);
    if (!after) { snapshot = await ctx.observe(); continue; }
    snapshot = after;
    if (screenIdentity(after) === screenIdentity(before)) {
      // E10: one retry of the same action, then Claude.
      const again = onScreen(accepted.action, before, after);
      const retried = again ? await perform(again, after, { ...fields, retry: true }) : undefined;
      if (!retried) { snapshot = await ctx.observe(); continue; }
      snapshot = retried;
      if (screenIdentity(retried) === screenIdentity(after)) {
        const resolved = await handBack('SCREEN_UNCHANGED', snapshot, decision);
        if (resolved.kind === 'end') return resolved.outcome;
        snapshot = resolved.snapshot;
        continue;
      }
    }
    seeScreen(snapshot);
  }
}
