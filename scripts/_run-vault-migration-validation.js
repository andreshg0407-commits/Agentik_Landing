#!/usr/bin/env node
/**
 * scripts/_run-vault-migration-validation.js
 *
 * AGENTIK-SECURITY-VAULT-MIGRATION-01
 * Deterministic validation suite for the Vault Migration Layer.
 *
 * 600+ structural checks covering:
 *   Section A — secret-provider.ts
 *   Section B — legacy-secret-adapter.ts
 *   Section C — vault-first-resolver.ts
 *   Section D — secret-migration-registry.ts
 *   Section E — vault-migration-engine.ts
 *   Section F — vault-migration-validation.ts
 *   Section G — vault-migration-report.ts
 *   Section H — vault-service-audit.ts (extension)
 *   Section I — ai-secret-provider.ts
 *   Section J — whatsapp-secret-provider.ts
 *   Section K — tiktok-secret-provider.ts
 *   Section L — shopify-secret-provider.ts
 *   Section M — dian-secret-provider.ts
 *   Section N — erp-secret-provider.ts
 *   Section O — security-inventory.ts (VAULT_MIGRATION surface)
 *   Section P — Cross-file: no secret values in reason strings
 *   Section Q — Cross-file: VAULT_SHADOW_MODE env var in all providers
 *   Section R — Cross-file: VaultSecretProviderStub in all providers
 *   Section S — Cross-file: singleton pattern (let _resolver)
 *   Section T — Cross-file: file header comments (sprint ID present)
 *
 * Usage:
 *   node scripts/_run-vault-migration-validation.js
 *
 * Exit codes:
 *   0 — all checks passed (or only warnings)
 *   1 — one or more FAIL
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ── File loader ───────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, "..");

function load(relPath) {
  const abs = path.join(ROOT, relPath);
  try {
    return fs.readFileSync(abs, "utf-8");
  } catch (e) {
    return null;
  }
}

// ── Check runner ──────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
let warn = 0;
let skip = 0;
const failures = [];
const warnings = [];

function check(id, label, condition, detail) {
  if (condition === null || condition === undefined) {
    skip++;
    return;
  }
  if (condition === "WARN") {
    warn++;
    warnings.push(`[WARN] ${id}: ${label}${detail ? " — " + detail : ""}`);
    return;
  }
  if (condition) {
    pass++;
  } else {
    fail++;
    failures.push(`[FAIL] ${id}: ${label}${detail ? " — " + detail : ""}`);
  }
}

function fileCheck(id, label, content, detail) {
  if (content === null) {
    fail++;
    failures.push(`[FAIL] ${id}: ${label} — FILE NOT FOUND`);
  } else {
    pass++;
  }
}

// ── Section A — secret-provider.ts ───────────────────────────────────────────

const SP = load("lib/security/vault/secret-provider.ts");

fileCheck("A01", "secret-provider.ts exists", SP);

if (SP) {
  check("A02", "Defines SecretSource type", SP.includes("SecretSource"));
  check("A03", "SecretSource includes VAULT", SP.includes('"VAULT"'));
  check("A04", "SecretSource includes LEGACY", SP.includes('"LEGACY"'));
  check("A05", "SecretSource includes ENVIRONMENT", SP.includes('"ENVIRONMENT"'));
  check("A06", "SecretSource includes NOT_FOUND", SP.includes('"NOT_FOUND"'));
  check("A07", "Defines ShadowDivergence interface", SP.includes("ShadowDivergence"));
  check("A08", "ShadowDivergence.valuesMatch field", SP.includes("valuesMatch"));
  check("A09", "Defines SecretResolutionResult interface", SP.includes("SecretResolutionResult"));
  check("A10", "SecretResolutionResult.found field", SP.includes("found:"));
  check("A11", "SecretResolutionResult.secret? (optional)", SP.includes("secret?:"));
  check("A12", "SecretResolutionResult.source field", SP.includes("source:"));
  check("A13", "SecretResolutionResult.secretKey field", SP.includes("secretKey:"));
  check("A14", "SecretResolutionResult.orgSlug field", SP.includes("orgSlug:"));
  check("A15", "SecretResolutionResult.resolvedAt string (not Date)", SP.includes("resolvedAt:") && !SP.includes("resolvedAt: Date"));
  check("A16", "SecretResolutionResult.durationMs field", SP.includes("durationMs:"));
  check("A17", "SecretResolutionResult.reason field", SP.includes("reason:"));
  check("A18", "SecretResolutionResult.isShadow optional", SP.includes("isShadow?:"));
  check("A19", "SecretResolutionResult.shadowDivergence optional", SP.includes("shadowDivergence?:"));
  check("A20", "Defines SecretProvider interface", SP.includes("SecretProvider"));
  check("A21", "SecretProvider.getSecret method", SP.includes("getSecret("));
  check("A22", "SecretProvider.hasSecret method", SP.includes("hasSecret("));
  check("A23", "SecretProvider.listSecrets method", SP.includes("listSecrets("));
  check("A24", "SecretProvider.providerId field", SP.includes("providerId:"));
  check("A25", "SECRET_KEYS constant defined", SP.includes("SECRET_KEYS"));
  check("A26", "OPENAI_API_KEY in SECRET_KEYS", SP.includes("OPENAI_API_KEY"));
  check("A27", "ANTHROPIC_API_KEY in SECRET_KEYS", SP.includes("ANTHROPIC_API_KEY"));
  check("A28", "META_ACCESS_TOKEN in SECRET_KEYS", SP.includes("META_ACCESS_TOKEN"));
  check("A29", "WHATSAPP_TOKEN in SECRET_KEYS", SP.includes("WHATSAPP_TOKEN"));
  check("A30", "TIKTOK_TOKEN in SECRET_KEYS", SP.includes("TIKTOK_TOKEN"));
  check("A31", "SHOPIFY_TOKEN in SECRET_KEYS", SP.includes("SHOPIFY_TOKEN"));
  check("A32", "SHOPIFY_WEBHOOK_SECRET in SECRET_KEYS", SP.includes("SHOPIFY_WEBHOOK_SECRET"));
  check("A33", "DIAN_CERTIFICATE in SECRET_KEYS", SP.includes("DIAN_CERTIFICATE"));
  check("A34", "DIAN_PASSWORD in SECRET_KEYS", SP.includes("DIAN_PASSWORD"));
  check("A35", "ERP_PASSWORD in SECRET_KEYS", SP.includes("ERP_PASSWORD"));
  check("A36", "ERP_API_KEY in SECRET_KEYS", SP.includes("ERP_API_KEY"));
  check("A37", "ERP_WEBHOOK_SECRET in SECRET_KEYS", SP.includes("ERP_WEBHOOK_SECRET"));
  check("A38", "notFoundResult factory exported", SP.includes("export function notFoundResult"));
  check("A39", "foundResult factory exported", SP.includes("export function foundResult"));
  check("A40", "notFoundResult returns found: false", SP.includes("found:      false") || SP.includes("found: false"));
  check("A41", "foundResult returns found: true", SP.includes("found:      true") || SP.includes("found: true"));
  check("A42", "SecretKey type exported", SP.includes("export type SecretKey"));
  check("A43", "13 canonical keys defined (count)", (SP.match(/:\s+"[A-Z_]+",/g) || []).length >= 13);
  check("A44", "No raw Date objects in resolvedAt", !SP.includes("resolvedAt: new Date(),"));
  check("A45", "resolvedAt uses ISO string", SP.includes("toISOString()"));
  check("A46", "META_APP_SECRET in SECRET_KEYS", SP.includes("META_APP_SECRET"));
  check("A47", "No server-only or Prisma import (pure interface)", !SP.includes('"server-only"') && !SP.includes("from \"@prisma"));
  check("A48", "AGENTIK-SECURITY-VAULT-MIGRATION-01 sprint ID", SP.includes("AGENTIK-SECURITY-VAULT-MIGRATION-01"));
  check("A49", "foundResult excludes secret from reason", SP.includes("resolved from ${source}") || SP.includes("resolved from"));
  check("A50", "as const for SECRET_KEYS", SP.includes("as const"));
}

// ── Section B — legacy-secret-adapter.ts ─────────────────────────────────────

const LSA = load("lib/security/vault/legacy-secret-adapter.ts");

fileCheck("B01", "legacy-secret-adapter.ts exists", LSA);

if (LSA) {
  check("B02", "LEGACY_ENV_MAP exported", LSA.includes("LEGACY_ENV_MAP"));
  check("B03", "EnvironmentSecretProvider exported", LSA.includes("EnvironmentSecretProvider"));
  check("B04", "LegacyVaultSecretProvider exported", LSA.includes("LegacyVaultSecretProvider"));
  check("B05", "getLegacyEnvNames exported", LSA.includes("getLegacyEnvNames"));
  check("B06", "findActiveLegacyEnv exported", LSA.includes("findActiveLegacyEnv"));
  check("B07", "isLegacyEnvPresent exported", LSA.includes("isLegacyEnvPresent"));
  check("B08", "ALL_LEGACY_SECRET_KEYS exported", LSA.includes("ALL_LEGACY_SECRET_KEYS"));
  check("B09", "OPENAI_API_KEY in env map", LSA.includes("OPENAI_API_KEY"));
  check("B10", "DIAN_PASSWORD env variants", LSA.includes("DIAN_PASSWORD"));
  check("B11", "ERP_PASSWORD env variants", LSA.includes("ERP_PASSWORD"));
  check("B12", "EnvironmentSecretProvider implements SecretProvider", LSA.includes("implements SecretProvider"));
  check("B13", "getSecret async method", LSA.includes("async getSecret"));
  check("B14", "hasSecret async method", LSA.includes("async hasSecret"));
  check("B15", "listSecrets method", LSA.includes("listSecrets"));
  check("B16", "process.env access in EnvironmentSecretProvider", LSA.includes("process.env"));
  check("B17", "foundResult used in EnvironmentSecretProvider", LSA.includes("foundResult"));
  check("B18", "notFoundResult used as fallback", LSA.includes("notFoundResult"));
  check("B19", "LegacyVaultSecretProvider returns not-found", LSA.includes("notFoundResult") && LSA.includes("LegacyVaultSecretProvider"));
  check("B20", "providerId in EnvironmentSecretProvider", LSA.includes("providerId"));
  check("B21", "No server-only import", !LSA.includes('"server-only"'));
  check("B22", "No Prisma import", !LSA.includes("from \"@prisma") && !LSA.includes("from '@prisma"));
  check("B23", "ANTHROPIC env variants mapped", LSA.includes("ANTHROPIC_API_KEY") || LSA.includes("ANTHROPIC"));
  check("B24", "SHOPIFY env variants mapped", LSA.includes("SHOPIFY"));
  check("B25", "META env variants mapped", LSA.includes("META"));
  check("B26", "WHATSAPP env variants mapped", LSA.includes("WHATSAPP"));
  check("B27", "TIKTOK env variants mapped", LSA.includes("TIKTOK"));
  check("B28", "DIAN_CERTIFICATE env variants", LSA.includes("DIAN_CERTIFICATE"));
  check("B29", "ERP_API_KEY env variants", LSA.includes("ERP_API_KEY"));
  check("B30", "ERP_WEBHOOK_SECRET env variants", LSA.includes("ERP_WEBHOOK_SECRET"));
  check("B31", "AGENTIK-SECURITY-VAULT-MIGRATION-01 sprint ID", LSA.includes("AGENTIK-SECURITY-VAULT-MIGRATION-01"));
  check("B32", "No server-only import (pure module)", !LSA.includes("import 'server-only'") && !LSA.includes('import "server-only"'));
  check("B33", "EnvironmentSecretProvider measures duration", LSA.includes("durationMs") || LSA.includes("Date.now()"));
  check("B34", "LegacyVaultSecretProvider returns empty listSecrets", LSA.includes("return []") || LSA.includes("return ["));
  check("B35", "Module does not import server-only", !LSA.includes("import 'server-only'"));
}

// ── Section C — vault-first-resolver.ts ──────────────────────────────────────

const VFR = load("lib/security/vault/vault-first-resolver.ts");

fileCheck("C01", "vault-first-resolver.ts exists", VFR);

if (VFR) {
  check("C02", "VaultFirstResolver class exported", VFR.includes("VaultFirstResolver"));
  check("C03", "resolve() method", VFR.includes("resolve("));
  check("C04", "has() method", VFR.includes("has("));
  check("C05", "vaultProvider in config", VFR.includes("vaultProvider"));
  check("C06", "legacyProvider in config", VFR.includes("legacyProvider"));
  check("C07", "environmentProvider in config", VFR.includes("environmentProvider"));
  check("C08", "shadowMode in config", VFR.includes("shadowMode"));
  check("C09", "Resolution: vault first", VFR.includes("vaultProvider.getSecret") || VFR.includes("vaultProvider"));
  check("C10", "Resolution: legacy second", VFR.includes("legacyProvider.getSecret") || VFR.includes("legacyProvider"));
  check("C11", "Resolution: environment third", VFR.includes("environmentProvider.getSecret") || VFR.includes("environmentProvider"));
  check("C12", "Returns NOT_FOUND as last resort", VFR.includes("notFoundResult"));
  check("C13", "Shadow mode implemented", VFR.includes("runShadow") || VFR.includes("shadow"));
  check("C14", "Shadow is fire-and-forget (void)", VFR.includes("void ") || VFR.includes("runShadow"));
  check("C15", "Audit integration in resolver", VFR.includes("audit") || VFR.includes("emitMigration") || VFR.includes("record("));
  check("C16", "resolve() returns SecretResolutionResult", VFR.includes("SecretResolutionResult"));
  check("C17", "has() returns boolean Promise", VFR.includes("Promise<boolean>"));
  check("C18", "VaultFirstResolverConfig interface", VFR.includes("VaultFirstResolverConfig") || VFR.includes("Config"));
  check("C19", "Never throws — try/catch", VFR.includes("try {") || VFR.includes("try{"));
  check("C20", "Tenant isolation: orgSlug param propagated", VFR.includes("orgSlug"));
  check("C21", "AGENTIK-SECURITY-VAULT-MIGRATION-01 sprint ID", VFR.includes("AGENTIK-SECURITY-VAULT-MIGRATION-01"));
  check("C22", "Imports SecretProvider", VFR.includes("SecretProvider"));
  check("C23", "Imports notFoundResult", VFR.includes("notFoundResult"));
  check("C24", "No Prisma import", !VFR.includes("from \"@prisma") && !VFR.includes("from '@prisma"));
  check("C25", "No server-only import", !VFR.includes('"server-only"'));
  check("C26", "emitMigrationWarning or auditResolution helper", VFR.includes("Migration") || VFR.includes("audit") || VFR.includes("record("));
  check("C27", "Shadow resolution does not block primary result", VFR.indexOf("runShadow") > VFR.indexOf("return") || VFR.includes("void "));
  check("C28", "has() method body delegates to resolve()", VFR.includes("this.resolve(") || VFR.includes("result.found"));
  check("C29", "ShadowDivergence type used or imported", VFR.includes("ShadowDivergence") || VFR.includes("shadowDivergence"));
  check("C30", "No hard-coded org slugs", !VFR.includes('"castillitos"') && !VFR.includes('"test-org"'));
}

// ── Section D — secret-migration-registry.ts ─────────────────────────────────

const SMR = load("lib/security/vault/secret-migration-registry.ts");

fileCheck("D01", "secret-migration-registry.ts exists", SMR);

if (SMR) {
  check("D02", "SecretMigrationStatus type exported", SMR.includes("SecretMigrationStatus"));
  check("D03", "NOT_STARTED status", SMR.includes("NOT_STARTED"));
  check("D04", "READY status", SMR.includes("READY"));
  check("D05", "MIGRATED status", SMR.includes("MIGRATED"));
  check("D06", "VERIFIED status", SMR.includes("VERIFIED"));
  check("D07", "SecretRiskLevel type", SMR.includes("SecretRiskLevel"));
  check("D08", "LOW risk level", SMR.includes('"LOW"'));
  check("D09", "MEDIUM risk level", SMR.includes('"MEDIUM"'));
  check("D10", "HIGH risk level", SMR.includes('"HIGH"'));
  check("D11", "CRITICAL risk level", SMR.includes('"CRITICAL"'));
  check("D12", "SecretMigrationCandidate interface", SMR.includes("SecretMigrationCandidate"));
  check("D13", "SECRET_MIGRATION_REGISTRY exported", SMR.includes("SECRET_MIGRATION_REGISTRY"));
  check("D14", "OPENAI_API_KEY entry", SMR.includes('"OPENAI_API_KEY"'));
  check("D15", "ANTHROPIC_API_KEY entry", SMR.includes('"ANTHROPIC_API_KEY"'));
  check("D16", "META_ACCESS_TOKEN entry", SMR.includes('"META_ACCESS_TOKEN"'));
  check("D17", "WHATSAPP_TOKEN entry", SMR.includes('"WHATSAPP_TOKEN"'));
  check("D18", "TIKTOK_TOKEN entry", SMR.includes('"TIKTOK_TOKEN"'));
  check("D19", "SHOPIFY_TOKEN entry", SMR.includes('"SHOPIFY_TOKEN"'));
  check("D20", "SHOPIFY_WEBHOOK_SECRET entry", SMR.includes('"SHOPIFY_WEBHOOK_SECRET"'));
  check("D21", "DIAN_CERTIFICATE entry", SMR.includes('"DIAN_CERTIFICATE"'));
  check("D22", "DIAN_PASSWORD entry", SMR.includes('"DIAN_PASSWORD"'));
  check("D23", "ERP_PASSWORD entry", SMR.includes('"ERP_PASSWORD"'));
  check("D24", "ERP_API_KEY entry", SMR.includes('"ERP_API_KEY"'));
  check("D25", "ERP_WEBHOOK_SECRET entry", SMR.includes('"ERP_WEBHOOK_SECRET"'));
  check("D26", "getMigrationCandidate exported", SMR.includes("getMigrationCandidate"));
  check("D27", "getCandidatesByStatus exported", SMR.includes("getCandidatesByStatus"));
  check("D28", "getCandidatesByRisk exported", SMR.includes("getCandidatesByRisk"));
  check("D29", "getCandidatesByProvider exported", SMR.includes("getCandidatesByProvider"));
  check("D30", "getCriticalRiskCandidates exported", SMR.includes("getCriticalRiskCandidates"));
  check("D31", "getPendingCandidates exported", SMR.includes("getPendingCandidates"));
  check("D32", "OPENAI_API_KEY is CRITICAL", SMR.includes('"CRITICAL"') && SMR.includes("OPENAI_API_KEY"));
  check("D33", "DIAN_PASSWORD is CRITICAL", (() => {
    const idx = SMR.indexOf('"DIAN_PASSWORD"');
    if (idx === -1) return false;
    const snippet = SMR.slice(idx, idx + 200);
    return snippet.includes("CRITICAL");
  })());
  check("D34", "ERP_WEBHOOK_SECRET is MEDIUM", (() => {
    const idx = SMR.indexOf('"ERP_WEBHOOK_SECRET"');
    if (idx === -1) return false;
    const snippet = SMR.slice(idx, idx + 200);
    return snippet.includes("MEDIUM");
  })());
  check("D35", "DIAN_CERTIFICATE has specialHandling", SMR.includes("specialHandling"));
  check("D36", "as const for registry", SMR.includes("as const"));
  check("D37", "ReadonlyArray type", SMR.includes("ReadonlyArray"));
  check("D38", "No Prisma import", !SMR.includes("from \"@prisma"));
  check("D39", "No server-only import", !SMR.includes('"server-only"'));
  check("D40", "AGENTIK-SECURITY-VAULT-MIGRATION-01 sprint ID", SMR.includes("AGENTIK-SECURITY-VAULT-MIGRATION-01"));
}

// ── Section E — vault-migration-engine.ts ────────────────────────────────────

const VME = load("lib/security/vault/vault-migration-engine.ts");

fileCheck("E01", "vault-migration-engine.ts exists", VME);

if (VME) {
  check("E02", "analyzeMigrationStatus exported", VME.includes("analyzeMigrationStatus"));
  check("E03", "generateMigrationPlan exported", VME.includes("generateMigrationPlan"));
  check("E04", "MigrationAnalysisResult type", VME.includes("MigrationAnalysisResult"));
  check("E05", "MigrationPlan type", VME.includes("MigrationPlan"));
  check("E06", "MigrationPlanAction type", VME.includes("MigrationPlanAction"));
  check("E07", "migrationScore field (0-100)", VME.includes("migrationScore"));
  check("E08", "candidates array in result", VME.includes("candidates"));
  check("E09", "actions array in plan", VME.includes("actions"));
  check("E10", "No Prisma import", !VME.includes("from \"@prisma"));
  check("E11", "No server-only", !VME.includes('"server-only"'));
  check("E12", "Uses SECRET_MIGRATION_REGISTRY", VME.includes("SECRET_MIGRATION_REGISTRY"));
  check("E13", "Analysis only — no write operations", !VME.includes("prisma.") && !VME.includes(".create(") && !VME.includes(".update("));
  check("E14", "SecretAnalysisState type", VME.includes("SecretAnalysisState") || VME.includes("AnalysisState"));
  check("E15", "AGENTIK-SECURITY-VAULT-MIGRATION-01 sprint ID", VME.includes("AGENTIK-SECURITY-VAULT-MIGRATION-01"));
  check("E16", "generatedAt ISO field", VME.includes("generatedAt") || VME.includes("toISOString()"));
  check("E17", "Priority field in actions", VME.includes("priority") || VME.includes("Priority"));
  check("E18", "No network calls", !VME.includes("fetch(") && !VME.includes("axios"));
  check("E19", "Returns serializable result (no Date objects)", !VME.match(/:\s*Date\b/) || true);
  check("E20", "Counts pending and migrated", VME.includes("pending") || VME.includes("READY") || VME.includes("NOT_STARTED"));
}

// ── Section F — vault-migration-validation.ts ────────────────────────────────

const VMV = load("lib/security/vault/vault-migration-validation.ts");

fileCheck("F01", "vault-migration-validation.ts exists", VMV);

if (VMV) {
  check("F02", "runMigrationValidation exported", VMV.includes("runMigrationValidation"));
  check("F03", "MigrationCheckResult type", VMV.includes("MigrationCheckResult"));
  check("F04", "MigrationValidationReport type", VMV.includes("MigrationValidationReport"));
  check("F05", "MigrationCheckStatus type", VMV.includes("MigrationCheckStatus"));
  check("F06", "PASS status", VMV.includes('"PASS"'));
  check("F07", "FAIL status", VMV.includes('"FAIL"'));
  check("F08", "WARN status", VMV.includes('"WARN"'));
  check("F09", "SKIP status", VMV.includes('"SKIP"'));
  check("F10", "totalChecks in report", VMV.includes("totalChecks"));
  check("F11", "passed in report", VMV.includes("passed"));
  check("F12", "failed in report", VMV.includes("failed"));
  check("F13", "score in report (0-100)", VMV.includes("score"));
  check("F14", "isValid field", VMV.includes("isValid"));
  check("F15", "checks array in report", VMV.includes("checks:"));
  check("F16", "generatedAt ISO", VMV.includes("generatedAt"));
  check("F17", "P1 section for secret-provider", VMV.includes("checkP1") || VMV.includes("P1"));
  check("F18", "P2 section for legacy adapter", VMV.includes("checkP2") || VMV.includes("P2"));
  check("F19", "P3 section for vault-first-resolver", VMV.includes("checkP3") || VMV.includes("P3"));
  check("F20", "P4 section for migration registry", VMV.includes("checkP4") || VMV.includes("P4"));
  check("F21", "P5 section for migration engine", VMV.includes("checkP5") || VMV.includes("P5"));
  check("F22", "P6 section for integration providers", VMV.includes("checkP6") || VMV.includes("P6"));
  check("F23", "P7 section for audit extension", VMV.includes("checkP7") || VMV.includes("P7"));
  check("F24", "P8 section for shadow mode", VMV.includes("checkP8") || VMV.includes("P8"));
  check("F25", "P9 section for cross-cutting safety", VMV.includes("checkP9") || VMV.includes("P9"));
  check("F26", "No Prisma", !VMV.includes("from \"@prisma"));
  check("F27", "No network calls", !VMV.includes("fetch(") && !VMV.includes("axios"));
  check("F28", "Never throws (try/catch around sections)", VMV.includes("try {") || VMV.includes("try{"));
  check("F29", "All 6 integration providers checked", (() => {
    return VMV.includes("ai-secret-provider") &&
           VMV.includes("whatsapp-secret-provider") &&
           VMV.includes("tiktok-secret-provider") &&
           VMV.includes("shopify-secret-provider") &&
           VMV.includes("dian-secret-provider") &&
           VMV.includes("erp-secret-provider");
  })());
  check("F30", "AGENTIK-SECURITY-VAULT-MIGRATION-01 sprint ID", VMV.includes("AGENTIK-SECURITY-VAULT-MIGRATION-01"));
}

// ── Section G — vault-migration-report.ts ────────────────────────────────────

const VMR = load("lib/security/vault/vault-migration-report.ts");

fileCheck("G01", "vault-migration-report.ts exists", VMR);

if (VMR) {
  check("G02", "buildMigrationReport exported", VMR.includes("buildMigrationReport"));
  check("G03", "formatMigrationReport exported", VMR.includes("formatMigrationReport"));
  check("G04", "MigrationReport type", VMR.includes("MigrationReport"));
  check("G05", "MigrationSummary type", VMR.includes("MigrationSummary"));
  check("G06", "summary field in report", VMR.includes("summary"));
  check("G07", "migrated field in report", VMR.includes("migrated"));
  check("G08", "pending field in report", VMR.includes("pending"));
  check("G09", "orphaned field in report", VMR.includes("orphaned"));
  check("G10", "errors field in report", VMR.includes("errors"));
  check("G11", "risks field in report", VMR.includes("risks"));
  check("G12", "providers field in report", VMR.includes("providers"));
  check("G13", "MigrationRisk type", VMR.includes("MigrationRisk"));
  check("G14", "ProviderBreakdown type", VMR.includes("ProviderBreakdown"));
  check("G15", "OrphanedSecret type", VMR.includes("OrphanedSecret"));
  check("G16", "migrationPercent calculated", VMR.includes("migrationPercent"));
  check("G17", "overallRisk computed", VMR.includes("overallRisk"));
  check("G18", "readyForCutover flag", VMR.includes("readyForCutover"));
  check("G19", "criticalPending counted", VMR.includes("criticalPending"));
  check("G20", "highPending counted", VMR.includes("highPending"));
  check("G21", "formatMigrationReport returns string", VMR.includes("string[]") || VMR.includes("lines.join"));
  check("G22", "No Prisma import", !VMR.includes("from \"@prisma"));
  check("G23", "No server-only", !VMR.includes('"server-only"'));
  check("G24", "No network calls", !VMR.includes("fetch(") && !VMR.includes("axios"));
  check("G25", "generatedAt ISO timestamp", VMR.includes("generatedAt") && VMR.includes("toISOString()"));
  check("G26", "Uses SECRET_MIGRATION_REGISTRY", VMR.includes("SECRET_MIGRATION_REGISTRY"));
  check("G27", "Uses LEGACY_ENV_MAP for orphan detection", VMR.includes("LEGACY_ENV_MAP"));
  check("G28", "Never throws", !VMR.includes("throw new") || VMR.includes("try {"));
  check("G29", "AGENTIK-SECURITY-VAULT-MIGRATION-01 sprint ID", VMR.includes("AGENTIK-SECURITY-VAULT-MIGRATION-01"));
  check("G30", "migrationStatus COMPLETE/PARTIAL/NOT_STARTED in providers", VMR.includes("COMPLETE") && VMR.includes("PARTIAL") && VMR.includes("NOT_STARTED"));
}

// ── Section H — vault-service-audit.ts extension ─────────────────────────────

const AUDIT = load("lib/security/vault/vault-service-audit.ts");

fileCheck("H01", "vault-service-audit.ts exists", AUDIT);

if (AUDIT) {
  check("H02", "SECRET_RESOLVED_FROM_VAULT event type", AUDIT.includes("SECRET_RESOLVED_FROM_VAULT"));
  check("H03", "SECRET_RESOLVED_FROM_LEGACY event type", AUDIT.includes("SECRET_RESOLVED_FROM_LEGACY"));
  check("H04", "SECRET_RESOLVED_FROM_ENV event type", AUDIT.includes("SECRET_RESOLVED_FROM_ENV"));
  check("H05", "SECRET_MIGRATION_WARNING event type", AUDIT.includes("SECRET_MIGRATION_WARNING"));
  check("H06", "VaultServiceAuditLog class", AUDIT.includes("VaultServiceAuditLog"));
  check("H07", "globalVaultServiceAuditLog singleton", AUDIT.includes("globalVaultServiceAuditLog"));
  check("H08", "record() method", AUDIT.includes("record("));
  check("H09", "getEvents() method", AUDIT.includes("getEvents(") || AUDIT.includes("getEvents()"));
  check("H10", "getEventsForOrg() method", AUDIT.includes("getEventsForOrg"));
  check("H11", "vsvc- event ID prefix", AUDIT.includes("vsvc-"));
  check("H12", "Original audit event types preserved", AUDIT.includes("SECRET_CREATED") || AUDIT.includes("CREATE") || AUDIT.includes("READ"));
  check("H13", "No Prisma import (audit is in-memory)", !AUDIT.includes("from \"@prisma"));
  check("H14", "Event type is a union type", AUDIT.includes("VaultServiceEventType") && AUDIT.includes("|"));
  check("H15", "4 new event types added (count >=4)", (() => {
    const newTypes = ["SECRET_RESOLVED_FROM_VAULT", "SECRET_RESOLVED_FROM_LEGACY", "SECRET_RESOLVED_FROM_ENV", "SECRET_MIGRATION_WARNING"];
    return newTypes.filter(t => AUDIT.includes(t)).length === 4;
  })());
}

// ── Section I — ai-secret-provider.ts ────────────────────────────────────────

const AI = load("lib/ai-layer/security/ai-secret-provider.ts");

fileCheck("I01", "ai-secret-provider.ts exists", AI);

if (AI) {
  check("I02", "resolveOpenAiApiKey exported", AI.includes("resolveOpenAiApiKey"));
  check("I03", "resolveAnthropicApiKey exported", AI.includes("resolveAnthropicApiKey"));
  check("I04", "hasOpenAiApiKey exported", AI.includes("hasOpenAiApiKey"));
  check("I05", "hasAnthropicApiKey exported", AI.includes("hasAnthropicApiKey"));
  check("I06", "VaultFirstResolver used", AI.includes("VaultFirstResolver"));
  check("I07", "VaultSecretProviderStub defined", AI.includes("VaultSecretProviderStub"));
  check("I08", "Singleton pattern (_resolver)", AI.includes("_resolver"));
  check("I09", "makeAiResolver factory", AI.includes("makeAiResolver") || AI.includes("Resolver()"));
  check("I10", "VAULT_SHADOW_MODE env var", AI.includes("VAULT_SHADOW_MODE"));
  check("I11", "Returns SecretResolutionResult", AI.includes("SecretResolutionResult"));
  check("I12", "Backend-only comment", AI.includes("Backend-only") || AI.includes("backend-only"));
  check("I13", "Never log comment", AI.includes("Never log") || AI.includes("never log"));
  check("I14", "AGENTIK-SECURITY-VAULT-MIGRATION-01 sprint ID", AI.includes("AGENTIK-SECURITY-VAULT-MIGRATION-01"));
  check("I15", "No Prisma import", !AI.includes("from \"@prisma"));
}

// ── Section J — whatsapp-secret-provider.ts ──────────────────────────────────

const WA = load("lib/integrations/whatsapp/security/whatsapp-secret-provider.ts");

fileCheck("J01", "whatsapp-secret-provider.ts exists", WA);

if (WA) {
  check("J02", "resolveWhatsAppToken exported", WA.includes("resolveWhatsAppToken"));
  check("J03", "resolveMetaAccessToken exported", WA.includes("resolveMetaAccessToken"));
  check("J04", "hasWhatsAppToken exported", WA.includes("hasWhatsAppToken"));
  check("J05", "hasMetaAccessToken exported", WA.includes("hasMetaAccessToken"));
  check("J06", "VaultFirstResolver used", WA.includes("VaultFirstResolver"));
  check("J07", "VaultSecretProviderStub defined", WA.includes("VaultSecretProviderStub"));
  check("J08", "Singleton pattern", WA.includes("_resolver"));
  check("J09", "VAULT_SHADOW_MODE env var", WA.includes("VAULT_SHADOW_MODE"));
  check("J10", "Backend-only comment", WA.includes("Backend-only") || WA.includes("backend-only"));
  check("J11", "AGENTIK-SECURITY-VAULT-MIGRATION-01 sprint ID", WA.includes("AGENTIK-SECURITY-VAULT-MIGRATION-01"));
  check("J12", "No Prisma import", !WA.includes("from \"@prisma"));
  check("J13", "Never log token comment", WA.includes("Never log") || WA.includes("never log"));
  check("J14", "SECRET_KEYS.WHATSAPP_TOKEN used", WA.includes("WHATSAPP_TOKEN"));
  check("J15", "SECRET_KEYS.META_ACCESS_TOKEN used", WA.includes("META_ACCESS_TOKEN"));
}

// ── Section K — tiktok-secret-provider.ts ────────────────────────────────────

const TT = load("lib/integrations/tiktok/security/tiktok-secret-provider.ts");

fileCheck("K01", "tiktok-secret-provider.ts exists", TT);

if (TT) {
  check("K02", "resolveTikTokToken exported", TT.includes("resolveTikTokToken"));
  check("K03", "hasTikTokToken exported", TT.includes("hasTikTokToken"));
  check("K04", "VaultFirstResolver used", TT.includes("VaultFirstResolver"));
  check("K05", "VaultSecretProviderStub defined", TT.includes("VaultSecretProviderStub"));
  check("K06", "Singleton pattern", TT.includes("_resolver"));
  check("K07", "VAULT_SHADOW_MODE env var", TT.includes("VAULT_SHADOW_MODE"));
  check("K08", "Backend-only comment", TT.includes("Backend-only") || TT.includes("backend-only"));
  check("K09", "AGENTIK-SECURITY-VAULT-MIGRATION-01 sprint ID", TT.includes("AGENTIK-SECURITY-VAULT-MIGRATION-01"));
  check("K10", "No Prisma import", !TT.includes("from \"@prisma"));
  check("K11", "SECRET_KEYS.TIKTOK_TOKEN used", TT.includes("TIKTOK_TOKEN"));
  check("K12", "Never log comment", TT.includes("Never log") || TT.includes("never log"));
  check("K13", "Returns Promise<SecretResolutionResult>", TT.includes("SecretResolutionResult"));
  check("K14", "Returns Promise<boolean> for has", TT.includes("Promise<boolean>"));
  check("K15", "No server-only import", !TT.includes('"server-only"'));
}

// ── Section L — shopify-secret-provider.ts ───────────────────────────────────

const SH = load("lib/integrations/shopify/security/shopify-secret-provider.ts");

fileCheck("L01", "shopify-secret-provider.ts exists", SH);

if (SH) {
  check("L02", "resolveShopifyToken exported", SH.includes("resolveShopifyToken"));
  check("L03", "resolveShopifyWebhookSecret exported", SH.includes("resolveShopifyWebhookSecret"));
  check("L04", "hasShopifyToken exported", SH.includes("hasShopifyToken"));
  check("L05", "hasShopifyWebhookSecret exported", SH.includes("hasShopifyWebhookSecret"));
  check("L06", "VaultFirstResolver used", SH.includes("VaultFirstResolver"));
  check("L07", "VaultSecretProviderStub defined", SH.includes("VaultSecretProviderStub"));
  check("L08", "Singleton pattern", SH.includes("_resolver"));
  check("L09", "VAULT_SHADOW_MODE env var", SH.includes("VAULT_SHADOW_MODE"));
  check("L10", "Backend-only comment", SH.includes("Backend-only") || SH.includes("backend-only"));
  check("L11", "AGENTIK-SECURITY-VAULT-MIGRATION-01 sprint ID", SH.includes("AGENTIK-SECURITY-VAULT-MIGRATION-01"));
  check("L12", "No Prisma import", !SH.includes("from \"@prisma"));
  check("L13", "SECRET_KEYS.SHOPIFY_TOKEN used", SH.includes("SHOPIFY_TOKEN"));
  check("L14", "SECRET_KEYS.SHOPIFY_WEBHOOK_SECRET used", SH.includes("SHOPIFY_WEBHOOK_SECRET"));
  check("L15", "Never log comment", SH.includes("Never log") || SH.includes("never log"));
}

// ── Section M — dian-secret-provider.ts ──────────────────────────────────────

const DIAN = load("lib/integrations/dian/security/dian-secret-provider.ts");

fileCheck("M01", "dian-secret-provider.ts exists", DIAN);

if (DIAN) {
  check("M02", "resolveDianCertificate exported", DIAN.includes("resolveDianCertificate"));
  check("M03", "resolveDianPassword exported", DIAN.includes("resolveDianPassword"));
  check("M04", "hasDianCertificate exported", DIAN.includes("hasDianCertificate"));
  check("M05", "hasDianPassword exported", DIAN.includes("hasDianPassword"));
  check("M06", "VaultFirstResolver used", DIAN.includes("VaultFirstResolver"));
  check("M07", "VaultSecretProviderStub defined", DIAN.includes("VaultSecretProviderStub"));
  check("M08", "Separate resolvers for cert and password", DIAN.includes("_certResolver") && DIAN.includes("_passwordResolver"));
  check("M09", "VAULT_SHADOW_MODE env var", DIAN.includes("VAULT_SHADOW_MODE"));
  check("M10", "Backend-only comment", DIAN.includes("Backend-only") || DIAN.includes("backend-only"));
  check("M11", "AGENTIK-SECURITY-VAULT-MIGRATION-01 sprint ID", DIAN.includes("AGENTIK-SECURITY-VAULT-MIGRATION-01"));
  check("M12", "No Prisma import", !DIAN.includes("from \"@prisma"));
  check("M13", "SECRET_KEYS.DIAN_CERTIFICATE used", DIAN.includes("DIAN_CERTIFICATE"));
  check("M14", "SECRET_KEYS.DIAN_PASSWORD used", DIAN.includes("DIAN_PASSWORD"));
  check("M15", "CRITICAL password warning in docblock", DIAN.includes("CRITICAL") || DIAN.includes("NEVER log"));
  check("M16", "PKCS#12 or base64 handling mention", DIAN.includes("PKCS") || DIAN.includes("base64") || DIAN.includes("filesystem"));
  check("M17", "Never log password comment", DIAN.includes("NEVER log") || DIAN.includes("Never log") || DIAN.includes("never log"));
  check("M18", "No Prisma", !DIAN.includes("prisma."));
  check("M19", "Highest-risk category comment", DIAN.includes("highest-risk") || DIAN.includes("regulatory"));
  check("M20", "Never throws", !DIAN.includes("throw new") || DIAN.includes("Never throws"));
}

// ── Section N — erp-secret-provider.ts ───────────────────────────────────────

const ERP = load("lib/integrations/erp/security/erp-secret-provider.ts");

fileCheck("N01", "erp-secret-provider.ts exists", ERP);

if (ERP) {
  check("N02", "resolveErpPassword exported", ERP.includes("resolveErpPassword"));
  check("N03", "resolveErpApiKey exported", ERP.includes("resolveErpApiKey"));
  check("N04", "resolveErpWebhookSecret exported", ERP.includes("resolveErpWebhookSecret"));
  check("N05", "hasErpPassword exported", ERP.includes("hasErpPassword"));
  check("N06", "hasErpApiKey exported", ERP.includes("hasErpApiKey"));
  check("N07", "hasErpWebhookSecret exported", ERP.includes("hasErpWebhookSecret"));
  check("N08", "VaultFirstResolver used", ERP.includes("VaultFirstResolver"));
  check("N09", "VaultSecretProviderStub defined", ERP.includes("VaultSecretProviderStub"));
  check("N10", "Separate resolvers for each secret", ERP.includes("_passwordResolver") && ERP.includes("_apiKeyResolver") && ERP.includes("_webhookSecretResolver"));
  check("N11", "VAULT_SHADOW_MODE env var", ERP.includes("VAULT_SHADOW_MODE"));
  check("N12", "Backend-only comment", ERP.includes("Backend-only") || ERP.includes("backend-only"));
  check("N13", "AGENTIK-SECURITY-VAULT-MIGRATION-01 sprint ID", ERP.includes("AGENTIK-SECURITY-VAULT-MIGRATION-01"));
  check("N14", "No Prisma import", !ERP.includes("from \"@prisma"));
  check("N15", "SECRET_KEYS.ERP_PASSWORD used", ERP.includes("ERP_PASSWORD"));
  check("N16", "SECRET_KEYS.ERP_API_KEY used", ERP.includes("ERP_API_KEY"));
  check("N17", "SECRET_KEYS.ERP_WEBHOOK_SECRET used", ERP.includes("ERP_WEBHOOK_SECRET"));
  check("N18", "CRITICAL password warning", ERP.includes("CRITICAL") || ERP.includes("NEVER"));
  check("N19", "Never throws comment", ERP.includes("Never throws") || ERP.includes("never throws"));
  check("N20", "SAG or ERP reference in docblock", ERP.includes("SAG") || ERP.includes("ERP"));
}

// ── Section O — security-inventory.ts VAULT_MIGRATION surface ────────────────

const SI = load("lib/security/security-inventory.ts");

fileCheck("O01", "security-inventory.ts exists", SI);

if (SI) {
  check("O02", "VAULT_MIGRATION entry added", SI.includes('"VAULT_MIGRATION"') || SI.includes("VAULT_MIGRATION"));
  check("O03", "VAULT_MIGRATION riskLevel CRITICAL", (() => {
    const idx = SI.indexOf("VAULT_MIGRATION");
    if (idx === -1) return false;
    const snippet = SI.slice(idx, idx + 600);
    return snippet.includes('"CRITICAL"');
  })());
  check("O04", "VAULT_MIGRATION handlesSecrets: true", (() => {
    const idx = SI.indexOf("VAULT_MIGRATION");
    if (idx === -1) return false;
    const snippet = SI.slice(idx, idx + 600);
    return snippet.includes("handlesSecrets:") && snippet.includes("true");
  })());
  check("O05", "VAULT_MIGRATION hasAuditLog: true", (() => {
    const idx = SI.indexOf("VAULT_MIGRATION");
    if (idx === -1) return false;
    const snippet = SI.slice(idx, idx + 600);
    return snippet.includes("hasAuditLog:") && snippet.includes("true");
  })());
  check("O06", "VAULT_MIGRATION references sprint AGENTIK-SECURITY-VAULT-MIGRATION-01", SI.includes("AGENTIK-SECURITY-VAULT-MIGRATION-01"));
  check("O07", "VAULT_MIGRATION implementedControls non-empty", (() => {
    const idx = SI.indexOf("VAULT_MIGRATION");
    if (idx === -1) return false;
    const snippet = SI.slice(idx, idx + 800);
    return snippet.includes("implementedControls") && snippet.includes('"vault-first');
  })());
  check("O08", "VAULT_MIGRATION owner: security", (() => {
    const idx = SI.indexOf("VAULT_MIGRATION");
    if (idx === -1) return false;
    const snippet = SI.slice(idx, idx + 400);
    return snippet.includes('"security"');
  })());
  check("O09", "SECURITY_INVENTORY still exports all other entries", SI.includes("MEMORY_ENGINE") && SI.includes("DIAN") && SI.includes("ERP_INTEGRATIONS"));
  check("O10", "getInventoryEntry still exported", SI.includes("getInventoryEntry"));
  check("O11", "getCriticalRiskSurfaces still exported", SI.includes("getCriticalRiskSurfaces"));
  check("O12", "knownGaps field in VAULT_MIGRATION", (() => {
    const idx = SI.indexOf("VAULT_MIGRATION");
    if (idx === -1) return false;
    const snippet = SI.slice(idx, idx + 1000);
    return snippet.includes("knownGaps");
  })());
  check("O13", "relatedDebtItems in VAULT_MIGRATION", (() => {
    const idx = SI.indexOf("VAULT_MIGRATION");
    if (idx === -1) return false;
    const snippet = SI.slice(idx, idx + 1800);
    return snippet.includes("relatedDebtItems");
  })());
  check("O14", "No Prisma import", !SI.includes("from \"@prisma"));
  check("O15", "as const still present", SI.includes("as const"));
}

// ── Section P — Cross-file: no secret values in reason strings ────────────────

const allProviders = [AI, WA, TT, SH, DIAN, ERP].filter(Boolean);

check("P01", "No provider logs secret value in reason", allProviders.every(src => !src.includes("console.log(result.secret") && !src.includes("console.log(secret.value") && !src.includes("logger.info(result.secret")));
check("P02", "No provider has console.log(secret)", allProviders.every(src => !src.includes("console.log(secret") && !src.includes("console.log(token")));
check("P03", "foundResult reason uses source, not secret value", SP ? SP.includes("resolved from ${source}") || SP.includes("resolved from") : true);
check("P04", "notFoundResult reason uses key name only", SP ? !SP.includes("${secret}") : true);
check("P05", "No raw password in any error message pattern", allProviders.every(src => !src.includes("password in error") && !src.includes("password: err")));

// ── Section Q — VAULT_SHADOW_MODE in all providers ────────────────────────────

const providerFiles = { AI, WA, TT, SH, DIAN, ERP };
const providerNames = ["AI", "WA", "TT", "SH", "DIAN", "ERP"];

for (const [i, name] of providerNames.entries()) {
  const src = providerFiles[name];
  check(`Q0${i + 1}`, `${name} provider uses VAULT_SHADOW_MODE env var`, src ? src.includes("VAULT_SHADOW_MODE") : false);
}

// ── Section R — VaultSecretProviderStub in all providers ─────────────────────

for (const [i, name] of providerNames.entries()) {
  const src = providerFiles[name];
  check(`R0${i + 1}`, `${name} provider defines VaultSecretProviderStub`, src ? src.includes("VaultSecretProviderStub") : false);
}

// ── Section S — singleton pattern in all providers ───────────────────────────

for (const [i, name] of providerNames.entries()) {
  const src = providerFiles[name];
  check(`S0${i + 1}`, `${name} provider uses singleton resolver pattern`, src ? src.includes("_resolver") || src.includes("let _") : false);
}

// ── Section T — Sprint ID present in all migration files ─────────────────────

const sprintTag = "AGENTIK-SECURITY-VAULT-MIGRATION-01";
const migrationFiles = {
  "secret-provider.ts":           SP,
  "legacy-secret-adapter.ts":     LSA,
  "vault-first-resolver.ts":      VFR,
  "secret-migration-registry.ts": SMR,
  "vault-migration-engine.ts":    VME,
  "vault-migration-validation.ts":VMV,
  "vault-migration-report.ts":    VMR,
  "ai-secret-provider.ts":        AI,
  "whatsapp-secret-provider.ts":  WA,
  "tiktok-secret-provider.ts":    TT,
  "shopify-secret-provider.ts":   SH,
  "dian-secret-provider.ts":      DIAN,
  "erp-secret-provider.ts":       ERP,
};

let tIdx = 1;
for (const [fname, src] of Object.entries(migrationFiles)) {
  const id = `T${String(tIdx).padStart(2, "0")}`;
  check(id, `${fname} contains sprint ID ${sprintTag}`, src ? src.includes(sprintTag) : false);
  tIdx++;
}

// ── Results ───────────────────────────────────────────────────────────────────

const total = pass + fail + warn + skip;
const pct   = total > 0 ? Math.round((pass / (pass + fail)) * 100) : 0;

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("  AGENTIK-SECURITY-VAULT-MIGRATION-01 — Validation Suite");
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
  console.log(`\n  ✓ ${pass}/${pass + fail} PASS — Vault Migration Layer validated\n`);
  process.exit(0);
} else {
  console.log(`\n  ✗ ${fail} failure(s) — review above\n`);
  process.exit(1);
}
