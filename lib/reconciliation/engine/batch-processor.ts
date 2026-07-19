/**
 * lib/reconciliation/engine/batch-processor.ts
 *
 * AGENTIK-RECON-ENGINE-03
 * Batch Processing Utility
 *
 * Splits large record arrays into configurable batches for:
 *   - Memory efficiency on large datasets
 *   - Progress reporting during long runs
 *   - Streaming readiness (each batch can be yielded downstream)
 *   - Controlled CPU bursts with optional yield between batches
 *
 * Design:
 *   - processBatchesSync()  — for pure CPU phases (no I/O), used inside the engine
 *   - processBatches()      — for async phases (DB reads/writes between batches)
 *   - splitIntoBatches()    — utility for manual batch control
 *
 * The engine's current phases are synchronous (no I/O). processBatchesSync is the
 * primary entry point today. processBatches is wired for streaming/DB insertion paths.
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BatchConfig {
  /**
   * Number of items per batch.
   * Default: 500. Tune based on record complexity and available memory.
   */
  batchSize: number;

  /**
   * Safety cap: maximum number of batches to process.
   * null = unlimited. Use to prevent runaway processing on unexpectedly large inputs.
   * Default: null.
   */
  maxBatches?: number | null;

  /**
   * Progress callback invoked after each batch completes.
   * Use for logging, progress bars, or streaming partial results.
   */
  onProgress?: (progress: BatchProgress) => void;
}

export interface BatchProgress {
  /** 0-based index of the just-completed batch */
  batchIndex:     number;
  /** Total number of batches (may be capped by maxBatches) */
  totalBatches:   number;
  /** Cumulative items processed so far */
  itemsProcessed: number;
  /** Total items in the input (before maxBatches cap) */
  totalItems:     number;
  /** Completion percentage 0–100 (based on totalItems, not capped count) */
  pctComplete:    number;
}

export interface BatchResult<R> {
  results:    R[];
  batchCount: number;
  /** Size of each batch (may vary for the last batch) */
  batchSizes: number[];
  totalItems: number;
  /** Whether the run was truncated by maxBatches */
  truncated:  boolean;
}

// ── Defaults ───────────────────────────────────────────────────────────────────

export const DEFAULT_BATCH_SIZE = 500;

export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  batchSize:  DEFAULT_BATCH_SIZE,
  maxBatches: null,
};

// ── Core utilities ─────────────────────────────────────────────────────────────

/**
 * Split an array into chunks of `batchSize`.
 * The last chunk may be smaller than batchSize.
 */
export function splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
  const effective = batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE;
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += effective) {
    batches.push(items.slice(i, i + effective));
  }
  return batches;
}

// ── Synchronous batch processor ────────────────────────────────────────────────

/**
 * Process items in synchronous batches.
 *
 * Use for pure CPU phases (matching, scoring, deduplication).
 * No await overhead — each batch runs to completion before the next starts.
 *
 * @example
 * const result = processBatchesSync(recordsA, { batchSize: 500 }, (batch) =>
 *   batch.map(r => normalize(r)),
 * );
 */
export function processBatchesSync<T, R>(
  items:     T[],
  config:    BatchConfig,
  processor: (batch: T[], batchIndex: number) => R[],
): BatchResult<R> {
  const allBatches = splitIntoBatches(items, config.batchSize);
  const batches    = config.maxBatches != null
    ? allBatches.slice(0, config.maxBatches)
    : allBatches;

  const results:    R[]    = [];
  const batchSizes: number[] = [];
  let   processed           = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch      = batches[i];
    const batchOut   = processor(batch, i);
    results.push(...batchOut);
    batchSizes.push(batch.length);
    processed += batch.length;

    if (config.onProgress) {
      config.onProgress({
        batchIndex:     i,
        totalBatches:   batches.length,
        itemsProcessed: processed,
        totalItems:     items.length,
        pctComplete:    Math.round((processed / items.length) * 100),
      });
    }
  }

  return {
    results,
    batchCount: batches.length,
    batchSizes,
    totalItems: items.length,
    truncated:  config.maxBatches != null && allBatches.length > batches.length,
  };
}

// ── Async batch processor ──────────────────────────────────────────────────────

/**
 * Process items in async batches.
 *
 * Use for I/O-bound phases: DB inserts, external API calls, file writes.
 * Each batch awaits completion before the next starts — no parallelism.
 * For parallel batches, use Promise.all() at the call site.
 *
 * @example
 * const result = await processBatches(exceptions, { batchSize: 100 }, async (batch) => {
 *   await prisma.reconciliationException.createMany({ data: batch });
 *   return batch;
 * });
 */
export async function processBatches<T, R>(
  items:     T[],
  config:    BatchConfig,
  processor: (batch: T[], batchIndex: number) => Promise<R[]>,
): Promise<BatchResult<R>> {
  const allBatches = splitIntoBatches(items, config.batchSize);
  const batches    = config.maxBatches != null
    ? allBatches.slice(0, config.maxBatches)
    : allBatches;

  const results:    R[]    = [];
  const batchSizes: number[] = [];
  let   processed           = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch    = batches[i];
    const batchOut = await processor(batch, i);
    results.push(...batchOut);
    batchSizes.push(batch.length);
    processed += batch.length;

    if (config.onProgress) {
      config.onProgress({
        batchIndex:     i,
        totalBatches:   batches.length,
        itemsProcessed: processed,
        totalItems:     items.length,
        pctComplete:    Math.round((processed / items.length) * 100),
      });
    }
  }

  return {
    results,
    batchCount: batches.length,
    batchSizes,
    totalItems: items.length,
    truncated:  config.maxBatches != null && allBatches.length > batches.length,
  };
}

// ── Streaming generator (streaming readiness) ─────────────────────────────────

/**
 * Generator that yields one batch at a time.
 *
 * Enables streaming architectures where callers process each batch
 * as it becomes available rather than waiting for all results.
 *
 * @example
 * for (const { batch, index, total } of batchGenerator(records, 500)) {
 *   await writeToStream(batch);
 * }
 */
export function* batchGenerator<T>(
  items:     T[],
  batchSize: number,
): Generator<{ batch: T[]; index: number; total: number }> {
  const effective = batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE;
  const total     = Math.ceil(items.length / effective);
  for (let i = 0; i < items.length; i += effective) {
    yield {
      batch: items.slice(i, i + effective),
      index: Math.floor(i / effective),
      total,
    };
  }
}
