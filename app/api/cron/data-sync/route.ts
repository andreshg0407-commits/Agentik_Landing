/**
 * GET /api/cron/data-sync
 *
 * Vercel Cron endpoint — triggers data sync for active connectors.
 * Protected by INTERNAL_CRON_SECRET.
 *
 * Sources: sag_pya_soap (SAG), castillitos_crm (CRM SuiteCRM V8)
 *
 * Use ?source=sag_pya_soap or ?source=castillitos_crm to sync a specific
 * connector. Without ?source, syncs all connectors.
 *
 * SAG SOAP returns 240k+ rows per query (~3 min per SOAP call).
 * To fit within Vercel's 300s limit, SAG is split into separate cron entries:
 *   /api/cron/data-sync?source=castillitos_crm    (fast: ~30s)
 *   /api/cron/data-sync?source=sag_pya_soap        (slow: ~5 min)
 *
 * Schedule: every 6 hours (vercel.json cron)
 *
 * Sprint: CRM-SYNC-CRON-HOTFIX-01
 * Sprint: PEDIDOS-SAG-SYNC-RECOVERY-01
 * Sprint: PEDIDOS-DRAWER-LINES-AND-SELLER-HISTORY-ROOT-CAUSE-01
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma }                    from "@/lib/prisma";
import { syncEngine }                from "@/lib/connectors/core/sync-engine";
import type { SyncModule }           from "@/lib/connectors/core/types";
import { syncOrderLines }            from "@/lib/connectors/adapters/sag-pya-soap/orders/sag-order-lines-sync";

// Register adapters (side-effect)
import "@/lib/connectors/adapters";

export const runtime     = "nodejs";
export const maxDuration = 300; // 5 min

// ── Auth ───────────────────────────────────────────────────────────────────────

const CRON_SECRET = process.env.INTERNAL_CRON_SECRET ?? "";
const VERCEL_CRON_SECRET = process.env.CRON_SECRET ?? "";

function isAuthorized(req: NextRequest): boolean {
  // Custom header (legacy)
  const header = req.headers.get("x-internal-cron-secret") ?? "";
  if (CRON_SECRET && header === CRON_SECRET) return true;

  // Query param
  const query = new URL(req.url).searchParams.get("secret") ?? "";
  if (CRON_SECRET && query === CRON_SECRET) return true;

  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (CRON_SECRET && token === CRON_SECRET) return true;
    if (VERCEL_CRON_SECRET && token === VERCEL_CRON_SECRET) return true;
  }

  return false;
}

// SAG-heavy modules that need their own time budget
const SAG_HEAVY_MODULES = new Set(["movements", "orders"]);

// ── Handler ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  const url = new URL(req.url);
  const sourceFilter = url.searchParams.get("source"); // optional: filter by connector source

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      status: "ACTIVE",
      source: { in: ["sag_pya_soap", "castillitos_crm"] },
    };
    if (sourceFilter) {
      where.source = sourceFilter;
    }

    const connectors = await prisma.connector.findMany({
      where,
      select: { id: true, organizationId: true, source: true, modules: true },
    });

    if (connectors.length === 0) {
      return NextResponse.json({ ok: true, message: "No active connectors", ms: Date.now() - t0 });
    }

    const results: Array<{ connectorId: string; source: string; module: string; status: string; rows: number }> = [];

    for (const connector of connectors) {
      const modules = (connector.modules as string[]) ?? [];
      const isSag   = connector.source === "sag_pya_soap";

      for (const mod of modules) {
        // Time guard: skip if less than 30s remaining (Vercel kills at 300s)
        const elapsed = Date.now() - t0;
        if (elapsed > 270_000) {
          results.push({
            connectorId: connector.id,
            source: connector.source,
            module: mod,
            status: "SKIPPED_TIMEOUT",
            rows: 0,
          });
          console.warn(`[cron/data-sync] Skipping ${connector.source}/${mod} — ${elapsed}ms elapsed, approaching timeout`);
          continue;
        }

        // For SAG heavy modules (movements, orders): skip if not enough time
        // These take 3+ min each, so only run if we have >240s remaining
        if (isSag && SAG_HEAVY_MODULES.has(mod) && elapsed > 60_000 && !sourceFilter) {
          results.push({
            connectorId: connector.id,
            source: connector.source,
            module: mod,
            status: "SKIPPED_TIME_BUDGET",
            rows: 0,
          });
          console.warn(`[cron/data-sync] Skipping ${connector.source}/${mod} — not enough time budget for heavy module`);
          continue;
        }

        try {
          const isRxBatch = mod === "receivables";
          const runId = await syncEngine.syncModule(connector.id, mod as SyncModule, {
            ...(isRxBatch ? { maxPages: 20 } : {}),
          });

          const run = await prisma.connectorRun.findUnique({
            where: { id: runId },
            select: { status: true, rowsImported: true },
          });

          results.push({
            connectorId: connector.id,
            source: connector.source,
            module: mod,
            status: run?.status ?? "UNKNOWN",
            rows: run?.rowsImported ?? 0,
          });

          // After SAG orders sync, sync order lines (MOVIMIENTOS_ITEMS)
          // Lines need existing order headers (FK), so this must run after orders.
          if (isSag && mod === "orders" && (run?.status === "SUCCESS" || run?.status === "PARTIAL")) {
            const remainingMs = 300_000 - (Date.now() - t0);
            if (remainingMs > 60_000) {
              try {
                const cfg = (await prisma.connector.findUnique({
                  where: { id: connector.id },
                  select: { config: true },
                }))?.config as Record<string, string> | null;

                if (cfg?.endpointUrl && cfg?.database) {
                  const lineResult = await syncOrderLines({
                    organizationId: connector.organizationId,
                    sagConfig: {
                      endpointUrl: cfg.endpointUrl,
                      token: cfg.token ?? "",
                      database: cfg.database,
                    },
                    sagDatabase: cfg.database,
                    onlyMissing: true, // only sync lines for orders without lines — fast incremental
                  });
                  results.push({
                    connectorId: connector.id,
                    source: connector.source,
                    module: "order_lines",
                    status: lineResult.success ? "SUCCESS" : "PARTIAL",
                    rows: lineResult.metrics.linesCreated,
                  });
                  console.log(`[cron/data-sync] order_lines: ${lineResult.metrics.linesCreated} lines synced in ${lineResult.metrics.durationMs}ms`);
                }
              } catch (lineErr) {
                results.push({
                  connectorId: connector.id,
                  source: connector.source,
                  module: "order_lines",
                  status: "ERROR",
                  rows: 0,
                });
                console.error(`[cron/data-sync] order_lines failed:`, (lineErr as Error).message);
              }
            } else {
              console.warn(`[cron/data-sync] Skipping order_lines — only ${remainingMs}ms remaining`);
            }
          }
        } catch (err) {
          results.push({
            connectorId: connector.id,
            source: connector.source,
            module: mod,
            status: "ERROR",
            rows: 0,
          });
          console.error(`[cron/data-sync] ${connector.source}/${mod} failed:`, (err as Error).message);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      connectors: connectors.length,
      sourceFilter: sourceFilter ?? "all",
      results,
      ms: Date.now() - t0,
    });
  } catch (err) {
    console.error("[cron/data-sync] Fatal:", (err as Error).message);
    return NextResponse.json(
      { ok: false, error: (err as Error).message, ms: Date.now() - t0 },
      { status: 500 },
    );
  }
}
