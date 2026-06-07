// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Integration: Strategic Memory ↔ Executive Brain

import type { StrategicMemoryEntry, StrategicMemorySnapshot } from "../strategic-memory-types";
import type { StrategicMemoryInput } from "../strategic-memory-builder";

// Minimal executive brain interfaces to avoid circular deps
export interface ExecutiveBrainSignal {
  readonly id: string;
  readonly orgSlug: string;
  readonly category: string;
  readonly severity: string;
  readonly title: string;
  readonly description: string;
  readonly confidence?: number;
  readonly agentId?: string;
  readonly detectedAt: string;
}

export interface ExecutiveInsight {
  readonly id: string;
  readonly orgSlug: string;
  readonly domain: string;
  readonly title: string;
  readonly summary: string;
  readonly confidence: number;
  readonly validated: boolean;
  readonly createdAt: string;
}

// ── Adapters ──────────────────────────────────────────────────────────────────

export function executiveSignalToStrategicInput(
  signal: ExecutiveBrainSignal,
  expectedOrgSlug: string
): StrategicMemoryInput | null {
  if (signal.orgSlug !== expectedOrgSlug) return null;

  const severity = signal.severity.toUpperCase();
  const priority: StrategicMemoryInput["priority"] =
    severity === "CRITICAL" ? "CRITICAL" :
    severity === "HIGH" ? "HIGH" :
    severity === "MEDIUM" ? "MEDIUM" :
    "LOW";

  const category = signal.category.toUpperCase();
  const type: StrategicMemoryInput["type"] =
    category === "RISK" || category === "ALERT" ? "RISK" :
    category === "OPPORTUNITY" ? "OPPORTUNITY" :
    category === "DECISION" ? "DECISION" :
    "INSIGHT";

  return {
    orgSlug: signal.orgSlug,
    type,
    priority,
    domain: mapSignalCategoryToDomain(signal.category),
    title: signal.title,
    description: signal.description.slice(0, 500),
    rationale: `Derived from executive brain signal ${signal.id} — severity ${signal.severity}`,
    confidenceScore: signal.confidence ?? 0.6,
    source: "SYSTEM",
    agentId: signal.agentId,
    evidenceIds: [signal.id],
  };
}

export function executiveInsightToStrategicInput(
  insight: ExecutiveInsight,
  expectedOrgSlug: string
): StrategicMemoryInput | null {
  if (insight.orgSlug !== expectedOrgSlug) return null;
  if (!insight.validated) return null;
  if (insight.confidence < 0.5) return null;

  return {
    orgSlug: insight.orgSlug,
    type: "INSIGHT",
    priority: insight.confidence >= 0.8 ? "HIGH" : "MEDIUM",
    domain: mapInsightDomainToStrategic(insight.domain),
    title: insight.title,
    description: insight.summary.slice(0, 500),
    rationale: `Validated executive insight ${insight.id} — confidence ${(insight.confidence * 100).toFixed(0)}%`,
    confidenceScore: insight.confidence,
    source: "EXECUTIVE_BRAIN",
    evidenceIds: [insight.id],
  };
}

export function buildExecutiveStrategicContext(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): string {
  const scoped = entries.filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE");
  const critical = scoped.filter((e) => e.priority === "CRITICAL");
  const goals = scoped.filter((e) => e.type === "GOAL" || e.type === "OBJECTIVE");
  const risks = scoped.filter((e) => e.type === "RISK");

  const parts: string[] = [];

  if (goals.length > 0) {
    parts.push(`Active Goals (${goals.length}): ${goals.slice(0, 3).map((g) => g.title).join(", ")}`);
  }
  if (critical.length > 0) {
    parts.push(`CRITICAL Items (${critical.length}): ${critical.slice(0, 3).map((c) => c.title).join(", ")}`);
  }
  if (risks.length > 0) {
    parts.push(`Active Risks (${risks.length}): ${risks.slice(0, 3).map((r) => r.title).join(", ")}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "No active strategic context.";
}

export function snapshotToExecutiveBriefing(snapshot: StrategicMemorySnapshot): string {
  return [
    `Strategic Score: ${(snapshot.strategicScore * 100).toFixed(0)}%`,
    `Active Items: ${snapshot.activeItems} (${snapshot.criticalItems} critical)`,
    snapshot.narrative,
  ].join(" — ");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapSignalCategoryToDomain(category: string): StrategicMemoryInput["domain"] {
  const c = category.toUpperCase();
  if (c.includes("FINANCE") || c.includes("COLLECTION") || c.includes("PAYMENT")) return "FINANCE";
  if (c.includes("COMMERCIAL") || c.includes("SALES") || c.includes("ORDER")) return "COMMERCIAL";
  if (c.includes("MARKETING")) return "MARKETING";
  if (c.includes("COMPLIANCE")) return "COMPLIANCE";
  if (c.includes("OPERATIONS") || c.includes("INVENTORY")) return "OPERATIONS";
  return "EXECUTIVE";
}

function mapInsightDomainToStrategic(domain: string): StrategicMemoryInput["domain"] {
  switch (domain.toUpperCase()) {
    case "FINANCE": return "FINANCE";
    case "COMMERCIAL": return "COMMERCIAL";
    case "MARKETING": return "MARKETING";
    case "OPERATIONS": return "OPERATIONS";
    case "EXECUTIVE": return "EXECUTIVE";
    case "COMPLIANCE": return "COMPLIANCE";
    default: return "CROSS_DOMAIN";
  }
}
