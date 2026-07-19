// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 12 — Executive Briefing Builder
// Generates CEO, Finance, Commercial, Operations, Custom briefings

import type {
  ExecutiveBriefing,
  ExecutiveBriefingType,
  ExecutivePriority,
  ExecutiveConcern,
  ExecutiveRecommendation,
  ExecutiveNarrative,
  ExecutiveFocusArea,
  ExecutiveConflict,
  ExecutiveTheme,
  ExecutiveDomain,
} from "./executive-brain-types";
import {
  generateEbv2Id,
  confidenceFromScore,
  EXECUTIVE_PRIORITY_RANK,
} from "./executive-brain-types";

// ── Briefing Builder API ──────────────────────────────────────────────────────

export interface BriefingBuilderInput {
  readonly orgSlug: string;
  readonly type: ExecutiveBriefingType;
  readonly priorities: ExecutivePriority[];
  readonly concerns: ExecutiveConcern[];
  readonly recommendations: ExecutiveRecommendation[];
  readonly narratives: ExecutiveNarrative[];
  readonly focusAreas: ExecutiveFocusArea[];
  readonly conflicts: ExecutiveConflict[];
  readonly themes: ExecutiveTheme[];
  readonly executiveScore: number;
  readonly domains?: ExecutiveDomain[]; // for custom briefings
}

export function buildExecutiveBriefing(input: BriefingBuilderInput): ExecutiveBriefing {
  const { orgSlug, type, executiveScore } = input;
  const domainFilter = _getDomainsForType(type, input.domains);

  const priorities = _filterByDomains(input.priorities, domainFilter)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 7);

  const concerns = _filterByDomains(input.concerns, domainFilter)
    .sort((a, b) => EXECUTIVE_PRIORITY_RANK[b.severity] - EXECUTIVE_PRIORITY_RANK[a.severity])
    .slice(0, 5);

  const recommendations = _filterByDomains(input.recommendations, domainFilter).slice(0, 5);
  const narratives = _filterByDomains(input.narratives, domainFilter).slice(0, 4);
  const focusAreas = _filterByDomains(input.focusAreas, domainFilter).slice(0, 5);
  const conflicts = _filterByDomains(input.conflicts, domainFilter).slice(0, 3);
  const themes = _filterByDomains(input.themes, domainFilter).slice(0, 4);

  const title = _buildBriefingTitle(type, orgSlug);
  const summary = _buildBriefingSummary(type, priorities, concerns, executiveScore);
  const confidence = confidenceFromScore(executiveScore);

  return {
    id: generateEbv2Id("brief"),
    orgSlug,
    type,
    title,
    summary,
    priorities,
    concerns,
    recommendations,
    narratives,
    focusAreas,
    conflicts,
    themes,
    executiveScore,
    confidence,
    metadata: {
      briefingType: type,
      domainFilter,
      itemCount: priorities.length + concerns.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

export function buildCEOBriefing(
  orgSlug: string,
  input: Omit<BriefingBuilderInput, "orgSlug" | "type">
): ExecutiveBriefing {
  return buildExecutiveBriefing({ orgSlug, type: "CEO", ...input });
}

export function buildFinanceBriefing(
  orgSlug: string,
  input: Omit<BriefingBuilderInput, "orgSlug" | "type">
): ExecutiveBriefing {
  return buildExecutiveBriefing({ orgSlug, type: "FINANCE", ...input });
}

export function buildCommercialBriefing(
  orgSlug: string,
  input: Omit<BriefingBuilderInput, "orgSlug" | "type">
): ExecutiveBriefing {
  return buildExecutiveBriefing({ orgSlug, type: "COMMERCIAL", ...input });
}

export function buildOperationsBriefing(
  orgSlug: string,
  input: Omit<BriefingBuilderInput, "orgSlug" | "type">
): ExecutiveBriefing {
  return buildExecutiveBriefing({ orgSlug, type: "OPERATIONS", ...input });
}

export function buildCustomBriefing(
  orgSlug: string,
  domains: ExecutiveDomain[],
  input: Omit<BriefingBuilderInput, "orgSlug" | "type" | "domains">
): ExecutiveBriefing {
  return buildExecutiveBriefing({ orgSlug, type: "CUSTOM", domains, ...input });
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _getDomainsForType(type: ExecutiveBriefingType, custom?: ExecutiveDomain[]): ExecutiveDomain[] | null {
  switch (type) {
    case "CEO": return null; // all domains
    case "FINANCE": return ["FINANCE", "COMPLIANCE"];
    case "COMMERCIAL": return ["COMMERCIAL", "MARKETING"];
    case "OPERATIONS": return ["OPERATIONS", "TECHNOLOGY", "PEOPLE"];
    case "CUSTOM": return custom ?? null;
  }
}

function _filterByDomains<T extends { domain: ExecutiveDomain }>(
  items: T[],
  domains: ExecutiveDomain[] | null
): T[] {
  if (!domains) return items;
  return items.filter((i) => domains.includes(i.domain) || i.domain === "CROSS_DOMAIN");
}

function _buildBriefingTitle(type: ExecutiveBriefingType, orgSlug: string): string {
  const labels: Record<ExecutiveBriefingType, string> = {
    CEO: "Informe ejecutivo CEO",
    FINANCE: "Informe financiero ejecutivo",
    COMMERCIAL: "Informe comercial ejecutivo",
    OPERATIONS: "Informe operacional ejecutivo",
    CUSTOM: "Informe ejecutivo personalizado",
  };
  return `${labels[type]} — ${orgSlug}`;
}

function _buildBriefingSummary(
  type: ExecutiveBriefingType,
  priorities: ExecutivePriority[],
  concerns: ExecutiveConcern[],
  score: number
): string {
  const scoreText = `Score ejecutivo: ${Math.round(score * 100)}%.`;
  const criticalConcerns = concerns.filter((c) => c.severity === "CRITICAL");

  if (criticalConcerns.length > 0) {
    return `${scoreText} ${criticalConcerns.length} preocupación(es) crítica(s). Prioridad inmediata: ${criticalConcerns[0].title}.`;
  }
  if (priorities.length > 0) {
    return `${scoreText} ${priorities.length} prioridad(es) activa(s). Enfoque principal: ${priorities[0].title}.`;
  }
  return `${scoreText} Sin alertas críticas detectadas.`;
}
