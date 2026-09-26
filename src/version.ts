import { createRequire } from 'node:module';

/** The one source of the bridge version: package.json, one level above both src/ and dist/. */
export const BRIDGE_VERSION: string = (createRequire(import.meta.url)('../package.json') as { version: string }).version;
