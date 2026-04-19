/**
 * SyncEngine — orchestrates the full pull → normalise → dedup → store pipeline.
 *
 * Pipeline per page:
 *   adapter.pull*(cursor)
 *     → dedupWithinPage()
 *     → StorageHandler.upsertMany()
 *     → cursorStore.set()
 *     → ConnectorRun counters updated
 *
 * The engine is stateless; call syncModule() or syncAll() per run.
 * A new ConnectorRun record is created for each invocation.
 *
 * Retry strategy: exponential back-off on individual page pulls.
 * Error strategy: page errors accumulate → run ends as PARTIAL; fatal errors → FAILED.
 */

import { prisma }      from "@/lib/prisma";
import { registry }    from "./connector-registry";
import { cursorStore } from "./cursor-store";
import { dedupWithinPage } from "./dedup";
import type {
  PullResult,
  RunContext,
  SourceRecord,
  StorageHandler,
  SyncModule,
  SyncOptions,
} from "./types";
import type { BaseAdapter } from "./base-adapter";

// ── Storage handler registry ──────────────────────────────────────────────────

const storageHandlers = new Map<SyncModule, StorageHandler<SourceRecord>>();

/**
 * Register a storage handler for a module.
 * Call once at startup (or lazily per adapter).
 * If no handler is registered for a module, records are counted but not stored.
 */
export function registerStorageHandler<T extends SourceRecord>(
  module:  SyncModule,
  handler: StorageHandler<T>
): void {
  storageHandlers.set(module, handler as StorageHandler<SourceRecord>);
}

// ── Retry config ──────────────────────────────────────────────────────────────

const MAX_RETRIES    = 3;
const BASE_DELAY_MS  = 1_000;
const MAX_DELAY_MS   = 30_000;

// ── Engine ────────────────────────────────────────────────────────────────────

class SyncEngine {
  /**
   * Sync a single module for a connector.
   * Returns the created ConnectorRun.id.
   */
  async syncModule(
    connectorId: string,
    module:      SyncModule,
    options:     SyncOptions = {}
  ): Promise<string> {
    // ── Load connector ────────────────────────────────────────────────────────
    const connector = await prisma.connector.findUniqueOrThrow({
      where: { id: connectorId },
    });

    const orgId       = connector.organizationId;
    const source      = connector.source;
    const adapterConf = connector.config as Record<string, unknown>;

    // ── Load cursor ───────────────────────────────────────────────────────────
    const cursorBefore = options.fullSync
      ? null
      : await cursorStore.get(connectorId, module);

    // ── Create run record ─────────────────────────────────────────────────────
    const run = await prisma.connectorRun.create({
      data: {
        connectorId,
        organizationId: orgId,
        source,
        module,
        status:       "RUNNING",
        cursorBefore: cursorBefore ?? undefined,
      },
    });

    const ctx: RunContext = {
      runId: run.id, connectorId, orgId,
      source: source as string, module,
    };

    let rowsRead     = 0;
    let rowsImported = 0;
    let rowsSkipped  = 0;
    let rowsErrored  = 0;
    let cursorAfter: string | null = cursorBefore;

    let finalStatus: "SUCCESS" | "PARTIAL" | "FAILED" = "SUCCESS";
    let finalError: string | undefined;

    try {
      // Mark connector as actively syncing
      await prisma.connector.update({
        where: { id: connectorId },
        data:  { status: "SYNCING" },
      });

      const adapter  = registry.create(source, orgId, adapterConf);
      const handler  = storageHandlers.get(module);
      const maxPages = options.maxPages ?? Infinity;

      let cursor:  string | undefined = cursorBefore ?? undefined;
      let hasMore: boolean = true;
      let pages   = 0;

      while (hasMore && pages < maxPages) {
        // Pull one page (with retry)
        const page = await withRetry<PullResult<SourceRecord>>(
          () => dispatchPull(adapter, module, cursor),
          { maxAttempts: MAX_RETRIES, baseMs: BASE_DELAY_MS, maxMs: options.maxRetryDelayMs ?? MAX_DELAY_MS }
        );

        // Intra-page dedup
        const { unique, duplicateCount } = dedupWithinPage(page.records);
        rowsRead    += page.records.length;
        rowsSkipped += duplicateCount;

        // Persist (skip in dry-run)
        if (unique.length > 0 && !options.dryRun) {
          if (handler) {
            const res = await handler.upsertMany(unique, ctx);
            rowsImported += res.imported;
            rowsSkipped  += res.skipped;
            rowsErrored  += res.errored;
          } else {
            // No handler: count as imported (no-op storage)
            rowsImported += unique.length;
          }
        }

        // Advance cursor
        if (page.nextCursor != null) {
          cursor      = page.nextCursor;
          cursorAfter = page.nextCursor;
          if (!options.dryRun) {
            await cursorStore.set(connectorId, module, page.nextCursor);
          }
        }

        hasMore = page.hasMore && page.nextCursor != null;
        pages++;
      }

      finalStatus = rowsErrored > 0 ? "PARTIAL" : "SUCCESS";

    } catch (e) {
      finalStatus = "FAILED";
      finalError  = (e as Error).message;
      console.error(`[SyncEngine] ${source}/${module} run ${run.id} failed:`, e);
    }

    // ── Finalise run ──────────────────────────────────────────────────────────
    await prisma.connectorRun.update({
      where: { id: run.id },
      data: {
        finishedAt:  new Date(),
        status:      finalStatus,
        rowsRead,
        rowsImported,
        rowsSkipped,
        rowsErrored,
        cursorAfter:  cursorAfter ?? undefined,
        error:        finalError  ?? undefined,
      },
    });

    await prisma.connector.update({
      where: { id: connectorId },
      data:  { status: finalStatus === "FAILED" ? "ERROR" : "ACTIVE" },
    });

    return run.id;
  }

  /**
   * Sync all enabled modules for a connector, sequentially.
   * Returns an array of run IDs (one per module).
   */
  async syncAll(
    connectorId: string,
    options:     SyncOptions = {}
  ): Promise<string[]> {
    const connector = await prisma.connector.findUniqueOrThrow({
      where:  { id: connectorId },
      select: { modules: true },
    });

    const runIds: string[] = [];
    for (const mod of connector.modules as SyncModule[]) {
      const runId = await this.syncModule(connectorId, mod, options);
      runIds.push(runId);
    }
    return runIds;
  }
}

// ── Module dispatch ───────────────────────────────────────────────────────────

function dispatchPull(
  adapter: BaseAdapter,
  module:  SyncModule,
  cursor?: string
): Promise<PullResult<SourceRecord>> {
  switch (module) {
    case "orders":        return adapter.pullOrders(cursor)        as Promise<PullResult<SourceRecord>>;
    case "customers":     return adapter.pullCustomers(cursor)     as Promise<PullResult<SourceRecord>>;
    case "inventory":     return adapter.pullInventory(cursor)     as Promise<PullResult<SourceRecord>>;
    case "invoices":      return adapter.pullInvoices(cursor)      as Promise<PullResult<SourceRecord>>;
    case "receivables":   return adapter.pullReceivables(cursor)   as Promise<PullResult<SourceRecord>>;
    case "opportunities": return adapter.pullOpportunities(cursor) as Promise<PullResult<SourceRecord>>;
    case "activities":    return adapter.pullActivities(cursor)    as Promise<PullResult<SourceRecord>>;
    case "quotes":        return adapter.pullQuotes(cursor)        as Promise<PullResult<SourceRecord>>;
    default:
      throw new Error(`[SyncEngine] Unknown module: "${module as string}"`);
  }
}

// ── Retry helper ──────────────────────────────────────────────────────────────

interface RetryOpts {
  maxAttempts: number;
  baseMs:      number;
  maxMs:       number;
}

async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  let last: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e as Error;
      if (attempt < opts.maxAttempts) {
        const delay = Math.min(opts.baseMs * 2 ** (attempt - 1), opts.maxMs);
        console.warn(
          `[SyncEngine] attempt ${attempt}/${opts.maxAttempts} failed (${last.message}), ` +
          `retrying in ${delay} ms…`
        );
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw last;
}

// Singleton
export const syncEngine = new SyncEngine();
