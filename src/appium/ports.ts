import { createServer } from 'node:net';
import type { AppiumPlatform } from './wire-schemas.js';
import { appiumComponentSchema, type AppiumComponent } from './fence/schema.js';

/** The host ports one command's automation listens on. Allocated per admission, never fixed, so two devices can run at once. */
export type HostPorts =
  | { platform: 'ios'; wdaLocalPort: number; mjpegServerPort: number }
  | { platform: 'android'; systemPort: number };

/** UiAutomator2's server port on the device; the host `systemPort` is forwarded to it. */
export const UIAUTOMATOR2_DEVICE_PORT = 6790;

export type FreePort = () => Promise<number>;

/** A free TCP port on the loopback interface, found by binding port 0. */
export const freeHostPort: FreePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.unref();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => typeof address === 'object' && address ? resolve(address.port) : reject(new Error('No port was bound')));
  });
});

export async function allocateHostPorts(platform: 'ios', freePort?: FreePort): Promise<Extract<HostPorts, { platform: 'ios' }>>;
export async function allocateHostPorts(platform: 'android', freePort?: FreePort): Promise<Extract<HostPorts, { platform: 'android' }>>;
export async function allocateHostPorts(platform: AppiumPlatform, freePort?: FreePort): Promise<HostPorts>;
export async function allocateHostPorts(platform: AppiumPlatform, freePort: FreePort = freeHostPort): Promise<HostPorts> {
  if (platform === 'ios') {
    const wdaLocalPort = await freePort();
    let mjpegServerPort = await freePort();
    while (mjpegServerPort === wdaLocalPort) mjpegServerPort = await freePort();
    return { platform, wdaLocalPort, mjpegServerPort };
  }
  return { platform, systemPort: await freePort() };
}

/** The fence components these ports imply: Android's owned forward, by value. iOS ports open no forward. */
export function portComponents(ports: HostPorts, serial: string, id: () => string): AppiumComponent[] {
  if (ports.platform === 'ios') return [];
  return [appiumComponentSchema.parse({ id: id(), kind: 'appium-forward', serial, local: `tcp:${String(ports.systemPort)}`, remote: `tcp:${String(UIAUTOMATOR2_DEVICE_PORT)}` })];
}
