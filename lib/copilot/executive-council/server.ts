// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 39: Server-Only Barrel
import "server-only";

// Types & enumerations
export * from "./executive-council-types";

// Identity
export * from "./executive-council-identity";

// Perspective registry
export * from "./perspective-registry";

// Perspective engines
export { buildFinancePerspective }     from "./engines/finance-perspective-engine";
export { buildCommercialPerspective }  from "./engines/commercial-perspective-engine";
export { buildOperationsPerspective }  from "./engines/operations-perspective-engine";
export { buildMarketingPerspective }   from "./engines/marketing-perspective-engine";
export { buildCollectionsPerspective } from "./engines/collections-perspective-engine";
export { buildStrategyPerspective }    from "./engines/strategy-perspective-engine";
export { buildRiskPerspective }        from "./engines/risk-perspective-engine";
export { buildCompliancePerspective }  from "./engines/compliance-perspective-engine";

// Core engines
export * from "./opinion-engine";
export * from "./argument-engine";
export * from "./consensus-engine";
export * from "./disagreement-engine";
export * from "./resolution-engine";
export * from "./executive-council-engine";

// Integrations
export * from "./integrations/council-executive-brain";
export * from "./integrations/council-strategic-advisor";
export * from "./integrations/council-strategic-simulations";
export * from "./integrations/council-strategic-planning";
export * from "./integrations/council-memory";
export * from "./integrations/council-learning";
export * from "./integrations/council-memory-graph";
export * from "./integrations/council-cross-module";
export * from "./integrations/council-tenant-profile";
export * from "./integrations/council-playbooks";
export * from "./integrations/council-compliance";
export * from "./integrations/council-audit";

// Query & Repository
export * from "./executive-council-query";
export * from "./executive-council-repository";
export { PrismaExecutiveCouncilRepository } from "./persistence/prisma-executive-council-repository";

// Dashboard, health, readiness
export * from "./executive-council-dashboard-contract";
export * from "./executive-council-health";
export * from "./executive-council-readiness";

// Canonical
export * from "./executive-council-canonical";
