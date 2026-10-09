import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { parseReadonlyMountMetadata } from '../src/observed/installed-plist.js';

// Retained diskutil fixture: no host command or filesystem lookup is performed.
const actualDiskutilXml = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>APFSContainerFree</key>\n\t<integer>503599104</integer>\n\t<key>APFSContainerReference</key>\n\t<string>disk7</string>\n\t<key>APFSContainerSize</key>\n\t<integer>18559795200</integer>\n\t<key>APFSPhysicalStores</key>\n\t<array>\n\t\t<dict>\n\t\t\t<key>APFSPhysicalStore</key>\n\t\t\t<string>disk6s1</string>\n\t\t</dict>\n\t</array>\n\t<key>APFSSnapshot</key>\n\t<false/>\n\t<key>Bootable</key>\n\t<true/>\n\t<key>BusProtocol</key>\n\t<string>Disk Image</string>\n\t<key>CanBeMadeBootable</key>\n\t<false/>\n\t<key>CanBeMadeBootableRequiresDestroy</key>\n\t<false/>\n\t<key>CapacityInUse</key>\n\t<integer>18008752128</integer>\n\t<key>Content</key>\n\t<string>41504653-0000-11AA-AA11-00306543ECAC</string>\n\t<key>DeviceBlockSize</key>\n\t<integer>4096</integer>\n\t<key>DeviceIdentifier</key>\n\t<string>disk7s1</string>\n\t<key>DeviceNode</key>\n\t<string>/dev/disk7s1</string>\n\t<key>DeviceTreePath</key>\n\t<string>IODeviceTree:/</string>\n\t<key>DiskUUID</key>\n\t<string>C0B81AA8-8A69-4A06-AE40-431F3203E52F</string>\n\t<key>Ejectable</key>\n\t<true/>\n\t<key>EjectableMediaAutomaticUnderSoftwareControl</key>\n\t<true/>\n\t<key>EjectableOnly</key>\n\t<true/>\n\t<key>Encryption</key>\n\t<false/>\n\t<key>EncryptionThisVolumeProper</key>\n\t<false/>\n\t<key>FileVault</key>\n\t<false/>\n\t<key>FilesystemName</key>\n\t<string>APFS</string>\n\t<key>FilesystemType</key>\n\t<string>apfs</string>\n\t<key>FilesystemUserVisibleName</key>\n\t<string>APFS</string>\n\t<key>FreeSpace</key>\n\t<integer>0</integer>\n\t<key>GlobalPermissionsEnabled</key>\n\t<true/>\n\t<key>IOKitSize</key>\n\t<integer>18559795200</integer>\n\t<key>IORegistryEntryName</key>\n\t<string>iOS 27.0 Simulator</string>\n\t<key>Internal</key>\n\t<false/>\n\t<key>Locked</key>\n\t<false/>\n\t<key>MediaName</key>\n\t<string></string>\n\t<key>MediaType</key>\n\t<string>Generic</string>\n\t<key>MountPoint</key>\n\t<string>/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ</string>\n\t<key>OSInternalMedia</key>\n\t<false/>\n\t<key>ParentWholeDisk</key>\n\t<string>disk7</string>\n\t<key>PartitionMapPartition</key>\n\t<false/>\n\t<key>RAIDMaster</key>\n\t<false/>\n\t<key>RAIDSlice</key>\n\t<false/>\n\t<key>Removable</key>\n\t<true/>\n\t<key>RemovableMedia</key>\n\t<true/>\n\t<key>RemovableMediaOrExternalDevice</key>\n\t<true/>\n\t<key>SMARTDeviceSpecificKeysMayVaryNotGuaranteed</key>\n\t<dict/>\n\t<key>SMARTStatus</key>\n\t<string>Not Supported</string>\n\t<key>Sealed</key>\n\t<string>Yes</string>\n\t<key>Size</key>\n\t<integer>18559795200</integer>\n\t<key>SupportsGlobalPermissionsDisable</key>\n\t<true/>\n\t<key>SystemImage</key>\n\t<false/>\n\t<key>TotalSize</key>\n\t<integer>18559795200</integer>\n\t<key>VolumeAllocationBlockSize</key>\n\t<integer>4096</integer>\n\t<key>VolumeName</key>\n\t<string>iOS 27.0 Simulator</string>\n\t<key>VolumeSize</key>\n\t<integer>0</integer>\n\t<key>VolumeUUID</key>\n\t<string>C0B81AA8-8A69-4A06-AE40-431F3203E52F</string>\n\t<key>WholeDisk</key>\n\t<false/>\n\t<key>Writable</key>\n\t<false/>\n\t<key>WritableMedia</key>\n\t<false/>\n\t<key>WritableVolume</key>\n\t<false/>\n</dict>\n</plist>\n';
const observedMountPoint = '/private/var/run/com.apple.security.cryptexd/mnt/com.apple.iPhoneOS.SimulatorRuntime-v24.1.434.0.iVUyCZ';

test('readonly mount metadata parses the retained 3108-byte diskutil XML and requires the exact mount', () => {
  assert.equal(Buffer.byteLength(actualDiskutilXml), 3108);
  assert.equal(createHash('sha256').update(actualDiskutilXml).digest('hex'), '338fdeb495a2a8d58be5e79ed9d2637d64bdbb6c7e9ba552b3aa345a34f2562d');
  assert.deepEqual(parseReadonlyMountMetadata(actualDiskutilXml, observedMountPoint),
    { MountPoint: observedMountPoint, Writable: false, WritableMedia: false, WritableVolume: false });
});

const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n';
const mountFields = `<key>MountPoint</key><string>${observedMountPoint}</string><key>Writable</key><false/><key>WritableMedia</key><false/><key>WritableVolume</key><false/>`;
const document = (body: string) => `${xmlHeader}<plist version="1.0"><dict>${body}</dict></plist>`;
const withUnknown = (value: string) => document(`${mountFields}<key>Ignored</key>${value}`);

for (const [name, xml] of [
  ['missing declaration', document(mountFields).replace('<?xml version="1.0" encoding="UTF-8"?>', '')],
  ['different encoding', document(mountFields).replace('UTF-8', 'UTF-16')],
  ['different doctype', document(mountFields).replace('http://www.apple.com/DTDs/PropertyList-1.0.dtd', 'file:///private/external.dtd')],
  ['internal entity declaration', document(mountFields).replace('PropertyList-1.0.dtd">', 'PropertyList-1.0.dtd" [<!ENTITY injected "external">]>')],
  ['additional doctype', document(mountFields).replace('<plist', '<!DOCTYPE plist SYSTEM "file:///private/foreign"><plist')],
  ['wrong plist version', document(mountFields).replace('plist version="1.0"', 'plist version="2.0"')],
  ['missing closing plist', document(mountFields).replace('</plist>', '')],
  ['trailing markup', document(mountFields) + '<dict/>'],
  ['trailing text', document(mountFields) + 'unconfirmed'],
  ['duplicate required field', document(mountFields + '<key>Writable</key><false/>')],
  ['decoded duplicate required field', document(mountFields + '<key>Writ&#97;ble</key><true/>')],
  ['duplicate unknown key', withUnknown('<dict><key>nested</key><string>a</string><key>nested</key><string>b</string></dict>')],
  ['key without value', document(mountFields + '<key>unfinished</key>')],
  ['value without key', document(mountFields + '<false/>')],
  ['unsupported tag', withUnknown('<null/>')],
  ['element attribute', withUnknown('<string source="foreign">x</string>')],
  ['mixed scalar markup', withUnknown('<string>before<true/>after</string>')],
  ['comment', withUnknown('<!-- unconfirmed --><string>x</string>')],
  ['processing instruction', withUnknown('<?foreign read="external"?><string>x</string>')],
  ['CDATA', withUnknown('<string><![CDATA[foreign]]></string>')],
  ['unknown entity', withUnknown('<string>&external;</string>')],
  ['unterminated entity', withUnknown('<string>&amp</string>')],
  ['nul numeric reference', withUnknown('<string>&#0;</string>')],
  ['surrogate numeric reference', withUnknown('<string>&#xD800;</string>')],
  ['out of range numeric reference', withUnknown('<string>&#x110000;</string>')],
  ['invalid numeric reference', withUnknown('<string>&#xGG;</string>')],
  ['invalid literal character', withUnknown('<string>\u0000</string>')],
  ['unpaired surrogate', withUnknown('<string>\ud800</string>')],
  ['forbidden text close', withUnknown('<string>]]></string>')],
  ['invalid integer', withUnknown('<integer>1.5</integer>')],
  ['invalid real', withUnknown('<real>NaN</real>')],
  ['overflowing real', withUnknown('<real>1e9999</real>')],
  ['invalid date', withUnknown('<date>2026-02-30T00:00:00Z</date>')],
  ['invalid base64', withUnknown('<data>@@@</data>')],
  ['noncanonical base64 padding', withUnknown('<data>YR==</data>')],
  ['mismatched nested closing tag', withUnknown('<array><string>x</integer></array>')],
  ['nested writable substitute', document('<key>MountPoint</key><string>' + observedMountPoint + '</string><key>Unknown</key><dict><key>Writable</key><false/><key>WritableMedia</key><false/><key>WritableVolume</key><false/></dict>')],
  ['input above 64KiB', document(mountFields) + ' '.repeat(65537 - Buffer.byteLength(document(mountFields)))],
  ['depth above 32', withUnknown('<array>'.repeat(30) + '<string>x</string>' + '</array>'.repeat(30))],
  ['nodes above 8192', withUnknown('<array>' + '<true/>'.repeat(8181) + '</array>')],
] as const) test(`readonly mount metadata refuses ${name}`, () => {
  assert.throws(() => parseReadonlyMountMetadata(xml, observedMountPoint), /Unconfirmed readonly mount metadata/);
});

for (const field of ['Writable', 'WritableMedia', 'WritableVolume']) for (const value of ['<true/>', '<string>false</string>', '<integer>0</integer>', '<array><false/></array>']) {
  test(`readonly mount metadata refuses ${field} as ${value}`, () => {
    assert.throws(() => parseReadonlyMountMetadata(document(mountFields.replace(`<key>${field}</key><false/>`, `<key>${field}</key>${value}`)), observedMountPoint));
  });
}
for (const field of ['MountPoint', 'Writable', 'WritableMedia', 'WritableVolume']) test(`readonly mount metadata requires ${field} at the root`, () => {
  const missing = field === 'MountPoint' ? mountFields.replace(`<key>MountPoint</key><string>${observedMountPoint}</string>`, '')
    : mountFields.replace(`<key>${field}</key><false/>`, '');
  assert.throws(() => parseReadonlyMountMetadata(document(missing), observedMountPoint));
});

test('readonly mount metadata refuses a different mount or coerced MountPoint type', () => {
  assert.throws(() => parseReadonlyMountMetadata(document(mountFields), observedMountPoint + '/different'));
  assert.throws(() => parseReadonlyMountMetadata(document(mountFields.replace(`<string>${observedMountPoint}</string>`, '<integer>0</integer>')), '0'));
});
