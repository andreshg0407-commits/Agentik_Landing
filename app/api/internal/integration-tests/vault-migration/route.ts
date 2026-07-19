/**
 * app/api/internal/integration-tests/vault-migration/route.ts
 *
 * AGENTIK-SECURITY-VAULT-MIGRATION-01
 * Integration Harness — Vault Migration Layer
 *
 * 30+ runtime tests for the full migration layer.
 * Tests run in process — no external HTTP calls.
 *
 * NOT for production use. Internal only.
 */

import { NextResponse } from "next/server";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TestResult {
  id:       string;
  label:    string;
  status:   "PASS" | "FAIL" | "SKIP";
  detail?:  string;
  durationMs: number;
}

interface HarnessReport {
  totalTests: number;
  passed:     number;
  failed:     number;
  skipped:    number;
  results:    TestResult[];
  ranAt:      string;
}

// ── Test runner ───────────────────────────────────────────────────────────────

async function runTest(
  id:     string,
  label:  string,
  fn:     () => unknown | Promise<unknown>,
): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { id, label, status: "PASS", durationMs: Date.now() - start };
  } catch (e: any) {
    return {
      id,
      label,
      status:    "FAIL",
      detail:    e?.message ?? String(e),
      durationMs: Date.now() - start,
    };
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ── T01 — secret-provider: notFoundResult shape ───────────────────────────────

async function t01(): Promise<void> {
  const { notFoundResult } = await import("@/lib/security/vault/secret-provider");
  const r = notFoundResult("test-org", "OPENAI_API_KEY", 0);
  assert(r.found === false, "found must be false");
  assert(r.source === "NOT_FOUND", "source must be NOT_FOUND");
  assert(r.orgSlug === "test-org", "orgSlug preserved");
  assert(r.secretKey === "OPENAI_API_KEY", "secretKey preserved");
  assert(typeof r.resolvedAt === "string", "resolvedAt is string");
  assert(r.resolvedAt.includes("T"), "resolvedAt is ISO");
  assert(r.secret === undefined, "no secret field when not found");
}

// ── T02 — secret-provider: foundResult shape ──────────────────────────────────

async function t02(): Promise<void> {
  const { foundResult } = await import("@/lib/security/vault/secret-provider");
  const r = foundResult("test-org", "ANTHROPIC_API_KEY", "sk-test-value", "ENVIRONMENT", 3);
  assert(r.found === true, "found must be true");
  assert(r.source === "ENVIRONMENT", "source must be ENVIRONMENT");
  assert(r.secret === "sk-test-value", "secret value preserved");
  assert(!r.reason.includes("sk-test-value"), "reason must not contain secret");
  assert(typeof r.durationMs === "number", "durationMs is number");
  assert(r.durationMs === 3, "durationMs matches");
}

// ── T03 — secret-provider: SECRET_KEYS completeness ──────────────────────────

async function t03(): Promise<void> {
  const { SECRET_KEYS } = await import("@/lib/security/vault/secret-provider");
  const required = [
    "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
    "META_ACCESS_TOKEN", "META_APP_SECRET",
    "WHATSAPP_TOKEN", "TIKTOK_TOKEN",
    "SHOPIFY_TOKEN", "SHOPIFY_WEBHOOK_SECRET",
    "DIAN_CERTIFICATE", "DIAN_PASSWORD",
    "ERP_PASSWORD", "ERP_API_KEY", "ERP_WEBHOOK_SECRET",
  ];
  for (const key of required) {
    assert(key in SECRET_KEYS, `SECRET_KEYS missing ${key}`);
    assert(SECRET_KEYS[key as keyof typeof SECRET_KEYS] === key, `${key} value mismatch`);
  }
}

// ── T04 — legacy-secret-adapter: LEGACY_ENV_MAP coverage ─────────────────────

async function t04(): Promise<void> {
  const { LEGACY_ENV_MAP, getLegacyEnvNames } = await import("@/lib/security/vault/legacy-secret-adapter");
  assert(typeof LEGACY_ENV_MAP === "object", "LEGACY_ENV_MAP is object");
  const names = getLegacyEnvNames("OPENAI_API_KEY");
  assert(Array.isArray(names), "getLegacyEnvNames returns array");
  assert(names.length > 0, "getLegacyEnvNames non-empty for OPENAI_API_KEY");
  assert(names.includes("OPENAI_API_KEY"), "OPENAI_API_KEY in variants");
}

// ── T05 — legacy-secret-adapter: unknown key returns empty array ──────────────

async function t05(): Promise<void> {
  const { getLegacyEnvNames } = await import("@/lib/security/vault/legacy-secret-adapter");
  const names = getLegacyEnvNames("TOTALLY_UNKNOWN_KEY_XYZ");
  assert(Array.isArray(names), "returns array");
  assert(names.length === 0, "returns empty for unknown key");
}

// ── T06 — legacy-secret-adapter: EnvironmentSecretProvider ───────────────────

async function t06(): Promise<void> {
  const { EnvironmentSecretProvider } = await import("@/lib/security/vault/legacy-secret-adapter");
  const provider = new EnvironmentSecretProvider();
  assert(provider.providerId === "environment", `providerId: ${provider.providerId}`);
  const result = await provider.getSecret("test-org", "OPENAI_API_KEY");
  assert(typeof result === "object", "returns object");
  assert("found" in result, "result has found field");
  assert("source" in result, "result has source field");
  // source must be ENVIRONMENT if found, NOT_FOUND if not
  assert(result.source === "ENVIRONMENT" || result.source === "NOT_FOUND", `unexpected source: ${result.source}`);
}

// ── T07 — legacy-secret-adapter: hasSecret never throws ──────────────────────

async function t07(): Promise<void> {
  const { EnvironmentSecretProvider } = await import("@/lib/security/vault/legacy-secret-adapter");
  const provider = new EnvironmentSecretProvider();
  const r = await provider.hasSecret("test-org", "OPENAI_API_KEY");
  assert(typeof r === "boolean", `hasSecret returns boolean: ${typeof r}`);
}

// ── T08 — vault-first-resolver: all-stub resolves to NOT_FOUND ───────────────

async function t08(): Promise<void> {
  const { VaultFirstResolver } = await import("@/lib/security/vault/vault-first-resolver");
  const { notFoundResult }     = await import("@/lib/security/vault/secret-provider");

  const stub = {
    providerId: "stub",
    async getSecret(o: string, k: string) { return notFoundResult(o, k, 0); },
    async hasSecret() { return false; },
    async listSecrets() { return []; },
  };

  const resolver = new VaultFirstResolver({
    vaultProvider:       stub,
    legacyProvider:      stub,
    environmentProvider: stub,
    shadowMode:          false,
  });

  const result = await resolver.resolve("test-org", "OPENAI_API_KEY");
  assert(result.found === false, "all stubs → not found");
  assert(result.source === "NOT_FOUND", `source: ${result.source}`);
  assert(result.orgSlug === "test-org", "orgSlug preserved");
}

// ── T09 — vault-first-resolver: environment fallback ─────────────────────────

async function t09(): Promise<void> {
  const { VaultFirstResolver } = await import("@/lib/security/vault/vault-first-resolver");
  const { notFoundResult, foundResult } = await import("@/lib/security/vault/secret-provider");

  const stub = {
    providerId: "stub",
    async getSecret(o: string, k: string) { return notFoundResult(o, k, 0); },
    async hasSecret() { return false; },
    async listSecrets() { return []; },
  };

  const envProvider = {
    providerId: "env-test",
    async getSecret(o: string, k: string) {
      if (k === "OPENAI_API_KEY") return foundResult(o, k, "sk-test-env", "ENVIRONMENT", 1);
      return notFoundResult(o, k, 0);
    },
    async hasSecret(_o: string, k: string) { return k === "OPENAI_API_KEY"; },
    async listSecrets() { return ["OPENAI_API_KEY"]; },
  };

  const resolver = new VaultFirstResolver({
    vaultProvider:       stub,
    legacyProvider:      stub,
    environmentProvider: envProvider,
    shadowMode:          false,
  });

  const result = await resolver.resolve("test-org", "OPENAI_API_KEY");
  assert(result.found === true, "env fallback found");
  assert(result.source === "ENVIRONMENT", `source: ${result.source}`);
  assert(result.secret === "sk-test-env", "secret value from env");
}

// ── T10 — vault-first-resolver: vault takes priority ─────────────────────────

async function t10(): Promise<void> {
  const { VaultFirstResolver } = await import("@/lib/security/vault/vault-first-resolver");
  const { notFoundResult, foundResult } = await import("@/lib/security/vault/secret-provider");

  const vaultProvider = {
    providerId: "vault-test",
    async getSecret(o: string, k: string) {
      return foundResult(o, k, "vault-secret-value", "VAULT", 2);
    },
    async hasSecret() { return true; },
    async listSecrets() { return ["OPENAI_API_KEY"]; },
  };

  const envProvider = {
    providerId: "env-test",
    async getSecret(o: string, k: string) {
      return foundResult(o, k, "env-secret-value", "ENVIRONMENT", 1);
    },
    async hasSecret() { return true; },
    async listSecrets() { return ["OPENAI_API_KEY"]; },
  };

  const stub = {
    providerId: "stub",
    async getSecret(o: string, k: string) { return notFoundResult(o, k, 0); },
    async hasSecret() { return false; },
    async listSecrets() { return []; },
  };

  const resolver = new VaultFirstResolver({
    vaultProvider,
    legacyProvider:      stub,
    environmentProvider: envProvider,
    shadowMode:          false,
  });

  const result = await resolver.resolve("test-org", "OPENAI_API_KEY");
  assert(result.found === true, "vault found");
  assert(result.source === "VAULT", `vault takes priority: got ${result.source}`);
  assert(result.secret === "vault-secret-value", "vault value used");
}

// ── T11 — vault-first-resolver: has() works ──────────────────────────────────

async function t11(): Promise<void> {
  const { VaultFirstResolver } = await import("@/lib/security/vault/vault-first-resolver");
  const { notFoundResult, foundResult } = await import("@/lib/security/vault/secret-provider");

  const envProvider = {
    providerId: "env-test",
    async getSecret(o: string, k: string) {
      return foundResult(o, k, "val", "ENVIRONMENT", 1);
    },
    async hasSecret() { return true; },
    async listSecrets() { return ["OPENAI_API_KEY"]; },
  };
  const stub = {
    providerId: "stub",
    async getSecret(o: string, k: string) { return notFoundResult(o, k, 0); },
    async hasSecret() { return false; },
    async listSecrets() { return []; },
  };

  const resolver = new VaultFirstResolver({
    vaultProvider: stub, legacyProvider: stub, environmentProvider: envProvider, shadowMode: false,
  });

  const has = await resolver.has("test-org", "OPENAI_API_KEY");
  assert(has === true, `has() should be true, got ${has}`);
}

// ── T12 — secret-migration-registry: 11 entries ──────────────────────────────

async function t12(): Promise<void> {
  const { SECRET_MIGRATION_REGISTRY } = await import("@/lib/security/vault/secret-migration-registry");
  assert(Array.isArray(SECRET_MIGRATION_REGISTRY), "registry is array");
  assert(SECRET_MIGRATION_REGISTRY.length === 11, `expected 11 entries, got ${SECRET_MIGRATION_REGISTRY.length}`);
}

// ── T13 — secret-migration-registry: CRITICAL entries ────────────────────────

async function t13(): Promise<void> {
  const { getCriticalRiskCandidates } = await import("@/lib/security/vault/secret-migration-registry");
  const criticals = getCriticalRiskCandidates();
  const ids = criticals.map(c => c.id);
  assert(ids.includes("OPENAI_API_KEY"),    "OPENAI_API_KEY is CRITICAL");
  assert(ids.includes("ANTHROPIC_API_KEY"), "ANTHROPIC_API_KEY is CRITICAL");
  assert(ids.includes("DIAN_CERTIFICATE"),  "DIAN_CERTIFICATE is CRITICAL");
  assert(ids.includes("DIAN_PASSWORD"),     "DIAN_PASSWORD is CRITICAL");
}

// ── T14 — secret-migration-registry: lookup helpers ──────────────────────────

async function t14(): Promise<void> {
  const {
    getMigrationCandidate,
    getCandidatesByProvider,
    getCandidatesByStatus,
  } = await import("@/lib/security/vault/secret-migration-registry");

  const entry = getMigrationCandidate("SHOPIFY_TOKEN");
  assert(entry !== undefined, "SHOPIFY_TOKEN entry exists");
  assert(entry!.provider === "shopify", "provider is shopify");

  const erp = getCandidatesByProvider("erp");
  assert(erp.length === 3, `ERP has 3 entries, got ${erp.length}`);

  const ready = getCandidatesByStatus("READY");
  assert(ready.length > 0, "some entries are READY");
}

// ── T15 — vault-migration-engine: analyzeMigrationStatus ─────────────────────

async function t15(): Promise<void> {
  const { analyzeMigrationStatus } = await import("@/lib/security/vault/vault-migration-engine");
  const result = analyzeMigrationStatus();
  assert(typeof result === "object", "returns object");
  assert(typeof result.totalCandidates === "number", "totalCandidates is number");
  assert(result.totalCandidates === 11, `expected 11, got ${result.totalCandidates}`);
  assert(typeof result.migrationScore === "number", "migrationScore is number");
  assert(result.migrationScore >= 0 && result.migrationScore <= 100, `score out of range: ${result.migrationScore}`);
}

// ── T16 — vault-migration-engine: generateMigrationPlan ──────────────────────

async function t16(): Promise<void> {
  const { generateMigrationPlan } = await import("@/lib/security/vault/vault-migration-engine");
  const plan = generateMigrationPlan();
  assert(typeof plan === "object", "returns object");
  assert(Array.isArray(plan.actions), "actions is array");
  assert(plan.actions.length > 0, "plan has at least 1 action");
  // All actions should have a priority
  const withoutPriority = plan.actions.filter((a: any) => !a.priority && a.priority !== 0);
  assert(withoutPriority.length === 0, "all actions have priority");
}

// ── T17 — vault-migration-report: buildMigrationReport ───────────────────────

async function t17(): Promise<void> {
  const { buildMigrationReport } = await import("@/lib/security/vault/vault-migration-report");
  const report = buildMigrationReport();
  assert(typeof report === "object", "returns object");
  assert(typeof report.summary === "object", "summary field");
  assert(Array.isArray(report.migrated), "migrated array");
  assert(Array.isArray(report.pending), "pending array");
  assert(Array.isArray(report.orphaned), "orphaned array");
  assert(Array.isArray(report.errors), "errors array");
  assert(Array.isArray(report.risks), "risks array");
  assert(Array.isArray(report.providers), "providers array");
  assert(typeof report.generatedAt === "string", "generatedAt is string");
  assert(report.generatedAt.includes("T"), "generatedAt is ISO");
  assert(report.summary.totalSecrets === 11, `totalSecrets: ${report.summary.totalSecrets}`);
  assert(report.summary.migrationPercent >= 0 && report.summary.migrationPercent <= 100, "percent in range");
}

// ── T18 — vault-migration-report: risks contain CRITICAL entries ──────────────

async function t18(): Promise<void> {
  const { buildMigrationReport } = await import("@/lib/security/vault/vault-migration-report");
  const report = buildMigrationReport();
  // Current registry: no entries are MIGRATED, so all pending should produce risks
  const criticalRisks = report.risks.filter(r => r.riskLevel === "CRITICAL");
  assert(criticalRisks.length >= 4, `expected ≥4 CRITICAL risks, got ${criticalRisks.length}`);
}

// ── T19 — vault-migration-report: formatMigrationReport ──────────────────────

async function t19(): Promise<void> {
  const { buildMigrationReport, formatMigrationReport } = await import("@/lib/security/vault/vault-migration-report");
  const report = buildMigrationReport();
  const formatted = formatMigrationReport(report);
  assert(typeof formatted === "string", "returns string");
  assert(formatted.length > 100, "output is non-trivial");
  assert(formatted.includes("AGENTIK VAULT MIGRATION REPORT"), "header present");
  assert(!formatted.includes("sk-"), "no API key values in report");
  assert(!formatted.includes("password:"), "no passwords in report");
}

// ── T20 — vault-migration-report: providers breakdown ────────────────────────

async function t20(): Promise<void> {
  const { buildMigrationReport } = await import("@/lib/security/vault/vault-migration-report");
  const report = buildMigrationReport();
  const providerNames = report.providers.map(p => p.provider);
  assert(providerNames.includes("openai"),    "openai provider");
  assert(providerNames.includes("anthropic"), "anthropic provider");
  assert(providerNames.includes("dian"),      "dian provider");
  assert(providerNames.includes("erp"),       "erp provider");
  assert(providerNames.includes("shopify"),   "shopify provider");
  const erp = report.providers.find(p => p.provider === "erp");
  assert(erp !== undefined, "erp provider breakdown exists");
  assert(erp!.total === 3, `erp total: ${erp!.total}`);
}

// ── T21 — ai-secret-provider: functions are async ────────────────────────────

async function t21(): Promise<void> {
  const { resolveOpenAiApiKey, hasOpenAiApiKey } = await import("@/lib/ai-layer/security/ai-secret-provider");
  const result = await resolveOpenAiApiKey("test-org");
  assert(typeof result === "object", "resolveOpenAiApiKey returns object");
  assert("found" in result, "has found field");
  assert("source" in result, "has source field");

  const has = await hasOpenAiApiKey("test-org");
  assert(typeof has === "boolean", `hasOpenAiApiKey returns boolean: ${typeof has}`);
}

// ── T22 — ai-secret-provider: Anthropic ──────────────────────────────────────

async function t22(): Promise<void> {
  const { resolveAnthropicApiKey, hasAnthropicApiKey } = await import("@/lib/ai-layer/security/ai-secret-provider");
  const result = await resolveAnthropicApiKey("test-org");
  assert("found" in result, "has found field");
  const has = await hasAnthropicApiKey("test-org");
  assert(typeof has === "boolean", "hasAnthropicApiKey boolean");
}

// ── T23 — whatsapp-secret-provider: functions are async ──────────────────────

async function t23(): Promise<void> {
  const {
    resolveWhatsAppToken,
    resolveMetaAccessToken,
    hasWhatsAppToken,
  } = await import("@/lib/integrations/whatsapp/security/whatsapp-secret-provider");

  const r1 = await resolveWhatsAppToken("test-org");
  assert("found" in r1, "WhatsApp found field");

  const r2 = await resolveMetaAccessToken("test-org");
  assert("found" in r2, "Meta found field");

  const has = await hasWhatsAppToken("test-org");
  assert(typeof has === "boolean", "hasWhatsAppToken boolean");
}

// ── T24 — tiktok-secret-provider ─────────────────────────────────────────────

async function t24(): Promise<void> {
  const { resolveTikTokToken, hasTikTokToken } = await import("@/lib/integrations/tiktok/security/tiktok-secret-provider");
  const r = await resolveTikTokToken("test-org");
  assert("found" in r, "TikTok found field");
  const has = await hasTikTokToken("test-org");
  assert(typeof has === "boolean", "hasTikTokToken boolean");
}

// ── T25 — shopify-secret-provider ────────────────────────────────────────────

async function t25(): Promise<void> {
  const {
    resolveShopifyToken,
    resolveShopifyWebhookSecret,
    hasShopifyToken,
    hasShopifyWebhookSecret,
  } = await import("@/lib/integrations/shopify/security/shopify-secret-provider");

  const r1 = await resolveShopifyToken("test-org");
  assert("found" in r1, "Shopify token found field");

  const r2 = await resolveShopifyWebhookSecret("test-org");
  assert("found" in r2, "Shopify webhook found field");

  assert(typeof (await hasShopifyToken("test-org")) === "boolean", "hasShopifyToken boolean");
  assert(typeof (await hasShopifyWebhookSecret("test-org")) === "boolean", "hasShopifyWebhookSecret boolean");
}

// ── T26 — dian-secret-provider ────────────────────────────────────────────────

async function t26(): Promise<void> {
  const {
    resolveDianCertificate,
    resolveDianPassword,
    hasDianCertificate,
    hasDianPassword,
  } = await import("@/lib/integrations/dian/security/dian-secret-provider");

  const r1 = await resolveDianCertificate("test-org");
  assert("found" in r1, "DIAN cert found field");

  const r2 = await resolveDianPassword("test-org");
  assert("found" in r2, "DIAN password found field");
  // CRITICAL: ensure password value never leaks into reason
  assert(!r2.reason.toLowerCase().includes("password_value"), "DIAN password not in reason");

  assert(typeof (await hasDianCertificate("test-org")) === "boolean", "hasDianCertificate boolean");
  assert(typeof (await hasDianPassword("test-org")) === "boolean", "hasDianPassword boolean");
}

// ── T27 — erp-secret-provider ─────────────────────────────────────────────────

async function t27(): Promise<void> {
  const {
    resolveErpPassword,
    resolveErpApiKey,
    resolveErpWebhookSecret,
    hasErpPassword,
    hasErpApiKey,
    hasErpWebhookSecret,
  } = await import("@/lib/integrations/erp/security/erp-secret-provider");

  const r1 = await resolveErpPassword("test-org");
  assert("found" in r1, "ERP password found field");

  const r2 = await resolveErpApiKey("test-org");
  assert("found" in r2, "ERP apiKey found field");

  const r3 = await resolveErpWebhookSecret("test-org");
  assert("found" in r3, "ERP webhook found field");

  assert(typeof (await hasErpPassword("test-org"))      === "boolean", "hasErpPassword boolean");
  assert(typeof (await hasErpApiKey("test-org"))        === "boolean", "hasErpApiKey boolean");
  assert(typeof (await hasErpWebhookSecret("test-org")) === "boolean", "hasErpWebhookSecret boolean");
}

// ── T28 — all providers: result is fully serializable ────────────────────────

async function t28(): Promise<void> {
  const { resolveOpenAiApiKey } = await import("@/lib/ai-layer/security/ai-secret-provider");
  const result = await resolveOpenAiApiKey("test-org");
  // JSON round-trip must not throw
  const json = JSON.stringify(result);
  const parsed = JSON.parse(json);
  assert(parsed.found === result.found, "found survives JSON round-trip");
  assert(parsed.source === result.source, "source survives JSON round-trip");
  assert(parsed.resolvedAt === result.resolvedAt, "resolvedAt survives as string");
}

// ── T29 — all providers: tenant isolation (different org, different result) ───

async function t29(): Promise<void> {
  const { resolveOpenAiApiKey } = await import("@/lib/ai-layer/security/ai-secret-provider");
  const r1 = await resolveOpenAiApiKey("org-alpha");
  const r2 = await resolveOpenAiApiKey("org-beta");
  // Both should have correct orgSlug
  assert(r1.orgSlug === "org-alpha", `r1 orgSlug: ${r1.orgSlug}`);
  assert(r2.orgSlug === "org-beta", `r2 orgSlug: ${r2.orgSlug}`);
  // Results must not cross-contaminate
  assert(r1.orgSlug !== r2.orgSlug, "orgSlugs differ");
}

// ── T30 — vault-first-resolver: shadow mode does not break resolution ─────────

async function t30(): Promise<void> {
  const { VaultFirstResolver } = await import("@/lib/security/vault/vault-first-resolver");
  const { notFoundResult }     = await import("@/lib/security/vault/secret-provider");

  const stub = {
    providerId: "stub",
    async getSecret(o: string, k: string) { return notFoundResult(o, k, 0); },
    async hasSecret() { return false; },
    async listSecrets() { return []; },
  };

  const resolver = new VaultFirstResolver({
    vaultProvider: stub, legacyProvider: stub, environmentProvider: stub,
    shadowMode: true, // shadow mode ON
  });

  // Must not throw even with shadow mode ON
  const result = await resolver.resolve("test-org", "OPENAI_API_KEY");
  assert(result.found === false, "shadow mode with all stubs → not found");
  assert(result.source === "NOT_FOUND", `source: ${result.source}`);
}

// ── T31 — security-inventory: VAULT_MIGRATION entry ──────────────────────────

async function t31(): Promise<void> {
  const { SECURITY_INVENTORY, getInventoryEntry } = await import("@/lib/security/security-inventory");
  const entry = getInventoryEntry("VAULT_MIGRATION");
  assert(entry !== undefined, "VAULT_MIGRATION entry exists");
  assert(entry!.riskLevel === "CRITICAL", `riskLevel: ${entry!.riskLevel}`);
  assert(entry!.handlesSecrets === true, "handlesSecrets: true");
  assert(entry!.hasAuditLog === true, "hasAuditLog: true");
  assert(entry!.implementedControls.length > 0, "has implementedControls");
}

// ── T32 — vault-migration-validation: runMigrationValidation ─────────────────

async function t32(): Promise<void> {
  const { runMigrationValidation } = await import("@/lib/security/vault/vault-migration-validation");
  const report = runMigrationValidation();
  assert(typeof report === "object", "returns object");
  assert(typeof report.totalChecks === "number", "totalChecks is number");
  assert(typeof report.passed === "number", "passed is number");
  assert(typeof report.failed === "number", "failed is number");
  assert(typeof report.isValid === "boolean", "isValid is boolean");
  assert(Array.isArray(report.checks), "checks is array");
  assert(typeof report.generatedAt === "string", "generatedAt is string");
  assert(report.totalChecks > 0, "totalChecks > 0");
  // Score must be 0-100
  assert(report.score >= 0 && report.score <= 100, `score: ${report.score}`);
}

// ── Test registry ─────────────────────────────────────────────────────────────

const TESTS: Array<{ id: string; label: string; fn: () => Promise<void> }> = [
  { id: "T01", label: "notFoundResult shape",                             fn: t01 },
  { id: "T02", label: "foundResult shape and safety",                     fn: t02 },
  { id: "T03", label: "SECRET_KEYS completeness (13 keys)",               fn: t03 },
  { id: "T04", label: "LEGACY_ENV_MAP coverage",                          fn: t04 },
  { id: "T05", label: "getLegacyEnvNames: unknown → []",                  fn: t05 },
  { id: "T06", label: "EnvironmentSecretProvider: never throws",          fn: t06 },
  { id: "T07", label: "EnvironmentSecretProvider: hasSecret boolean",     fn: t07 },
  { id: "T08", label: "VaultFirstResolver: all stubs → NOT_FOUND",        fn: t08 },
  { id: "T09", label: "VaultFirstResolver: environment fallback",         fn: t09 },
  { id: "T10", label: "VaultFirstResolver: vault takes priority",         fn: t10 },
  { id: "T11", label: "VaultFirstResolver: has() works",                  fn: t11 },
  { id: "T12", label: "Secret registry: 11 entries",                      fn: t12 },
  { id: "T13", label: "Secret registry: CRITICAL entries",                fn: t13 },
  { id: "T14", label: "Secret registry: lookup helpers",                  fn: t14 },
  { id: "T15", label: "Migration engine: analyzeMigrationStatus",         fn: t15 },
  { id: "T16", label: "Migration engine: generateMigrationPlan",          fn: t16 },
  { id: "T17", label: "Migration report: buildMigrationReport shape",     fn: t17 },
  { id: "T18", label: "Migration report: CRITICAL risks present",         fn: t18 },
  { id: "T19", label: "Migration report: formatMigrationReport safe",     fn: t19 },
  { id: "T20", label: "Migration report: provider breakdown",             fn: t20 },
  { id: "T21", label: "AI provider: resolveOpenAiApiKey / has",           fn: t21 },
  { id: "T22", label: "AI provider: resolveAnthropicApiKey / has",        fn: t22 },
  { id: "T23", label: "WhatsApp provider: resolve + has",                 fn: t23 },
  { id: "T24", label: "TikTok provider: resolve + has",                   fn: t24 },
  { id: "T25", label: "Shopify provider: resolve + has (both secrets)",   fn: t25 },
  { id: "T26", label: "DIAN provider: resolve + has (cert + password)",   fn: t26 },
  { id: "T27", label: "ERP provider: resolve + has (3 secrets)",          fn: t27 },
  { id: "T28", label: "All providers: result is JSON serializable",       fn: t28 },
  { id: "T29", label: "Tenant isolation: orgSlug scoped correctly",       fn: t29 },
  { id: "T30", label: "Shadow mode: does not break resolution",           fn: t30 },
  { id: "T31", label: "Security inventory: VAULT_MIGRATION entry",        fn: t31 },
  { id: "T32", label: "Validation suite: runMigrationValidation runs",    fn: t32 },
];

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const results: TestResult[] = [];

  for (const t of TESTS) {
    const r = await runTest(t.id, t.label, t.fn);
    results.push(r);
  }

  const passed  = results.filter(r => r.status === "PASS").length;
  const failed  = results.filter(r => r.status === "FAIL").length;
  const skipped = results.filter(r => r.status === "SKIP").length;

  const report: HarnessReport = {
    totalTests: results.length,
    passed,
    failed,
    skipped,
    results,
    ranAt: new Date().toISOString(),
  };

  return NextResponse.json(report, { status: failed > 0 ? 500 : 200 });
}
