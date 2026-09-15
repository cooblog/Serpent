const RAW_METADATA_BACKFILL_MIN_INTERVAL_MS = 2_000;

/** Per-library throttle for the expensive full-catalog RAW backfill probe. */
export class RawMetadataBackfillAdmissionGate {
  private readonly nextAttemptAtByLibrary = new Map<string, number>();

  shouldAttempt(libraryId: string, now = Date.now()): boolean {
    return now >= (this.nextAttemptAtByLibrary.get(libraryId) ?? 0);
  }

  deferNextAttempt(libraryId: string, now = Date.now()): void {
    this.nextAttemptAtByLibrary.set(
      libraryId,
      now + RAW_METADATA_BACKFILL_MIN_INTERVAL_MS,
    );
  }

  remainingDelayMs(libraryId: string, now = Date.now()): number {
    return Math.max(0, (this.nextAttemptAtByLibrary.get(libraryId) ?? 0) - now);
  }

  cancel(libraryId: string): void {
    this.nextAttemptAtByLibrary.delete(libraryId);
  }
}
