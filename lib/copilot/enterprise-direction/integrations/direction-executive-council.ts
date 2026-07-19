// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 24: Executive Council Integration

export type DirectionCouncilSignal =
  | "ESCALATION_ACTIVE"
  | "COUNCIL_STABLE"
  | "NO_COUNCIL_DATA";

export interface DirectionCouncilContext {
  readonly orgSlug:       string;
  readonly signal:        DirectionCouncilSignal;
  readonly councilBoost:  number; // 0–0.10
  readonly hasEscalation: boolean;
}

export function getCouncilDirectionSignal(
  deliberations: Array<{ status?: string; priority?: string }> = []
): DirectionCouncilSignal {
  try {
    if (deliberations.length === 0) return "NO_COUNCIL_DATA";
    const hasEscalation = deliberations.some(
      (d) => d.status === "ESCALATED" || d.priority === "CRITICAL"
    );
    return hasEscalation ? "ESCALATION_ACTIVE" : "COUNCIL_STABLE";
  } catch {
    return "NO_COUNCIL_DATA";
  }
}

export function buildDirectionCouncilContext(
  orgSlug: string,
  deliberations: Array<{ status?: string; priority?: string }> = []
): DirectionCouncilContext {
  try {
    const signal        = getCouncilDirectionSignal(deliberations);
    const hasEscalation = signal === "ESCALATION_ACTIVE";
    const councilBoost  = deliberations.length > 0
      ? Math.min(0.10, deliberations.length * 0.015)
      : 0;
    return { orgSlug, signal, councilBoost, hasEscalation };
  } catch {
    return { orgSlug, signal: "NO_COUNCIL_DATA", councilBoost: 0, hasEscalation: false };
  }
}
