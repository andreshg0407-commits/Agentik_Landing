/**
 * POST /api/orgs/[orgSlug]/connectors/[connectorId]/sync
 *
 * Triggers a connector sync run. Imports all adapter registrations, then
 * delegates to SyncEngine. Runs synchronously and returns when the run
 * finishes (or errors). Safe to call repeatedly — all storage handlers use
 * upsert semantics.
 *
 * Body (optional JSON):
 *   { module?: string }   — omit to sync all enabled modules sequentially.
 *
 * Returns:
 *   { runId, module, status, rowsImported, rowsSkipped, rowsErrored, ms }
 *   or for syncAll: { runIds: string[], modules: string[] }
 *
 * After a successful customers or receivables sync the route also triggers
 * a bulk financial refresh so CustomerProfile.ltv / totalSalesL12 stay
 * current from SaleRecord data.
 */

import { NextResponse }     from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma }           from "@/lib/prisma";
import { syncEngine }       from "@/lib/connectors/core/sync-engine";
import { refreshAllCustomerFinancials } from "@/lib/customer360/service";
import { runScoringForOrg }             from "@/lib/customer360/scoring-service";
import { generateCrmAlerts }            from "@/lib/sales/crm-alert-engine";
import { sagError }                     from "@/lib/sag/logger";

// Register all adapters (side-effect import — must come before syncEngine calls)
import "@/lib/connectors/adapters";

// ── CRM connector detection ───────────────────────────────────────────────────
// Sources that carry CRM modules (opportunities, activities, quotes).
// Add new CRM integrations here — do not scatter source names across hooks.
const CRM_CONNECTOR_SOURCES = new Set([
  "castillitos_crm",
  "hubspot",
  "salesforce",
  "pipedrive",
  "crm_generic",
]);
const isCrmConnector = (source: string) => CRM_CONNECTOR_SOURCES.has(source);

export const runtime     = "nodejs";
export const maxDuration = 120; // long enough for a full SAG SOAP pull

export async function POST(
  req: Request,
  { params }: { params: { orgSlug: string; connectorId: string } },
) {
  const t0 = Date.now();

  try {
    const { organization } = await requireOrgAccess(params.orgSlug);
    const { connectorId }  = params;

    // Verify connector belongs to this org
    const connector = await prisma.connector.findFirst({
      where: { id: connectorId, organizationId: organization.id },
    });
    if (!connector) {
      return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    // Parse optional module param
    let body: { module?: string } = {};
    try { body = await req.json(); } catch { /* no body is fine */ }

    const module = body.module;

    if (module) {
      // ── Single-module sync ──────────────────────────────────────────────────
      //
      // For SAG receivables: SAG returns all rows in one SOAP response.
      // The adapter paginates client-side in batches of 500 rows, using an
      // instance-level cache so only one SOAP call is made per invocation.
      // maxPages=20 caps each invocation at ~10 000 rows (~55–70 s of DB writes),
      // keeping us within the 120-second Vercel limit.
      // The cursor is persisted after each page; if hasMore is true the caller
      // should invoke sync again (the next cron tick or explicit UI retry).
      const isRxBatch = module === "receivables" && connector.source === "sag_pya_soap";
      const runId = await syncEngine.syncModule(connectorId, module as never, {
        ...(isRxBatch ? { maxPages: 20 } : {}),
      });

      const run = await prisma.connectorRun.findUnique({
        where: { id: runId },
        select: { status: true, rowsRead: true, rowsImported: true, rowsSkipped: true, rowsErrored: true, error: true, cursorAfter: true },
      });

      // Post-sync hooks (fire-and-forget — do not block the response)
      if (run?.status !== "FAILED") {
        // ERP: refresh financial KPIs after customer or receivables sync
        if (
          (module === "customers" || module === "receivables") &&
          connector.source === "sag_pya_soap"
        ) {
          refreshAllCustomerFinancials(organization.id).catch(e =>
            sagError("sync:hook:fail", { orgId: organization.id, connectorId, module, code: "refreshAllCustomerFinancials", message: (e as Error).message }),
          );
        }

        // CRM: after customers/accounts sync, refresh financial KPIs so that
        // CustomerProfile.ltv / totalSalesL12 are joined to CRM-sourced profiles.
        if (module === "customers" && isCrmConnector(connector.source)) {
          refreshAllCustomerFinancials(organization.id).catch(e =>
            sagError("sync:hook:fail", { orgId: organization.id, connectorId, module, code: "refreshAllCustomerFinancials(crm)", message: (e as Error).message }),
          );
        }

        // CRM: re-score all customers after opportunity/activity sync so
        // churnRisk and nextBestAction reflect the latest CRM engagement data.
        // Also regenerate CRM risk alerts (stale opps, inactive premium clients, etc.)
        if (
          (module === "customers" || module === "opportunities" || module === "activities" || module === "quotes") &&
          isCrmConnector(connector.source)
        ) {
          runScoringForOrg(organization.id).catch(e =>
            sagError("sync:hook:fail", { orgId: organization.id, connectorId, module, code: "runScoringForOrg", message: (e as Error).message }),
          );
          generateCrmAlerts(organization.id).catch(e =>
            sagError("sync:hook:fail", { orgId: organization.id, connectorId, module, code: "generateCrmAlerts", message: (e as Error).message }),
          );
        }
      }

      // For receivables batch sync: indicate whether this invocation processed
      // all available pages or hit maxPages and needs to be called again.
      // The cursor is already persisted by cursorStore.set(); the next call
      // resumes from where this one stopped.
      // Callers loop until resumable=false to complete the full initial import.
      const resumable =
        isRxBatch &&
        typeof run?.cursorAfter === "string" &&
        run.cursorAfter.startsWith("page:");

      return NextResponse.json({
        runId,
        module,
        status:       run?.status,
        rowsRead:     run?.rowsRead     ?? 0,
        rowsImported: run?.rowsImported ?? 0,
        rowsSkipped:  run?.rowsSkipped  ?? 0,
        rowsErrored:  run?.rowsErrored  ?? 0,
        error:        run?.error ?? null,
        resumable,
        ms: Date.now() - t0,
      });

    } else {
      // ── Sync all enabled modules ────────────────────────────────────────────
      const runIds = await syncEngine.syncAll(connectorId, {});

      // Post-sync hooks for full sync (fire-and-forget)
      if (connector.source === "sag_pya_soap") {
        refreshAllCustomerFinancials(organization.id).catch(e =>
          sagError("sync:hook:fail", { orgId: organization.id, connectorId, code: "refreshAllCustomerFinancials", message: (e as Error).message }),
        );
      }
      if (isCrmConnector(connector.source)) {
        // Full CRM sync may include "customers" — refresh financials to join
        // ERP sales data onto newly upserted CRM-sourced CustomerProfiles.
        refreshAllCustomerFinancials(organization.id).catch(e =>
          sagError("sync:hook:fail", { orgId: organization.id, connectorId, code: "refreshAllCustomerFinancials(crm)", message: (e as Error).message }),
        );
        runScoringForOrg(organization.id).catch(e =>
          sagError("sync:hook:fail", { orgId: organization.id, connectorId, code: "runScoringForOrg", message: (e as Error).message }),
        );
        generateCrmAlerts(organization.id).catch(e =>
          sagError("sync:hook:fail", { orgId: organization.id, connectorId, code: "generateCrmAlerts", message: (e as Error).message }),
        );
      }

      return NextResponse.json({
        runIds,
        modules: connector.modules,
        ms: Date.now() - t0,
      });
    }

  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (msg === "ACCESS_DENIED")   return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (msg === "ORG_NOT_FOUND")   return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("[connectors/sync/POST]", err);
    return NextResponse.json(
      { error: (err as Error).message, ms: Date.now() - t0 },
      { status: 500 },
    );
  }
}
