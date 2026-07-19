/**
 * lib/marketing-studio/orchestrator/orchestrator-engine.ts
 *
 * MS-17 — Unified Publishing Orchestrator: Core engine + RSC entry point
 *
 * SERVER ONLY — never import in client components.
 */

import type { OrchestratorRuntimeState } from "./orchestrator-types";
import {
  listOrchestratorPlans,
  listRecentOrchestratorActivity,
} from "./orchestrator-repository";
import { computeOrchestratorHealth }    from "./orchestrator-health";
import { computeAllRecommendations }    from "./orchestrator-recommendations";

// ── RSC entry point ───────────────────────────────────────────────────────────

export async function buildOrchestratorRuntimeState(
  organizationId: string,
): Promise<OrchestratorRuntimeState> {
  const [plans, _recentActivity] = await Promise.all([
    listOrchestratorPlans(organizationId, 50),
    listRecentOrchestratorActivity(organizationId, 30),
  ]);

  const health          = computeOrchestratorHealth(plans);
  const recommendations = computeAllRecommendations(plans, organizationId);
  const activePlanIds   = plans
    .filter(p => ["running", "queued", "validating", "partially_completed"].includes(p.status))
    .map(p => p.id);

  return {
    organizationId,
    computedAt:      new Date().toISOString(),
    plans,
    health,
    recommendations,
    totalPlans:      plans.length,
    activePlanIds,
  };
}
