// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Narrative Engine — strategic knowledge → executive language

import type {
  StrategicMemoryEntry,
  StrategicMemoryContext,
  StrategicMemorySnapshot,
} from "./strategic-memory-types";

export interface StrategicNarrative {
  readonly orgSlug: string;
  readonly headline: string;
  readonly body: string;
  readonly bulletPoints: string[];
  readonly callsToAction: string[];
  readonly generatedAt: string; // ISO8601
}

function priorityLabel(priority: string): string {
  switch (priority) {
    case "CRITICAL": return "CRITICAL";
    case "HIGH": return "High-priority";
    case "MEDIUM": return "Medium-priority";
    default: return "Low-priority";
  }
}

export function buildGoalNarrative(
  orgSlug: string,
  goals: StrategicMemoryEntry[]
): StrategicNarrative {
  const active = goals.filter((g) => g.status === "ACTIVE");
  const critical = active.filter((g) => g.priority === "CRITICAL");

  const headline = active.length > 0
    ? `${active.length} active strategic goal(s) — ${critical.length > 0 ? `${critical.length} critical` : "no critical"}`
    : "No active strategic goals";

  const bulletPoints = active.slice(0, 5).map(
    (g) => `[${priorityLabel(g.priority)}] ${g.title}: ${g.description.slice(0, 120)}`
  );

  const callsToAction: string[] = [];
  if (critical.length > 0) {
    callsToAction.push(`Review ${critical.length} critical goal(s) immediately`);
  }

  return {
    orgSlug,
    headline,
    body: `The organization has ${active.length} active strategic goals. ` +
      (critical.length > 0 ? `${critical.length} require immediate attention.` : ""),
    bulletPoints,
    callsToAction,
    generatedAt: new Date().toISOString(),
  };
}

export function buildRiskNarrative(
  orgSlug: string,
  risks: StrategicMemoryEntry[]
): StrategicNarrative {
  const active = risks.filter((r) => r.status === "ACTIVE");
  const critical = active.filter((r) => r.priority === "CRITICAL");
  const high = active.filter((r) => r.priority === "HIGH");

  const headline = critical.length > 0
    ? `${critical.length} CRITICAL strategic risk(s) require immediate action`
    : active.length > 0
      ? `${active.length} active strategic risk(s)`
      : "No active strategic risks";

  const bulletPoints = [...critical, ...high].slice(0, 5).map(
    (r) => `[${priorityLabel(r.priority)}] ${r.title}: ${r.description.slice(0, 120)}`
  );

  const callsToAction: string[] = [];
  if (critical.length > 0) {
    callsToAction.push(`Escalate ${critical.length} critical risk(s) to executive team`);
  }

  return {
    orgSlug,
    headline,
    body: `Strategic risk profile: ${active.length} active risks (${critical.length} critical, ${high.length} high).`,
    bulletPoints,
    callsToAction,
    generatedAt: new Date().toISOString(),
  };
}

export function buildOpportunityNarrative(
  orgSlug: string,
  opportunities: StrategicMemoryEntry[]
): StrategicNarrative {
  const active = opportunities.filter((o) => o.status === "ACTIVE");

  const headline = active.length > 0
    ? `${active.length} strategic opportunity(ies) identified`
    : "No active strategic opportunities";

  const bulletPoints = active.slice(0, 5).map(
    (o) => `[${priorityLabel(o.priority)}] ${o.title}: ${o.description.slice(0, 120)}`
  );

  return {
    orgSlug,
    headline,
    body: `The organization has ${active.length} active strategic opportunities ready for activation.`,
    bulletPoints,
    callsToAction: active.length > 0 ? ["Review top opportunities for activation planning"] : [],
    generatedAt: new Date().toISOString(),
  };
}

export function buildStrategicSummary(
  orgSlug: string,
  context: StrategicMemoryContext
): StrategicNarrative {
  const parts: string[] = [];
  const bullets: string[] = [];
  const actions: string[] = [];

  if (context.activeGoals.length > 0) {
    parts.push(`${context.activeGoals.length} active goals`);
    bullets.push(`Goals: ${context.activeGoals.map((g) => g.title).slice(0, 3).join(", ")}`);
  }

  if (context.criticalRisks.length > 0) {
    parts.push(`${context.criticalRisks.length} critical risks`);
    actions.push(`Address ${context.criticalRisks.length} critical risk(s)`);
    bullets.push(`Critical risks: ${context.criticalRisks.map((r) => r.title).slice(0, 3).join(", ")}`);
  }

  if (context.recentDecisions.length > 0) {
    parts.push(`${context.recentDecisions.length} recent decisions`);
  }

  if (context.activeCommitments.length > 0) {
    bullets.push(`Active commitments: ${context.activeCommitments.length}`);
  }

  return {
    orgSlug,
    headline: parts.length > 0 ? parts.join(" · ") : "No active strategic context",
    body: `Strategic memory score: ${(context.strategicScore * 100).toFixed(0)}%. ${parts.join(". ")}.`,
    bulletPoints: bullets,
    callsToAction: actions,
    generatedAt: new Date().toISOString(),
  };
}

export function buildExecutiveNarrative(
  orgSlug: string,
  snapshot: StrategicMemorySnapshot
): StrategicNarrative {
  const parts: string[] = [];
  const bullets: string[] = [];
  const actions: string[] = [];

  if (snapshot.goals.length > 0) {
    parts.push(`${snapshot.goals.length} strategic goal(s)`);
    bullets.push(`Active goals: ${snapshot.goals.map((g) => g.title).slice(0, 3).join(", ")}`);
  }

  if (snapshot.criticalItems > 0) {
    parts.push(`${snapshot.criticalItems} critical item(s)`);
    actions.push(`Review ${snapshot.criticalItems} critical strategic item(s)`);
  }

  if (snapshot.risks.length > 0) {
    parts.push(`${snapshot.risks.length} active risk(s)`);
  }

  if (snapshot.commitments.length > 0) {
    bullets.push(`Active commitments: ${snapshot.commitments.length}`);
  }

  return {
    orgSlug,
    headline: `Strategic state — Score: ${(snapshot.strategicScore * 100).toFixed(0)}%`,
    body: snapshot.narrative,
    bulletPoints: bullets,
    callsToAction: actions,
    generatedAt: new Date().toISOString(),
  };
}
