/**
 * lib/comercial/pedidos/quote-lines-sync.ts
 *
 * Synchronization service: CRM AOS_Products_Quotes → CRMQuoteLine (Prisma).
 *
 * Wires the existing infrastructure that was built but never invoked:
 *   - CastillitosCrmAdapter.pullQuoteLines()   → fetches from CRM V8 API
 *   - upsertQuoteLines()                       → persists to CRMQuoteLine
 *
 * Architecture: SAG/CRM → Data Extraction → CRMQuote → CRMQuoteLine → Pedidos
 *
 * Properties:
 *   - Idempotent: upserts by (organizationId, crmId)
 *   - Incremental: only fetches quotes that have 0 lines or stale sync
 *   - Re-executable: safe to run multiple times
 *   - Multi-tenant: orgId scoped
 *
 * SERVER ONLY — never import from client components.
 *
 * Sprint: SAG-ORDER-LINES-SYNC-01
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { CastillitosCrmAdapter } from "@/lib/connectors/adapters/castillitos-crm/index";
import { upsertQuoteLines } from "@/lib/connectors/adapters/castillitos-crm/storage";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuoteLinesSyncMetrics {
  totalQuotes:       number;
  quotesWithLines:   number;
  quotesEmpty:       number;
  quotesErrored:     number;
  totalLinesCreated: number;
  totalLinesUpdated: number;
  totalLinesErrored: number;
  durationMs:        number;
}

export interface QuoteLineSyncResult {
  quoteId:    string;
  quoteCrmId: string;
  quoteNumber: string | null;
  linesFound: number;
  upserted:   number;
  errored:    number;
  error?:     string;
}

// ── Sync all quote lines for an organization ──────────────────────────────────

/**
 * Sync CRM quote lines for all CRMQuotes in an organization.
 *
 * Strategy:
 *   1. Load all CRMQuotes that have a crmId (CRM UUID needed for API call)
 *   2. For each quote, call pullQuoteLines(crmId) via the CRM adapter
 *   3. Persist via upsertQuoteLines()
 *
 * @param orgId - Organization ID
 * @param connectorConfig - CRM adapter configuration (from Connector.config)
 * @param options.forceResync - Re-fetch lines even for quotes that already have lines
 * @param options.maxQuotes - Limit number of quotes to process (for incremental runs)
 * @param options.batchSize - How many quotes to process per batch (default 10)
 */
export async function syncQuoteLines(
  orgId: string,
  connectorConfig: Record<string, unknown>,
  options: {
    forceResync?: boolean;
    maxQuotes?:   number;
    batchSize?:   number;
  } = {},
): Promise<{ metrics: QuoteLinesSyncMetrics; results: QuoteLineSyncResult[] }> {
  const start = Date.now();
  const batchSize = options.batchSize ?? 10;

  // ── Load quotes that need line sync ────────────────────────────────────────
  const quotes = await prisma.cRMQuote.findMany({
    where: {
      organizationId: orgId,
      crmId: { not: null },
    },
    select: {
      id:          true,
      crmId:       true,
      quoteNumber: true,
      _count:      { select: { quoteLines: true } },
    },
    orderBy: { updatedAt: "desc" },
    ...(options.maxQuotes ? { take: options.maxQuotes } : {}),
  });

  // Filter: only quotes without lines (unless forceResync)
  const quotesToSync = options.forceResync
    ? quotes
    : quotes.filter(q => q._count.quoteLines === 0);

  // ── Create adapter ─────────────────────────────────────────────────────────
  const adapter = new CastillitosCrmAdapter(orgId, connectorConfig);

  // ── Process in batches ─────────────────────────────────────────────────────
  const results: QuoteLineSyncResult[] = [];
  let totalLinesCreated = 0;
  let totalLinesErrored = 0;
  let quotesWithLines   = 0;
  let quotesEmpty       = 0;
  let quotesErrored     = 0;

  for (let i = 0; i < quotesToSync.length; i += batchSize) {
    const batch = quotesToSync.slice(i, i + batchSize);

    for (const quote of batch) {
      const crmId = quote.crmId!;

      try {
        // Fetch lines from CRM API
        const lines = await adapter.pullQuoteLines(crmId);

        if (lines.length === 0) {
          quotesEmpty++;
          results.push({
            quoteId:     quote.id,
            quoteCrmId:  crmId,
            quoteNumber: quote.quoteNumber,
            linesFound:  0,
            upserted:    0,
            errored:     0,
          });
          continue;
        }

        // Persist to CRMQuoteLine
        const { upserted, errored } = await upsertQuoteLines(
          orgId,
          quote.id,
          crmId,
          lines,
        );

        totalLinesCreated += upserted;
        totalLinesErrored += errored;

        if (upserted > 0) quotesWithLines++;
        else if (errored > 0) quotesErrored++;

        results.push({
          quoteId:     quote.id,
          quoteCrmId:  crmId,
          quoteNumber: quote.quoteNumber,
          linesFound:  lines.length,
          upserted,
          errored,
        });

      } catch (e) {
        quotesErrored++;
        results.push({
          quoteId:     quote.id,
          quoteCrmId:  crmId,
          quoteNumber: quote.quoteNumber,
          linesFound:  0,
          upserted:    0,
          errored:     0,
          error:       (e as Error).message,
        });
        console.error(
          `[QuoteLinesSync] Failed quote ${quote.quoteNumber} (crmId=${crmId}):`,
          (e as Error).message,
        );
      }
    }
  }

  const metrics: QuoteLinesSyncMetrics = {
    totalQuotes:       quotesToSync.length,
    quotesWithLines,
    quotesEmpty,
    quotesErrored,
    totalLinesCreated,
    totalLinesUpdated: 0, // upsertQuoteLines counts upserts, not separate create/update
    totalLinesErrored,
    durationMs:        Date.now() - start,
  };

  return { metrics, results };
}

// ── Sync lines for a single quote ─────────────────────────────────────────────

/**
 * Sync lines for a single CRMQuote by its Prisma ID.
 * Used for on-demand refresh (e.g., when opening the drawer).
 */
export async function syncSingleQuoteLines(
  orgId: string,
  quoteId: string,
  connectorConfig: Record<string, unknown>,
): Promise<QuoteLineSyncResult> {
  const quote = await prisma.cRMQuote.findFirst({
    where: { id: quoteId, organizationId: orgId },
    select: { id: true, crmId: true, quoteNumber: true },
  });

  if (!quote || !quote.crmId) {
    return {
      quoteId,
      quoteCrmId:  "",
      quoteNumber: null,
      linesFound:  0,
      upserted:    0,
      errored:     0,
      error:       "Quote not found or missing crmId",
    };
  }

  const adapter = new CastillitosCrmAdapter(orgId, connectorConfig);

  try {
    const lines = await adapter.pullQuoteLines(quote.crmId);

    if (lines.length === 0) {
      return {
        quoteId:     quote.id,
        quoteCrmId:  quote.crmId,
        quoteNumber: quote.quoteNumber,
        linesFound:  0,
        upserted:    0,
        errored:     0,
      };
    }

    const { upserted, errored } = await upsertQuoteLines(
      orgId,
      quote.id,
      quote.crmId,
      lines,
    );

    return {
      quoteId:     quote.id,
      quoteCrmId:  quote.crmId,
      quoteNumber: quote.quoteNumber,
      linesFound:  lines.length,
      upserted,
      errored,
    };
  } catch (e) {
    return {
      quoteId:     quote.id,
      quoteCrmId:  quote.crmId,
      quoteNumber: quote.quoteNumber,
      linesFound:  0,
      upserted:    0,
      errored:     0,
      error:       (e as Error).message,
    };
  }
}

// ── Get connector config for an org ───────────────────────────────────────────

/**
 * Load the CRM connector config for an organization.
 * Returns null if no CRM connector is configured.
 */
export async function getCrmConnectorConfig(
  orgId: string,
): Promise<Record<string, unknown> | null> {
  const connector = await prisma.connector.findFirst({
    where: {
      organizationId: orgId,
      source:         "castillitos_crm",
      status:         { in: ["ACTIVE", "SYNCING", "INACTIVE"] },
    },
    select: { config: true },
  });

  if (!connector?.config) return null;
  return connector.config as Record<string, unknown>;
}
