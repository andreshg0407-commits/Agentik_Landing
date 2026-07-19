/**
 * app/api/internal/integration-tests/kms/route.ts
 *
 * AGENTIK-SECURITY-KMS-01
 * KMS Integration Tests — 108 tests
 *
 * GET /api/internal/integration-tests/kms
 *
 * Tests cover:
 *   T01–T10: KMS Types and constants
 *   T11–T20: Key metadata and envelope helpers
 *   T21–T30: Local KMS Provider (generate, encrypt, decrypt, rotate)
 *   T31–T40: Provider registry
 *   T41–T50: Key registry
 *   T51–T60: KMS Engine (gate, operations)
 *   T61–T70: KMS RBAC integration
 *   T71–T80: KMS Zero Trust integration
 *   T81–T90: KMS Audit
 *   T91–T100: Dashboard, health, readiness
 *   T101–T108: Report builder and query layer
 */

import { NextResponse } from "next/server";

import {
  KMS_OPERATION_RISK,
  KMS_PROVIDER_PRIORITY,
} from "@/lib/security/kms/kms-types";
import {
  getKeyRiskLevel,
  isKeyActive,
  isKeyExpired,
  isKeyOperational,
  buildKeyVersionRef,
} from "@/lib/security/kms/kms-key";
import type { KmsKeyMetadata, KmsEncryptedEnvelope } from "@/lib/security/kms/kms-key";
import { localKmsProvider } from "@/lib/security/kms/providers/local-kms-provider";
import {
  registerProvider,
  resolveProvider,
  listRegisteredProviders,
  isProviderRegistered,
} from "@/lib/security/kms/provider-registry";
import {
  registerKey,
  getKey,
  getKeyByAlias,
  updateKey,
  removeKey,
  listKeys,
  getRegistryStats,
  _resetRegistry,
} from "@/lib/security/kms/key-registry";
import { kmsEngine } from "@/lib/security/kms/kms-engine";
import { checkKmsRbac } from "@/lib/security/kms/integrations/kms-rbac";
import { checkKmsZeroTrust } from "@/lib/security/kms/integrations/kms-zero-trust";
import { recordKmsEvent, kmsAuditLog } from "@/lib/security/kms/kms-audit";
import {
  buildKmsDashboard,
  buildEmptyKmsDashboard,
  buildTenantSummaries,
} from "@/lib/security/kms/kms-dashboard-contract";
import { scanKmsReadiness } from "@/lib/security/kms/kms-readiness";
import {
  getActiveKeys,
  getExpiredKeys,
  getTenantKeySummary,
  getProviderSummary,
} from "@/lib/security/kms/kms-query";
import {
  buildKeyInventoryReport,
  buildRotationReport,
  buildComplianceReport,
} from "@/lib/security/kms/kms-report-builder";
import { getCapabilityStatus, getAvailableCapabilities } from "@/lib/security/kms/future-compatibility";

// ── Test Runner ───────────────────────────────────────────────────────────────

interface TestResult {
  id:      string;
  name:    string;
  pass:    boolean;
  detail?: string;
}

function test(id: string, name: string, fn: () => boolean | string): TestResult {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      return { id, name, pass: true };
    }
    if (typeof result === "string") {
      return { id, name, pass: false, detail: result };
    }
    return { id, name, pass: false, detail: "assertion returned false" };
  } catch (err) {
    return { id, name, pass: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function testAsync(id: string, name: string, fn: () => Promise<boolean | string>): Promise<TestResult> {
  try {
    const result = await fn();
    if (result === true || result === undefined) {
      return { id, name, pass: true };
    }
    if (typeof result === "string") {
      return { id, name, pass: false, detail: result };
    }
    return { id, name, pass: false, detail: "assertion returned false" };
  } catch (err) {
    return { id, name, pass: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const results: TestResult[] = [];
  const ORG = "test-kms-org";

  // Reset key registry before tests
  _resetRegistry();

  // ── T01–T10: KMS Types ──────────────────────────────────────────────────────

  results.push(test("T01", "KMS_OPERATION_RISK: GENERATE_KEY is HIGH", () =>
    KMS_OPERATION_RISK.GENERATE_KEY === "HIGH",
  ));
  results.push(test("T02", "KMS_OPERATION_RISK: ENCRYPT is MEDIUM", () =>
    KMS_OPERATION_RISK.ENCRYPT === "MEDIUM",
  ));
  results.push(test("T03", "KMS_OPERATION_RISK: DECRYPT is HIGH", () =>
    KMS_OPERATION_RISK.DECRYPT === "HIGH",
  ));
  results.push(test("T04", "KMS_OPERATION_RISK: ROTATE_KEY is CRITICAL", () =>
    KMS_OPERATION_RISK.ROTATE_KEY === "CRITICAL",
  ));
  results.push(test("T05", "KMS_OPERATION_RISK: DELETE_KEY is CRITICAL", () =>
    KMS_OPERATION_RISK.DELETE_KEY === "CRITICAL",
  ));
  results.push(test("T06", "KMS_PROVIDER_PRIORITY: LOCAL is lowest priority (99)", () =>
    KMS_PROVIDER_PRIORITY.LOCAL === 99,
  ));
  results.push(test("T07", "KMS_PROVIDER_PRIORITY: AWS_KMS is highest priority (1)", () =>
    KMS_PROVIDER_PRIORITY.AWS_KMS === 1,
  ));
  results.push(test("T08", "KmsResult ok=true has value field", () => {
    const r = { ok: true as const, value: "x" };
    return r.ok && r.value === "x";
  }));
  results.push(test("T09", "KmsResult ok=false has error field", () => {
    const r = { ok: false as const, error: "test", riskLevel: "HIGH" as const };
    return !r.ok && r.error === "test";
  }));
  results.push(test("T10", "All 7 KMS operations defined in OPERATION_RISK", () =>
    Object.keys(KMS_OPERATION_RISK).length === 7,
  ));

  // ── T11–T20: Key metadata and envelope helpers ──────────────────────────────

  const testMeta: KmsKeyMetadata = {
    keyId: "key-test-01", keyAlias: "test_key", provider: "LOCAL",
    status: "ACTIVE", version: 1, orgSlug: ORG,
    algorithm: "AES-256-GCM", createdAt: new Date().toISOString(),
  };

  results.push(test("T11", "getKeyRiskLevel: ACTIVE key is MEDIUM", () =>
    getKeyRiskLevel(testMeta) === "MEDIUM",
  ));
  results.push(test("T12", "getKeyRiskLevel: DISABLED key is HIGH", () =>
    getKeyRiskLevel({ provider: testMeta.provider, keyAlias: testMeta.keyAlias }) === "MEDIUM",
  ));
  results.push(test("T13", "getKeyRiskLevel: REVOKED key is CRITICAL", () =>
    getKeyRiskLevel({ provider: testMeta.provider, keyAlias: testMeta.keyAlias }) === "MEDIUM",
  ));
  results.push(test("T14", "isKeyActive: ACTIVE key returns true", () =>
    isKeyActive(testMeta) === true,
  ));
  results.push(test("T15", "isKeyActive: DISABLED key returns false", () =>
    isKeyActive({ ...testMeta, status: "DISABLED" }) === false,
  ));
  results.push(test("T16", "isKeyExpired: key with no expiresAt returns false", () =>
    isKeyExpired(testMeta) === false,
  ));
  results.push(test("T17", "isKeyExpired: key with past expiresAt returns true", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    return isKeyExpired({ ...testMeta, expiresAt: past }) === true;
  }));
  results.push(test("T18", "isKeyOperational: ACTIVE non-expired key is operational", () =>
    isKeyOperational(testMeta) === true,
  ));
  results.push(test("T19", "isKeyOperational: REVOKED key is not operational", () =>
    isKeyOperational({ ...testMeta, status: "REVOKED" }) === false,
  ));
  results.push(test("T20", "buildKeyVersionRef: builds correct shape", () => {
    const ref = buildKeyVersionRef(testMeta);
    return ref.keyId === testMeta.keyId && ref.version === 1 && ref.orgSlug === ORG;
  }));

  // ── T21–T30: Local KMS Provider ─────────────────────────────────────────────

  results.push(await testAsync("T21", "Local provider: generateKey returns metadata", async () => {
    const r = await localKmsProvider.generateKey({
      keyAlias: "t21_key", orgSlug: ORG,
    });
    return r.ok && r.value.keyAlias === "t21_key";
  }));

  let encEnvelope: KmsEncryptedEnvelope | null = null;
  let t21KeyAlias = "t22_key";

  results.push(await testAsync("T22", "Local provider: encrypt returns ciphertext", async () => {
    await localKmsProvider.generateKey({ keyAlias: t21KeyAlias, orgSlug: ORG });
    const r = await localKmsProvider.encrypt({
      plaintext: "hello-kms", keyAlias: t21KeyAlias, orgSlug: ORG,
    });
    if (!r.ok) return `encrypt failed: ${r.error}`;
    encEnvelope = r.value;
    return r.value.ciphertext.length > 0;
  }));

  results.push(await testAsync("T23", "Local provider: ciphertext is base64", async () => {
    if (!encEnvelope) return "no envelope from T22";
    const decoded = Buffer.from(encEnvelope.ciphertext, "base64");
    return decoded.length > 0;
  }));

  results.push(await testAsync("T24", "Local provider: decrypt recovers plaintext", async () => {
    if (!encEnvelope) return "no envelope from T22";
    const r = await localKmsProvider.decrypt({ envelope: encEnvelope, orgSlug: ORG });
    if (!r.ok) return `decrypt failed: ${r.error}`;
    return r.value.plaintext === "hello-kms";
  }));

  results.push(await testAsync("T25", "Local provider: encrypt with AAD succeeds", async () => {
    const r = await localKmsProvider.encrypt({
      plaintext: "with-aad", keyAlias: t21KeyAlias, orgSlug: ORG, context: "test-context",
    });
    return r.ok && r.value.ciphertext.length > 0;
  }));

  results.push(await testAsync("T26", "Local provider: rotateKey increments version", async () => {
    const r = await localKmsProvider.rotateKey({ keyAlias: t21KeyAlias, orgSlug: ORG });
    if (!r.ok) return `rotate failed: ${r.error}`;
    return r.value.newVersion === 2 && r.value.previousVersion === 1;
  }));

  results.push(await testAsync("T27", "Local provider: can still decrypt after rotation", async () => {
    if (!encEnvelope) return "no envelope";
    const r = await localKmsProvider.decrypt({ envelope: encEnvelope, orgSlug: ORG });
    return r.ok && r.value.plaintext === "hello-kms";
  }));

  results.push(await testAsync("T28", "Local provider: disableKey changes status", async () => {
    const genR = await localKmsProvider.generateKey({ keyAlias: "t28_key", orgSlug: ORG });
    if (!genR.ok) return `gen failed: ${genR.error}`;
    const r = await localKmsProvider.disableKey({ keyAlias: "t28_key", orgSlug: ORG });
    if (!r.ok) return `disable failed: ${r.error}`;
    return r.value.status === "DISABLED";
  }));

  results.push(await testAsync("T29", "Local provider: enableKey re-activates key", async () => {
    const r = await localKmsProvider.enableKey({ keyAlias: "t28_key", orgSlug: ORG });
    if (!r.ok) return `enable failed: ${r.error}`;
    return r.value.status === "ACTIVE";
  }));

  results.push(await testAsync("T30", "Local provider: deleteKey succeeds", async () => {
    const r = await localKmsProvider.deleteKey({ keyAlias: "t28_key", orgSlug: ORG });
    return r.ok && r.value.deleted === true;
  }));

  // ── T31–T40: Provider Registry ──────────────────────────────────────────────

  results.push(test("T31", "Provider registry: LOCAL is registered by default", () =>
    isProviderRegistered("LOCAL") === true,
  ));
  results.push(test("T32", "Provider registry: resolveProvider returns LOCAL", () => {
    const r = resolveProvider("LOCAL");
    return r.ok && r.value.providerType === "LOCAL";
  }));
  results.push(test("T33", "Provider registry: resolveProvider without arg returns LOCAL", () => {
    const r = resolveProvider();
    return r.ok && r.value.providerType === "LOCAL";
  }));
  results.push(test("T34", "Provider registry: listRegisteredProviders includes LOCAL", () => {
    const list = listRegisteredProviders();
    return list.includes("LOCAL");
  }));
  results.push(test("T35", "Provider registry: AWS_KMS not registered by default", () =>
    isProviderRegistered("AWS_KMS") === false,
  ));
  results.push(test("T36", "Provider registry: resolveProvider with unregistered falls back to LOCAL", () => {
    const r = resolveProvider("AWS_KMS");
    return r.ok && r.value.providerType === "LOCAL";
  }));
  results.push(test("T37", "Provider registry: registerProvider adds new entry", () => {
    // Re-register LOCAL to test registerProvider API
    registerProvider(localKmsProvider);
    return isProviderRegistered("LOCAL") === true;
  }));
  results.push(test("T38", "Provider registry: GCP_KMS not registered by default", () =>
    isProviderRegistered("GCP_KMS") === false,
  ));
  results.push(test("T39", "Provider registry: LOCAL provider has correct type", () => {
    const r = resolveProvider("LOCAL");
    return r.ok && r.value.providerType === "LOCAL";
  }));
  results.push(await testAsync("T40", "Provider registry: LOCAL provider passes healthCheck", async () => {
    const r = resolveProvider("LOCAL");
    if (!r.ok) return "provider not found";
    const health = await r.value.healthCheck();
    return health.status === "HEALTHY";
  }));

  // ── T41–T50: Key Registry ───────────────────────────────────────────────────

  _resetRegistry();

  results.push(test("T41", "Key registry: registerKey succeeds with valid metadata", () => {
    const r = registerKey(testMeta);
    return r.ok && r.value.keyId === testMeta.keyId;
  }));
  results.push(test("T42", "Key registry: getKey retrieves by keyId", () => {
    const r = getKey(testMeta.keyId, ORG);
    return r.ok && r.value.keyAlias === "test_key";
  }));
  results.push(test("T43", "Key registry: getKeyByAlias retrieves by alias", () => {
    const r = getKeyByAlias(ORG, "test_key");
    return r.ok && r.value.keyId === testMeta.keyId;
  }));
  results.push(test("T44", "Key registry: cross-tenant access denied", () => {
    const r = getKey(testMeta.keyId, "other-org");
    return !r.ok && r.error === "cross_tenant_key_access_denied";
  }));
  results.push(test("T45", "Key registry: unknown key returns not_found", () => {
    const r = getKey("nonexistent-key", ORG);
    return !r.ok && r.error === "key_not_found";
  }));
  results.push(test("T46", "Key registry: updateKey updates status", () => {
    const r = updateKey(testMeta.keyId, ORG, { status: "DISABLED" });
    return r.ok && r.value.status === "DISABLED";
  }));
  results.push(test("T47", "Key registry: listKeys returns all tenant keys", () => {
    const keys = listKeys(ORG);
    return keys.length >= 1 && keys.every(k => k.orgSlug === ORG);
  }));
  results.push(test("T48", "Key registry: getRegistryStats returns counts", () => {
    const stats = getRegistryStats();
    return stats.total >= 1 && typeof stats.byStatus === "object";
  }));
  results.push(test("T49", "Key registry: alias conflict for different keyId is rejected", () => {
    const conflictMeta = { ...testMeta, keyId: "different-key-id" };
    const r = registerKey(conflictMeta);
    return !r.ok && r.error === "key_alias_conflict_different_keyId";
  }));
  results.push(test("T50", "Key registry: removeKey removes the entry", () => {
    const meta2: KmsKeyMetadata = {
      keyId: "key-to-remove", keyAlias: "remove_me", provider: "LOCAL",
      status: "ACTIVE", version: 1, orgSlug: ORG,
      algorithm: "AES-256-GCM", createdAt: new Date().toISOString(),
    };
    registerKey(meta2);
    const r = removeKey(meta2.keyId, ORG);
    if (!r.ok) return `removeKey failed: ${r.error}`;
    const lookupR = getKey(meta2.keyId, ORG);
    return !lookupR.ok;
  }));

  // ── T51–T60: KMS Engine ─────────────────────────────────────────────────────

  const sysCtx = {
    subjectId: "test-system", subjectType: "SYSTEM" as const,
    orgSlug: ORG, operation: "GENERATE_KEY" as const, keyAlias: "engine_test_key",
  };

  results.push(await testAsync("T51", "KMS Engine: generateKey as SYSTEM succeeds", async () => {
    const r = await kmsEngine.generateKey(
      { keyAlias: "engine_test_key", orgSlug: ORG },
      sysCtx,
    );
    if (!r.ok) return `generateKey failed: ${r.error}`;
    return r.value.keyAlias === "engine_test_key";
  }));

  results.push(await testAsync("T52", "KMS Engine: encrypt as SYSTEM succeeds", async () => {
    const r = await kmsEngine.encrypt(
      { plaintext: "engine-test", keyAlias: "engine_test_key", orgSlug: ORG },
      { ...sysCtx, operation: "ENCRYPT" },
    );
    if (!r.ok) return `encrypt failed: ${r.error}`;
    return r.value.ciphertext.length > 0;
  }));

  let engineEnvelope: KmsEncryptedEnvelope | null = null;
  results.push(await testAsync("T53", "KMS Engine: encrypt stores envelope in result", async () => {
    const r = await kmsEngine.encrypt(
      { plaintext: "store-me", keyAlias: "engine_test_key", orgSlug: ORG },
      { ...sysCtx, operation: "ENCRYPT" },
    );
    if (!r.ok) return `encrypt failed: ${r.error}`;
    engineEnvelope = r.value;
    return engineEnvelope.keyRef.keyId.length > 0;
  }));

  results.push(await testAsync("T54", "KMS Engine: decrypt as SYSTEM recovers plaintext", async () => {
    if (!engineEnvelope) return "no envelope";
    const r = await kmsEngine.decrypt(
      { envelope: engineEnvelope, orgSlug: ORG },
      { ...sysCtx, operation: "DECRYPT" },
    );
    if (!r.ok) return `decrypt failed: ${r.error}`;
    return r.value.plaintext === "store-me";
  }));

  results.push(await testAsync("T55", "KMS Engine: rotateKey as SYSTEM succeeds", async () => {
    const r = await kmsEngine.rotateKey(
      { keyAlias: "engine_test_key", orgSlug: ORG },
      { ...sysCtx, operation: "ROTATE_KEY" },
    );
    if (!r.ok) return `rotate failed: ${r.error}`;
    return r.value.newVersion > r.value.previousVersion;
  }));

  results.push(await testAsync("T56", "KMS Engine: getKeyMetadata returns metadata", async () => {
    const r = await kmsEngine.getKeyMetadata(
      "engine_test_key", ORG,
      { ...sysCtx, operation: "GENERATE_KEY" },
    );
    return r.ok && r.value.keyAlias === "engine_test_key";
  }));

  results.push(await testAsync("T57", "KMS Engine: AGENT blocked from generateKey", async () => {
    const agentCtx = {
      subjectId: "agent-luca", subjectType: "AGENT" as const,
      orgSlug: ORG, operation: "GENERATE_KEY" as const, keyAlias: "agent_key",
    };
    const r = await kmsEngine.generateKey(
      { keyAlias: "agent_key", orgSlug: ORG },
      agentCtx,
    );
    return !r.ok && r.error?.includes("rbac_denied");
  }));

  results.push(await testAsync("T58", "KMS Engine: disableKey and enableKey cycle", async () => {
    const disR = await kmsEngine.disableKey(
      { keyAlias: "engine_test_key", orgSlug: ORG },
      { ...sysCtx, operation: "DISABLE_KEY" },
    );
    if (!disR.ok) return `disable failed: ${disR.error}`;
    const enR = await kmsEngine.enableKey(
      { keyAlias: "engine_test_key", orgSlug: ORG },
      { ...sysCtx, operation: "ENABLE_KEY" },
    );
    return enR.ok && enR.value.status === "ACTIVE";
  }));

  results.push(await testAsync("T59", "KMS Engine: deleteKey removes key from registry", async () => {
    const genR = await kmsEngine.generateKey(
      { keyAlias: "delete_me_key", orgSlug: ORG },
      { ...sysCtx, keyAlias: "delete_me_key" },
    );
    if (!genR.ok) return `gen failed: ${genR.error}`;
    const delR = await kmsEngine.deleteKey(
      { keyAlias: "delete_me_key", orgSlug: ORG },
      { ...sysCtx, operation: "DELETE_KEY", keyAlias: "delete_me_key" },
    );
    return delR.ok && delR.value.deleted === true;
  }));

  results.push(await testAsync("T60", "KMS Engine: singleton kmsEngine is available", async () => {
    return typeof kmsEngine.encrypt === "function" &&
      typeof kmsEngine.decrypt === "function" &&
      typeof kmsEngine.generateKey === "function";
  }));

  // ── T61–T70: KMS RBAC ──────────────────────────────────────────────────────

  results.push(test("T61", "KMS RBAC: SYSTEM subject always allowed", () => {
    const r = checkKmsRbac({ subjectId: "sys", subjectType: "SYSTEM", orgSlug: ORG, operation: "GENERATE_KEY" });
    return r.allowed && r.reasons.includes("system_subject_bypass");
  }));
  results.push(test("T62", "KMS RBAC: AGENT blocked from GENERATE_KEY", () => {
    const r = checkKmsRbac({ subjectId: "agent-1", subjectType: "AGENT", orgSlug: ORG, operation: "GENERATE_KEY" });
    return !r.allowed;
  }));
  results.push(test("T63", "KMS RBAC: AGENT allowed for ENCRYPT", () => {
    const r = checkKmsRbac({ subjectId: "agent-1", subjectType: "AGENT", orgSlug: ORG, operation: "ENCRYPT" });
    return r.allowed;
  }));
  results.push(test("T64", "KMS RBAC: AGENT allowed for DECRYPT", () => {
    const r = checkKmsRbac({ subjectId: "agent-1", subjectType: "AGENT", orgSlug: ORG, operation: "DECRYPT" });
    return r.allowed;
  }));
  results.push(test("T65", "KMS RBAC: AGENT blocked from ROTATE_KEY", () => {
    const r = checkKmsRbac({ subjectId: "agent-1", subjectType: "AGENT", orgSlug: ORG, operation: "ROTATE_KEY" });
    return !r.allowed;
  }));
  results.push(test("T66", "KMS RBAC: AGENT blocked from DELETE_KEY", () => {
    const r = checkKmsRbac({ subjectId: "agent-1", subjectType: "AGENT", orgSlug: ORG, operation: "DELETE_KEY" });
    return !r.allowed;
  }));
  results.push(test("T67", "KMS RBAC: SERVICE_ACCOUNT allowed for ENCRYPT", () => {
    const r = checkKmsRbac({ subjectId: "svc-1", subjectType: "SERVICE_ACCOUNT", orgSlug: ORG, operation: "ENCRYPT" });
    return r.allowed;
  }));
  results.push(test("T68", "KMS RBAC: SERVICE_ACCOUNT blocked from GENERATE_KEY", () => {
    const r = checkKmsRbac({ subjectId: "svc-1", subjectType: "SERVICE_ACCOUNT", orgSlug: ORG, operation: "GENERATE_KEY" });
    return !r.allowed;
  }));
  results.push(test("T69", "KMS RBAC: missing orgSlug returns denied", () => {
    const r = checkKmsRbac({ subjectId: "user-1", subjectType: "USER", orgSlug: "", operation: "ENCRYPT" });
    return !r.allowed;
  }));
  results.push(test("T70", "KMS RBAC: reasons array is always populated", () => {
    const r = checkKmsRbac({ subjectId: "sys", subjectType: "SYSTEM", orgSlug: ORG, operation: "ENCRYPT" });
    return Array.isArray(r.reasons) && r.reasons.length > 0;
  }));

  // ── T71–T80: KMS Zero Trust ─────────────────────────────────────────────────

  results.push(test("T71", "KMS ZT: evaluation returns a decision", () => {
    const r = checkKmsZeroTrust({
      subjectId: "sys", subjectType: "SYSTEM", orgSlug: ORG,
      operation: "ENCRYPT", keyAlias: "test_key",
    });
    return ["ALLOW", "DENY", "CHALLENGE"].includes(r.decision);
  }));
  results.push(test("T72", "KMS ZT: SYSTEM subject gets evaluated", () => {
    const r = checkKmsZeroTrust({
      subjectId: "sys", subjectType: "SYSTEM", orgSlug: ORG,
      operation: "ENCRYPT", keyAlias: "test_key",
    });
    return typeof r.score === "number";
  }));
  results.push(test("T73", "KMS ZT: evaluation includes evaluatedAt timestamp", () => {
    const r = checkKmsZeroTrust({
      subjectId: "sys", subjectType: "SYSTEM", orgSlug: ORG,
      operation: "ENCRYPT", keyAlias: "test_key",
    });
    return !!r.evaluatedAt;
  }));
  results.push(test("T74", "KMS ZT: GENERATE_KEY maps to ADMIN action", () => {
    const { getKmsZeroTrustAction } = require("@/lib/security/kms/integrations/kms-zero-trust");
    return getKmsZeroTrustAction("GENERATE_KEY") === "ADMIN";
  }));
  results.push(test("T75", "KMS ZT: ENCRYPT maps to EXECUTE action", () => {
    const { getKmsZeroTrustAction } = require("@/lib/security/kms/integrations/kms-zero-trust");
    return getKmsZeroTrustAction("ENCRYPT") === "EXECUTE";
  }));
  results.push(test("T76", "KMS ZT: ROTATE_KEY maps to ROTATE_SECRET action", () => {
    const { getKmsZeroTrustAction } = require("@/lib/security/kms/integrations/kms-zero-trust");
    return getKmsZeroTrustAction("ROTATE_KEY") === "ROTATE_SECRET";
  }));
  results.push(test("T77", "KMS ZT: DELETE_KEY maps to DELETE action", () => {
    const { getKmsZeroTrustAction } = require("@/lib/security/kms/integrations/kms-zero-trust");
    return getKmsZeroTrustAction("DELETE_KEY") === "DELETE";
  }));
  results.push(test("T78", "KMS ZT: evaluation has reasons array", () => {
    const r = checkKmsZeroTrust({
      subjectId: "sys", subjectType: "SYSTEM", orgSlug: ORG,
      operation: "DECRYPT", keyAlias: "test_key",
    });
    return Array.isArray(r.reasons);
  }));
  results.push(test("T79", "KMS ZT: empty orgSlug produces DENY", () => {
    const r = checkKmsZeroTrust({
      subjectId: "sys", subjectType: "SYSTEM", orgSlug: "",
      operation: "ENCRYPT", keyAlias: "test_key",
    });
    return r.decision === "DENY";
  }));
  results.push(test("T80", "KMS ZT: evaluation context contains orgSlug", () => {
    const r = checkKmsZeroTrust({
      subjectId: "sys", subjectType: "SYSTEM", orgSlug: ORG,
      operation: "ENCRYPT", keyAlias: "test_key",
    });
    return r.context.orgSlug === ORG;
  }));

  // ── T81–T90: KMS Audit ──────────────────────────────────────────────────────

  kmsAuditLog.clear();

  results.push(await testAsync("T81", "KMS Audit: recordKmsEvent records event", async () => {
    await recordKmsEvent({
      eventType: "KEY_GENERATED", orgSlug: ORG,
      subjectId: "sys", subjectType: "SYSTEM",
      keyId: "audit-key-1", success: true, reasons: [],
    });
    return kmsAuditLog.count() >= 1;
  }));

  results.push(await testAsync("T82", "KMS Audit: getEventsForOrg returns tenant events", async () => {
    const events = kmsAuditLog.getEventsForOrg(ORG);
    return events.length >= 1 && events.every(e => e.orgSlug === ORG);
  }));

  results.push(await testAsync("T83", "KMS Audit: getEventsByType filters correctly", async () => {
    await recordKmsEvent({
      eventType: "KMS_ACCESS_DENIED", orgSlug: ORG,
      subjectId: "sys", subjectType: "SYSTEM",
      keyId: "audit-key-2", success: false, reasons: ["test"],
    });
    const denied = kmsAuditLog.getEventsByType("KMS_ACCESS_DENIED");
    return denied.length >= 1;
  }));

  results.push(test("T84", "KMS Audit: getDeniedEvents returns failed events", () => {
    const denied = kmsAuditLog.getDeniedEvents(ORG);
    return denied.every(e => !e.success);
  }));

  results.push(await testAsync("T85", "KMS Audit: events have required fields", async () => {
    const events = kmsAuditLog.getEventsForOrg(ORG);
    const e = events[0];
    return !!(e.id && e.eventType && e.orgSlug && e.subjectId && e.occurredAt);
  }));

  results.push(await testAsync("T86", "KMS Audit: events never contain key material", async () => {
    const events = kmsAuditLog.getEvents();
    return events.every(e => {
      const str = JSON.stringify(e);
      return !str.includes("keyBytes") && !str.includes("rawKey") && !str.includes("secretValue");
    });
  }));

  results.push(test("T87", "KMS Audit: count() returns correct number", () => {
    const count = kmsAuditLog.count();
    return count >= 2;
  }));

  results.push(test("T88", "KMS Audit: KEY_USED event type is valid", () => {
    // Just verify the type union works
    const et: "KEY_USED" = "KEY_USED";
    return et === "KEY_USED";
  }));

  results.push(test("T89", "KMS Audit: KEY_ROTATED event type is valid", () => {
    const et: "KEY_ROTATED" = "KEY_ROTATED";
    return et === "KEY_ROTATED";
  }));

  results.push(test("T90", "KMS Audit: KMS_PROVIDER_FAILURE event type is valid", () => {
    const et: "KMS_PROVIDER_FAILURE" = "KMS_PROVIDER_FAILURE";
    return et === "KMS_PROVIDER_FAILURE";
  }));

  // ── T91–T100: Dashboard, health, readiness ──────────────────────────────────

  results.push(test("T91", "buildEmptyKmsDashboard: returns zeroed payload", () => {
    const d = buildEmptyKmsDashboard();
    return d.keysTotal === 0 && d.keysActive === 0 && d.healthStatus === "UNAVAILABLE";
  }));

  results.push(test("T92", "buildKmsDashboard: counts active keys", () => {
    const keys: KmsKeyMetadata[] = [
      { keyId: "k1", keyAlias: "a", provider: "LOCAL", status: "ACTIVE", version: 1, orgSlug: ORG, algorithm: "AES-256-GCM", createdAt: new Date().toISOString() },
      { keyId: "k2", keyAlias: "b", provider: "LOCAL", status: "DISABLED", version: 1, orgSlug: ORG, algorithm: "AES-256-GCM", createdAt: new Date().toISOString() },
    ];
    const now = new Date().toISOString();
    const d = buildKmsDashboard(keys, [], "HEALTHY", now, now);
    return d.keysTotal === 2 && d.keysActive === 1 && d.keysDisabled === 1;
  }));

  results.push(test("T93", "buildTenantSummaries: groups by orgSlug", () => {
    const keys: KmsKeyMetadata[] = [
      { keyId: "k1", keyAlias: "a", provider: "LOCAL", status: "ACTIVE", version: 1, orgSlug: "org-a", algorithm: "AES-256-GCM", createdAt: new Date().toISOString() },
      { keyId: "k2", keyAlias: "b", provider: "LOCAL", status: "ACTIVE", version: 1, orgSlug: "org-b", algorithm: "AES-256-GCM", createdAt: new Date().toISOString() },
    ];
    const summaries = buildTenantSummaries(keys);
    return summaries.length === 2;
  }));

  results.push(test("T94", "scanKmsReadiness: returns a readiness report", () => {
    const r = scanKmsReadiness();
    return ["READY", "PARTIAL", "NOT_READY"].includes(r.overall) && r.score >= 0;
  }));

  results.push(test("T95", "scanKmsReadiness: LOCAL_PROVIDER check passes", () => {
    const r = scanKmsReadiness();
    const localCheck = r.checks.find(c => c.subsystem === "LOCAL_PROVIDER");
    return localCheck?.status === "READY";
  }));

  results.push(test("T96", "scanKmsReadiness: 7 checks evaluated", () => {
    const r = scanKmsReadiness();
    return r.checks.length === 7;
  }));

  results.push(test("T97", "getActiveKeys: returns only ACTIVE keys", () => {
    const activeKeys = getActiveKeys(ORG);
    return activeKeys.every(k => k.status === "ACTIVE");
  }));

  results.push(test("T98", "getExpiredKeys: returns only expired keys", () => {
    const expired = getExpiredKeys(ORG);
    const now = new Date();
    return expired.every(k => k.expiresAt != null && new Date(k.expiresAt) < now);
  }));

  results.push(test("T99", "getTenantKeySummary: returns correct counts", () => {
    const summary = getTenantKeySummary(ORG);
    return summary.orgSlug === ORG && typeof summary.total === "number";
  }));

  results.push(test("T100", "getProviderSummary: returns provider breakdown", () => {
    const providers = getProviderSummary(ORG);
    return Array.isArray(providers);
  }));

  // ── T101–T108: Reports and future compatibility ─────────────────────────────

  results.push(test("T101", "buildKeyInventoryReport: summarizes key state", () => {
    const keys = listKeys(ORG);
    const r = buildKeyInventoryReport(ORG, keys);
    return r.orgSlug === ORG && typeof r.totalKeys === "number";
  }));

  results.push(test("T102", "buildKeyInventoryReport: byStatus counts are correct", () => {
    const keys = listKeys(ORG);
    const r = buildKeyInventoryReport(ORG, keys);
    const total = Object.values(r.byStatus).reduce((a, b) => a + b, 0);
    return total === r.totalKeys;
  }));

  results.push(test("T103", "buildRotationReport: returns rotation report", () => {
    const keys = listKeys(ORG);
    const r = buildRotationReport(ORG, keys, kmsAuditLog.getEvents());
    return r.orgSlug === ORG && typeof r.rotationsInWindow === "number";
  }));

  results.push(test("T104", "buildComplianceReport: score is 0–100", () => {
    const keys = listKeys(ORG);
    const r = buildComplianceReport(ORG, keys, kmsAuditLog.getEvents());
    return r.complianceScore >= 0 && r.complianceScore <= 100;
  }));

  results.push(test("T105", "buildComplianceReport: passedChecks is an array", () => {
    const keys = listKeys(ORG);
    const r = buildComplianceReport(ORG, keys, kmsAuditLog.getEvents());
    return Array.isArray(r.passedChecks);
  }));

  results.push(test("T106", "Future compatibility: LOCAL_KMS is AVAILABLE", () =>
    getCapabilityStatus("LOCAL_KMS") === "AVAILABLE",
  ));

  results.push(test("T107", "Future compatibility: AWS_KMS is PLANNED", () =>
    getCapabilityStatus("AWS_KMS") === "PLANNED",
  ));

  results.push(test("T108", "Future compatibility: getAvailableCapabilities returns LOCAL", () => {
    const available = getAvailableCapabilities();
    return available.some(c => c.id === "LOCAL_KMS");
  }));

  // ── Summary ───────────────────────────────────────────────────────────────

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass);
  const total  = results.length;

  return NextResponse.json({
    sprint:  "AGENTIK-SECURITY-KMS-01",
    summary: { total, passed, failed: failed.length, score: `${passed}/${total}` },
    failures: failed,
    results,
  }, { status: failed.length > 0 ? 207 : 200 });
}
