// AGENTIK-STRATEGIC-PLANNING-01 — Phase 33: Server Barrel
// Server-only. Never import this from client components.

import "server-only";

// ── Domain Types ──────────────────────────────────────────────────────────────
export * from "./strategic-planning-types";
export * from "./strategic-planning-identity";

// ── Engines ───────────────────────────────────────────────────────────────────
export * from "./objective-engine";
export * from "./initiative-engine";
export * from "./dependency-engine";
export * from "./milestone-engine";
export * from "./risk-planning-engine";
export * from "./opportunity-planning-engine";
export * from "./roadmap-engine";
export * from "./plan-prioritization-engine";
export * from "./planning-narrative-engine";
export * from "./strategic-planning-engine";

// ── Integrations ──────────────────────────────────────────────────────────────
export * from "./integrations/planning-strategic-memory";
export * from "./integrations/planning-learning";
export * from "./integrations/planning-executive-brain";
export * from "./integrations/planning-advisor";
export * from "./integrations/planning-simulations";
export * from "./integrations/planning-cross-module";
export * from "./integrations/planning-memory-graph";
export * from "./integrations/planning-tenant-profile";
export * from "./integrations/planning-playbooks";
export * from "./integrations/planning-compliance";
export * from "./integrations/planning-audit";

// ── Query & Repository ────────────────────────────────────────────────────────
export * from "./strategic-planning-query";
export * from "./strategic-planning-repository";
export { PrismaStrategicPlanningRepository } from "./persistence/prisma-strategic-planning-repository";

// ── Planning Council ──────────────────────────────────────────────────────────
export * from "./planning-council-engine";

// ── Dashboard / Health / Readiness ────────────────────────────────────────────
export * from "./strategic-planning-dashboard-contract";
export * from "./strategic-planning-health";
export * from "./strategic-planning-readiness";
export * from "./strategic-planning-canonical";
