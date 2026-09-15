import { describe, expect, it } from "vitest";

import { summarizeBenchLog, summarizeMediaQueueWindow } from "../e2e/perf-bench-helpers";

function line(scope: string, context: Record<string, unknown>): string {
  return JSON.stringify({ scope, context });
}

describe("summarizeBenchLog", () => {
  it("joins Worker and Main command records once by request id", () => {
    const log = [
      line("worker.cmd", {
        requestId: "request-1",
        type: "browse.session.open",
        queueMs: 11,
        schedulerWaitMs: 3,
        runMs: 17,
      }),
      line("worker.cmd.roundtrip", {
        requestId: "request-1",
        commandType: "browse.session.open",
        roundTripMs: 39,
        totalMs: 999,
      }),
      line("worker.cmd", {
        requestId: "request-2",
        type: "browse.session.open",
        queueMs: 2,
        schedulerWaitMs: 1,
        runMs: 6,
      }),
      line("worker.cmd.roundtrip", {
        requestId: "orphan-request",
        commandType: "media.list-jobs",
        roundTripMs: 80,
      }),
    ].join("\n");

    const summary = summarizeBenchLog(log);
    expect(summary.commands).toHaveLength(1);
    expect(summary.commands[0]).toMatchObject({
      commandType: "browse.session.open",
      count: 2,
      queueMs: { count: 2, totalMs: 13 },
      schedulerWaitMs: { count: 2, totalMs: 4 },
      runMs: { count: 2, totalMs: 23 },
      roundTripMs: { count: 1, totalMs: 39 },
    });
    expect(summary.unmatchedRoundTripCount).toBe(1);
  });

  it("reads lag, stall, and media-wave fields from structured context", () => {
    const fakeLibraryId = "00000000-0000-4000-8000-000000000000";
    const log = [
      line("worker.eventLoop.lag", {
        activity: `open-reconciliation:${fakeLibraryId}`,
        driftMs: 47,
      }),
      line("worker.scheduler.stall", {
        waitedMs: 850,
        active: [
          { label: `open-reconciliation:${fakeLibraryId}`, lane: "maintenance", libraryId: fakeLibraryId, runningMs: 900 },
        ],
        queued: [],
      }),
      line("worker.media-queue", { mediaStage: "wave-start" }),
      line("worker.media-queue", { mediaStage: "job-start", kind: "generate_thumbnail" }),
      line("worker.media-queue", { mediaStage: "job-finish", kind: "generate_thumbnail", elapsedMs: 95 }),
      line("worker.media-queue", { mediaStage: "wave-finish", elapsedMs: 180 }),
    ].join("\n");

    const summary = summarizeBenchLog(log);
    expect(summary.lagEvents).toMatchObject({
      count: 1,
      maxDriftMs: 47,
      activities: { "open-reconciliation": 1 },
    });
    expect(summary.schedulerStalls).toMatchObject({
      count: 1,
      maxWaitMs: 850,
      owners: { "maintenance:open-reconciliation": 1 },
    });
    expect(summary.mediaWaves).toMatchObject({
      waves: 1,
      jobs: 1,
      startedJobs: 1,
      maxWaveMs: 180,
      maxJobMs: 95,
      kinds: { generate_thumbnail: 1 },
    });
  });

  it("counts preview-cache events without retaining logged identifiers", () => {
    const log = [
      JSON.stringify({ scope: "preview-cache", message: "miss private-library-id private-artifact-id" }),
      JSON.stringify({ scope: "preview-cache", message: "store private-library-id private-artifact-id" }),
      JSON.stringify({ scope: "preview-cache", message: "hit private-library-id private-artifact-id" }),
      JSON.stringify({ scope: "preview-cache", message: "evicted private-library-id private-artifact-id" }),
    ].join("\n");

    expect(summarizeBenchLog(log).previewCache).toEqual({
      miss: 1,
      store: 1,
      hit: 1,
      evicted: 1,
    });
    expect(JSON.stringify(summarizeBenchLog(log))).not.toContain("private-");
  });

  it("measures completed background jobs only inside the profiled interval", () => {
    const startedAt = Date.parse("2026-09-15T00:00:00.000Z");
    const endedAt = startedAt + 60_000;
    const log = [
      line("worker.media-queue", {
        timestamp: new Date(startedAt + 1_000).toISOString(),
        mediaStage: "job-finish",
        kind: "extract_palette",
        elapsedMs: 20,
      }),
      line("worker.media-queue", {
        timestamp: new Date(startedAt + 2_000).toISOString(),
        mediaStage: "job-finish",
        kind: "generate_thumbnail",
        elapsedMs: 500,
      }),
      line("worker.media-queue", {
        timestamp: new Date(endedAt + 1).toISOString(),
        mediaStage: "job-finish",
        kind: "extract_palette",
        elapsedMs: 20,
      }),
    ].join("\n");

    expect(summarizeMediaQueueWindow(log, startedAt, endedAt)).toMatchObject({
      elapsedMs: 60_000,
      finishedJobs: 2,
      jobsPerMinute: 2,
      jobKinds: { extract_palette: 1, generate_thumbnail: 1 },
      jobElapsedMs: { count: 2, p50Ms: 20, p95Ms: 500 },
    });
  });
});
