import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { DeviceReasonError, deviceEnvironment } from '../index.js';
import { pinnedAgent } from './agent-supply.js';
async function isExecutableFile(path) {
    try {
        await access(path, constants.X_OK);
        return (await stat(path)).isFile();
    }
    catch {
        return false;
    }
}
/** Where `adb` may be, in order (open point 3): `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `PATH`, then the Android Studio default. */
function adbCandidates(environment, home) {
    const sdks = [environment.ANDROID_HOME, environment.ANDROID_SDK_ROOT].filter((sdk) => Boolean(sdk));
    const path = (environment.PATH ?? '').split(delimiter).filter(folder => isAbsolute(folder));
    return [
        ...sdks.map(sdk => join(sdk, 'platform-tools', 'adb')),
        ...path.map(folder => join(folder, 'adb')),
        join(home, 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
    ];
}
/** The first executable `adb` in lookup order. None found is `ANDROID_TOOLS_UNAVAILABLE`. */
export async function findAdb(options = {}) {
    for (const candidate of adbCandidates(options.environment ?? process.env, options.home ?? homedir())) {
        if (await isExecutableFile(candidate))
            return candidate;
    }
    throw new DeviceReasonError('ANDROID_TOOLS_UNAVAILABLE', 'adb could not be found in ANDROID_HOME, ANDROID_SDK_ROOT, PATH or ~/Library/Android/sdk/platform-tools. Install the Android SDK platform tools.');
}
/**
 * The environment for `adb`: `deviceEnvironment()`, so the Jev key never reaches it. `ANDROID_ADB_SERVER_PORT`
 * passes through unchanged, so `adb` talks to the adb server the user chose (a private one, in the release checks).
 */
export function adbEnvironment(source = process.env) {
    return deviceEnvironment(source);
}
/**
 * The tools check the Android driver runs before looking up the device, so a missing tool is reported first:
 * `adb`, then the pinned device agent. Either missing is `ANDROID_TOOLS_UNAVAILABLE`.
 */
export async function androidTools(options = {}) {
    const adb = await findAdb(options);
    const agent = await pinnedAgent(options);
    return { adb, agent };
}
