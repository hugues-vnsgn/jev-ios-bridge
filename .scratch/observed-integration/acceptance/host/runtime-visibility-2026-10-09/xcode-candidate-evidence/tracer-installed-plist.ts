export type ReadonlyMountMetadata = { MountPoint: string; Writable: false; WritableMedia: false; WritableVolume: false };

export function parseReadonlyMountMetadata(xml: string, expectedMountPoint: string): ReadonlyMountMetadata {
  const mount = /<key>MountPoint<\/key>\s*<string>([^<]*)<\/string>/.exec(xml)?.[1];
  if (mount !== expectedMountPoint || !['Writable', 'WritableMedia', 'WritableVolume'].every(key =>
    new RegExp(`<key>${key}</key>\\s*<false\\s*/>`).test(xml))) throw new Error('Unconfirmed readonly mount metadata');
  return { MountPoint: mount, Writable: false, WritableMedia: false, WritableVolume: false };
}
