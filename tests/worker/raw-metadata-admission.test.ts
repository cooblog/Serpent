// Serpent-288cd9: the secondary pump decides "the RAW catalogue is drained" from
// the admission outcome, so that signal has to be exact. A drained probe must
// report `budgetCapped: false`; a probe that was stopped by the global admission
// cap must NOT, otherwise the gate would stop rescanning while RAW assets still
// need metadata.
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LibraryService } from '../../src/worker/library-service';

interface TestDatabase {
  prepare(source: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
}

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as new (filename: string) => TestDatabase;

const temporaryRoots: string[] = [];
const services: LibraryService[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'serpent-raw-admission-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const service of services.splice(0)) service.closeAll();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true, maxRetries: 5, retryDelay: 100 });
  }
});

describe('RAW metadata backfill admission (Serpent-288cd9)', () => {
  it('reports a drained catalogue instead of a capped probe', () => {
    const service = new LibraryService();
    services.push(service);
    const created = service.createLibrary({
      displayName: 'RAW admission',
      selectedParentPath: temporaryRoot(),
    });

    const first = service.enqueueRawImageMetadataBackfill(created.libraryId, 64);
    expect(first).toEqual({ admitted: 0, probed: 0, budgetCapped: false });

    // A drained catalogue stays drained: repeated probes admit nothing and keep
    // reporting the drained signal the gate relies on.
    const second = service.enqueueRawImageMetadataBackfill(created.libraryId, 64);
    expect(second).toEqual({ admitted: 0, probed: 0, budgetCapped: false });
    expect(service.listMediaJobs(created.libraryId, { summaryOnly: true }).queued).toBe(0);
  });

  it('does not report drained while the global admission budget is full', () => {
    const service = new LibraryService();
    services.push(service);
    const created = service.createLibrary({
      displayName: 'RAW admission cap',
      selectedParentPath: temporaryRoot(),
    });
    const database = new Database(path.join(created.libraryPath, '.serpent', 'library.db'));
    try {
      const now = new Date().toISOString();
      const insert = database.prepare(
        `INSERT INTO jobs (job_id, library_id, asset_id, revision_id, kind, status, priority,
                           progress, attempt_count, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, 'extract_metadata', 'queued', -25, 0.0, 0, ?, ?)`,
      );
      // Fill the whole batch budget with pending metadata work.
      for (let index = 0; index < 64; index += 1) {
        insert.run(crypto.randomUUID(), created.libraryId, now, now);
      }
    } finally {
      database.close();
    }

    const outcome = service.enqueueRawImageMetadataBackfill(created.libraryId, 64);
    expect(outcome.admitted).toBe(0);
    expect(outcome.budgetCapped).toBe(true);
  });
});
