/**
 * executive-engine.ts
 *
 * INFORMES-EJECUTIVOS-CASTILLITOS-03 — Executive Intelligence Engine.
 *
 * Orchestrates all specialized engines and produces the unified
 * ExecutiveDashboard model. This is the ONLY function that the
 * Dashboard page should call.
 *
 * Flow:
 *   CommercialEngine → InventoryEngine → ProductionEngine
 *   → KPIEngine → AlertEngine → RecommendationEngine → TimelineEngine
 *   → ExecutiveDashboard
 */

import "server-only";
import type { ExecutiveDashboard, ExecutiveHealth } from "./executive-types";
import { runCommercialEngine } from "./commercial-engine";
import { runInventoryEngine } from "./inventory-engine";
import { runProductionEngine } from "./production-engine";
import { computeKpis } from "./executive-kpis";
import { computeAlerts } from "./executive-alerts";
import { computeRecommendations } from "./executive-recommendations";
import { runTimelineEngine } from "./executive-timeline";

export async function runExecutiveEngine(orgId: string): Promise<ExecutiveDashboard> {
  // Phase 1: Run data engines in parallel
  const [commercial, inventory, production] = await Promise.all([
    runCommercialEngine(orgId),
    runInventoryEngine(orgId),
    runProductionEngine(orgId),
  ]);

  // Phase 2: Run intelligence engines (depend on Phase 1 outputs)
  const [kpis, alerts, recommendations, timeline] = await Promise.all([
    Promise.resolve(computeKpis(commercial, inventory)),
    Promise.resolve(computeAlerts(commercial, inventory, production)),
    Promise.resolve(computeRecommendations(commercial, inventory, production)),
    runTimelineEngine(orgId),
  ]);

  // Phase 3: Compute health
  const health = computeHealth(commercial, inventory, production);

  return {
    // Core engine outputs
    summary: commercial.summary,
    commercial,
    inventory,
    production,
    kpis,
    alerts,
    recommendations,
    timeline,
    health,
    lastSync: inventory.lastSync,
    generatedAt: new Date().toISOString(),

    // Convenience accessors for backward compatibility
    agotados: inventory.agotados,
    stockCritico: inventory.stockCritico,
    topReferencias: commercial.topReferencias,
    topClientes: commercial.topClientes,
    topVendedores: commercial.topVendedores,
    fulfillment: commercial.fulfillment,
  };
}

function computeHealth(
  commercial: Awaited<ReturnType<typeof runCommercialEngine>>,
  inventory: Awaited<ReturnType<typeof runInventoryEngine>>,
  production: Awaited<ReturnType<typeof runProductionEngine>>,
): ExecutiveHealth {
  const commercialHealth: ExecutiveHealth["commercial"] =
    commercial.fulfillment.totalPedidos > 0 ? "healthy" : "degraded";

  const inventoryHealth: ExecutiveHealth["inventory"] =
    inventory.totalVariantes > 0 ? "healthy" : "degraded";

  const productionHealth: ExecutiveHealth["production"] =
    production.productionHealth === "active" ? "healthy"
    : production.productionHealth === "idle" ? "degraded"
    : "unavailable";

  // overall can only be healthy or degraded since commercial/inventory engines only return those two
  const overall: ExecutiveHealth["overall"] =
    commercialHealth === "healthy" && inventoryHealth === "healthy" ? "healthy" : "degraded";

  return { commercial: commercialHealth, inventory: inventoryHealth, production: productionHealth, overall };
}
