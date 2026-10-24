import { isDeepStrictEqual } from 'node:util';
import { isAbsolute } from 'node:path';
import { z } from 'zod/v4';
import type { VerifiedStack } from './stack.js';
import type { PrivateAppiumClient } from './client.js';
import { AppiumError, capabilitiesSchema, platformSchema, type AppiumSessionId, type SessionCapabilities } from './wire-schemas.js';

const text = z.string().min(1).max(4096).refine(value => !value.includes('\0'));
const path = z.enum(['run', 'driven', 'capture', 'attach', 'observed-prepare', 'observed-action']);
const apkSchema = z.strictObject({ package: text, sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const profileInputSchema = z.discriminatedUnion('platform', [
  z.strictObject({ platform: z.literal('ios'), device: text, path, presentation: z.enum(['visible', 'headless']),
    simulatorSet: text.refine(isAbsolute).optional() }),
  z.strictObject({ platform: z.literal('android'), device: text, path, serverInstallation: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('install') }),
    z.strictObject({ kind: z.literal('verified'), device: text, apks: z.array(apkSchema).length(2) }),
  ]) }),
]);
export type SessionProfileInput = z.infer<typeof profileInputSchema>;
const profileSchema = z.strictObject({ platform: platformSchema, device: text, path, capabilities: capabilitiesSchema }).brand<'SessionProfile'>();
export type SessionProfile = z.infer<typeof profileSchema>;

export function createSessionProfile(stack: VerifiedStack, input: SessionProfileInput): SessionProfile {
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) throw new AppiumError('NOT_ALLOWED');
  const selection = parsed.data;
  if (selection.platform === 'ios' && (selection.path === 'attach' || !isAbsolute(stack.wdaRunner))) throw new AppiumError('NOT_ALLOWED');
  let capabilities: SessionCapabilities;
  const common = { 'appium:udid': selection.device, 'appium:noReset': true, 'appium:autoLaunch': false,
    'appium:shouldTerminateApp': false, 'appium:skipLogCapture': true };
  if (selection.platform === 'ios') {
    capabilities = { ...common, platformName: 'iOS', 'appium:automationName': 'XCUITest', 'appium:usePreinstalledWDA': true,
      'appium:prebuiltWDAPath': stack.wdaRunner, 'appium:wdaLaunchTimeout': 120000, 'appium:wdaLocalPort': 18100,
      'appium:mjpegServerPort': 18101, 'appium:simulatorPasteboardAutomaticSync': 'system', 'appium:connectHardwareKeyboard': false,
      'appium:isHeadless': selection.presentation === 'headless',
      ...(selection.simulatorSet === undefined ? {} : { 'appium:simulatorDevicesSetPath': selection.simulatorSet }) };
  } else {
    const installation = selection.serverInstallation;
    if (installation.kind === 'verified') {
      const expected = stack.manifest.androidApks.filter(apk => ['io.appium.uiautomator2.server', 'io.appium.uiautomator2.server.test'].includes(apk.package));
      if (installation.device !== selection.device || expected.length !== 2 || !expected.every(apk => installation.apks.some(installed => installed.package === apk.package && installed.sha256 === apk.sha256)))
        throw new AppiumError('NOT_ALLOWED');
    }
    capabilities = { ...common, platformName: 'Android', 'appium:automationName': 'UiAutomator2', 'appium:systemPort': 18200,
      'appium:mjpegServerPort': 0, 'appium:dontStopAppOnReset': true, 'appium:forceAppLaunch': false,
      'appium:skipDeviceInitialization': true, 'appium:skipServerInstallation': installation.kind === 'verified', 'appium:skipUnlock': true,
      'appium:skipLogcatCapture': true, 'appium:suppressKillServer': true, 'appium:autoGrantPermissions': false,
      'appium:adbExecTimeout': 120000, 'appium:uiautomator2ServerInstallTimeout': 120000 };
  }
  const profile = profileSchema.parse({ platform: selection.platform, device: selection.device, path: selection.path, capabilities });
  Object.freeze(profile.capabilities); return Object.freeze(profile);
}

export function validateSessionCapabilities(profile: SessionProfile, input: unknown): SessionCapabilities {
  const parsed = capabilitiesSchema.safeParse(input);
  if (!parsed.success || !isDeepStrictEqual(parsed.data, profile.capabilities)) throw new AppiumError('NOT_ALLOWED');
  return parsed.data;
}

type SessionState = 'ready' | 'paused' | 'lost' | 'closed';
export class AppiumCommandSession {
  private phase: SessionState = 'ready';
  private finishing: Promise<void> | undefined;
  private constructor(readonly client: PrivateAppiumClient, readonly profile: SessionProfile, readonly sessionId: AppiumSessionId) {}
  static async start({ client, profile, timeoutMs }: { client: PrivateAppiumClient; profile: SessionProfile; timeoutMs?: number }): Promise<AppiumCommandSession> {
    const created = await client.manageSession({ action: 'create', platform: profile.platform, capabilities: JSON.stringify(profile.capabilities) }, profile, timeoutMs);
    if (created.kind !== 'created') throw new AppiumError('ACKNOWLEDGEMENT_LOST');
    await client.applySettings(profile, timeoutMs);
    return new AppiumCommandSession(client, profile, created.sessionId);
  }
  get state(): SessionState { return this.phase; }
  pause(): void {
    if (this.phase !== 'ready') throw new AppiumError('NOT_ALLOWED');
    this.phase = 'paused';
  }
  async resume<T>(refresh: (sessionId: AppiumSessionId) => Promise<T>, replace?: () => Promise<AppiumCommandSession>): Promise<
    { kind: 'refreshed'; observation: T } | { kind: 'session-lost' } | { kind: 'handback'; session: AppiumCommandSession; observation: T }> {
    if (this.phase !== 'paused') throw new AppiumError('NOT_ALLOWED');
    try {
      if (!this.client.dispatchOpen) throw new AppiumError('CONNECTION_LOST');
      const observation = await refresh(this.sessionId);
      this.phase = 'ready'; return { kind: 'refreshed', observation };
    } catch (error) {
      if (error instanceof Error && 'code' in error && ['SESSION_MISMATCH', 'CONNECTION_LOST', 'ACKNOWLEDGEMENT_LOST', 'TIMEOUT'].includes(String(error.code))) {
        this.phase = 'lost'; this.client.stopDispatch();
        if (!replace) return { kind: 'session-lost' };
        await this.client.close();
        const session = await replace();
        const observation = await refresh(session.sessionId);
        return { kind: 'handback', session, observation };
      }
      throw error;
    }
  }
  finish(): Promise<void> {
    this.finishing ??= this.finishOnce(); return this.finishing;
  }
  private async finishOnce(): Promise<void> {
    try { await this.client.manageSession({ action: 'delete', sessionId: this.sessionId }, this.profile); }
    finally { this.phase = 'closed'; await this.client.close(); }
  }
}
