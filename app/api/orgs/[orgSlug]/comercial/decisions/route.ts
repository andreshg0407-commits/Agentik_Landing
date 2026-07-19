/**
 * GET /api/orgs/[orgSlug]/comercial/decisions
 *
 * Unified commercial decisions endpoint.
 * Wires: Data Loaders → Decision Engines → BusinessDecision Bridges → Aggregator.
 *
 * Returns CommercialDecisionSummary with decisions from all connected engines.
 * Query params:
 *   ?domain=VENDEDORES — filter to single domain
 *   ?minPriority=HIGH — filter by minimum priority
 *
 * Sprint: COMMERCIAL-DATA-CONNECTIVITY-01 (P0-001d)
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { NextResponse } from "next/server";

// ── Data loaders ──────────────────────────────────────────────────────────────
import {
  loadImportReferenceInputs,
  buildImportPolicyContext,
} from "@/lib/comercial/importaciones/import-data-loader";
import {
  loadProductionSubgroupInputs,
  buildProductionContext,
} from "@/lib/comercial/produccion/production-data-loader";
import {
  loadSalesRepData,
  listSellerSlugs,
} from "@/lib/comercial/sales-reps/sales-rep-data-loader";

// ── Decision engines ──────────────────────────────────────────────────────────
import {
  evaluateLowRotation,
  evaluateRepurchase,
  buildNextContainerRecommendations,
  evaluateInventoryAging,
} from "@/lib/comercial/importaciones/import-decision-engine";
import {
  evaluateProductionNeed,
  evaluatePriority,
} from "@/lib/comercial/produccion/production-decision-engine";
import {
  evaluateMalletOutOfStock,
  evaluateCustomerReceivablesAlert,
  evaluateCustomerInactivity,
} from "@/lib/comercial/sales-reps/sales-rep-decision-engine";

// ── Configs ──────────────────────────────────────────────────────────────────
import { CASTILLITOS_IMPORT_POLICY_PACK_CONFIG } from "@/lib/comercial/importaciones/import-policy-pack-config";
import { CASTILLITOS_PRODUCTION_PLANNING_CONFIG } from "@/lib/comercial/produccion/production-planning-config";
import { CASTILLITOS_SALESREP_POLICY_PACK_CONFIG } from "@/lib/comercial/sales-reps/sales-rep-policy-pack-config";

// ── BusinessDecision bridges ─────────────────────────────────────────────────
import { buildAllImportBusinessDecisions } from "@/lib/comercial/importaciones/import-business-decisions";
import { buildAllProductionBusinessDecisions } from "@/lib/comercial/produccion/production-business-decisions";
import {
  buildOutOfStockDecisions,
  buildOverdueReceivableDecisions,
  buildInactiveCustomerDecisions,
} from "@/lib/comercial/sales-reps/sales-rep-business-decisions";

// ── Aggregator ───────────────────────────────────────────────────────────────
import {
  aggregateCommercialDecisions,
  filterByDomain,
  filterByPriority,
} from "@/lib/comercial/business-policy/commercial-decision-aggregator";
import type {
  BusinessDecision,
  CommercialDomain,
} from "@/lib/comercial/business-policy/business-decision-types";

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const url = new URL(req.url);
  const domainFilter = url.searchParams.get("domain") as CommercialDomain | null;
  const minPriority = url.searchParams.get("minPriority") as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | null;

  const allDecisions: BusinessDecision[] = [];
  const errors: { domain: string; error: string }[] = [];

  // ── IMPORTACIONES ─────────────────────────────────────────────────────────
  if (!domainFilter || domainFilter === "IMPORTACIONES") {
    try {
      const ctx = buildImportPolicyContext(orgId);
      const items = await loadImportReferenceInputs(orgId);
      const config = CASTILLITOS_IMPORT_POLICY_PACK_CONFIG;

      const lowRotation = evaluateLowRotation(ctx, items, config);
      const repurchase = items.map(item => evaluateRepurchase(ctx, item, config));
      const container = buildNextContainerRecommendations(ctx, items, repurchase, config);
      const aging = evaluateInventoryAging(ctx, items, config);

      const decisions = buildAllImportBusinessDecisions(
        orgId,
        lowRotation,
        repurchase,
        container.items,
        aging,
      );
      allDecisions.push(...decisions);
    } catch (e: any) {
      errors.push({ domain: "IMPORTACIONES", error: e?.message ?? "Unknown error" });
    }
  }

  // ── PRODUCCION ────────────────────────────────────────────────────────────
  if (!domainFilter || domainFilter === "PRODUCCION") {
    try {
      const ctx = buildProductionContext(orgId);
      const items = await loadProductionSubgroupInputs(orgId);
      const config = CASTILLITOS_PRODUCTION_PLANNING_CONFIG;

      const needs = evaluateProductionNeed(ctx, items, config);
      const priorities = items.map(item => evaluatePriority(ctx, item, config));

      const decisions = buildAllProductionBusinessDecisions(needs, priorities, orgId);
      allDecisions.push(...decisions);
    } catch (e: any) {
      errors.push({ domain: "PRODUCCION", error: e?.message ?? "Unknown error" });
    }
  }

  // ── VENDEDORES ────────────────────────────────────────────────────────────
  if (!domainFilter || domainFilter === "VENDEDORES") {
    try {
      const slugs = await listSellerSlugs(orgId);
      const config = CASTILLITOS_SALESREP_POLICY_PACK_CONFIG;

      // Process up to 20 sellers to avoid timeout
      const activeSlugs = slugs.slice(0, 20);

      for (const slug of activeSlugs) {
        try {
          const data = await loadSalesRepData(orgId, slug);

          // Out-of-stock alerts
          if (data.malletState) {
            const oos = evaluateMalletOutOfStock(
              data.context, data.malletState.malletId, data.malletItems, config,
            );
            allDecisions.push(...buildOutOfStockDecisions(oos, orgId));
          }

          // Overdue receivable alerts (bridge filters alertSeverity === "info")
          const overdueResults = data.customers
            .map(c => evaluateCustomerReceivablesAlert(data.context, c, config));
          allDecisions.push(...buildOverdueReceivableDecisions(overdueResults, orgId));

          // Inactive customer alerts (bridge filters activityStatus === "ACTIVE")
          const inactiveResults = data.customers
            .map(c => evaluateCustomerInactivity(data.context, c, config));
          allDecisions.push(...buildInactiveCustomerDecisions(inactiveResults, orgId));
        } catch {
          // Skip individual seller errors
        }
      }
    } catch (e: any) {
      errors.push({ domain: "VENDEDORES", error: e?.message ?? "Unknown error" });
    }
  }

  // ── Apply filters ────────────────────────────────────────────────────────
  let filtered = allDecisions;
  if (domainFilter) {
    filtered = filterByDomain(filtered, domainFilter);
  }
  if (minPriority) {
    filtered = filterByPriority(filtered, minPriority);
  }

  const summary = aggregateCommercialDecisions(orgId, filtered);

  return NextResponse.json({
    ...summary,
    errors: errors.length > 0 ? errors : undefined,
  });
}
