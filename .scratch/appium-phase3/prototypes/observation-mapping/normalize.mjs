import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mapAndroidTree} from '../../../../src/device/android/mapping.ts';
import {renderAssertionState} from '../../../../src/scripted/observe.ts';

const [platform, xmlPath] = process.argv.slice(2);
if (!['ios', 'android'].includes(platform) || !xmlPath) {
  throw new Error('Usage: node --import tsx normalize.mjs <ios|android> <xml-path>');
}
const parsed = JSON.parse(execFileSync('python3', [fileURLToPath(new URL('./normalize.py', import.meta.url)), platform, xmlPath], {encoding: 'utf8'}));
const elements = platform === 'android' ? mapAndroidTree(parsed) : parsed;
console.log(JSON.stringify({
  platform,
  completeness: 'unknown',
  elements,
  rendered: renderAssertionState({elements, truncated: false}, platform),
}, null, 2));
