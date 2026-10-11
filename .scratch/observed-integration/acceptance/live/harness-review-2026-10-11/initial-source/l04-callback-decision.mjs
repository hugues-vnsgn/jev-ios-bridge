import { check } from './receipts.mjs';
export function withhold(receipt, callbackError) {
  check(callbackError === null && receipt.rawReceiptDurablyRetained && !receipt.truncated
    && receipt.actualCloseCode === 0 && receipt.actualCloseSignal === null, 'L04_REAL_CLOSE_NOT_PROVEN');
  const envelope = JSON.parse(receipt.stdout.toString('utf8'));
  const object = x => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length > 0;
  check(envelope.didError !== true && envelope.schema === 'mobilebuildmcp.output.ui-action-result'
    && ['2', '3'].includes(envelope.schemaVersion) && object(envelope.data?.artifacts) && object(envelope.data?.action), 'L04_SUCCESS_NOT_PROVEN');
  const error = new Error('SYNTHETIC_REPLY_WITHHELD_AFTER_RETAINED_REAL_SUCCESS');
  error.code = 'HARNESS_REPLY_WITHHELD';
  return [error, '', ''];
}
