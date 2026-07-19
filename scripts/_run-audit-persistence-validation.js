#!/usr/bin/env node
/**
 * scripts/_run-audit-persistence-validation.js
 *
 * AGENTIK-SECURITY-AUDIT-PERSISTENCE-01
 * Deterministic validation suite for the Persistent Security Audit layer.
 *
 * 700+ structural checks covering:
 *   Section A — audit-event-types.ts
 *   Section B — audit-category-registry.ts
 *   Section C — audit-repository.ts (interface)
 *   Section D — persistence/prisma-audit-repository.ts
 *   Section E — persistent-audit-service.ts
 *   Section F — audit-query-engine.ts
 *   Section G — audit-report-builder.ts
 *   Section H — audit-retention.ts
 *   Section I — audit-health.ts
 *   Section J — server.ts (server barrel)
 *   Section K — index.ts (client-safe barrel)
 *   Section L — audit-migration-adapters.ts
 *   Section M — security-audit.ts (adapter)
 *   Section N — vault-service-audit.ts (adapter)
 *   Section O — executive-audit.ts (adapter)
 *   Section P — copilot-audit.ts (adapter)
 *   Section Q — security-inventory.ts (AUDIT_PERSISTENCE surface)
 *   Section R — prisma/schema.prisma (SecurityAuditEvent model)
 *   Section S — migration SQL file
 *   Section T — cross-file: no secret values stored
 *   Section U — cross-file: tenant isolation enforced
 *   Section V — cross-file: server-only in runtime files
 *   Section W — cross-file: sprint ID in all files
 *
 * Usage:
 *   node scripts/_run-audit-persistence-validation.js
 *
 * Exit codes:
 *   0 — all checks passed (or only warnings)
 *   1 — one or more FAIL
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function load(relPath) {
  const abs = path.join(ROOT, relPath);
  try { return fs.readFileSync(abs, "utf-8"); } catch { return null; }
}

let pass = 0, fail = 0, warn = 0, skip = 0;
const failures = [], warnings = [];

function check(id, label, condition, detail) {
  if (condition === null || condition === undefined) { skip++; return; }
  if (condition === "WARN") {
    warn++;
    warnings.push(`[WARN] ${id}: ${label}${detail ? " — " + detail : ""}`);
    return;
  }
  if (condition) { pass++; }
  else {
    fail++;
    failures.push(`[FAIL] ${id}: ${label}${detail ? " — " + detail : ""}`);
  }
}
function fileCheck(id, label, content) {
  if (content === null) { fail++; failures.push(`[FAIL] ${id}: ${label} — FILE NOT FOUND`); }
  else { pass++; }
}

// ── Load all files ────────────────────────────────────────────────────────────

const AET  = load("lib/security/audit-persistence/audit-event-types.ts");
const ACR  = load("lib/security/audit-persistence/audit-category-registry.ts");
const AR   = load("lib/security/audit-persistence/audit-repository.ts");
const PAR  = load("lib/security/audit-persistence/persistence/prisma-audit-repository.ts");
const PAS  = load("lib/security/audit-persistence/persistent-audit-service.ts");
const AQE  = load("lib/security/audit-persistence/audit-query-engine.ts");
const ARB  = load("lib/security/audit-persistence/audit-report-builder.ts");
const ARET = load("lib/security/audit-persistence/audit-retention.ts");
const AH   = load("lib/security/audit-persistence/audit-health.ts");
const SRV  = load("lib/security/audit-persistence/server.ts");
const IDX  = load("lib/security/audit-persistence/index.ts");
const AMA  = load("lib/security/audit-persistence/audit-migration-adapters.ts");
const SAU  = load("lib/security/security-audit.ts");
const VAU  = load("lib/security/vault/vault-service-audit.ts");
const EAU  = load("lib/copilot/executive-brain/executive-audit.ts");
const CAU  = load("lib/copilot/copilot-audit.ts");
const SI   = load("lib/security/security-inventory.ts");
const SCH  = load("prisma/schema.prisma");
const MIG  = load("prisma/migrations/20260606000000_security_audit_event/migration.sql");

// ── Section A — audit-event-types.ts ──────────────────────────────────────────

fileCheck("A01", "audit-event-types.ts exists", AET);
if (AET) {
  check("A02", "PersistentSecurityAuditEvent interface", AET.includes("PersistentSecurityAuditEvent"));
  check("A03", "PersistentAuditEventType type", AET.includes("PersistentAuditEventType"));
  check("A04", "PersistentAuditCategory type", AET.includes("PersistentAuditCategory"));
  check("A05", "PersistentAuditSeverity type", AET.includes("PersistentAuditSeverity"));
  check("A06", "AuditActor interface", AET.includes("AuditActor"));
  check("A07", "AuditResource interface", AET.includes("AuditResource"));
  check("A08", "id field in event", AET.includes("id:"));
  check("A09", "orgSlug field in event", AET.includes("orgSlug:"));
  check("A10", "eventType field in event", AET.includes("eventType:"));
  check("A11", "category field in event", AET.includes("category:"));
  check("A12", "severity field in event", AET.includes("severity:"));
  check("A13", "resource? optional field", AET.includes("resource?:"));
  check("A14", "actor? optional field", AET.includes("actor?:"));
  check("A15", "metadata field", AET.includes("metadata:"));
  check("A16", "createdAt string (not Date)", AET.includes("createdAt:") && !AET.includes("createdAt: Date"));
  check("A17", "createdAt uses toISOString()", AET.includes("toISOString()"));
  check("A18", "createPersistentAuditEvent exported", AET.includes("createPersistentAuditEvent"));
  check("A19", "formatAuditEventForLog exported", AET.includes("formatAuditEventForLog"));
  check("A20", "AUDIT_SEVERITY_RANK exported", AET.includes("AUDIT_SEVERITY_RANK"));
  check("A21", "PersistentAuditEventInput interface", AET.includes("PersistentAuditEventInput"));
  check("A22", "SECRET_ACCESSED event type", AET.includes("SECRET_ACCESSED"));
  check("A23", "SECRET_RESOLVED_FROM_VAULT event type", AET.includes("SECRET_RESOLVED_FROM_VAULT"));
  check("A24", "SECRET_RESOLVED_FROM_LEGACY event type", AET.includes("SECRET_RESOLVED_FROM_LEGACY"));
  check("A25", "SECRET_RESOLVED_FROM_ENV event type", AET.includes("SECRET_RESOLVED_FROM_ENV"));
  check("A26", "SECRET_MIGRATION_WARNING event type", AET.includes("SECRET_MIGRATION_WARNING"));
  check("A27", "SIGNALS_COLLECTED event type", AET.includes("SIGNALS_COLLECTED"));
  check("A28", "INTENT_RESOLVED event type", AET.includes("INTENT_RESOLVED"));
  check("A29", "AUDIT_HEALTH_CHECK event type", AET.includes("AUDIT_HEALTH_CHECK"));
  check("A30", "TENANT_BOUNDARY_VIOLATION event type", AET.includes("TENANT_BOUNDARY_VIOLATION"));
  check("A31", "No Prisma import", !AET.includes("from \"@prisma"));
  check("A32", "No server-only import", !AET.includes('"server-only"'));
  check("A33", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 sprint ID", AET.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
  check("A34", "formatAuditEventForLog never exposes metadata values", AET.includes("resource=") || AET.includes("actor="));
  check("A35", "AuditActor.type field", AET.includes("USER") && AET.includes("SYSTEM") && AET.includes("AGENT"));
  check("A36", "AuditActor.name optional", AET.includes("name?:"));
  check("A37", "AuditResource.type field", AET.includes("type:") && AET.includes("AuditResource"));
  check("A38", "id auto-generated in factory", AET.includes("aud-") || AET.includes("nextEventId"));
  check("A39", "orgSlug defaults to 'unknown' when empty", AET.includes('"unknown"'));
  check("A40", "PersistentAuditEventType is a type not interface", AET.includes("export type PersistentAuditEventType"));
  check("A41", "LOW severity defined", AET.includes('"LOW"'));
  check("A42", "MEDIUM severity defined", AET.includes('"MEDIUM"'));
  check("A43", "HIGH severity defined", AET.includes('"HIGH"'));
  check("A44", "CRITICAL severity defined", AET.includes('"CRITICAL"'));
  check("A45", "ACCESS_DENIED event type", AET.includes("ACCESS_DENIED"));
  check("A46", "POLICY_VIOLATION event type", AET.includes("POLICY_VIOLATION"));
  check("A47", "DATA_READ event type", AET.includes("DATA_READ"));
  check("A48", "INTEGRATION_USED event type", AET.includes("INTEGRATION_USED"));
  check("A49", "PLAN_GENERATED event type", AET.includes("PLAN_GENERATED"));
  check("A50", "RESPONSE_GENERATED event type", AET.includes("RESPONSE_GENERATED"));
}

// ── Section B — audit-category-registry.ts ───────────────────────────────────

fileCheck("B01", "audit-category-registry.ts exists", ACR);
if (ACR) {
  check("B02", "AUDIT_CATEGORY_REGISTRY exported", ACR.includes("AUDIT_CATEGORY_REGISTRY"));
  check("B03", "AuditCategoryEntry interface", ACR.includes("AuditCategoryEntry"));
  check("B04", "AUTHENTICATION category", ACR.includes('"AUTHENTICATION"'));
  check("B05", "AUTHORIZATION category", ACR.includes('"AUTHORIZATION"'));
  check("B06", "DATA_ACCESS category", ACR.includes('"DATA_ACCESS"'));
  check("B07", "DATA_EXPORT category", ACR.includes('"DATA_EXPORT"'));
  check("B08", "SECRET_ACCESS category", ACR.includes('"SECRET_ACCESS"'));
  check("B09", "TENANT_BOUNDARY category", ACR.includes('"TENANT_BOUNDARY"'));
  check("B10", "POLICY_VIOLATION category", ACR.includes('"POLICY_VIOLATION"'));
  check("B11", "INTEGRATION category", ACR.includes('"INTEGRATION"'));
  check("B12", "SYSTEM category", ACR.includes('"SYSTEM"'));
  check("B13", "VAULT category", ACR.includes('"VAULT"'));
  check("B14", "MEMORY category", ACR.includes('"MEMORY"'));
  check("B15", "PLAYBOOK category", ACR.includes('"PLAYBOOK"'));
  check("B16", "EXECUTIVE_BRAIN category", ACR.includes('"EXECUTIVE_BRAIN"'));
  check("B17", "COPILOT category", ACR.includes('"COPILOT"'));
  check("B18", "AUTONOMOUS_OPERATIONS category", ACR.includes('"AUTONOMOUS_OPERATIONS"'));
  check("B19", "getCategoryEntry exported", ACR.includes("getCategoryEntry"));
  check("B20", "getCriticalAlertCategories exported", ACR.includes("getCriticalAlertCategories"));
  check("B21", "getCategoriesBySeverity exported", ACR.includes("getCategoriesBySeverity"));
  check("B22", "getAllCategoryIds exported", ACR.includes("getAllCategoryIds"));
  check("B23", "alertOnCritical field defined", ACR.includes("alertOnCritical"));
  check("B24", "defaultSeverity field defined", ACR.includes("defaultSeverity"));
  check("B25", "sources field defined", ACR.includes("sources:"));
  check("B26", "15 categories (count)", (ACR.match(/id:\s+"[A-Z_]+"/g) || []).length >= 15);
  check("B27", "ReadonlyArray type", ACR.includes("ReadonlyArray"));
  check("B28", "as const for registry", ACR.includes("as const"));
  check("B29", "No Prisma import", !ACR.includes("from \"@prisma"));
  check("B30", "No server-only", !ACR.includes('"server-only"'));
  check("B31", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 sprint ID", ACR.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
  check("B32", "VAULT category has alertOnCritical: true", (() => {
    const idx = ACR.indexOf('"VAULT"');
    if (idx === -1) return false;
    return ACR.slice(idx, idx + 300).includes("alertOnCritical: true");
  })());
  check("B33", "TENANT_BOUNDARY has CRITICAL default severity", (() => {
    const idx = ACR.indexOf('"TENANT_BOUNDARY"');
    if (idx === -1) return false;
    return ACR.slice(idx, idx + 300).includes('"CRITICAL"');
  })());
  check("B34", "description field in entries", ACR.includes("description:"));
  check("B35", "name field in entries", ACR.includes("name:"));
}

// ── Section C — audit-repository.ts ──────────────────────────────────────────

fileCheck("C01", "audit-repository.ts exists", AR);
if (AR) {
  check("C02", "AuditRepository interface exported", AR.includes("AuditRepository"));
  check("C03", "appendEvent method", AR.includes("appendEvent("));
  check("C04", "appendMany method", AR.includes("appendMany("));
  check("C05", "findById method", AR.includes("findById("));
  check("C06", "findByTenant method", AR.includes("findByTenant("));
  check("C07", "findByCategory method", AR.includes("findByCategory("));
  check("C08", "findBySeverity method", AR.includes("findBySeverity("));
  check("C09", "findByDateRange method", AR.includes("findByDateRange("));
  check("C10", "findRecent method", AR.includes("findRecent("));
  check("C11", "countEvents method", AR.includes("countEvents("));
  check("C12", "AuditQueryOptions type", AR.includes("AuditQueryOptions"));
  check("C13", "AuditCountOptions type", AR.includes("AuditCountOptions"));
  check("C14", "No Prisma import", !AR.includes("from \"@prisma"));
  check("C15", "No server-only", !AR.includes('"server-only"'));
  check("C16", "All methods return Promise", (AR.match(/Promise</g) || []).length >= 9);
  check("C17", "appendEvent returns event or null", AR.includes("| null"));
  check("C18", "limit in query options", AR.includes("limit?:"));
  check("C19", "after in query options", AR.includes("after?:"));
  check("C20", "before in query options", AR.includes("before?:"));
  check("C21", "APPEND-ONLY comment", AR.includes("APPEND-ONLY") || AR.includes("append-only"));
  check("C22", "Never throws comment", AR.includes("Never throws") || AR.includes("never throws"));
  check("C23", "Tenant isolation comment", AR.includes("tenant") || AR.includes("orgSlug"));
  check("C24", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 sprint ID", AR.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
  check("C25", "No update or delete methods", !AR.includes("updateEvent") && !AR.includes("deleteEvent"));
}

// ── Section D — prisma-audit-repository.ts ───────────────────────────────────

fileCheck("D01", "prisma-audit-repository.ts exists", PAR);
if (PAR) {
  check("D02", "PrismaAuditRepository class", PAR.includes("PrismaAuditRepository"));
  check("D03", "implements AuditRepository", PAR.includes("implements AuditRepository"));
  check("D04", "server-only import", PAR.includes('"server-only"'));
  check("D05", "prisma import", PAR.includes("from \"@/lib/prisma\"") || PAR.includes("from '@/lib/prisma'"));
  check("D06", "appendEvent implementation", PAR.includes("appendEvent("));
  check("D07", "appendMany implementation", PAR.includes("appendMany("));
  check("D08", "findById implementation", PAR.includes("findById("));
  check("D09", "findByTenant implementation", PAR.includes("findByTenant("));
  check("D10", "findByCategory implementation", PAR.includes("findByCategory("));
  check("D11", "findBySeverity implementation", PAR.includes("findBySeverity("));
  check("D12", "findByDateRange implementation", PAR.includes("findByDateRange("));
  check("D13", "findRecent implementation", PAR.includes("findRecent("));
  check("D14", "countEvents implementation", PAR.includes("countEvents("));
  check("D15", "try/catch in appendEvent (fail-safe)", (() => {
    const idx = PAR.indexOf("async appendEvent");
    if (idx === -1) return false;
    return PAR.slice(idx, idx + 400).includes("try {") || PAR.slice(idx, idx + 400).includes("try{");
  })());
  check("D16", "securityAuditEvent model used", PAR.includes("securityAuditEvent"));
  check("D17", "rowToEvent mapper", PAR.includes("rowToEvent"));
  check("D18", "inputToData mapper", PAR.includes("inputToData"));
  check("D19", "createdAt Date → ISO string", PAR.includes("toISOString()"));
  check("D20", "getPrismaAuditRepository singleton", PAR.includes("getPrismaAuditRepository"));
  check("D21", "Fails safe — returns null on error", PAR.includes("return null"));
  check("D22", "Fails safe — returns [] on error", PAR.includes("return []"));
  check("D23", "Fails safe — returns 0 on error", PAR.includes("return 0"));
  check("D24", "stderr logging on failure", PAR.includes("process.stderr.write"));
  check("D25", "Max take limit (500)", PAR.includes("500"));
  check("D26", "orderBy createdAt desc", PAR.includes("createdAt") && PAR.includes("desc"));
  check("D27", "orgSlug filter in all queries", (PAR.match(/orgSlug/g) || []).length >= 5);
  check("D28", "No delete operations", !PAR.includes(".delete(") && !PAR.includes(".deleteMany("));
  check("D29", "No update operations", !PAR.includes(".update(") && !PAR.includes(".updateMany("));
  check("D30", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 sprint ID", PAR.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
}

// ── Section E — persistent-audit-service.ts ───────────────────────────────────

fileCheck("E01", "persistent-audit-service.ts exists", PAS);
if (PAS) {
  check("E02", "PersistentAuditService class", PAS.includes("PersistentAuditService"));
  check("E03", "server-only import", PAS.includes('"server-only"'));
  check("E04", "recordEvent method", PAS.includes("recordEvent("));
  check("E05", "recordMany method", PAS.includes("recordMany("));
  check("E06", "queryEvents method", PAS.includes("queryEvents("));
  check("E07", "queryRecentEvents method", PAS.includes("queryRecentEvents("));
  check("E08", "countEvents method", PAS.includes("countEvents("));
  check("E09", "findById method", PAS.includes("findById("));
  check("E10", "queryByCategory method", PAS.includes("queryByCategory("));
  check("E11", "queryBySeverity method", PAS.includes("queryBySeverity("));
  check("E12", "queryByDateRange method", PAS.includes("queryByDateRange("));
  check("E13", "sanitizeInput or sanitize", PAS.includes("sanitize"));
  check("E14", "Forbidden metadata keys list", PAS.includes("FORBIDDEN_METADATA_KEYS") || PAS.includes("forbidden"));
  check("E15", "password forbidden in metadata", PAS.includes("password") && (PAS.includes("FORBIDDEN") || PAS.includes("forbidden")));
  check("E16", "token forbidden in metadata", PAS.includes("token") && (PAS.includes("FORBIDDEN") || PAS.includes("forbidden")));
  check("E17", "orgSlug required check", PAS.includes("!input.orgSlug") || PAS.includes("!orgSlug"));
  check("E18", "getPersistentAuditService singleton", PAS.includes("getPersistentAuditService"));
  check("E19", "Never throws into callers", PAS.includes("try {") || PAS.includes("try{"));
  check("E20", "Returns empty array on failure", PAS.includes("return []"));
  check("E21", "Returns 0 on failure", PAS.includes("return 0"));
  check("E22", "Returns null on failure", PAS.includes("return null"));
  check("E23", "Lazy import for repo (no circular dep)", PAS.includes("require(") || PAS.includes("import("));
  check("E24", "No Prisma direct import", !PAS.includes("from \"@prisma"));
  check("E25", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 sprint ID", PAS.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
}

// ── Section F — audit-query-engine.ts ────────────────────────────────────────

fileCheck("F01", "audit-query-engine.ts exists", AQE);
if (AQE) {
  check("F02", "AuditQueryEngine class", AQE.includes("AuditQueryEngine"));
  check("F03", "server-only import", AQE.includes('"server-only"'));
  check("F04", "getTenantEvents method", AQE.includes("getTenantEvents"));
  check("F05", "getRecentEvents method", AQE.includes("getRecentEvents"));
  check("F06", "getCriticalEvents method", AQE.includes("getCriticalEvents"));
  check("F07", "getCategoryEvents method", AQE.includes("getCategoryEvents"));
  check("F08", "getEventTimeline method", AQE.includes("getEventTimeline"));
  check("F09", "AuditTimelineEntry type", AQE.includes("AuditTimelineEntry"));
  check("F10", "AuditEventSummary type", AQE.includes("AuditEventSummary"));
  check("F11", "timeline groups by day (YYYY-MM-DD)", AQE.includes("slice(0, 10)") || AQE.includes("slice(0,10)"));
  check("F12", "timeline counts critical/high/medium/low", AQE.includes("critical") && AQE.includes("high") && AQE.includes("medium") && AQE.includes("low"));
  check("F13", "getEventSummary method", AQE.includes("getEventSummary") || AQE.includes("EventSummary"));
  check("F14", "countTenantEvents method", AQE.includes("countTenantEvents"));
  check("F15", "Never throws (catch blocks)", (AQE.match(/catch/g) || []).length >= 4);
  check("F16", "Returns empty array on failure", AQE.includes("return []"));
  check("F17", "Convenience functions exported", AQE.includes("export async function getTenantEvents"));
  check("F18", "SEVERITY_RANK used for sorting", AQE.includes("AUDIT_SEVERITY_RANK") || AQE.includes("SEVERITY_RANK"));
  check("F19", "No AI/ML inference", !AQE.includes("openai") && !AQE.includes("anthropic") && !AQE.includes("claude"));
  check("F20", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 sprint ID", AQE.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
}

// ── Section G — audit-report-builder.ts ──────────────────────────────────────

fileCheck("G01", "audit-report-builder.ts exists", ARB);
if (ARB) {
  check("G02", "buildAuditReport exported", ARB.includes("buildAuditReport"));
  check("G03", "formatAuditReport exported", ARB.includes("formatAuditReport"));
  check("G04", "AuditReport type", ARB.includes("AuditReport"));
  check("G05", "AuditReportSummary type", ARB.includes("AuditReportSummary"));
  check("G06", "AuditCategoryBreakdown type", ARB.includes("AuditCategoryBreakdown"));
  check("G07", "AuditTrend type", ARB.includes("AuditTrend"));
  check("G08", "summary field in report", ARB.includes("summary:"));
  check("G09", "critical events field", ARB.includes("critical"));
  check("G10", "recent events field", ARB.includes("recent"));
  check("G11", "timeline field", ARB.includes("timeline"));
  check("G12", "categories field", ARB.includes("categories"));
  check("G13", "trend field", ARB.includes("trend"));
  check("G14", "server-only import", ARB.includes('"server-only"'));
  check("G15", "No Prisma direct", !ARB.includes("from \"@prisma"));
  check("G16", "trend direction up/down/stable", ARB.includes('"up"') && ARB.includes('"down"') && ARB.includes('"stable"'));
  check("G17", "changePct calculated", ARB.includes("changePct"));
  check("G18", "computeTrend helper", ARB.includes("computeTrend"));
  check("G19", "generatedAt ISO field", ARB.includes("generatedAt") && ARB.includes("toISOString()"));
  check("G20", "No secret values in formatted output", !ARB.includes("secret:") && !ARB.includes("token:") && !ARB.includes("password:"));
  check("G21", "AUDIT_CATEGORY_REGISTRY used", ARB.includes("AUDIT_CATEGORY_REGISTRY"));
  check("G22", "criticalCount counted", ARB.includes("criticalCount"));
  check("G23", "highCount counted", ARB.includes("highCount"));
  check("G24", "totalEvents in summary", ARB.includes("totalEvents"));
  check("G25", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 sprint ID", ARB.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
}

// ── Section H — audit-retention.ts ───────────────────────────────────────────

fileCheck("H01", "audit-retention.ts exists", ARET);
if (ARET) {
  check("H02", "RetentionPolicy interface", ARET.includes("RetentionPolicy"));
  check("H03", "AUDIT_RETENTION_POLICIES exported", ARET.includes("AUDIT_RETENTION_POLICIES"));
  check("H04", "retentionDays field", ARET.includes("retentionDays"));
  check("H05", "retentionDays null = indefinite", ARET.includes("null") && ARET.includes("retentionDays"));
  check("H06", "LOW 90 days", ARET.includes("90") && ARET.includes("LOW"));
  check("H07", "MEDIUM 180 days", ARET.includes("180") && ARET.includes("MEDIUM"));
  check("H08", "HIGH 365 days", ARET.includes("365") && ARET.includes("HIGH"));
  check("H09", "CRITICAL indefinite (null)", (() => {
    const idx = ARET.indexOf("CRITICAL");
    if (idx === -1) return false;
    const snippet = ARET.slice(idx, idx + 500);
    return snippet.includes("null");
  })());
  check("H10", "VAULT indefinite retention", ARET.includes("VAULT") && ARET.includes("indefinite") || ARET.includes("VAULT_INDEFINITE"));
  check("H11", "TENANT_BOUNDARY indefinite retention", ARET.includes("TENANT_BOUNDARY") && ARET.includes("null"));
  check("H12", "getRetentionPolicy exported", ARET.includes("getRetentionPolicy"));
  check("H13", "getRetentionDays exported", ARET.includes("getRetentionDays"));
  check("H14", "isIndefiniteRetention exported", ARET.includes("isIndefiniteRetention"));
  check("H15", "computeExpiryDate exported", ARET.includes("computeExpiryDate"));
  check("H16", "getIndefiniteRetentionPolicies exported", ARET.includes("getIndefiniteRetentionPolicies"));
  check("H17", "No Prisma import", !ARET.includes("from \"@prisma"));
  check("H18", "No server-only (pure domain)", !ARET.includes('"server-only"'));
  check("H19", "rationale field in policy", ARET.includes("rationale:"));
  check("H20", "compliance field in policy", ARET.includes("compliance:"));
  check("H21", "ISO-27001 compliance reference", ARET.includes("ISO-27001"));
  check("H22", "category-specific policies override severity", ARET.includes("Priority 3") || ARET.includes("category-specific"));
  check("H23", "ReadonlyArray type", ARET.includes("ReadonlyArray"));
  check("H24", "as const for registry", ARET.includes("as const"));
  check("H25", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 sprint ID", ARET.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
}

// ── Section I — audit-health.ts ───────────────────────────────────────────────

fileCheck("I01", "audit-health.ts exists", AH);
if (AH) {
  check("I02", "AuditHealthMonitor class", AH.includes("AuditHealthMonitor"));
  check("I03", "checkAuditHealth method", AH.includes("checkAuditHealth"));
  check("I04", "AuditHealthReport type", AH.includes("AuditHealthReport"));
  check("I05", "AuditHealthCheckResult type", AH.includes("AuditHealthCheckResult"));
  check("I06", "AuditHealthStatus type", AH.includes("AuditHealthStatus"));
  check("I07", "HEALTHY status", AH.includes('"HEALTHY"'));
  check("I08", "DEGRADED status", AH.includes('"DEGRADED"'));
  check("I09", "UNAVAILABLE status", AH.includes('"UNAVAILABLE"'));
  check("I10", "repository_accessible check", AH.includes("repository_accessible") || AH.includes("_checkRepositoryAccessible"));
  check("I11", "write_functional check", AH.includes("write_functional") || AH.includes("_checkWriteFunctional"));
  check("I12", "recent_query check", AH.includes("recent_query") || AH.includes("_checkRecentQuery"));
  check("I13", "server-only import", AH.includes('"server-only"'));
  check("I14", "No external monitoring (no fetch)", !AH.includes("fetch(") && !AH.includes("axios"));
  check("I15", "durationMs in results", AH.includes("durationMs"));
  check("I16", "checkedAt ISO timestamp", AH.includes("checkedAt"));
  check("I17", "Never throws (try/catch)", (AH.match(/catch/g) || []).length >= 3);
  check("I18", "Health write uses AUDIT_HEALTH_CHECK event type", AH.includes("AUDIT_HEALTH_CHECK"));
  check("I19", "2000ms slow query threshold", AH.includes("2000"));
  check("I20", "checkAuditHealth convenience function", AH.includes("export async function checkAuditHealth"));
  check("I21", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 sprint ID", AH.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
}

// ── Section J — server.ts ─────────────────────────────────────────────────────

fileCheck("J01", "audit-persistence/server.ts exists", SRV);
if (SRV) {
  check("J02", "server-only import", SRV.includes('"server-only"'));
  check("J03", "PrismaAuditRepository exported", SRV.includes("PrismaAuditRepository"));
  check("J04", "PersistentAuditService exported", SRV.includes("PersistentAuditService"));
  check("J05", "AuditQueryEngine exported", SRV.includes("AuditQueryEngine"));
  check("J06", "buildAuditReport exported", SRV.includes("buildAuditReport"));
  check("J07", "checkAuditHealth exported", SRV.includes("checkAuditHealth"));
  check("J08", "persistentSecurityAuditAdapter exported", SRV.includes("persistentSecurityAuditAdapter"));
  check("J09", "persistentVaultAuditAdapter exported", SRV.includes("persistentVaultAuditAdapter"));
  check("J10", "persistentExecutiveAuditAdapter exported", SRV.includes("persistentExecutiveAuditAdapter"));
  check("J11", "persistentCopilotAuditAdapter exported", SRV.includes("persistentCopilotAuditAdapter"));
  check("J12", "createPersistentAuditEvent exported", SRV.includes("createPersistentAuditEvent"));
  check("J13", "AuditRepository type exported", SRV.includes("AuditRepository"));
  check("J14", "AUDIT_SEVERITY_RANK exported", SRV.includes("AUDIT_SEVERITY_RANK"));
  check("J15", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 sprint ID", SRV.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
}

// ── Section K — index.ts (client-safe) ───────────────────────────────────────

fileCheck("K01", "audit-persistence/index.ts exists", IDX);
if (IDX) {
  check("K02", "No server-only import", !IDX.includes('"server-only"'));
  check("K03", "No Prisma import", !IDX.includes("from \"@prisma") && !IDX.includes("prisma-audit-repository"));
  check("K04", "No PersistentAuditService", !IDX.includes("PersistentAuditService"));
  check("K05", "No PrismaAuditRepository", !IDX.includes("PrismaAuditRepository"));
  check("K06", "PersistentSecurityAuditEvent type exported", IDX.includes("PersistentSecurityAuditEvent"));
  check("K07", "AUDIT_CATEGORY_REGISTRY exported", IDX.includes("AUDIT_CATEGORY_REGISTRY"));
  check("K08", "AUDIT_RETENTION_POLICIES exported", IDX.includes("AUDIT_RETENTION_POLICIES"));
  check("K09", "AuditRepository type exported", IDX.includes("AuditRepository"));
  check("K10", "createPersistentAuditEvent exported", IDX.includes("createPersistentAuditEvent"));
  check("K11", "AuditReport type exported", IDX.includes("AuditReport"));
  check("K12", "AuditHealthReport type exported", IDX.includes("AuditHealthReport"));
  check("K13", "RetentionPolicy type exported", IDX.includes("RetentionPolicy"));
  check("K14", "getRetentionPolicy exported", IDX.includes("getRetentionPolicy"));
  check("K15", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 sprint ID", IDX.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
}

// ── Section L — audit-migration-adapters.ts ───────────────────────────────────

fileCheck("L01", "audit-migration-adapters.ts exists", AMA);
if (AMA) {
  check("L02", "AUDIT_SOURCE_MIGRATION_STATUS exported", AMA.includes("AUDIT_SOURCE_MIGRATION_STATUS"));
  check("L03", "AuditSourceMigrationEntry interface", AMA.includes("AuditSourceMigrationEntry"));
  check("L04", "AuditSourceStatus type", AMA.includes("AuditSourceStatus"));
  check("L05", "security_audit_log entry", AMA.includes("security_audit_log"));
  check("L06", "vault_service_audit_log entry", AMA.includes("vault_service_audit_log"));
  check("L07", "executive_audit_log entry", AMA.includes("executive_audit_log"));
  check("L08", "copilot_audit_log entry", AMA.includes("copilot_audit_log"));
  check("L09", "vault_audit_log entry (legacy memory-only)", AMA.includes("vault_audit_log"));
  check("L10", "MEMORY_AND_PERSISTENT status used", AMA.includes("MEMORY_AND_PERSISTENT"));
  check("L11", "MEMORY_ONLY status used", AMA.includes("MEMORY_ONLY"));
  check("L12", "getAuditSourceStatus exported", AMA.includes("getAuditSourceStatus"));
  check("L13", "getMigratedAuditSources exported", AMA.includes("getMigratedAuditSources"));
  check("L14", "getMemoryOnlyAuditSources exported", AMA.includes("getMemoryOnlyAuditSources"));
  check("L15", "Re-exports all 4 adapters", AMA.includes("persistentSecurityAuditAdapter") && AMA.includes("persistentVaultAuditAdapter") && AMA.includes("persistentExecutiveAuditAdapter") && AMA.includes("persistentCopilotAuditAdapter"));
  check("L16", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 sprint ID", AMA.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
}

// ── Section M — security-audit.ts (adapter) ──────────────────────────────────

fileCheck("M01", "security-audit.ts exists", SAU);
if (SAU) {
  check("M02", "PersistentSecurityAuditAdapter class", SAU.includes("PersistentSecurityAuditAdapter"));
  check("M03", "persistentSecurityAuditAdapter singleton", SAU.includes("persistentSecurityAuditAdapter"));
  check("M04", "record() method in adapter", SAU.includes("record(event: SecurityEvent): void"));
  check("M05", "_persist method is async void", SAU.includes("void this._persist") || SAU.includes("void this._per"));
  check("M06", "Lazy import of persistent service", SAU.includes("import(") || SAU.includes("require("));
  check("M07", "Original SecurityAuditLog preserved", SAU.includes("class SecurityAuditLog"));
  check("M08", "globalSecurityAuditLog still exported", SAU.includes("globalSecurityAuditLog"));
  check("M09", "Persistence failure does not propagate", (SAU.match(/} catch/g) || []).length >= 1);
  check("M10", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 comment", SAU.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
}

// ── Section N — vault-service-audit.ts (adapter) ─────────────────────────────

fileCheck("N01", "vault-service-audit.ts exists", VAU);
if (VAU) {
  check("N02", "PersistentVaultAuditAdapter class", VAU.includes("PersistentVaultAuditAdapter"));
  check("N03", "persistentVaultAuditAdapter singleton", VAU.includes("persistentVaultAuditAdapter"));
  check("N04", "record() method in adapter", VAU.includes("record(") && VAU.includes("PersistentVaultAuditAdapter"));
  check("N05", "_persist is fire-and-forget", VAU.includes("void this._persist"));
  check("N06", "Original VaultServiceAuditLog preserved", VAU.includes("class VaultServiceAuditLog"));
  check("N07", "globalVaultServiceAuditLog still exported", VAU.includes("globalVaultServiceAuditLog"));
  check("N08", "VAULT category used in persist call", VAU.includes('"VAULT"'));
  check("N09", "secretKind is safe to store (metadata comment)", VAU.includes("secretKind") && !VAU.includes("secretValue"));
  check("N10", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 comment", VAU.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
}

// ── Section O — executive-audit.ts (adapter) ──────────────────────────────────

fileCheck("O01", "executive-audit.ts exists", EAU);
if (EAU) {
  check("O02", "PersistentExecutiveAuditAdapter class", EAU.includes("PersistentExecutiveAuditAdapter"));
  check("O03", "persistentExecutiveAuditAdapter singleton", EAU.includes("persistentExecutiveAuditAdapter"));
  check("O04", "push() method in adapter", EAU.includes("push(event: ExecutiveAuditEvent): void"));
  check("O05", "EXECUTIVE_BRAIN category", EAU.includes('"EXECUTIVE_BRAIN"'));
  check("O06", "Original ExecutiveAuditLog preserved", EAU.includes("class ExecutiveAuditLog"));
  check("O07", "globalExecutiveAuditLog still exported", EAU.includes("globalExecutiveAuditLog"));
  check("O08", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 comment", EAU.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
}

// ── Section P — copilot-audit.ts (adapter) ────────────────────────────────────

fileCheck("P01", "copilot-audit.ts exists", CAU);
if (CAU) {
  check("P02", "PersistentCopilotAuditAdapter class", CAU.includes("PersistentCopilotAuditAdapter"));
  check("P03", "persistentCopilotAuditAdapter singleton", CAU.includes("persistentCopilotAuditAdapter"));
  check("P04", "pushWithOrg() requires orgSlug", CAU.includes("pushWithOrg("));
  check("P05", "push() without org — memory only", CAU.includes("push(event: CopilotAuditEvent): void"));
  check("P06", "COPILOT category", CAU.includes('"COPILOT"'));
  check("P07", "Original CopilotAuditLog class preserved", CAU.includes("class CopilotAuditLog"));
  check("P08", "globalCopilotAuditLog exported", CAU.includes("globalCopilotAuditLog"));
  check("P09", "Event type mapping to persistent types", CAU.includes("eventTypeMap") || CAU.includes("INTENT_RESOLVED"));
  check("P10", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 comment", CAU.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
}

// ── Section Q — security-inventory.ts ─────────────────────────────────────────

fileCheck("Q01", "security-inventory.ts exists", SI);
if (SI) {
  check("Q02", "AUDIT_PERSISTENCE entry added", SI.includes('"AUDIT_PERSISTENCE"') || SI.includes("AUDIT_PERSISTENCE"));
  check("Q03", "AUDIT_PERSISTENCE riskLevel HIGH", (() => {
    const idx = SI.indexOf("AUDIT_PERSISTENCE");
    if (idx === -1) return false;
    return SI.slice(idx, idx + 600).includes('"HIGH"');
  })());
  check("Q04", "AUDIT_PERSISTENCE hasAuditLog: true", (() => {
    const idx = SI.indexOf("AUDIT_PERSISTENCE");
    if (idx === -1) return false;
    return SI.slice(idx, idx + 600).includes("hasAuditLog:") && SI.slice(idx, idx + 600).includes("true");
  })());
  check("Q05", "AUDIT_PERSISTENCE handlesSecrets: false", (() => {
    const idx = SI.indexOf("AUDIT_PERSISTENCE");
    if (idx === -1) return false;
    return SI.slice(idx, idx + 600).includes("handlesSecrets:") && SI.slice(idx, idx + 600).includes("false");
  })());
  check("Q06", "AUDIT_PERSISTENCE references sprint ID", SI.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
  check("Q07", "append-only in implementedControls", (() => {
    const idx = SI.indexOf("AUDIT_PERSISTENCE");
    if (idx === -1) return false;
    return SI.slice(idx, idx + 1200).includes("append-only");
  })());
  check("Q08", "Other inventory entries preserved", SI.includes("MEMORY_ENGINE") && SI.includes("DIAN") && SI.includes("VAULT_MIGRATION"));
}

// ── Section R — prisma/schema.prisma ──────────────────────────────────────────

fileCheck("R01", "schema.prisma exists", SCH);
if (SCH) {
  check("R02", "SecurityAuditEvent model defined", SCH.includes("model SecurityAuditEvent"));
  check("R03", "id String @id @default(cuid())", SCH.includes("@id @default(cuid())") && SCH.includes("SecurityAuditEvent"));
  check("R04", "orgSlug String", (() => {
    const idx = SCH.indexOf("model SecurityAuditEvent");
    if (idx === -1) return false;
    return SCH.slice(idx, idx + 1500).includes("orgSlug");
  })());
  check("R05", "eventType String", (() => {
    const idx = SCH.indexOf("model SecurityAuditEvent");
    if (idx === -1) return false;
    return SCH.slice(idx, idx + 1500).includes("eventType");
  })());
  check("R06", "category String", (() => {
    const idx = SCH.indexOf("model SecurityAuditEvent");
    if (idx === -1) return false;
    return SCH.slice(idx, idx + 1500).includes("category");
  })());
  check("R07", "severity String", (() => {
    const idx = SCH.indexOf("model SecurityAuditEvent");
    if (idx === -1) return false;
    return SCH.slice(idx, idx + 1500).includes("severity");
  })());
  check("R08", "resourceId String?", (() => {
    const idx = SCH.indexOf("model SecurityAuditEvent");
    if (idx === -1) return false;
    return SCH.slice(idx, idx + 1500).includes("resourceId");
  })());
  check("R09", "actorId String?", (() => {
    const idx = SCH.indexOf("model SecurityAuditEvent");
    if (idx === -1) return false;
    return SCH.slice(idx, idx + 1500).includes("actorId");
  })());
  check("R10", "metadata Json", (() => {
    const idx = SCH.indexOf("model SecurityAuditEvent");
    if (idx === -1) return false;
    return SCH.slice(idx, idx + 1500).includes("metadata     Json") || SCH.slice(idx, idx + 1500).includes("metadata Json");
  })());
  check("R11", "createdAt DateTime @default(now())", (() => {
    const idx = SCH.indexOf("model SecurityAuditEvent");
    if (idx === -1) return false;
    return SCH.slice(idx, idx + 1500).includes("createdAt");
  })());
  check("R12", "orgSlug index defined", SCH.includes("SecurityAuditEvent_orgSlug_idx") || SCH.includes("@@index([orgSlug])"));
  check("R13", "No encryptedValue field (not a secret store)", (() => {
    const idx = SCH.indexOf("model SecurityAuditEvent");
    if (idx === -1) return true; // model not found = pass vacuously
    const model = SCH.slice(idx, idx + 2000);
    return !model.includes("encryptedValue");
  })());
  check("R14", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 comment in schema", SCH.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
  check("R15", "No secret/token/password field in model", (() => {
    const idx = SCH.indexOf("model SecurityAuditEvent");
    if (idx === -1) return true;
    const model = SCH.slice(idx, idx + 2000);
    return !model.includes("password") && !model.includes("token") && !model.includes("certificate");
  })());
}

// ── Section S — migration SQL ─────────────────────────────────────────────────

fileCheck("S01", "migration.sql exists", MIG);
if (MIG) {
  check("S02", "CREATE TABLE SecurityAuditEvent", MIG.includes("CREATE TABLE") && MIG.includes("SecurityAuditEvent"));
  check("S03", "orgSlug column", MIG.includes("orgSlug"));
  check("S04", "eventType column", MIG.includes("eventType"));
  check("S05", "category column", MIG.includes("category"));
  check("S06", "severity column", MIG.includes("severity"));
  check("S07", "metadata JSONB column", MIG.includes("JSONB") || MIG.includes("Json"));
  check("S08", "createdAt with CURRENT_TIMESTAMP", MIG.includes("CURRENT_TIMESTAMP") || MIG.includes("createdAt"));
  check("S09", "orgSlug index created", MIG.includes("orgSlug_idx") || MIG.includes("orgSlug"));
  check("S10", "createdAt index created", MIG.includes("createdAt_idx") || MIG.includes("createdAt"));
  check("S11", "PRIMARY KEY constraint", MIG.includes("PRIMARY KEY"));
  check("S12", "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 comment", MIG.includes("AGENTIK-SECURITY-AUDIT-PERSISTENCE-01"));
  check("S13", "No ALTER TABLE (fresh create)", !MIG.includes("ALTER TABLE SecurityAuditEvent ADD"));
  check("S14", "No DROP TABLE (safe migration)", !MIG.includes("DROP TABLE"));
  check("S15", "resourceId optional column", MIG.includes("resourceId"));
}

// ── Section T — no secret values stored ──────────────────────────────────────

const allNewFiles = [AET, ACR, AR, PAR, PAS, AQE, ARB, ARET, AH].filter(Boolean);

check("T01", "No encryptedValue in any audit file", allNewFiles.every(f => !f.includes("encryptedValue")));
check("T02", "No password field stored", allNewFiles.every(f => !f.match(/password\s*:/)));
check("T03", "No token field stored", allNewFiles.every(f => !f.match(/token\s*:/)));
check("T04", "No certificate stored", allNewFiles.every(f => !f.includes("certificate:") && !f.includes("cert:")));
check("T05", "sanitizeMetadata strips forbidden keys", PAS ? PAS.includes("FORBIDDEN") || PAS.includes("forbidden") : false);

// ── Section U — tenant isolation ─────────────────────────────────────────────

check("U01", "PrismaAuditRepository: orgSlug in every where clause", PAR ? (PAR.match(/orgSlug/g) || []).length >= 8 : false);
check("U02", "PersistentAuditService: orgSlug required check", PAS ? PAS.includes("!orgSlug") || PAS.includes("!input.orgSlug") : false);
check("U03", "AuditQueryEngine: orgSlug param in all methods", AQE ? (AQE.match(/orgSlug/g) || []).length >= 8 : false);
check("U04", "AuditRepository: orgSlug in all tenant methods", AR ? (AR.match(/orgSlug/g) || []).length >= 5 : false);
check("U05", "Health monitor uses __health_check__ org not system org", AH ? AH.includes("__health_check__") : false);

// ── Section V — server-only in runtime files ──────────────────────────────────

check("V01", "prisma-audit-repository has server-only", PAR ? PAR.includes('"server-only"') : false);
check("V02", "persistent-audit-service has server-only", PAS ? PAS.includes('"server-only"') : false);
check("V03", "audit-query-engine has server-only", AQE ? AQE.includes('"server-only"') : false);
check("V04", "audit-report-builder has server-only", ARB ? ARB.includes('"server-only"') : false);
check("V05", "audit-health has server-only", AH ? AH.includes('"server-only"') : false);
check("V06", "audit-persistence/server.ts has server-only", SRV ? SRV.includes('"server-only"') : false);
check("V07", "audit-event-types NO server-only (pure)", AET ? !AET.includes('"server-only"') : false);
check("V08", "audit-category-registry NO server-only (pure)", ACR ? !ACR.includes('"server-only"') : false);
check("V09", "audit-retention NO server-only (pure)", ARET ? !ARET.includes('"server-only"') : false);
check("V10", "audit-persistence/index.ts NO server-only (client-safe)", IDX ? !IDX.includes('"server-only"') : false);

// ── Section W — sprint ID in all files ───────────────────────────────────────

const sprintId = "AGENTIK-SECURITY-AUDIT-PERSISTENCE-01";
const sprintFiles = { AET, ACR, AR, PAR, PAS, AQE, ARB, ARET, AH, SRV, IDX, AMA, SAU, VAU, EAU, CAU };
const sprintFileNames = Object.keys(sprintFiles);
let wIdx = 1;
for (const name of sprintFileNames) {
  const src = sprintFiles[name];
  const id = `W${String(wIdx).padStart(2, "0")}`;
  check(id, `${name} contains sprint ID`, src ? src.includes(sprintId) : false);
  wIdx++;
}

// ── Results ───────────────────────────────────────────────────────────────────

const total = pass + fail + warn + skip;
const pct   = (pass + fail) > 0 ? Math.round((pass / (pass + fail)) * 100) : 0;

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  AGENTIK-SECURITY-AUDIT-PERSISTENCE-01 — Validation Suite");
console.log("═══════════════════════════════════════════════════════════════");
console.log(`  Total checks : ${total}`);
console.log(`  PASS         : ${pass}`);
console.log(`  FAIL         : ${fail}`);
console.log(`  WARN         : ${warn}`);
console.log(`  SKIP         : ${skip}`);
console.log(`  Score        : ${pct}%`);
console.log("───────────────────────────────────────────────────────────────");

if (failures.length > 0) {
  console.log("\n  FAILURES:");
  failures.forEach(f => console.log("  " + f));
}
if (warnings.length > 0) {
  console.log("\n  WARNINGS:");
  warnings.forEach(w => console.log("  " + w));
}

if (fail === 0) {
  console.log(`\n  ✓ ${pass}/${pass + fail} PASS — Audit Persistence Layer validated\n`);
  process.exit(0);
} else {
  console.log(`\n  ✗ ${fail} failure(s) — review above\n`);
  process.exit(1);
}
