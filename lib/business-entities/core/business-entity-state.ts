/**
 * business-entity-state.ts
 *
 * BUSINESS-ENTITIES-CORE-01
 * Common operational state model for all Digital Business Entities.
 *
 * Replaces the simpler OperationalState from business-engine/entities.
 * Used by LiveVendor, LiveProduct, LiveCustomer, and all future entities.
 *
 * No Prisma. No React. Pure domain types.
 */

// ── State Levels ─────────────────────────────────────────────────────────────

/** The operational state of a business entity. */
export type BusinessEntityStateLevel =
  | "healthy"
  | "attention_needed"
  | "warning"
  | "critical"
  | "blocked"
  | "inactive"
  | "unknown";

// ── Severity ─────────────────────────────────────────────────────────────────

/** Severity of a condition affecting the entity. */
export type BusinessEntitySeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info";

// ── Signal ───────────────────────────────────────────────────────────────────

/** A discrete signal contributing to the entity's operational state. */
export interface BusinessEntitySignal {
  /** Signal identifier (e.g. "depleted_stock", "blocked_orders"). */
  code: string;
  /** Human-readable description. */
  message: string;
  /** Severity of this signal. */
  severity: BusinessEntitySeverity;
  /** Source system that detected this signal. */
  source: string;
  /** ISO timestamp when the signal was detected. */
  detectedAt: string;
}

// ── Operational State ────────────────────────────────────────────────────────

/**
 * The complete operational state of a business entity.
 *
 * This is richer than a simple health enum — it includes the reason,
 * severity, source, and contributing signals.
 */
export interface BusinessEntityState {
  /** Current operational state level. */
  level: BusinessEntityStateLevel;
  /** Human-readable reason for the current state. */
  reason: string;
  /** Overall severity. */
  severity: BusinessEntitySeverity;
  /** ISO timestamp when the state last changed. */
  lastChangedAt: string;
  /** Source that determined this state (e.g. "vendor-engine", "inventory-sync"). */
  source: string;
  /** Individual signals contributing to this state. */
  signals: BusinessEntitySignal[];
}

// ── State Computation Helpers ────────────────────────────────────────────────

/** Severity ordering (lower = more severe). */
const SEVERITY_ORDER: Record<BusinessEntitySeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/** Compute the highest severity from a list of signals. */
export function computeHighestSeverity(
  signals: BusinessEntitySignal[],
): BusinessEntitySeverity {
  if (signals.length === 0) return "info";
  return signals.reduce<BusinessEntitySeverity>((worst, s) =>
    SEVERITY_ORDER[s.severity] < SEVERITY_ORDER[worst] ? s.severity : worst,
    "info",
  );
}

/** Derive state level from severity. */
export function severityToStateLevel(severity: BusinessEntitySeverity): BusinessEntityStateLevel {
  switch (severity) {
    case "critical": return "critical";
    case "high":     return "warning";
    case "medium":   return "attention_needed";
    case "low":      return "healthy";
    case "info":     return "healthy";
  }
}

/** Build a BusinessEntityState from signals. */
export function buildStateFromSignals(
  signals: BusinessEntitySignal[],
  source: string,
): BusinessEntityState {
  const severity = computeHighestSeverity(signals);
  const level = severityToStateLevel(severity);
  const now = new Date().toISOString();

  const reason = signals.length === 0
    ? "Sin senales activas"
    : signals
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
        .slice(0, 3)
        .map(s => s.message)
        .join(". ");

  return { level, reason, severity, lastChangedAt: now, source, signals };
}
