// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 19 — Playbook Integration

import type { Playbook } from "../../playbooks/playbook-types";
import type { ExecutiveRecommendation, ExecutiveDomain } from "../executive-brain-types";
import { generateEbv2Id, confidenceFromScore } from "../executive-brain-types";

export interface PlaybookExecSummary {
  readonly orgSlug: string;
  readonly activePlaybookCount: number;
  readonly criticalPlaybookCount: number;
  readonly effectivePlaybookIds: string[];
  readonly playbookCoverage: Record<string, number>; // domain → count
}

export function buildPlaybookExecSummary(
  orgSlug: string,
  playbooks: Playbook[]
): PlaybookExecSummary {
  const scoped = playbooks.filter((p) => p.orgSlug === orgSlug && p.status === "ACTIVE");
  const coverage: Record<string, number> = {};
  for (const p of scoped) {
    coverage[p.category] = (coverage[p.category] ?? 0) + 1;
  }

  return {
    orgSlug,
    activePlaybookCount: scoped.length,
    criticalPlaybookCount: scoped.filter((p) => p.priority === "CRITICAL").length,
    effectivePlaybookIds: scoped.filter((p) => p.priority === "HIGH" || p.priority === "CRITICAL").map((p) => p.id),
    playbookCoverage: coverage,
  };
}

export function extractRecommendationsFromPlaybooks(
  orgSlug: string,
  playbooks: Playbook[]
): ExecutiveRecommendation[] {
  return playbooks
    .filter(
      (p) =>
        p.orgSlug === orgSlug &&
        p.status === "ACTIVE" &&
        (p.priority === "CRITICAL" || p.priority === "HIGH")
    )
    .slice(0, 5)
    .map((p) => ({
      id: generateEbv2Id("rec"),
      orgSlug,
      title: `Ejecutar playbook: ${p.title}`,
      description: p.description,
      rationale: `Playbook activo con prioridad ${p.priority}`,
      domain: _mapPlaybookCategory(p.category),
      priority: (p.priority === "CRITICAL" ? "CRITICAL" : p.priority === "HIGH" ? "HIGH" : "MEDIUM") as ExecutiveRecommendation["priority"],
      confidence: confidenceFromScore(p.priority === "CRITICAL" ? 0.9 : 0.7),
      confidenceScore: p.priority === "CRITICAL" ? 0.9 : 0.7,
      impactScore: p.priority === "CRITICAL" ? 0.9 : 0.7,
      urgencyScore: p.priority === "CRITICAL" ? 0.85 : 0.6,
      suggestedOnly: true as const,
      evidenceIds: [p.id],
      metadata: { source: "PLAYBOOK", playbookId: p.id, playbookCategory: p.category },
    }));
}

export function findRelatedPlaybooks(
  orgSlug: string,
  domain: ExecutiveDomain,
  playbooks: Playbook[]
): Playbook[] {
  const categoryForDomain = _domainToCategory(domain);
  return playbooks.filter(
    (p) =>
      p.orgSlug === orgSlug &&
      p.status === "ACTIVE" &&
      (p.category === categoryForDomain || p.category === "EXECUTIVE")
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _mapPlaybookCategory(category: string): ExecutiveDomain {
  const map: Record<string, ExecutiveDomain> = {
    FINANCE: "FINANCE", COLLECTIONS: "FINANCE", SALES: "COMMERCIAL",
    MARKETING: "MARKETING", OPERATIONS: "OPERATIONS", EXECUTIVE: "EXECUTIVE",
    CUSTOMER_SERVICE: "COMMERCIAL", CUSTOM: "CROSS_DOMAIN",
  };
  return map[category] ?? "CROSS_DOMAIN";
}

function _domainToCategory(domain: ExecutiveDomain): string {
  const map: Record<ExecutiveDomain, string> = {
    FINANCE: "FINANCE", COMMERCIAL: "SALES", MARKETING: "MARKETING",
    OPERATIONS: "OPERATIONS", EXECUTIVE: "EXECUTIVE", COMPLIANCE: "CUSTOM",
    TECHNOLOGY: "CUSTOM", PEOPLE: "CUSTOM", CROSS_DOMAIN: "CUSTOM",
  };
  return map[domain] ?? "CUSTOM";
}
