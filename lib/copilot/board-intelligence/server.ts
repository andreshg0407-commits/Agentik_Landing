// AGENTIK-BOARD-INTELLIGENCE-01 — Server barrel (server-only)
import "server-only";

// Types
export * from "./board-intelligence-types";

// Identity
export * from "./board-intelligence-identity";

// Core engines
export * from "./governance-assessment-engine";
export * from "./strategic-assessment-engine";
export * from "./board-risk-engine";
export * from "./board-opportunity-engine";
export * from "./board-concern-engine";
export * from "./board-priority-engine";
export * from "./board-alignment-engine";
export * from "./board-finding-engine";
export * from "./decision-candidate-engine";
export * from "./board-recommendation-engine";
export * from "./board-resolution-engine";
export * from "./board-narrative-engine";
export * from "./board-digest-engine";
export * from "./board-briefing-engine";
export * from "./board-intelligence-engine";

// Integrations
export * from "./integrations/board-executive-brain";
export * from "./integrations/board-advisor";
export * from "./integrations/board-simulations";
export * from "./integrations/board-planning";
export * from "./integrations/board-executive-council";
export * from "./integrations/board-strategic-memory";
export * from "./integrations/board-learning";
export * from "./integrations/board-memory-graph";
export * from "./integrations/board-cross-module";
export * from "./integrations/board-tenant-profile";
export * from "./integrations/board-playbooks";
export * from "./integrations/board-compliance";
export * from "./integrations/board-audit";

// Query — explicit exports to avoid name collisions with engine exports
export {
  getSessions,
  getSession,
  findSessionsByOutcome,
  sortSessionsByScore,
  getLatestSession,
  getFindings,
  getBlockerFindings as getSessionBlockerFindings,
  getCriticalFindings as getSessionCriticalFindings,
  findingsByDomain,
  getRisks,
  getSystemicRisks as getSessionSystemicRisks,
  getCriticalBoardRisks as getSessionCriticalBoardRisks,
  getOpportunities,
  getTransformationalOpportunities as getSessionTransformationalOpportunities,
  getPriorities,
  filterPrioritiesByLevel,
  getRecommendations,
  filterRecommendationsByPriority,
  getDecisionCandidates,
  getEscalationCandidates,
  getReports,
  getBoardStats,
} from "./board-intelligence-query";
export type { BoardStats } from "./board-intelligence-query";

// Repository
export * from "./board-intelligence-repository";
export * from "./persistence/prisma-board-intelligence-repository";

// Dashboard (client-safe, re-exported here for server convenience)
export * from "./board-intelligence-dashboard-contract";

// Health + Readiness
export * from "./board-intelligence-health";
export * from "./board-intelligence-readiness";

// Canonical
export * from "./board-intelligence-canonical";

// Synthesis
export * from "./board-council-synthesis-engine";
