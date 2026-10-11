/**
 * Pure, unexecuted draft of the L04 callback decision. This module installs no
 * hooks and issues no effects. The future recorder must supply independently
 * retained raw receipts and the exact already-authorized touch argv binding.
 */
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => plain(value) && Object.keys(value).length > 0;
const sameStrings = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length === b.length && a.every((value, index) => typeof value === 'string' && value === b[index]);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function createL04CallbackDecision(binding) {
  if (!plain(binding) || binding.row !== 'L04' || binding.phase !== 'action'
      || typeof binding.executable !== 'string' || !binding.executable.startsWith('/')
      || !Array.isArray(binding.argv) || binding.argv.length !== 7
      || typeof binding.argv[0] !== 'string' || !binding.argv[0].startsWith('/')
      || binding.argv[1] !== 'ui-automation' || binding.argv[2] !== 'touch'
      || binding.argv[3] !== '--json' || binding.argv[5] !== '--output' || binding.argv[6] !== 'json'
      || !hash(binding.reviewedDispatchTokenSha256) || !hash(binding.requestSha256)) {
    throw new Error('INVALID_REVIEWED_L04_BINDING');
  }
  const payload = JSON.parse(binding.argv[4]);
  if (!plain(payload) || Object.keys(payload).sort().join(',') !== 'delay,down,elementRef,simulatorId,up'
      || payload.down !== true || payload.up !== true || payload.delay !== 0.05
      || typeof payload.elementRef !== 'string' || payload.elementRef.length === 0
      || typeof payload.simulatorId !== 'string'
      || !/^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/.test(payload.simulatorId)) {
    throw new Error('INVALID_EXACT_TOUCH_BINDING');
  }
  const expectedExecutable = binding.executable;
  const expectedArgv = [...binding.argv];
  let decided = false;
  return function decide(receipt) {
    if (decided) throw new Error('L04_CALLBACK_ALREADY_DECIDED');
    decided = true;
    if (!plain(receipt) || receipt.executable !== expectedExecutable
        || !sameStrings(receipt.argv, expectedArgv) || receipt.callbackError !== null
        || receipt.actualCloseCode !== 0 || receipt.actualCloseSignal !== null
        || typeof receipt.actualCloseAtUtc !== 'string' || !Number.isFinite(Date.parse(receipt.actualCloseAtUtc))
        || receipt.rawReceiptDurablyRetained !== true || !hash(receipt.stdoutSha256)
        || !hash(receipt.stderrSha256) || receipt.truncated !== false
        || typeof receipt.stdout !== 'string' || typeof receipt.stderr !== 'string') {
      throw new Error('L04_REAL_SUCCESS_NOT_ESTABLISHED');
    }
    const envelope = JSON.parse(receipt.stdout);
    if (!plain(envelope) || envelope.didError === true
        || envelope.schema !== 'mobilebuildmcp.output.ui-action-result'
        || !['2', '3'].includes(envelope.schemaVersion)
        || !plain(envelope.data) || !nonempty(envelope.data.artifacts) || !nonempty(envelope.data.action)) {
      throw new Error('L04_TERMINAL_SUCCESS_NOT_ESTABLISHED');
    }
    // Passing real successful stdout with a nonzero error is unsafe: the
    // production parser can mark such a payload terminalAcknowledged=true.
    const error = new Error('SYNTHETIC_REPLY_WITHHELD_AFTER_RETAINED_REAL_SUCCESS');
    error.code = 'HARNESS_REPLY_WITHHELD';
    return { callback: { error, stdout: '', stderr: '' }, injected: true,
      classification: 'synthetic reply loss before driver parse/acknowledgement',
      rawStdoutSha256: receipt.stdoutSha256, rawStderrSha256: receipt.stderrSha256 };
  };
}
