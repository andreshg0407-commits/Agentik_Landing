/**
 * vendor-engine.ts
 *
 * COMERCIAL-VENDEDORES-LIVE-01
 * Assembles a LiveVendor from multiple data sources.
 *
 * This is the core engine that transforms a simple vendor ID
 * into a living operational entity. It orchestrates all sub-engines
 * and returns a single, cohesive LiveVendor snapshot.
 *
 * SERVER ONLY.
 */

import "server-only";
import { getVendorRegistry } from "@/lib/comercial/maletas/maletas-normalizer";
import type { LiveVendor, VendorCard } from "./vendor-types";
import type { OperationalState } from "@/lib/business-engine/entities/entity-types";
import {
  computeVendorCommercialKpis,
  computeVendorCustomerSummary,
  computeVendorOrderSummary,
} from "./vendor-metrics";
import {
  computeVendorFulfillment,
  computeVendorActiveCaseSnapshot,
} from "./vendor-performance";
import { computeVendorAlerts } from "./vendor-alerts";
import { computeVendorRecommendations } from "./vendor-recommendations";
import { toSlug } from "./vendor-utils";

// ── Resolve Single LiveVendor ────────────────────────────────────────────────

export async function resolveVendor(
  orgId: string,
  vendorId: string,
): Promise<LiveVendor | null> {
  const registry = getVendorRegistry(orgId);
  const vendor = registry.find(v => v.id === vendorId);
  if (!vendor) return null;

  const allVendorNames = registry.filter(v => v.active).map(v => v.name);

  // Phase 1: Data engines in parallel
  const [commercial, activeCase, customers, orders, fulfillment] = await Promise.all([
    computeVendorCommercialKpis(orgId, vendor.sagName ?? vendor.name, allVendorNames),
    computeVendorActiveCaseSnapshot(orgId, vendorId),
    computeVendorCustomerSummary(orgId, vendor.sagName ?? vendor.name),
    computeVendorOrderSummary(orgId, vendor.sagName ?? vendor.name),
    computeVendorFulfillment(orgId, vendor.sagName ?? vendor.name),
  ]);

  // Phase 2: Intelligence engines (pure computation, no DB)
  const alerts = computeVendorAlerts({ commercial, activeCase, orders, customers, fulfillment });
  const recommendations = computeVendorRecommendations({ commercial, activeCase, orders, customers, fulfillment });

  // Phase 3: Operational state
  const operationalState = computeOperationalState(alerts, activeCase.lastSyncedAt, commercial);

  return {
    kind: "vendor",
    identity: {
      id: vendor.id,
      name: vendor.name,
      sagName: vendor.sagName,
      slug: toSlug(vendor.name),
      zone: null, // V2: tenant-configurable zones
      active: vendor.active,
    },
    commercial,
    activeCase,
    customers,
    orders,
    fulfillment,
    alerts,
    recommendations,
    operationalState,
    assembledAt: new Date().toISOString(),
  };
}

// ── Resolve All Vendors (list view) ──────────────────────────────────────────

export async function resolveVendorCards(orgId: string): Promise<VendorCard[]> {
  const registry = getVendorRegistry(orgId);
  const activeVendors = registry.filter(v => v.active);

  const cards = await Promise.all(
    activeVendors.map(async (vendor) => {
      try {
        const live = await resolveVendor(orgId, vendor.id);
        if (!live) return null;

        return {
          id: live.identity.id,
          name: live.identity.name,
          salesToday: live.commercial.salesToday,
          salesMonth: live.commercial.salesMonth,
          ordersToday: live.commercial.ordersToday,
          customersToday: live.commercial.customersToday,
          fulfillmentRate: live.fulfillment.fulfillmentRate,
          depletedReferences: live.activeCase.depletedReferences,
          alertCount: live.alerts.length,
          health: live.operationalState.health,
          ranking: live.commercial.ranking,
        } satisfies VendorCard;
      } catch {
        return {
          id: vendor.id,
          name: vendor.name,
          salesToday: 0,
          salesMonth: 0,
          ordersToday: 0,
          customersToday: 0,
          fulfillmentRate: 0,
          depletedReferences: 0,
          alertCount: 0,
          health: "unknown" as const,
          ranking: null,
        } satisfies VendorCard;
      }
    }),
  );

  return cards.filter((c): c is VendorCard => c !== null);
}

// ── Operational State ────────────────────────────────────────────────────────

function computeOperationalState(
  alerts: { severity: string }[],
  lastSyncedAt: string | null,
  commercial: { ordersToday: number },
): OperationalState {
  const criticalAlerts = alerts.filter(a => a.severity === "critical").length;
  const highAlerts = alerts.filter(a => a.severity === "high").length;

  let health: OperationalState["health"] = "healthy";
  if (criticalAlerts > 0) health = "critical";
  else if (highAlerts > 0) health = "warning";

  return {
    health,
    activeAlertCount: alerts.length,
    pendingActionCount: alerts.filter(a => a.severity === "critical" || a.severity === "high").length,
    lastUpdatedAt: new Date().toISOString(),
    lastSyncedAt,
    completeness: computeCompleteness(commercial, lastSyncedAt),
  };
}

function computeCompleteness(
  commercial: { ordersToday: number },
  lastSyncedAt: string | null,
): number {
  let score = 40; // Base: identity exists
  if (lastSyncedAt) score += 20; // Case synced
  if (commercial.ordersToday > 0) score += 20; // Has activity today
  score += 20; // KPIs computed
  return Math.min(100, score);
}
