/**
 * lib/comercial/business-policy/commercial-decision-aggregator.ts
 *
 * CommercialDecisionAggregator — receives BusinessDecision objects
 * from all six commercial engines and groups them by domain.
 *
 * NOT a new engine. NOT a new decision maker.
 * Pure aggregation only.
 *
 * Sprint: COMMERCIAL-INTEGRATION-01
 */

import type {
  BusinessDecision,
  CommercialDomain,
  CommercialDecisionGroup,
  CommercialDecisionSummary,
} from "./business-decision-types";

// ── Aggregate decisions by domain ───────────────────────────────────────────

export function aggregateByDomain(
  decisions: BusinessDecision[],
): Map<CommercialDomain, BusinessDecision[]> {
  const map = new Map<CommercialDomain, BusinessDecision[]>();
  for (const d of decisions) {
    const list = map.get(d.domain) ?? [];
    list.push(d);
    map.set(d.domain, list);
  }
  return map;
}

// ── Build a group from decisions of the same domain ─────────────────────────

function buildGroup(
  domain: CommercialDomain,
  engine: string,
  decisions: BusinessDecision[],
): CommercialDecisionGroup {
  return {
    domain,
    engine,
    decisions,
    totalCount: decisions.length,
    criticalCount: decisions.filter(d => d.priority === "CRITICAL").length,
    highCount: decisions.filter(d => d.priority === "HIGH").length,
    mediumCount: decisions.filter(d => d.priority === "MEDIUM").length,
    lowCount: decisions.filter(d => d.priority === "LOW").length,
  };
}

// ── Main aggregator ─────────────────────────────────────────────────────────

const DOMAIN_ENGINE_MAP: Record<CommercialDomain, string> = {
  MALETAS: "MaletasPolicyPack",
  TIENDAS: "StorePolicyPack",
  PEDIDOS: "OrderPolicyPack",
  VENDEDORES: "SalesRepPolicyPack",
  IMPORTACIONES: "ImportPolicyPack",
  PRODUCCION: "ProductionPlanningPack",
};

export function aggregateCommercialDecisions(
  tenantId: string,
  decisions: BusinessDecision[],
): CommercialDecisionSummary {
  const byDomain = aggregateByDomain(decisions);
  const groups: CommercialDecisionGroup[] = [];

  for (const [domain, domainDecisions] of byDomain) {
    const engine = DOMAIN_ENGINE_MAP[domain] ?? domain;
    groups.push(buildGroup(domain, engine, domainDecisions));
  }

  groups.sort((a, b) => b.criticalCount - a.criticalCount || b.highCount - a.highCount);

  return {
    tenantId,
    groups,
    totalDecisions: decisions.length,
    criticalDecisions: decisions.filter(d => d.priority === "CRITICAL").length,
    highDecisions: decisions.filter(d => d.priority === "HIGH").length,
    domains: groups.map(g => g.domain),
    generatedAt: new Date().toISOString(),
  };
}

// ── Filter helpers ──────────────────────────────────────────────────────────

export function filterByDomain(
  decisions: BusinessDecision[],
  domain: CommercialDomain,
): BusinessDecision[] {
  return decisions.filter(d => d.domain === domain);
}

export function filterByPriority(
  decisions: BusinessDecision[],
  minPriority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
): BusinessDecision[] {
  const rank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const threshold = rank[minPriority] ?? 1;
  return decisions.filter(d => (rank[d.priority] ?? 0) >= threshold);
}

export function filterPending(decisions: BusinessDecision[]): BusinessDecision[] {
  return decisions.filter(d => d.status === "pending");
}

export function sortByPriority(decisions: BusinessDecision[]): BusinessDecision[] {
  const rank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  return [...decisions].sort((a, b) => (rank[b.priority] ?? 0) - (rank[a.priority] ?? 0));
}
