import { createHash } from 'node:crypto';

export function rawSha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The iOS freeze's convention (`digest` in spikes/scripted/harness.ts at 88ad659f1): object keys sorted
 *  recursively, array order kept, then SHA-256 of JSON.stringify. */
export function canonicalJsonSha256(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (isRecord(input)) return Object.fromEntries(Object.keys(input).sort().map(key => [key, canonical(input[key])]));
    return input;
  };
  return rawSha256(JSON.stringify(canonical(value)));
}
