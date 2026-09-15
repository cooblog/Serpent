import { describe, expect, it } from 'vitest';

import { RawMetadataBackfillAdmissionGate } from '../../src/worker/raw-metadata-backfill-gate';

describe('RawMetadataBackfillAdmissionGate', () => {
  it('bounds full-catalog probes per library', () => {
    const gate = new RawMetadataBackfillAdmissionGate();

    expect(gate.shouldAttempt('alpha', 1_000)).toBe(true);
    gate.deferNextAttempt('alpha', 1_000);

    expect(gate.shouldAttempt('alpha', 2_999)).toBe(false);
    expect(gate.remainingDelayMs('alpha', 2_999)).toBe(1);
    expect(gate.shouldAttempt('alpha', 3_000)).toBe(true);
  });

  it('keeps independent libraries and clears throttle state on close', () => {
    const gate = new RawMetadataBackfillAdmissionGate();
    gate.deferNextAttempt('alpha', 10_000);

    expect(gate.shouldAttempt('beta', 10_000)).toBe(true);
    expect(gate.shouldAttempt('alpha', 10_001)).toBe(false);

    gate.cancel('alpha');
    expect(gate.shouldAttempt('alpha', 10_001)).toBe(true);
  });
});
