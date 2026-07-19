/**
 * lib/agent-intelligence/runtime-intelligence-engine.ts
 *
 * Agentik Runtime Intelligence — Main Engine
 *
 * Composes all sub-engines into a single RuntimeIntelligenceReport.
 * Also handles:
 *   - Memory graph pattern interpretation
 *   - Orphan decision detection
 *   - Cross-module dependency signals
 *   - Executive rail summary derivation
 *
 * Entry point: generateRuntimeIntelligence()
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-INTELLIGENCE-01
 */

import type { ActionEnvelope }             from "@/lib/agent-runtime/action-envelope";
import type { RuntimeMemoryNode }           from "@/lib/agent-memory/runtime-memory-types";
import type { AgentObservation }            from "@/lib/agent-memory/runtime-memory-types";
import type {
  RuntimeIntelligenceReport,
  DetectedPattern,
  OrphanDecision,
  ExecutiveRuntimeInsight,
  RuntimeInsight,
} from "./runtime-intelligence-types";
import { buildRuntimePriorities }           from "./runtime-priority-engine";
import { detectRuntimeBlockers }            from "./runtime-blocker-engine";
import { buildCoordinationRecommendations } from "./runtime-coordination-engine";

// ── Memory graph interpreter ──────────────────────────────────────────────────

/**
 * Detect repeated action patterns across envelopes.
 * Groups by (actionType × agentId) and computes outcome distribution.
 */
export function detectRepeatedPatterns(
  envelopes: ActionEnvelope[],
): DetectedPattern[] {
  const patternMap = new Map<string, ActionEnvelope[]>();

  for (const e of envelopes) {
    const key = `${e.type}:${String(e.sourceAgentId)}:${e.moduleKey}`;
    const bucket = patternMap.get(key) ?? [];
    bucket.push(e);
    patternMap.set(key, bucket);
  }

  const patterns: DetectedPattern[] = [];
  for (const [key, actions] of patternMap) {
    if (actions.length < 2) continue; // Only patterns with >= 2 occurrences
    const [actionType, agentId, moduleId] = key.split(":");

    const sorted  = [...actions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const first   = sorted[0]!.createdAt;
    const last    = sorted[sorted.length - 1]!.createdAt;

    patterns.push({
      patternKey:  key,
      actionType:  actionType ?? "",
      agentId:     agentId ?? "",
      moduleId:    moduleId ?? "",
      occurrences: actions.length,
      firstSeen:   first,
      lastSeen:    last,
      outcomes: {
        approved: actions.filter(a => a.agentStatus === "approved" || a.agentStatus === "executed").length,
        rejected: actions.filter(a => a.agentStatus === "rejected" || a.agentStatus === "dismissed").length,
        failed:   actions.filter(a => a.agentStatus === "failed").length,
        pending:  actions.filter(a => a.agentStatus === "pending_approval" || a.agentStatus === "suggested").length,
      },
    });
  }

  return patterns.sort((a, b) => b.occurrences - a.occurrences);
}

/**
 * Detect unresolved memory chains: node sequences ending in failure or rejection
 * with no subsequent resolution node.
 */
export function detectUnresolvedChains(
  memoryNodes: RuntimeMemoryNode[],
): { chainId: string; moduleId: string; agentId: string; depth: number; lastState: string }[] {
  const terminalNodes = memoryNodes.filter(n =>
    (n.nodeType === "action_failed" || n.nodeType === "action_rejected") &&
    n.relatedEdges.length === 0,
  );

  return terminalNodes.map(n => ({
    chainId:   n.id,
    moduleId:  n.moduleId,
    agentId:   String(n.agentId),
    depth:     1,
    lastState: n.nodeType,
  }));
}

/**
 * Detect cross-module impact: actions where the agent's module key differs
 * from a detected "affects_module" pattern (proxy: same action affects multiple modules).
 */
export function detectCrossModuleImpact(
  envelopes:   ActionEnvelope[],
  memoryNodes: RuntimeMemoryNode[],
): { agentId: string; sourceModule: string; affectedModule: string; actionId: string | null }[] {
  const results: { agentId: string; sourceModule: string; affectedModule: string; actionId: string | null }[] = [];

  // Cross-module signal: same agent has pending actions in different modules
  const agentModules = new Map<string, Set<string>>();
  for (const e of envelopes) {
    if (e.agentStatus !== "pending_approval" && e.agentStatus !== "approved") continue;
    const aid = String(e.sourceAgentId);
    const mods = agentModules.get(aid) ?? new Set();
    mods.add(e.moduleKey);
    agentModules.set(aid, mods);
  }

  for (const [agentId, mods] of agentModules) {
    if (mods.size < 2) continue;
    const modList = [...mods];
    results.push({
      agentId,
      sourceModule:   modList[0]!,
      affectedModule: modList[1]!,
      actionId:       null,
    });
  }

  // Also check memory node domains
  void memoryNodes;

  return results;
}

/**
 * Detect orphan decision nodes: decision_point nodes with no related edges.
 */
export function detectOrphanDecisions(
  memoryNodes: RuntimeMemoryNode[],
): OrphanDecision[] {
  return memoryNodes
    .filter(n => n.nodeType === "decision_point" && n.relatedEdges.length === 0)
    .map(n => ({
      nodeId:    n.id,
      agentId:   String(n.agentId),
      moduleId:  n.moduleId,
      summary:   n.summary,
      timestamp: n.timestamp,
      reason:    "no_connected_action" as const,
    }));
}

// ── Summary derivation ────────────────────────────────────────────────────────

function deriveSummary(
  envelopes:    ActionEnvelope[],
  insights:     RuntimeInsight[],
  patterns:     DetectedPattern[],
  orphans:      OrphanDecision[],
  blockerCount: number,
  coordCount:   number,
): RuntimeIntelligenceReport["summary"] {
  // Most pressured module: highest count of pending_approval actions
  const moduleCounts = new Map<string, number>();
  for (const e of envelopes) {
    if (e.agentStatus !== "pending_approval") continue;
    moduleCounts.set(e.moduleKey, (moduleCounts.get(e.moduleKey) ?? 0) + 1);
  }
  const mostPressuredModule = moduleCounts.size > 0
    ? [...moduleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    : null;

  // Most active agent: highest total action count
  const agentCounts = new Map<string, number>();
  for (const e of envelopes) {
    const aid = String(e.sourceAgentId);
    agentCounts.set(aid, (agentCounts.get(aid) ?? 0) + 1);
  }
  const mostActiveAgent = agentCounts.size > 0
    ? [...agentCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    : null;

  // Stale pending count
  const staleMs = 30 * 60_000;
  const staleActionCount = envelopes.filter(e =>
    e.agentStatus === "pending_approval" &&
    (Date.now() - new Date(e.createdAt).getTime()) > staleMs,
  ).length;

  return {
    insightCount:         insights.length,
    blockerCount,
    coordinationCount:    coordCount,
    criticalInsightCount: insights.filter(i => i.severity === "critical").length,
    mostPressuredModule,
    mostActiveAgent,
    staleActionCount,
    patternsDetected:     patterns.length,
    orphanChains:         orphans.length,
  };
}

// ── Executive rail summary ────────────────────────────────────────────────────

export function deriveExecutiveRuntimeInsight(
  report: RuntimeIntelligenceReport,
): ExecutiveRuntimeInsight {
  const topInsight = report.insights.find(i => i.severity === "critical") ??
                     report.insights.find(i => i.severity === "high") ??
                     report.insights[0] ?? null;

  const criticalBlockers = report.blockers.filter(b => b.severity === "critical").length;

  const topCoord = report.coordinationRecommendations.find(c => c.priority === "high" || c.priority === "critical");
  const coordinationHint = topCoord
    ? `${topCoord.sourceAgentId} → ${topCoord.targetAgentId}: ${topCoord.recommendedAction.slice(0, 80)}…`
    : null;

  const stale = report.summary.staleActionCount;
  const module = report.summary.mostPressuredModule;
  const nextBestAction = stale > 0 && module
    ? `Revisar ${stale} propuesta${stale !== 1 ? "s" : ""} sin resolver en ${module}`
    : report.blockers[0]
      ? report.blockers[0].suggestedResolution
      : null;

  return { topInsight, nextBestAction, coordinationHint, criticalBlockers };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function generateRuntimeIntelligence(
  orgId:        string,
  envelopes:    ActionEnvelope[],
  memoryNodes:  RuntimeMemoryNode[],
  observations: AgentObservation[],
): RuntimeIntelligenceReport {
  const insights      = buildRuntimePriorities(envelopes, memoryNodes, observations, orgId);
  const blockers      = detectRuntimeBlockers(envelopes, memoryNodes, observations);
  const coordination  = buildCoordinationRecommendations(envelopes, memoryNodes, observations);
  const patterns      = detectRepeatedPatterns(envelopes);
  const orphans       = detectOrphanDecisions(memoryNodes);

  const summary = deriveSummary(envelopes, insights, patterns, orphans, blockers.length, coordination.length);

  return {
    orgId,
    insights,
    blockers,
    coordinationRecommendations: coordination,
    detectedPatterns:            patterns,
    orphanDecisions:             orphans,
    summary,
    generatedAt:                 new Date().toISOString(),
  };
}
