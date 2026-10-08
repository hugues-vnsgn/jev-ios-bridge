import type { ObservedAllocator as AllocatorPort } from '../../../../../../src/observed/service.js';
import type { ObservedAllocator as AllocatorImplementation } from '../../../../../../src/observed/allocation.js';
import type { AllocationResult } from '../../../../../../src/observed/allocation-schema.js';
declare const implementation: AllocatorImplementation;
const composition: AllocatorPort<AllocationResult> = implementation;
void composition;
