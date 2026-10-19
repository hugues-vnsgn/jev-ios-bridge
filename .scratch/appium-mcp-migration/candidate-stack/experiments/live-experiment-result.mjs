import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function experimentPassed(state, cleanup) {
  if (Object.keys(state).some(key => /[Ff]ailure$/.test(key))) return false;
  if (!state.roundTrip || !state.dispatchClosed || !state.final?.closed ||
      !state.descendantVerification?.verified || !state.hostStop?.groupStopped || !state.childStop?.recordedChildrenStopped ||
      !state.nativeStop?.deviceOffline || !state.nativeStop?.ownedPortsClosed) return false;
  if (state.faultExpected && (!state.lostReply?.failure || !state.retryBlockedBeforeWire ||
      !state.localClosureProof?.commandsUnchanged)) return false;
  return cleanup !== 'automation' || (state.releasePredicateRecorded === true &&
    state.automationFence?.ownedAutomationInert === true &&
    state.automationFence?.deviceRemainsRunning === true &&
    state.automationFence?.deviceShutdownIssued === false);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [path, cleanup] = process.argv.slice(2);
  const passed = experimentPassed(JSON.parse(readFileSync(path, 'utf8')), cleanup);
  console.log(JSON.stringify({ passed }));
  if (!passed) process.exitCode = 1;
}
