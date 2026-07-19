/**
 * lib/copilot/executive-brain/executive-brain-types.ts
 *
 * Agentik — Executive Brain — Domain Types
 * Sprint: AGENTIK-EXECUTIVE-BRAIN-01
 *
 * Core domain types for the Executive Brain layer.
 * The Executive Brain transforms dispersed information into executive criterion:
 *   - "What should I worry about today?"
 *   - "Where is the greatest risk?"
 *   - "What needs immediate attention?"
 *
 * All types are:
 *   - JSON serializable (no Date objects, no class instances, no circular refs)
 *   - Multi-tenant by design (every context object carries orgSlug)
 *   - Pure domain — no Prisma, no React, no Next.js, no server-only
 *   - Completely independent of Memory Engine, Playbooks, Agent Runtime
 */

// ── Enums ─────────────────────────────────────────────────────────────────────

/**
 * Severity of an executive signal.
 * CRITICAL — requires immediate attention; blocks normal operation
 * HIGH     — important; should be addressed within the day
 * MEDIUM   — notable; worth monitoring
 * LOW      — informational; no urgent action needed
 */
export type ExecutiveSignalSeverity =
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW";

/**
 * Direction of an executive signal — is the underlying metric improving or worsening?
 */
export type ExecutiveSignalDirection =
  | "IMPROVING"
  | "STABLE"
  | "DECLINING";

/**
 * Business domain that an executive signal belongs to.
 */
export type ExecutiveSignalCategory =
  | "FINANCE"
  | "COMMERCIAL"
  | "COLLECTIONS"
  | "MARKETING"
  | "OPERATIONS"
  | "EXECUTIVE";

// ── Signal ────────────────────────────────────────────────────────────────────

/**
 * An ExecutiveSignal is a discrete observation extracted from operational context.
 *
 * Signals are the atomic unit of executive intelligence.
 * They are extracted from memory entries and playbooks, then ranked and grouped
 * into insights.
 *
 * Examples:
 *   - "Cartera vencida por encima del 20%" (COLLECTIONS/CRITICAL/DECLINING)
 *   - "Conciliación bancaria pendiente" (FINANCE/HIGH/STABLE)
 *   - "Campaña Q2 superó target" (MARKETING/MEDIUM/IMPROVING)
 */
export interface ExecutiveSignal {
  /** Unique identifier for this signal instance. */
  id:          string;
  /** Short human-readable label. */
  title:       string;
  /** Explanation of what this signal means and why it matters. */
  description: string;
  /** Business domain. */
  category:    ExecutiveSignalCategory;
  /** Urgency level. */
  severity:    ExecutiveSignalSeverity;
  /** Trend direction. */
  direction:   ExecutiveSignalDirection;
  /**
   * Confidence in this signal (0.0 – 1.0).
   * 1.0 = directly observed, 0.5 = inferred from context, 0.1 = weak hint.
   */
  confidence:  number;
  /**
   * Where the signal was extracted from.
   * e.g. "memory:mem-001", "playbook:pb-001", "registry:FINANCE_LOW_CASH"
   */
  source:      string;
  /** Arbitrary serializable metadata for traceability. */
  metadata:    Record<string, unknown>;
  /** ISO 8601 — when this signal was generated. */
  generatedAt: string;
}

// ── Insight ───────────────────────────────────────────────────────────────────

/**
 * An ExecutiveInsight aggregates related signals into a human-readable observation.
 *
 * Insights are what Copilot presents to the executive. They are derived from
 * one or more signals via deterministic grouping rules.
 *
 * Examples:
 *   - "Riesgo elevado en recuperación de cartera" (CRITICAL, COLLECTIONS)
 *   - "Situación financiera estable con señales positivas" (LOW, FINANCE)
 */
export interface ExecutiveInsight {
  /** Unique identifier. */
  id:                string;
  /** One-line executive label. */
  title:             string;
  /** 1–2 sentence summary for executive consumption. */
  summary:           string;
  /**
   * Priority of this insight — drives ordering in Copilot output.
   * Derived from the highest severity among supportingSignals.
   */
  priority:          ExecutiveSignalSeverity;
  /** Business domains this insight spans. */
  categories:        ExecutiveSignalCategory[];
  /** IDs of the signals that support this insight. */
  supportingSignals: string[];
}

// ── Context ───────────────────────────────────────────────────────────────────

/**
 * ExecutiveContext — the final output of the Executive Brain pipeline.
 * Attached to CopilotResponse when the brain produced actionable intelligence.
 */
export interface ExecutiveContext {
  /** Tenant this context belongs to. */
  orgSlug:     string;
  /** All ranked signals from this analysis run. */
  signals:     ExecutiveSignal[];
  /** All derived insights from this analysis run. Max 10. */
  insights:    ExecutiveInsight[];
  /** ISO 8601 — when this context was assembled. */
  generatedAt: string;
}

// ── Input / options ───────────────────────────────────────────────────────────

export interface ExecutiveBrainInput {
  orgSlug: string;
  /** User's expressed intent — used to weight signal categories. */
  intent:  string;
  /** Optional: memory entries to extract signals from. */
  memoryEntries?: Array<{
    id:         string;
    type:       string;
    importance: string;
    title:      string;
    content:    string;
    tags:       string[];
    source:     string;
  }>;
  /** Optional: playbooks to extract signals from. */
  playbooks?: Array<{
    id:       string;
    title:    string;
    category: string;
    priority: string;
    status:   string;
    tags:     string[];
  }>;
}

export interface ExecutiveBrainOptions {
  /** Maximum number of signals to retain after ranking. Default: 20. */
  maxSignals?:  number;
  /** Maximum number of insights to generate. Default: 10. */
  maxInsights?: number;
}

// ── Priority ordering ─────────────────────────────────────────────────────────

export const EXECUTIVE_SEVERITY_RANK: Record<ExecutiveSignalSeverity, number> = {
  CRITICAL: 3,
  HIGH:     2,
  MEDIUM:   1,
  LOW:      0,
};

/**
 * Sort comparator: CRITICAL first, then HIGH, MEDIUM, LOW.
 * Secondary sort: confidence DESC.
 */
export function sortSignalsByPriority(a: ExecutiveSignal, b: ExecutiveSignal): number {
  const sevDiff = EXECUTIVE_SEVERITY_RANK[b.severity] - EXECUTIVE_SEVERITY_RANK[a.severity];
  if (sevDiff !== 0) return sevDiff;
  return b.confidence - a.confidence;
}

/**
 * Sort comparator for insights: CRITICAL first, then by supportingSignals count.
 */
export function sortInsightsByPriority(a: ExecutiveInsight, b: ExecutiveInsight): number {
  const sevDiff = EXECUTIVE_SEVERITY_RANK[b.priority] - EXECUTIVE_SEVERITY_RANK[a.priority];
  if (sevDiff !== 0) return sevDiff;
  return b.supportingSignals.length - a.supportingSignals.length;
}
