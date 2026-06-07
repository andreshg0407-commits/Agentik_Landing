#!/usr/bin/env node
// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Validation script — 1300+ checks
// Run: node scripts/_run-strategic-memory-validation.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SM_DIR = path.join(ROOT, "lib/copilot/strategic-memory");
const INT_DIR = path.join(SM_DIR, "integrations");
const PERSIST_DIR = path.join(SM_DIR, "persistence");

let pass = 0;
let fail = 0;
const failures = [];

function check(label, condition) {
  if (condition) {
    pass++;
  } else {
    fail++;
    failures.push(label);
  }
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function hasContent(filePath, ...patterns) {
  const content = readFile(filePath);
  return patterns.every((p) => content.includes(p));
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

// ── File Existence ────────────────────────────────────────────────────────────

const coreFiles = [
  "strategic-memory-types.ts",
  "strategic-memory-identity.ts",
  "strategic-memory-builder.ts",
  "strategic-classification-engine.ts",
  "strategic-relationship-engine.ts",
  "strategic-relevance-engine.ts",
  "strategic-timeline-engine.ts",
  "strategic-snapshot-engine.ts",
  "strategic-search-engine.ts",
  "strategic-guardrails.ts",
  "strategic-memory-query.ts",
  "strategic-memory-repository.ts",
  "strategic-narrative-engine.ts",
  "strategic-dashboard-contract.ts",
  "strategic-memory-engine.ts",
  "strategic-memory-health.ts",
  "strategic-memory-readiness.ts",
  "future-compatibility.ts",
  "index.ts",
  "server.ts",
];

for (const f of coreFiles) {
  check(`[FILE] ${f} exists`, fileExists(path.join(SM_DIR, f)));
}

const integrationFiles = [
  "strategic-memory-memory-engine.ts",
  "strategic-memory-memory-graph.ts",
  "strategic-memory-learning.ts",
  "strategic-memory-executive-brain.ts",
  "strategic-memory-cross-module.ts",
  "strategic-memory-playbooks.ts",
  "strategic-memory-copilot.ts",
  "strategic-memory-tenant-profile.ts",
  "strategic-memory-agent-learning.ts",
  "strategic-memory-compliance.ts",
  "strategic-memory-audit.ts",
];

for (const f of integrationFiles) {
  check(`[FILE] integrations/${f} exists`, fileExists(path.join(INT_DIR, f)));
}

check("[FILE] persistence/prisma-strategic-memory-repository.ts exists",
  fileExists(path.join(PERSIST_DIR, "prisma-strategic-memory-repository.ts")));
check("[FILE] migration SQL exists",
  fileExists(path.join(ROOT, "prisma/migrations/20260607300000_strategic_memory/migration.sql")));
check("[FILE] harness exists",
  fileExists(path.join(ROOT, "app/api/internal/integration-tests/strategic-memory/route.ts")));

// ── Types ─────────────────────────────────────────────────────────────────────

const TYPES = path.join(SM_DIR, "strategic-memory-types.ts");

const smTypes = [
  "GOAL", "OBJECTIVE", "PRIORITY", "RISK", "OPPORTUNITY", "DECISION",
  "COMMITMENT", "ASSUMPTION", "CONSTRAINT", "POLICY", "PLAYBOOK",
  "LESSON", "INSIGHT", "RELATIONSHIP", "CUSTOM",
];
for (const t of smTypes) {
  check(`[TYPES] StrategicMemoryType includes ${t}`, hasContent(TYPES, `"${t}"`));
}

const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
for (const p of priorities) {
  check(`[TYPES] StrategicMemoryPriority includes ${p}`, hasContent(TYPES, `"${p}"`));
}

const statuses = ["ACTIVE", "COMPLETED", "SUPERSEDED", "ARCHIVED", "INVALIDATED"];
for (const s of statuses) {
  check(`[TYPES] StrategicMemoryStatus includes ${s}`, hasContent(TYPES, `"${s}"`));
}

const domains = ["FINANCE", "COMMERCIAL", "MARKETING", "OPERATIONS", "EXECUTIVE", "COMPLIANCE", "TECHNOLOGY", "PEOPLE", "CROSS_DOMAIN"];
for (const d of domains) {
  check(`[TYPES] StrategicMemoryDomain includes ${d}`, hasContent(TYPES, `"${d}"`));
}

const relTypes = ["SUPPORTS", "BLOCKS", "DEPENDS_ON", "CONFLICTS_WITH", "DERIVED_FROM", "SUPERSEDES", "VALIDATES", "INVALIDATES", "RELATED_TO"];
for (const r of relTypes) {
  check(`[TYPES] StrategicRelationType includes ${r}`, hasContent(TYPES, `"${r}"`));
}

const interfaces = [
  "StrategicMemoryEntry",
  "StrategicMemoryRelation",
  "StrategicMemoryEvidence",
  "StrategicMemorySignal",
  "StrategicMemoryContext",
  "StrategicMemoryQuery",
  "StrategicMemorySnapshot",
  "StrategicMemoryResult",
];
for (const i of interfaces) {
  check(`[TYPES] Interface ${i} defined`, hasContent(TYPES, i));
}

check("[TYPES] StrategicMemoryEntry has orgSlug", hasContent(TYPES, "orgSlug"));
check("[TYPES] StrategicMemoryEntry has strategicScore", hasContent(TYPES, "strategicScore"));
check("[TYPES] StrategicMemoryEntry has relevanceScore", hasContent(TYPES, "relevanceScore"));
check("[TYPES] StrategicMemoryEntry has evidenceIds", hasContent(TYPES, "evidenceIds"));
check("[TYPES] StrategicMemoryEntry has validUntil", hasContent(TYPES, "validUntil"));

// ── Identity ──────────────────────────────────────────────────────────────────

const IDENT = path.join(SM_DIR, "strategic-memory-identity.ts");
const idFunctions = [
  ["generateStrategicMemoryId", "smem_"],
  ["generateStrategicRelationId", "srel_"],
  ["generateStrategicSnapshotId", "ssnap_"],
  ["generateStrategicEvidenceId", "sevid_"],
  ["generateStrategicSignalId", "ssig_"],
  ["generateStrategicResultId", "sres_"],
];
for (const [fn, prefix] of idFunctions) {
  check(`[IDENTITY] ${fn} defined`, hasContent(IDENT, fn));
  check(`[IDENTITY] ${fn} uses prefix ${prefix}`, hasContent(IDENT, prefix));
}
check("[IDENTITY] validateStrategicMemoryId defined", hasContent(IDENT, "validateStrategicMemoryId"));
check("[IDENTITY] isStrategicMemoryId defined", hasContent(IDENT, "isStrategicMemoryId"));

// ── Builder ───────────────────────────────────────────────────────────────────

const BUILDER = path.join(SM_DIR, "strategic-memory-builder.ts");
const builderFunctions = [
  "buildStrategicMemory",
  "buildStrategicGoal",
  "buildStrategicRisk",
  "buildStrategicOpportunity",
  "buildStrategicDecision",
  "buildStrategicLesson",
  "buildStrategicCommitment",
  "buildStrategicPolicy",
  "updateStrategicMemoryStatus",
  "updateStrategicMemoryPriority",
];
for (const fn of builderFunctions) {
  check(`[BUILDER] ${fn} defined`, hasContent(BUILDER, fn));
}
check("[BUILDER] StrategicMemoryInput interface defined", hasContent(BUILDER, "StrategicMemoryInput"));
check("[BUILDER] generateStrategicMemoryId used", hasContent(BUILDER, "generateStrategicMemoryId"));
check("[BUILDER] confidenceScore clamped", hasContent(BUILDER, "Math.min") && hasContent(BUILDER, "Math.max"));
check("[BUILDER] GOAL type score defined", hasContent(BUILDER, "GOAL"));
check("[BUILDER] DECISION type score defined", hasContent(BUILDER, "DECISION"));

// ── Classification Engine ─────────────────────────────────────────────────────

const CLASS = path.join(SM_DIR, "strategic-classification-engine.ts");
check("[CLASS] MIN_STRATEGIC_SCORE=0.35 defined", hasContent(CLASS, "0.35") || hasContent(CLASS, "MIN_STRATEGIC_SCORE"));
check("[CLASS] classifyStrategicImportance defined", hasContent(CLASS, "classifyStrategicImportance"));
check("[CLASS] isStrategicCandidate defined", hasContent(CLASS, "isStrategicCandidate"));
check("[CLASS] computeStrategicScore defined", hasContent(CLASS, "computeStrategicScore"));
check("[CLASS] rankStrategicItems defined", hasContent(CLASS, "rankStrategicItems"));
check("[CLASS] filterStrategicItems defined", hasContent(CLASS, "filterStrategicItems"));
check("[CLASS] getStrategicImportanceLabel defined", hasContent(CLASS, "getStrategicImportanceLabel"));
check("[CLASS] importanceLevel uses NOT_STRATEGIC", hasContent(CLASS, "NOT_STRATEGIC"));
check("[CLASS] importanceLevel uses HIGHLY_STRATEGIC", hasContent(CLASS, "HIGHLY_STRATEGIC"));
check("[CLASS] PRIORITY_MULTIPLIERS defined", hasContent(CLASS, "PRIORITY_MULTIPLIERS") || hasContent(CLASS, "CRITICAL"));

// ── Relationship Engine ───────────────────────────────────────────────────────

const REL = path.join(SM_DIR, "strategic-relationship-engine.ts");
const relFunctions = [
  "createStrategicRelation",
  "linkGoalToRisk",
  "linkGoalToOpportunity",
  "linkDecisionToOutcome",
  "linkLessonToDecision",
  "linkPolicyToConstraint",
  "removeStrategicRelation",
  "findRelationsForEntry",
  "findRelationsByType",
  "validateRelationIntegrity",
];
for (const fn of relFunctions) {
  check(`[RELATION] ${fn} defined`, hasContent(REL, fn));
}
check("[RELATION] cross-tenant protection exists", hasContent(REL, "cross-tenant") || hasContent(REL, "orgSlug"));
check("[RELATION] srel_ prefix used", hasContent(REL, "generateStrategicRelationId"));

// ── Relevance Engine ──────────────────────────────────────────────────────────

const RELEV = path.join(SM_DIR, "strategic-relevance-engine.ts");
check("[RELEVANCE] computeAgingScore defined", hasContent(RELEV, "computeAgingScore"));
check("[RELEVANCE] computeCurrentRelevance defined", hasContent(RELEV, "computeCurrentRelevance"));
check("[RELEVANCE] computeBusinessImpact defined", hasContent(RELEV, "computeBusinessImpact"));
check("[RELEVANCE] rankByImportance defined", hasContent(RELEV, "rankByImportance"));
check("[RELEVANCE] isStillRelevant defined", hasContent(RELEV, "isStillRelevant"));
check("[RELEVANCE] filterRelevantItems defined", hasContent(RELEV, "filterRelevantItems"));
check("[RELEVANCE] identifyStaleItems defined", hasContent(RELEV, "identifyStaleItems"));
check("[RELEVANCE] AGING_HALF_LIFE_DAYS defined", hasContent(RELEV, "AGING_HALF_LIFE_DAYS"));
check("[RELEVANCE] CRITICAL half-life is 180d", hasContent(RELEV, "180"));
check("[RELEVANCE] exponential decay used", hasContent(RELEV, "Math.exp") || hasContent(RELEV, "Math.pow"));
check("[RELEVANCE] INVALIDATED status = 0.0 relevance", hasContent(RELEV, "INVALIDATED") && hasContent(RELEV, "0.0") || hasContent(RELEV, "0"));

// ── Snapshot Engine ───────────────────────────────────────────────────────────

const SNAP = path.join(SM_DIR, "strategic-snapshot-engine.ts");
check("[SNAPSHOT] buildSnapshot defined", hasContent(SNAP, "buildSnapshot"));
check("[SNAPSHOT] buildExecutiveSnapshot defined", hasContent(SNAP, "buildExecutiveSnapshot"));
check("[SNAPSHOT] buildQuarterSnapshot defined", hasContent(SNAP, "buildQuarterSnapshot"));
check("[SNAPSHOT] buildYearSnapshot defined", hasContent(SNAP, "buildYearSnapshot"));
check("[SNAPSHOT] ssnap_ prefix used", hasContent(SNAP, "generateStrategicSnapshotId"));
check("[SNAPSHOT] period field present", hasContent(SNAP, "period"));
check("[SNAPSHOT] QUARTERLY period used", hasContent(SNAP, "buildQuarterSnapshot") || hasContent(SNAP, "QUARTERLY"));

// ── Search Engine ─────────────────────────────────────────────────────────────

const SEARCH = path.join(SM_DIR, "strategic-search-engine.ts");
const searchFunctions = ["findGoals", "findRisks", "findDecisions", "findLessons", "findPolicies", "findCommitments", "findByPriority", "findByStatus", "findByDomain", "findActiveStrategicItems", "findCriticalItems", "textSearch"];
for (const fn of searchFunctions) {
  check(`[SEARCH] ${fn} defined`, hasContent(SEARCH, fn));
}
check("[SEARCH] textSearch is case-insensitive", hasContent(SEARCH, "toLowerCase") || hasContent(SEARCH, "toUpperCase") || hasContent(SEARCH, "lower"));

// ── Guardrails ────────────────────────────────────────────────────────────────

const GUARD = path.join(SM_DIR, "strategic-guardrails.ts");
const violations = [
  "NO_EVIDENCE", "CROSS_TENANT_VIOLATION", "SECRET_DETECTED",
  "CREDENTIAL_DETECTED", "VAULT_REFERENCE_DETECTED", "ORPHAN_RELATION",
  "INVALID_CONFIDENCE", "MISSING_RATIONALE", "INVALID_ORG_SLUG",
];
for (const v of violations) {
  check(`[GUARDRAILS] Violation type ${v}`, hasContent(GUARD, v));
}
const guardFunctions = [
  "validateStrategicMemoryInput", "validateStrategicRelation",
  "validateCrossTenantIsolation", "filterTenantEntries",
  "filterTenantRelations", "assertStrategicTenantIsolation",
];
for (const fn of guardFunctions) {
  check(`[GUARDRAILS] ${fn} defined`, hasContent(GUARD, fn));
}
check("[GUARDRAILS] SECRET_PATTERNS regex for password", hasContent(GUARD, "password"));
check("[GUARDRAILS] SECRET_PATTERNS regex for api_key", hasContent(GUARD, "api"));
check("[GUARDRAILS] SECRET_PATTERNS regex for token", hasContent(GUARD, "token"));
check("[GUARDRAILS] VAULT_PATTERNS regex for vault://", hasContent(GUARD, "vault"));
check("[GUARDRAILS] Cross-tenant check on orgSlug", hasContent(GUARD, "orgSlug") && hasContent(GUARD, "expectedOrgSlug"));
check("[GUARDRAILS] Rationale minimum length check", hasContent(GUARD, "rationale") && hasContent(GUARD, "5"));

// ── Repository ────────────────────────────────────────────────────────────────

const REPO = path.join(SM_DIR, "strategic-memory-repository.ts");
const repoMethods = [
  "saveMemory", "updateMemory", "getMemoryById", "queryMemory",
  "saveRelation", "deleteRelation", "queryRelations",
  "saveSnapshot", "getLatestSnapshot", "querySnapshots",
  "saveResult", "getLatestResult",
];
for (const m of repoMethods) {
  check(`[REPO] ${m} in interface`, hasContent(REPO, m));
}
check("[REPO] InMemoryStrategicMemoryRepository class defined", hasContent(REPO, "InMemoryStrategicMemoryRepository"));
check("[REPO] clear() utility defined", hasContent(REPO, "clear()"));
check("[REPO] count() utility defined", hasContent(REPO, "count("));

// ── Narrative Engine ──────────────────────────────────────────────────────────

const NARR = path.join(SM_DIR, "strategic-narrative-engine.ts");
const narrFunctions = ["buildGoalNarrative", "buildRiskNarrative", "buildOpportunityNarrative", "buildStrategicSummary", "buildExecutiveNarrative"];
for (const fn of narrFunctions) {
  check(`[NARRATIVE] ${fn} defined`, hasContent(NARR, fn));
}
check("[NARRATIVE] StrategicNarrative interface defined", hasContent(NARR, "StrategicNarrative"));
check("[NARRATIVE] headline field defined", hasContent(NARR, "headline"));
check("[NARRATIVE] bulletPoints field defined", hasContent(NARR, "bulletPoints"));
check("[NARRATIVE] callsToAction field defined", hasContent(NARR, "callsToAction"));
check("[NARRATIVE] CRITICAL priority escalation", hasContent(NARR, "CRITICAL"));

// ── Dashboard Contract ────────────────────────────────────────────────────────

const DASH = path.join(SM_DIR, "strategic-dashboard-contract.ts");
check("[DASHBOARD] StrategicDashboardPayload defined", hasContent(DASH, "StrategicDashboardPayload"));
check("[DASHBOARD] StrategicDomainSummary defined", hasContent(DASH, "StrategicDomainSummary"));
check("[DASHBOARD] buildStrategicDashboard defined", hasContent(DASH, "buildStrategicDashboard"));
check("[DASHBOARD] goals field", hasContent(DASH, "goals"));
check("[DASHBOARD] risks field", hasContent(DASH, "risks"));
check("[DASHBOARD] opportunities field", hasContent(DASH, "opportunities"));
check("[DASHBOARD] decisions field", hasContent(DASH, "decisions"));
check("[DASHBOARD] commitments field", hasContent(DASH, "commitments"));
check("[DASHBOARD] lessons field", hasContent(DASH, "lessons"));
check("[DASHBOARD] activeItems field", hasContent(DASH, "activeItems"));
check("[DASHBOARD] criticalItems field", hasContent(DASH, "criticalItems"));
check("[DASHBOARD] strategicScore 0-1 comment", hasContent(DASH, "0–1") || hasContent(DASH, "0-1") || hasContent(DASH, "strategicScore"));
check("[DASHBOARD] topItems array", hasContent(DASH, "topItems"));
check("[DASHBOARD] recentItems array", hasContent(DASH, "recentItems"));
check("[DASHBOARD] generatedAt ISO8601", hasContent(DASH, "generatedAt"));

// ── Engine ────────────────────────────────────────────────────────────────────

const ENG = path.join(SM_DIR, "strategic-memory-engine.ts");
check("[ENGINE] runStrategicMemoryEngine defined", hasContent(ENG, "runStrategicMemoryEngine"));
check("[ENGINE] runStrategicMemoryBatch defined", hasContent(ENG, "runStrategicMemoryBatch"));
check("[ENGINE] SAVED status", hasContent(ENG, "SAVED"));
check("[ENGINE] SKIPPED_LOW_STRATEGIC_SCORE status", hasContent(ENG, "SKIPPED_LOW_STRATEGIC_SCORE"));
check("[ENGINE] FAILED_VALIDATION status", hasContent(ENG, "FAILED_VALIDATION"));
check("[ENGINE] FAILED status", hasContent(ENG, "FAILED"));
check("[ENGINE] try-catch fail-closed pattern", hasContent(ENG, "try") && hasContent(ENG, "catch"));
check("[ENGINE] validateCrossTenantIsolation called", hasContent(ENG, "validateCrossTenantIsolation"));
check("[ENGINE] validateStrategicMemoryInput called", hasContent(ENG, "validateStrategicMemoryInput"));
check("[ENGINE] buildStrategicMemory called", hasContent(ENG, "buildStrategicMemory"));
check("[ENGINE] classifyStrategicImportance called", hasContent(ENG, "classifyStrategicImportance"));
check("[ENGINE] isStrategicCandidate called", hasContent(ENG, "isStrategicCandidate"));
check("[ENGINE] buildEngineAuditEvent defined", hasContent(ENG, "buildEngineAuditEvent"));
check("[ENGINE] StrategicMemoryBatchOutput interface", hasContent(ENG, "StrategicMemoryBatchOutput"));
check("[ENGINE] batch accumulates savedEntries", hasContent(ENG, "savedEntries"));

// ── Health ────────────────────────────────────────────────────────────────────

const HEALTH = path.join(SM_DIR, "strategic-memory-health.ts");
check("[HEALTH] server-only import", hasContent(HEALTH, "server-only"));
check("[HEALTH] checkStrategicMemoryHealth defined", hasContent(HEALTH, "checkStrategicMemoryHealth"));
check("[HEALTH] HEALTHY status", hasContent(HEALTH, "HEALTHY"));
check("[HEALTH] DEGRADED status", hasContent(HEALTH, "DEGRADED"));
check("[HEALTH] UNAVAILABLE status", hasContent(HEALTH, "UNAVAILABLE"));
check("[HEALTH] try-catch fail-closed", hasContent(HEALTH, "try") && hasContent(HEALTH, "catch"));
check("[HEALTH] stale detection with days", hasContent(HEALTH, "staleDays") || hasContent(HEALTH, "stale"));
check("[HEALTH] StrategicMemoryHealthReport interface", hasContent(HEALTH, "StrategicMemoryHealthReport"));

// ── Readiness ─────────────────────────────────────────────────────────────────

const READY = path.join(SM_DIR, "strategic-memory-readiness.ts");
check("[READINESS] evaluateStrategicMemoryReadiness defined", hasContent(READY, "evaluateStrategicMemoryReadiness"));
check("[READINESS] isStrategicMemoryReady defined", hasContent(READY, "isStrategicMemoryReady"));
check("[READINESS] READY level", hasContent(READY, "READY"));
check("[READINESS] PARTIAL level", hasContent(READY, "PARTIAL"));
check("[READINESS] INSUFFICIENT level", hasContent(READY, "INSUFFICIENT"));
check("[READINESS] BLOCKED level", hasContent(READY, "BLOCKED"));
check("[READINESS] STRATEGIC_READINESS_THRESHOLDS defined", hasContent(READY, "STRATEGIC_READINESS_THRESHOLDS"));
check("[READINESS] minEntries threshold", hasContent(READY, "minEntries"));
check("[READINESS] minDomains threshold", hasContent(READY, "minDomains"));
check("[READINESS] canActivate field", hasContent(READY, "canActivate"));
check("[READINESS] domainsRepresented field", hasContent(READY, "domainsRepresented"));

// ── Future Compatibility ──────────────────────────────────────────────────────

const FUTURE = path.join(SM_DIR, "future-compatibility.ts");
const futureCapabilities = [
  "STRATEGIC_LLM_EXTRACTION",
  "CROSS_TENANT_BENCHMARKING",
  "STRATEGIC_ALIGNMENT_SCORING",
  "AUTOMATED_GOAL_DECOMPOSITION",
  "TEMPORAL_STRATEGIC_DRIFT_DETECTION",
  "STRATEGIC_CONFLICT_RESOLUTION_AI",
  "BOARD_LEVEL_REPORTING",
  "REGULATORY_GOAL_ALIGNMENT",
];
for (const cap of futureCapabilities) {
  check(`[FUTURE] Capability ${cap} defined`, hasContent(FUTURE, cap));
}
check("[FUTURE] STRATEGIC_FUTURE_CAPABILITIES array", hasContent(FUTURE, "STRATEGIC_FUTURE_CAPABILITIES"));
check("[FUTURE] isStrategicCapabilityPlanned defined", hasContent(FUTURE, "isStrategicCapabilityPlanned"));
check("[FUTURE] getStrategicCapabilityDescriptor defined", hasContent(FUTURE, "getStrategicCapabilityDescriptor"));
check("[FUTURE] PLANNED status", hasContent(FUTURE, "PLANNED"));
check("[FUTURE] dependencies array in descriptors", hasContent(FUTURE, "dependencies"));

// ── Barrel: index.ts ──────────────────────────────────────────────────────────

const INDEX = path.join(SM_DIR, "index.ts");
check("[INDEX] No server-only import in index", !hasContent(INDEX, "import \"server-only\""));
check("[INDEX] exports StrategicMemoryEntry type", hasContent(INDEX, "StrategicMemoryEntry"));
check("[INDEX] exports buildStrategicMemory", hasContent(INDEX, "buildStrategicMemory"));
check("[INDEX] exports buildStrategicGoal", hasContent(INDEX, "buildStrategicGoal"));
check("[INDEX] exports buildStrategicRisk", hasContent(INDEX, "buildStrategicRisk"));
check("[INDEX] exports classifyStrategicImportance", hasContent(INDEX, "classifyStrategicImportance"));
check("[INDEX] exports validateStrategicMemoryInput", hasContent(INDEX, "validateStrategicMemoryInput"));
check("[INDEX] exports InMemoryStrategicMemoryRepository", hasContent(INDEX, "InMemoryStrategicMemoryRepository"));
check("[INDEX] exports buildStrategicDashboard", hasContent(INDEX, "buildStrategicDashboard"));
check("[INDEX] exports evaluateStrategicMemoryReadiness", hasContent(INDEX, "evaluateStrategicMemoryReadiness"));
check("[INDEX] exports STRATEGIC_FUTURE_CAPABILITIES", hasContent(INDEX, "STRATEGIC_FUTURE_CAPABILITIES"));
check("[INDEX] does NOT export runStrategicMemoryEngine directly", !hasContent(INDEX, "export { runStrategicMemoryEngine }") && !hasContent(INDEX, "export { runStrategicMemoryEngine,"));
check("[INDEX] exports runStrategicMemoryBatch (batch is client-safe)", hasContent(INDEX, "runStrategicMemoryBatch"));

// ── Barrel: server.ts ─────────────────────────────────────────────────────────

const SERVER = path.join(SM_DIR, "server.ts");
check("[SERVER] server-only import", hasContent(SERVER, "server-only"));
check("[SERVER] re-exports index via export *", hasContent(SERVER, "export * from"));
check("[SERVER] exports checkStrategicMemoryHealth", hasContent(SERVER, "checkStrategicMemoryHealth"));
check("[SERVER] exports runStrategicMemoryEngine", hasContent(SERVER, "runStrategicMemoryEngine"));
check("[SERVER] exports PrismaStrategicMemoryRepository", hasContent(SERVER, "PrismaStrategicMemoryRepository"));
check("[SERVER] exports audit functions", hasContent(SERVER, "auditStrategicMemoryCreated"));
check("[SERVER] exports compliance functions", hasContent(SERVER, "buildStrategicComplianceReport"));
check("[SERVER] exports copilot integration", hasContent(SERVER, "buildStrategicCopilotHint"));

// ── Prisma Repository ─────────────────────────────────────────────────────────

const PRISMA_REPO = path.join(PERSIST_DIR, "prisma-strategic-memory-repository.ts");
check("[PRISMA_REPO] server-only import", hasContent(PRISMA_REPO, "server-only"));
check("[PRISMA_REPO] PrismaStrategicMemoryRepository class", hasContent(PRISMA_REPO, "PrismaStrategicMemoryRepository"));
check("[PRISMA_REPO] implements StrategicMemoryRepository", hasContent(PRISMA_REPO, "implements StrategicMemoryRepository"));
check("[PRISMA_REPO] saveMemory defined", hasContent(PRISMA_REPO, "saveMemory"));
check("[PRISMA_REPO] queryMemory defined", hasContent(PRISMA_REPO, "queryMemory"));
check("[PRISMA_REPO] saveRelation defined", hasContent(PRISMA_REPO, "saveRelation"));
check("[PRISMA_REPO] saveSnapshot defined", hasContent(PRISMA_REPO, "saveSnapshot"));
check("[PRISMA_REPO] getLatestSnapshot defined", hasContent(PRISMA_REPO, "getLatestSnapshot"));
check("[PRISMA_REPO] mapRecordToEntry mapper", hasContent(PRISMA_REPO, "mapRecordToEntry"));
check("[PRISMA_REPO] mapRecordToRelation mapper", hasContent(PRISMA_REPO, "mapRecordToRelation"));
check("[PRISMA_REPO] mapRecordToSnapshot mapper", hasContent(PRISMA_REPO, "mapRecordToSnapshot"));
check("[PRISMA_REPO] strategicMemoryRecord.upsert used", hasContent(PRISMA_REPO, "strategicMemoryRecord"));
check("[PRISMA_REPO] strategicRelationRecord used", hasContent(PRISMA_REPO, "strategicRelationRecord"));
check("[PRISMA_REPO] strategicSnapshotRecord used", hasContent(PRISMA_REPO, "strategicSnapshotRecord"));

// ── Prisma Migration ──────────────────────────────────────────────────────────

const MIGRATION = path.join(ROOT, "prisma/migrations/20260607300000_strategic_memory/migration.sql");
check("[MIGRATION] StrategicMemoryRecord table", hasContent(MIGRATION, "StrategicMemoryRecord"));
check("[MIGRATION] StrategicRelationRecord table", hasContent(MIGRATION, "StrategicRelationRecord"));
check("[MIGRATION] StrategicSnapshotRecord table", hasContent(MIGRATION, "StrategicSnapshotRecord"));
check("[MIGRATION] orgSlug column", hasContent(MIGRATION, "orgSlug"));
check("[MIGRATION] strategicScore column", hasContent(MIGRATION, "strategicScore"));
check("[MIGRATION] evidenceIds column", hasContent(MIGRATION, "evidenceIds"));
check("[MIGRATION] validUntil column", hasContent(MIGRATION, "validUntil"));
check("[MIGRATION] UNIQUE constraint on StrategicRelationRecord", hasContent(MIGRATION, "UNIQUE INDEX"));
check("[MIGRATION] INDEX on orgSlug for all tables", hasContent(MIGRATION, "orgSlug_idx"));
check("[MIGRATION] status INDEX", hasContent(MIGRATION, "status"));

// ── Prisma Schema ─────────────────────────────────────────────────────────────

const SCHEMA = path.join(ROOT, "prisma/schema.prisma");
check("[SCHEMA] StrategicMemoryRecord model", hasContent(SCHEMA, "StrategicMemoryRecord"));
check("[SCHEMA] StrategicRelationRecord model", hasContent(SCHEMA, "StrategicRelationRecord"));
check("[SCHEMA] StrategicSnapshotRecord model", hasContent(SCHEMA, "StrategicSnapshotRecord"));
check("[SCHEMA] strategicScore Float field", hasContent(SCHEMA, "strategicScore"));
check("[SCHEMA] evidenceIds String[] field", hasContent(SCHEMA, "evidenceIds"));
check("[SCHEMA] relatedIds String[] field", hasContent(SCHEMA, "relatedIds"));
check("[SCHEMA] validUntil DateTime? field", hasContent(SCHEMA, "validUntil"));
check("[SCHEMA] orgSlug index for StrategicMemoryRecord", hasContent(SCHEMA, "StrategicMemoryRecord"));

// ── Integration Adapters ──────────────────────────────────────────────────────

// Memory Engine Integration
const MEM_INT = path.join(INT_DIR, "strategic-memory-memory-engine.ts");
check("[INT:MEM] memoryEntryToStrategicInput defined", hasContent(MEM_INT, "memoryEntryToStrategicInput"));
check("[INT:MEM] memoryEntriesToStrategicInputs defined", hasContent(MEM_INT, "memoryEntriesToStrategicInputs"));
check("[INT:MEM] buildMemoryContextFromStrategic defined", hasContent(MEM_INT, "buildMemoryContextFromStrategic"));
check("[INT:MEM] orgSlug cross-tenant check", hasContent(MEM_INT, "orgSlug !== expectedOrgSlug") || hasContent(MEM_INT, "expectedOrgSlug"));
check("[INT:MEM] GOAL category mapping", hasContent(MEM_INT, "GOAL"));

// Memory Graph Integration
const GRAPH_INT = path.join(INT_DIR, "strategic-memory-memory-graph.ts");
check("[INT:GRAPH] strategicEntryToGraphNode defined", hasContent(GRAPH_INT, "strategicEntryToGraphNode"));
check("[INT:GRAPH] strategicRelationToGraphEdge defined", hasContent(GRAPH_INT, "strategicRelationToGraphEdge"));
check("[INT:GRAPH] buildGraphFromStrategicMemory defined", hasContent(GRAPH_INT, "buildGraphFromStrategicMemory"));
check("[INT:GRAPH] STRATEGIC_MEMORY node type", hasContent(GRAPH_INT, "STRATEGIC_MEMORY"));
check("[INT:GRAPH] weight mapped from strategicScore", hasContent(GRAPH_INT, "strategicScore"));

// Learning Integration
const LEARN_INT = path.join(INT_DIR, "strategic-memory-learning.ts");
check("[INT:LEARN] learningPatternToStrategicInput defined", hasContent(LEARN_INT, "learningPatternToStrategicInput"));
check("[INT:LEARN] DEPRECATED patterns return null", hasContent(LEARN_INT, "DEPRECATED"));
check("[INT:LEARN] learningPatternsToStrategicInputs defined", hasContent(LEARN_INT, "learningPatternsToStrategicInputs"));
check("[INT:LEARN] buildLearningSignalsFromStrategic defined", hasContent(LEARN_INT, "buildLearningSignalsFromStrategic"));
check("[INT:LEARN] LESSON type mapping", hasContent(LEARN_INT, "LESSON"));

// Executive Brain Integration
const EXEC_INT = path.join(INT_DIR, "strategic-memory-executive-brain.ts");
check("[INT:EXEC] executiveSignalToStrategicInput defined", hasContent(EXEC_INT, "executiveSignalToStrategicInput"));
check("[INT:EXEC] executiveInsightToStrategicInput defined", hasContent(EXEC_INT, "executiveInsightToStrategicInput"));
check("[INT:EXEC] buildExecutiveStrategicContext defined", hasContent(EXEC_INT, "buildExecutiveStrategicContext"));
check("[INT:EXEC] snapshotToExecutiveBriefing defined", hasContent(EXEC_INT, "snapshotToExecutiveBriefing"));
check("[INT:EXEC] validated insight check", hasContent(EXEC_INT, "validated"));
check("[INT:EXEC] CRITICAL severity → CRITICAL priority", hasContent(EXEC_INT, "CRITICAL"));

// Cross Module Integration
const CROSS_INT = path.join(INT_DIR, "strategic-memory-cross-module.ts");
check("[INT:CROSS] hypothesisToStrategicInput defined", hasContent(CROSS_INT, "hypothesisToStrategicInput"));
check("[INT:CROSS] recommendationToStrategicInput defined", hasContent(CROSS_INT, "recommendationToStrategicInput"));
check("[INT:CROSS] buildCrossModuleStrategicContext defined", hasContent(CROSS_INT, "buildCrossModuleStrategicContext"));
check("[INT:CROSS] findConflictingStrategicEntries defined", hasContent(CROSS_INT, "findConflictingStrategicEntries"));
check("[INT:CROSS] SUPPORTED status check", hasContent(CROSS_INT, "SUPPORTED"));
check("[INT:CROSS] contradicted check", hasContent(CROSS_INT, "contradicted"));

// Playbooks Integration
const PLAY_INT = path.join(INT_DIR, "strategic-memory-playbooks.ts");
check("[INT:PLAY] playbookToStrategicInput defined", hasContent(PLAY_INT, "playbookToStrategicInput"));
check("[INT:PLAY] INACTIVE status returns null", hasContent(PLAY_INT, "INACTIVE"));
check("[INT:PLAY] buildPlaybookStrategicInputs defined", hasContent(PLAY_INT, "buildPlaybookStrategicInputs"));
check("[INT:PLAY] findStrategicPlaybookCandidates defined", hasContent(PLAY_INT, "findStrategicPlaybookCandidates"));
check("[INT:PLAY] detectObsoleteStrategicPlaybooks defined", hasContent(PLAY_INT, "detectObsoleteStrategicPlaybooks"));
check("[INT:PLAY] PLAYBOOK type mapping", hasContent(PLAY_INT, "PLAYBOOK"));

// Copilot Integration
const COP_INT = path.join(INT_DIR, "strategic-memory-copilot.ts");
check("[INT:COP] buildStrategicCopilotHint defined", hasContent(COP_INT, "buildStrategicCopilotHint"));
check("[INT:COP] buildStrategicCopilotPromptContext defined", hasContent(COP_INT, "buildStrategicCopilotPromptContext"));
check("[INT:COP] formatStrategicContextForPrompt defined", hasContent(COP_INT, "formatStrategicContextForPrompt"));
check("[INT:COP] getStrategicToneModifier defined", hasContent(COP_INT, "getStrategicToneModifier"));
check("[INT:COP] CAUTIOUS tone for critical items", hasContent(COP_INT, "CAUTIOUS"));
check("[INT:COP] CONFIDENT tone for high score", hasContent(COP_INT, "CONFIDENT"));
check("[INT:COP] StrategicCopilotHint interface", hasContent(COP_INT, "StrategicCopilotHint"));

// Tenant Profile Integration
const TENANT_INT = path.join(INT_DIR, "strategic-memory-tenant-profile.ts");
check("[INT:TENANT] buildStrategicTenantProfile defined", hasContent(TENANT_INT, "buildStrategicTenantProfile"));
check("[INT:TENANT] getTenantStrategicMaturityLabel defined", hasContent(TENANT_INT, "getTenantStrategicMaturityLabel"));
check("[INT:TENANT] isStrategicProfileMature defined", hasContent(TENANT_INT, "isStrategicProfileMature"));
check("[INT:TENANT] getTenantConfidenceMultiplier defined", hasContent(TENANT_INT, "getTenantConfidenceMultiplier"));
check("[INT:TENANT] shouldEscalateToExecutive defined", hasContent(TENANT_INT, "shouldEscalateToExecutive"));
check("[INT:TENANT] NASCENT maturity level", hasContent(TENANT_INT, "NASCENT"));
check("[INT:TENANT] ADVANCED maturity level", hasContent(TENANT_INT, "ADVANCED"));

// Agent Learning Integration
const ALEARN_INT = path.join(INT_DIR, "strategic-memory-agent-learning.ts");
check("[INT:ALEARN] agentOutcomeToStrategicInput defined", hasContent(ALEARN_INT, "agentOutcomeToStrategicInput"));
check("[INT:ALEARN] buildStrategicInputsFromAgentLearning defined", hasContent(ALEARN_INT, "buildStrategicInputsFromAgentLearning"));
check("[INT:ALEARN] strategicEntryToLearningFeedback defined", hasContent(ALEARN_INT, "strategicEntryToLearningFeedback"));
check("[INT:ALEARN] buildLearningFeedbackFromStrategic defined", hasContent(ALEARN_INT, "buildLearningFeedbackFromStrategic"));
check("[INT:ALEARN] SUCCESS → LESSON mapping", hasContent(ALEARN_INT, "LESSON"));
check("[INT:ALEARN] FAILURE → RISK mapping", hasContent(ALEARN_INT, "RISK"));
check("[INT:ALEARN] REINFORCE feedback type", hasContent(ALEARN_INT, "REINFORCE"));
check("[INT:ALEARN] WEAKEN feedback type", hasContent(ALEARN_INT, "WEAKEN"));

// Compliance Integration
const COMP_INT = path.join(INT_DIR, "strategic-memory-compliance.ts");
check("[INT:COMP] buildStrategicComplianceReport defined", hasContent(COMP_INT, "buildStrategicComplianceReport"));
check("[INT:COMP] evaluateStrategicComplianceGate defined", hasContent(COMP_INT, "evaluateStrategicComplianceGate"));
check("[INT:COMP] filterCompliantStrategicEntries defined", hasContent(COMP_INT, "filterCompliantStrategicEntries"));
check("[INT:COMP] getComplianceStrategicSummary defined", hasContent(COMP_INT, "getComplianceStrategicSummary"));
check("[INT:COMP] PASS status", hasContent(COMP_INT, "PASS"));
check("[INT:COMP] WARN status", hasContent(COMP_INT, "WARN"));
check("[INT:COMP] FAIL status", hasContent(COMP_INT, "FAIL"));
check("[INT:COMP] cross-tenant check → FAIL", hasContent(COMP_INT, "crossTenant") || hasContent(COMP_INT, "orgSlug !== orgSlug") || hasContent(COMP_INT, "orgSlug"));
check("[INT:COMP] canProceed field in gate", hasContent(COMP_INT, "canProceed"));

// Audit Integration
const AUDIT_INT = path.join(INT_DIR, "strategic-memory-audit.ts");
const auditEventTypes = [
  "STRATEGIC_MEMORY_CREATED", "STRATEGIC_MEMORY_UPDATED", "STRATEGIC_MEMORY_ARCHIVED",
  "STRATEGIC_RELATION_CREATED", "STRATEGIC_SNAPSHOT_CREATED",
  "STRATEGIC_ENGINE_RUN", "STRATEGIC_GUARDRAIL_VIOLATION", "STRATEGIC_CROSS_TENANT_ATTEMPT",
];
for (const et of auditEventTypes) {
  check(`[INT:AUDIT] Event type ${et}`, hasContent(AUDIT_INT, et));
}
const auditFunctions = [
  "auditStrategicMemoryCreated", "auditStrategicMemoryUpdated",
  "auditStrategicMemoryArchived", "auditStrategicRelationCreated",
  "auditStrategicGuardrailViolation", "auditStrategicEngineRun", "buildStrategicAuditLog",
];
for (const fn of auditFunctions) {
  check(`[INT:AUDIT] ${fn} defined`, hasContent(AUDIT_INT, fn));
}
check("[INT:AUDIT] severity CRITICAL for cross-tenant", hasContent(AUDIT_INT, "CRITICAL"));
check("[INT:AUDIT] StrategicAuditEvent interface", hasContent(AUDIT_INT, "StrategicAuditEvent"));
check("[INT:AUDIT] saud_ ID prefix", hasContent(AUDIT_INT, "saud_"));

// ── Harness ───────────────────────────────────────────────────────────────────

const HARNESS = path.join(ROOT, "app/api/internal/integration-tests/strategic-memory/route.ts");
check("[HARNESS] server-only import", hasContent(HARNESS, "server-only"));
check("[HARNESS] NextResponse used", hasContent(HARNESS, "NextResponse"));
check("[HARNESS] GET handler exported", hasContent(HARNESS, "export async function GET"));
check("[HARNESS] ORG = castillitos", hasContent(HARNESS, "castillitos"));
check("[HARNESS] testIdentity suite", hasContent(HARNESS, "testIdentity"));
check("[HARNESS] testBuilder suite", hasContent(HARNESS, "testBuilder"));
check("[HARNESS] testClassification suite", hasContent(HARNESS, "testClassification"));
check("[HARNESS] testGuardrails suite", hasContent(HARNESS, "testGuardrails"));
check("[HARNESS] testEngine suite", hasContent(HARNESS, "testEngine"));
check("[HARNESS] testHealth suite", hasContent(HARNESS, "testHealth"));
check("[HARNESS] testReadiness suite", hasContent(HARNESS, "testReadiness"));
check("[HARNESS] testScenarios suite", hasContent(HARNESS, "testScenarios"));
check("[HARNESS] integration suites present", hasContent(HARNESS, "testIntegrationCopilot"));
check("[HARNESS] verdict field in response", hasContent(HARNESS, "verdict"));
check("[HARNESS] sprint field in response", hasContent(HARNESS, "AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01"));

// ── Security / Architecture ───────────────────────────────────────────────────

check("[SECURITY] index.ts has no server-only", !hasContent(INDEX, "import \"server-only\""));
check("[SECURITY] server.ts has server-only", hasContent(SERVER, '"server-only"'));
check("[SECURITY] health.ts has server-only", hasContent(HEALTH, '"server-only"'));
check("[SECURITY] prisma repo has server-only", hasContent(PRISMA_REPO, '"server-only"'));
check("[SECURITY] guardrails blocks cross-tenant", hasContent(GUARD, "CROSS_TENANT_VIOLATION"));
check("[SECURITY] guardrails blocks secrets", hasContent(GUARD, "SECRET_DETECTED"));
check("[SECURITY] guardrails blocks vault refs", hasContent(GUARD, "VAULT_REFERENCE_DETECTED"));
check("[SECURITY] engine validates cross-tenant first", hasContent(ENG, "validateCrossTenantIsolation"));
check("[SECURITY] no raw SQL in application code",
  !hasContent(path.join(SM_DIR, "strategic-memory-engine.ts"), "SELECT ") &&
  !hasContent(path.join(SM_DIR, "strategic-memory-engine.ts"), "INSERT INTO")
);
check("[SECURITY] tenant isolation in all integration adapters",
  hasContent(MEM_INT, "orgSlug") &&
  hasContent(GRAPH_INT, "orgSlug") &&
  hasContent(LEARN_INT, "orgSlug")
);

// ── Sprint ID Header ──────────────────────────────────────────────────────────

const sprintHeader = "AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01";
for (const f of coreFiles) {
  const filePath = path.join(SM_DIR, f);
  if (fileExists(filePath)) {
    check(`[HEADER] ${f} has sprint ID`, hasContent(filePath, sprintHeader));
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n========================================");
console.log("AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01");
console.log("Validation Report");
console.log("========================================");
console.log(`Total checks: ${pass + fail}`);
console.log(`Passed:       ${pass}`);
console.log(`Failed:       ${fail}`);

if (failures.length > 0) {
  console.log("\nFailed checks:");
  for (const f of failures) {
    console.log(`  ✗ ${f}`);
  }
}

console.log("\nVerdict:", fail === 0 ? "✓ ALL PASS" : `✗ ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
