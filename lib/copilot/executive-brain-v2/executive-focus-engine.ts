// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 9 — Executive Focus Engine
// Determines Top 3, Top 5, Top 10 focus areas

import type {
  ExecutiveFocusArea,
  ExecutivePriority,
  ExecutiveRisk,
  ExecutiveConflict,
  ExecutiveDomain,
} from "./executive-brain-types";
import { generateEbv2Id, confidenceFromScore } from "./executive-brain-types";

// ── Focus Engine API ──────────────────────────────────────────────────────────

export interface FocusEngineInput {
  readonly orgSlug: string;
  readonly priorities: ExecutivePriority[];
  readonly risks: ExecutiveRisk[];
  readonly conflicts: ExecutiveConflict[];
}

export function computeFocusAreas(input: FocusEngineInput): ExecutiveFocusArea[] {
  const { orgSlug } = input;
  const candidates = _buildFocusCandidates(input);
  return candidates
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((c, i) => ({ ...c, rank: i + 1 }))
    .slice(0, 10);
}

export function getTop3FocusAreas(areas: ExecutiveFocusArea[], orgSlug: string): ExecutiveFocusArea[] {
  return areas.filter((a) => a.orgSlug === orgSlug).slice(0, 3);
}

export function getTop5FocusAreas(areas: ExecutiveFocusArea[], orgSlug: string): ExecutiveFocusArea[] {
  return areas.filter((a) => a.orgSlug === orgSlug).slice(0, 5);
}

export function getTop10FocusAreas(areas: ExecutiveFocusArea[], orgSlug: string): ExecutiveFocusArea[] {
  return areas.filter((a) => a.orgSlug === orgSlug).slice(0, 10);
}

export function getFocusAreasByDomain(
  areas: ExecutiveFocusArea[],
  orgSlug: string,
  domain: ExecutiveDomain
): ExecutiveFocusArea[] {
  return areas.filter((a) => a.orgSlug === orgSlug && a.domain === domain);
}

// ── Private candidate building ────────────────────────────────────────────────

function _buildFocusCandidates(input: FocusEngineInput): ExecutiveFocusArea[] {
  const { orgSlug, priorities, risks, conflicts } = input;
  const candidates: ExecutiveFocusArea[] = [];
  const domainScores = new Map<ExecutiveDomain, { urgency: number; impact: number; count: number }>();

  // Aggregate from priorities
  for (const p of priorities) {
    const current = domainScores.get(p.domain) ?? { urgency: 0, impact: 0, count: 0 };
    domainScores.set(p.domain, {
      urgency: Math.max(current.urgency, p.urgencyScore),
      impact: Math.max(current.impact, p.impactScore),
      count: current.count + 1,
    });
  }

  // Boost from critical risks
  for (const r of risks.filter((r) => r.level === "CRITICAL" || r.level === "HIGH")) {
    const current = domainScores.get(r.domain) ?? { urgency: 0, impact: 0, count: 0 };
    domainScores.set(r.domain, {
      urgency: Math.max(current.urgency, r.likelihood + 0.1),
      impact: Math.max(current.impact, r.impact),
      count: current.count + 1,
    });
  }

  // Convert domain aggregates to focus areas
  for (const [domain, scores] of domainScores.entries()) {
    const urgencyScore = Math.min(scores.urgency, 1);
    const impactScore = Math.min(scores.impact, 1);
    const compositeScore = Math.round((urgencyScore * 0.45 + impactScore * 0.55) * 100) / 100;

    const topPriority = priorities.find((p) => p.domain === domain && p.orgSlug === orgSlug);
    const topRisk = risks.find((r) => r.domain === domain && r.orgSlug === orgSlug);

    const title = _buildFocusTitle(domain, topPriority, topRisk);
    const rationale = _buildFocusRationale(domain, scores.count, topPriority, topRisk);

    candidates.push({
      id: generateEbv2Id("focus"),
      orgSlug,
      rank: 0,
      title,
      rationale,
      domain,
      priority: compositeScore >= 0.8 ? "CRITICAL" : compositeScore >= 0.6 ? "HIGH" : compositeScore >= 0.35 ? "MEDIUM" : "LOW",
      confidence: confidenceFromScore(compositeScore * 0.85),
      urgencyScore,
      impactScore,
      compositeScore,
      evidenceIds: [
        ...(topPriority?.evidenceIds ?? []),
        ...(topRisk?.evidenceIds ?? []),
      ].slice(0, 5),
      metadata: {
        domain,
        signalCount: scores.count,
        source: "FOCUS_ENGINE",
      },
    });
  }

  // Add conflict-driven focus areas
  for (const conflict of conflicts.filter((c) => c.severity === "CRITICAL" || c.severity === "HIGH")) {
    if (candidates.some((c) => c.domain === conflict.domain)) continue;

    candidates.push({
      id: generateEbv2Id("focus"),
      orgSlug,
      rank: 0,
      title: `Resolver conflicto en ${conflict.domain}`,
      rationale: conflict.description,
      domain: conflict.domain,
      priority: "HIGH",
      confidence: conflict.confidence,
      urgencyScore: 0.7,
      impactScore: 0.75,
      compositeScore: 0.72,
      evidenceIds: [],
      metadata: { source: "CONFLICT_ENGINE", conflictId: conflict.id },
    });
  }

  return candidates;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _buildFocusTitle(
  domain: ExecutiveDomain,
  priority?: ExecutivePriority,
  risk?: ExecutiveRisk
): string {
  if (priority) return priority.title;
  if (risk) return `Gestión de riesgo: ${risk.title}`;
  return _domainLabel(domain);
}

function _buildFocusRationale(
  domain: ExecutiveDomain,
  signalCount: number,
  priority?: ExecutivePriority,
  risk?: ExecutiveRisk
): string {
  const parts: string[] = [];
  if (priority) parts.push(`Prioridad: ${priority.title}`);
  if (risk) parts.push(`Riesgo: ${risk.title}`);
  if (parts.length === 0) parts.push(_domainLabel(domain));
  parts.push(`${signalCount} señal(es) activa(s) en este dominio`);
  return parts.join(". ");
}

function _domainLabel(domain: ExecutiveDomain): string {
  const labels: Record<ExecutiveDomain, string> = {
    FINANCE: "Finanzas", COMMERCIAL: "Comercial", MARKETING: "Marketing",
    OPERATIONS: "Operaciones", EXECUTIVE: "Ejecutivo", COMPLIANCE: "Cumplimiento",
    TECHNOLOGY: "Tecnología", PEOPLE: "Personas", CROSS_DOMAIN: "Multi-dominio",
  };
  return labels[domain] ?? domain;
}
