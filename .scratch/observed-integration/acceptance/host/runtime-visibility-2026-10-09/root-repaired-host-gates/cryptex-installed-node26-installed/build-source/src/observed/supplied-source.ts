import { simulatorUuid, validSimulatorIdentifiers } from './create-source.js';
export type SuppliedInventoryEntry = {
  inventoryId: string; udid: string; deviceTypeId: string; runtimeId: string;
  creation: { createdAt: string; origin: string; evidenceRef: string };
  attestation: { freshUnused: true; exclusive: true };
};
export type SuppliedSourceResult =
  | { status: 'selected'; source: Readonly<SuppliedInventoryEntry> }
  | { status: 'refused'; reason: 'INVENTORY_EXHAUSTED' | 'INVENTORY_INELIGIBLE' };
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 500 && !value.includes('\0');
/** Selection only: the allocator must reserve and check exclusions before vendor availability checks. */
export function selectSuppliedSource(inventoryId: string, inventory: readonly unknown[]): SuppliedSourceResult {
  const entries = inventory.filter((item): item is SuppliedInventoryEntry => !!item && typeof item === 'object' && 'inventoryId' in item && item.inventoryId === inventoryId);
  if (!entries.length) return { status: 'refused', reason: 'INVENTORY_EXHAUSTED' };
  const entry = entries[0]!;
  if (!text(inventoryId) || entries.length !== 1 || typeof entry.udid !== 'string' || !simulatorUuid.test(entry.udid)
    || !validSimulatorIdentifiers(entry.deviceTypeId, entry.runtimeId)
    || !entry.creation || !text(entry.creation.origin) || !text(entry.creation.evidenceRef)
    || !text(entry.creation.createdAt) || !Number.isFinite(Date.parse(entry.creation.createdAt))
    || !entry.attestation || entry.attestation.freshUnused !== true || entry.attestation.exclusive !== true
    || inventory.some(item => item !== entry && !!item && typeof item === 'object' && 'udid' in item
      && typeof item.udid === 'string' && item.udid.toUpperCase() === entry.udid.toUpperCase())) {
    return { status: 'refused', reason: 'INVENTORY_INELIGIBLE' };
  }
  return { status: 'selected', source: Object.freeze({ inventoryId, udid: entry.udid.toUpperCase(), deviceTypeId: entry.deviceTypeId, runtimeId: entry.runtimeId,
    creation: Object.freeze({ createdAt: entry.creation.createdAt, origin: entry.creation.origin, evidenceRef: entry.creation.evidenceRef }), attestation: Object.freeze({ freshUnused: true as const, exclusive: true as const }) }) };
}
