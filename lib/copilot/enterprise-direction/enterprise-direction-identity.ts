// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 2: Identity Generation

let _counter = 0;
function next(): string {
  _counter = (_counter + 1) % 99999;
  return _counter.toString(36).padStart(3, "0");
}

export const DIRECTION_ID_PREFIXES = [
  "direction_",
  "northstar_",
  "dobjective_",
  "dpriority_",
  "dinitiative_",
  "dreport_",
  "dtheme_",
  "dpillar_",
  "dalignment_",
  "ddeviation_",
  "dconflict_",
  "dsignal_",
  "drec_",
  "ddigest_",
  "dbriefing_",
  "daud_",
] as const;

export type DirectionIdPrefix = (typeof DIRECTION_ID_PREFIXES)[number];

export function generateDirectionId(): string {
  return `direction_${Date.now().toString(36)}_${next()}`;
}

export function generateNorthStarId(): string {
  return `northstar_${Date.now().toString(36)}_${next()}`;
}

export function generateDirectionObjectiveId(): string {
  return `dobjective_${Date.now().toString(36)}_${next()}`;
}

export function generateDirectionPriorityId(): string {
  return `dpriority_${Date.now().toString(36)}_${next()}`;
}

export function generateDirectionInitiativeId(): string {
  return `dinitiative_${Date.now().toString(36)}_${next()}`;
}

export function generateDirectionReportId(): string {
  return `dreport_${Date.now().toString(36)}_${next()}`;
}

export function generateStrategicThemeId(): string {
  return `dtheme_${Date.now().toString(36)}_${next()}`;
}

export function generateStrategicPillarId(): string {
  return `dpillar_${Date.now().toString(36)}_${next()}`;
}

export function generateDirectionAlignmentId(): string {
  return `dalignment_${Date.now().toString(36)}_${next()}`;
}

export function generateDirectionDeviationId(): string {
  return `ddeviation_${Date.now().toString(36)}_${next()}`;
}

export function generateDirectionConflictId(): string {
  return `dconflict_${Date.now().toString(36)}_${next()}`;
}

export function generateDirectionSignalId(): string {
  return `dsignal_${Date.now().toString(36)}_${next()}`;
}

export function generateDirectionRecommendationId(): string {
  return `drec_${Date.now().toString(36)}_${next()}`;
}

export function generateDirectionDigestId(): string {
  return `ddigest_${Date.now().toString(36)}_${next()}`;
}

export function generateDirectionBriefingId(): string {
  return `dbriefing_${Date.now().toString(36)}_${next()}`;
}

export function generateDirectionAuditId(): string {
  return `daud_${Date.now().toString(36)}_${next()}`;
}

export function validateDirectionId(id: string): boolean {
  return DIRECTION_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export function getDirectionIdPrefix(id: string): DirectionIdPrefix | null {
  return DIRECTION_ID_PREFIXES.find((prefix) => id.startsWith(prefix)) ?? null;
}
