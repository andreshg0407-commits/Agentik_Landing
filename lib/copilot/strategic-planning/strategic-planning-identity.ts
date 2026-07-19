// AGENTIK-STRATEGIC-PLANNING-01
// Phase 2 — Planning Identity

let _planCounter = 0;

function _next(): string {
  _planCounter = (_planCounter + 1) % 99999;
  return `${Date.now().toString(36)}_${_planCounter}`;
}

export function generatePlanId():         string { return `plan_${_next()}`; }
export function generateObjectiveId():    string { return `objective_${_next()}`; }
export function generateInitiativeId():   string { return `initiative_${_next()}`; }
export function generateMilestoneId():    string { return `milestone_${_next()}`; }
export function generateDependencyId():   string { return `dependency_${_next()}`; }
export function generateRoadmapId():      string { return `roadmap_${_next()}`; }
export function generateRiskPlanId():     string { return `planrisk_${_next()}`; }
export function generateOppPlanId():      string { return `planopp_${_next()}`; }
export function generateCandidateId():    string { return `candidate_${_next()}`; }
export function generateSnapshotId():     string { return `snapshot_${_next()}`; }

export function validatePlanningId(id: string): boolean {
  const validPrefixes = ["plan_", "objective_", "initiative_", "milestone_", "dependency_", "roadmap_", "planrisk_", "planopp_", "candidate_", "snapshot_"];
  return validPrefixes.some((p) => id.startsWith(p));
}
