/**
 * app/api/internal/integration-tests/security-encryption/route.ts
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Integration Harness — Enterprise Encryption Layer
 *
 * 40+ runtime tests for the full encryption stack.
 * Tests run in process — no external calls.
 *
 * NOT for production use. Internal only.
 */

import { NextResponse } from "next/server";

// ── Guards ────────────────────────────────────────────────────────────────────

const ALLOWED =
  process.env.NODE_ENV !== "production" &&
  process.env.ENABLE_INTERNAL_INTEGRATION_TESTS === "true";

const EXPECTED_TOKEN = process.env.INTERNAL_INTEGRATION_TEST_TOKEN;

// ── Types ─────────────────────────────────────────────────────────────────────

interface TestResult {
  id:         string;
  label:      string;
  status:     "PASS" | "FAIL" | "SKIP";
  detail?:    string;
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

// ── Runner ────────────────────────────────────────────────────────────────────

async function runTest(
  id:    string,
  label: string,
  fn:    () => unknown | Promise<unknown>,
): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { id, label, status: "PASS", durationMs: Date.now() - start };
  } catch (e: any) {
    return {
      id,
      label,
      status:     "FAIL",
      detail:     e?.message ?? String(e),
      durationMs: Date.now() - start,
    };
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ── Key availability check ────────────────────────────────────────────────────

function encryptionKeyAvailable(): boolean {
  const { getActiveKeyReference } = require("@/lib/security/encryption/key-management");
  const ref = getActiveKeyReference();
  if (!ref) return false;
  const val = process.env[ref.envVarName];
  return !!val && val.trim().length > 0;
}

// ── T01 — types: createPersistentAuditEvent shape ────────────────────────────

async function t01(): Promise<void> {
  const { isEncryptedPayload, serializePayload, deserializePayload } = await import(
    "@/lib/security/encryption"
  );
  // isEncryptedPayload: invalid inputs
  assert(!isEncryptedPayload(null), "null is not EncryptedPayload");
  assert(!isEncryptedPayload({}), "empty object is not EncryptedPayload");
  assert(!isEncryptedPayload("string"), "string is not EncryptedPayload");
  // valid shape
  const mock = {
    algorithm:   "AES_256_GCM",
    ciphertext:  "deadbeef",
    iv:          "aabbccdd",
    authTag:     "eeff0011",
    keyVersion:  "v1",
    encryptedAt: new Date().toISOString(),
  };
  assert(isEncryptedPayload(mock), "valid shape is EncryptedPayload");
  // serialize round-trip
  const json   = serializePayload(mock as any);
  assert(json !== null, "serializePayload returns string");
  const parsed = deserializePayload(json!);
  assert(parsed !== null, "deserializePayload returns object");
  assert(parsed!.algorithm === "AES_256_GCM", "algorithm preserved");
  assert(parsed!.keyVersion === "v1", "keyVersion preserved");
}

// ── T02 — types: CURRENT_ENCRYPTION_ALGORITHM ─────────────────────────────────

async function t02(): Promise<void> {
  const { CURRENT_ENCRYPTION_ALGORITHM } = await import("@/lib/security/encryption");
  assert(CURRENT_ENCRYPTION_ALGORITHM === "AES_256_GCM", "current algorithm is AES_256_GCM");
}

// ── T03 — metadata: createEnvelope shape ─────────────────────────────────────

async function t03(): Promise<void> {
  const { createEnvelope, validateEnvelopeMetadata, safeMetadataSummary } = await import(
    "@/lib/security/encryption"
  );
  const mockPayload = {
    algorithm:   "AES_256_GCM" as const,
    ciphertext:  "aabbcc",
    iv:          "112233445566778899001122",
    authTag:     "00112233445566778899001122334455",
    keyVersion:  "v1",
    encryptedAt: new Date().toISOString(),
  };
  const envelope = createEnvelope(mockPayload, "test-org", "CONFIDENTIAL", "COPILOT_MEMORY");
  assert(envelope.meta.tenantId === "test-org", "tenantId set");
  assert(envelope.meta.classification === "CONFIDENTIAL", "classification set");
  assert(envelope.meta.assetType === "COPILOT_MEMORY", "assetType set");
  assert(envelope.meta.keyVersion === "v1", "keyVersion matches payload");

  const check = validateEnvelopeMetadata(envelope, "test-org");
  assert(check.valid, "envelope valid for correct tenant");

  const wrongTenant = validateEnvelopeMetadata(envelope, "other-org");
  assert(!wrongTenant.valid, "envelope invalid for wrong tenant");
  assert(wrongTenant.reason === "tenant_id_mismatch", "correct rejection reason");

  const summary = safeMetadataSummary(envelope.meta);
  assert(typeof summary.tenantId === "string", "summary.tenantId is string");
  assert(typeof summary.algorithm === "string", "summary.algorithm is string");
}

// ── T04 — metadata: serialize/deserialize envelope ───────────────────────────

async function t04(): Promise<void> {
  const { createEnvelope, serializeEnvelope, deserializeEnvelope } = await import(
    "@/lib/security/encryption"
  );
  const mockPayload = {
    algorithm:   "AES_256_GCM" as const,
    ciphertext:  "aabbcc",
    iv:          "112233445566778899001122",
    authTag:     "00112233445566778899001122334455",
    keyVersion:  "v1",
    encryptedAt: new Date().toISOString(),
  };
  const envelope  = createEnvelope(mockPayload, "test-org", "CONFIDENTIAL");
  const json      = serializeEnvelope(envelope);
  assert(json !== null, "serializeEnvelope returns string");
  const parsed    = deserializeEnvelope(json!);
  assert(parsed !== null, "deserializeEnvelope returns object");
  assert(parsed!.meta.tenantId === "test-org", "tenantId preserved in round-trip");
  assert(parsed!.payload.keyVersion === "v1", "payload keyVersion preserved");
  // invalid JSON
  const bad = deserializeEnvelope("not-json");
  assert(bad === null, "invalid JSON returns null");
}

// ── T05 — classification: requiresEncryption ─────────────────────────────────

async function t05(): Promise<void> {
  const { requiresEncryption } = await import("@/lib/security/encryption");
  assert(!requiresEncryption("PUBLIC"),       "PUBLIC does not require encryption");
  assert(!requiresEncryption("INTERNAL"),     "INTERNAL does not require encryption");
  assert(requiresEncryption("CONFIDENTIAL"),  "CONFIDENTIAL requires encryption");
  assert(requiresEncryption("RESTRICTED"),    "RESTRICTED requires encryption");
}

// ── T06 — classification: asset classification map ───────────────────────────

async function t06(): Promise<void> {
  const { getAssetClassification, assetRequiresEncryption, getAllEncryptionRequiredAssets } =
    await import("@/lib/security/encryption");
  assert(getAssetClassification("COPILOT_MEMORY") === "CONFIDENTIAL", "COPILOT_MEMORY is CONFIDENTIAL");
  assert(getAssetClassification("EMPLOYEE_RECORD") === "RESTRICTED", "EMPLOYEE_RECORD is RESTRICTED");
  assert(getAssetClassification("PUBLIC_CONTENT") === "PUBLIC", "PUBLIC_CONTENT is PUBLIC");
  assert(getAssetClassification("UNKNOWN_XYZ") === "INTERNAL", "unknown defaults to INTERNAL");

  assert(assetRequiresEncryption("COPILOT_MEMORY"), "COPILOT_MEMORY requires encryption");
  assert(assetRequiresEncryption("PLAYBOOK"), "PLAYBOOK requires encryption");
  assert(!assetRequiresEncryption("PUBLIC_CONTENT"), "PUBLIC_CONTENT does not require encryption");

  const required = getAllEncryptionRequiredAssets();
  assert(Array.isArray(required), "getAllEncryptionRequiredAssets returns array");
  assert(required.includes("COPILOT_MEMORY"), "COPILOT_MEMORY in required list");
  assert(required.includes("EMPLOYEE_RECORD"), "EMPLOYEE_RECORD in required list");
  assert(!required.includes("PUBLIC_CONTENT"), "PUBLIC_CONTENT not in required list");
}

// ── T07 — classification: elevation ──────────────────────────────────────────

async function t07(): Promise<void> {
  const { elevateClassification, isMoreSensitiveThan, classificationRank } = await import(
    "@/lib/security/encryption"
  );
  assert(elevateClassification("CONFIDENTIAL", "INTERNAL") === "CONFIDENTIAL", "CONFIDENTIAL > INTERNAL");
  assert(elevateClassification("PUBLIC", "RESTRICTED") === "RESTRICTED", "RESTRICTED > PUBLIC");
  assert(isMoreSensitiveThan("RESTRICTED", "CONFIDENTIAL"), "RESTRICTED > CONFIDENTIAL");
  assert(!isMoreSensitiveThan("PUBLIC", "INTERNAL"), "PUBLIC not > INTERNAL");
  assert(classificationRank("RESTRICTED") === 3, "RESTRICTED rank is 3");
  assert(classificationRank("PUBLIC") === 0, "PUBLIC rank is 0");
}

// ── T08 — registry: all 7 entries present ────────────────────────────────────

async function t08(): Promise<void> {
  const { ENCRYPTION_REGISTRY, getEncryptionRegistryEntry, getEncryptionRegistrySummary } =
    await import("@/lib/security/encryption");
  assert(ENCRYPTION_REGISTRY.length >= 7, "At least 7 registry entries");
  const ids = ["COPILOT_MEMORY", "PLAYBOOK", "EXECUTIVE_CONTEXT", "FINANCIAL_RECORD",
               "CUSTOMER_RECORD", "EMPLOYEE_RECORD", "AGENT_CONFIGURATION"];
  for (const id of ids) {
    const entry = getEncryptionRegistryEntry(id);
    assert(entry !== undefined, `${id} entry exists`);
    assert(entry!.requiresEncryption, `${id} requires encryption`);
  }
  const summary = getEncryptionRegistrySummary();
  assert(summary.total >= 7, "summary.total >= 7");
  assert(summary.requireEncrypt >= 7, "all entries require encryption");
  assert(summary.adapterReady >= 3, "at least 3 adapters ready");
  assert(summary.adapterPending >= 4, "at least 4 adapters pending");
}

// ── T09 — key-management: active key reference ───────────────────────────────

async function t09(): Promise<void> {
  const { getActiveKeyReference, getActiveKeyVersion, KEY_VERSION_REGISTRY,
          getKeyReference, getDecryptableKeyVersions } =
    await import("@/lib/security/encryption");
  assert(KEY_VERSION_REGISTRY.length >= 1, "At least 1 key version defined");
  const activeRef = getActiveKeyReference();
  assert(activeRef !== null, "active key reference exists");
  assert(activeRef!.status === "ACTIVE", "active key is ACTIVE");
  assert(typeof activeRef!.keyId === "string", "keyId is string");
  assert(typeof activeRef!.envVarName === "string", "envVarName is string");

  const version = getActiveKeyVersion();
  assert(version === activeRef!.keyId, "getActiveKeyVersion matches active ref keyId");

  const ref = getKeyReference("v1");
  assert(ref !== null, "v1 key reference exists");

  const decryptable = getDecryptableKeyVersions();
  assert(Array.isArray(decryptable), "getDecryptableKeyVersions returns array");
  assert(decryptable.some(k => k.status === "ACTIVE"), "at least one ACTIVE key");
}

// ── T10 — engine: validate payload structure ──────────────────────────────────

async function t10(): Promise<void> {
  const { validatePayloadStructure } = await import(
    "@/lib/security/encryption/server"
  );
  // Valid payload structure
  const validPayload = {
    algorithm:   "AES_256_GCM" as const,
    ciphertext:  "deadbeefcafe",
    iv:          "112233445566778899001122",     // 24 hex chars = 12 bytes
    authTag:     "00112233445566778899001122334455", // 32 hex chars = 16 bytes
    keyVersion:  "v1",
    encryptedAt: "2026-06-06T00:00:00.000Z",
  };
  const valid = validatePayloadStructure(validPayload);
  assert(valid.valid, "valid payload structure passes");

  // Wrong algorithm
  const badAlg = validatePayloadStructure({ ...validPayload, algorithm: "DES_EDE" as any });
  assert(!badAlg.valid, "wrong algorithm fails");
  assert(badAlg.reason === "unsupported_algorithm", "correct reason for bad algorithm");

  // Wrong IV length
  const badIv = validatePayloadStructure({ ...validPayload, iv: "tooshort" });
  assert(!badIv.valid, "wrong IV length fails");
  assert(badIv.reason === "invalid_iv", "correct reason for bad IV");

  // Wrong auth tag
  const badTag = validatePayloadStructure({ ...validPayload, authTag: "tooshort" });
  assert(!badTag.valid, "wrong auth tag fails");
  assert(badTag.reason === "invalid_auth_tag", "correct reason for bad auth tag");
}

// ── T11 — engine: encrypt text (key must be set) ─────────────────────────────

async function t11(): Promise<void> {
  if (!encryptionKeyAvailable()) {
    throw new Error("SKIP: AGENTIK_ENCRYPTION_KEY not set — run with key to test encrypt");
  }
  const { encryptData } = await import("@/lib/security/encryption/server");
  const result = encryptData({ plaintext: "hello-encryption-test", orgSlug: "test-org" });
  assert(result !== null, "encryptData returns result");
  assert(typeof result!.payload.ciphertext === "string", "ciphertext is string");
  assert(result!.payload.ciphertext.length > 0, "ciphertext is non-empty");
  assert(result!.payload.algorithm === "AES_256_GCM", "algorithm is AES_256_GCM");
  assert(result!.payload.iv.length === 24, "IV is 24 hex chars (12 bytes)");
  assert(result!.payload.authTag.length === 32, "authTag is 32 hex chars (16 bytes)");
  assert(result!.payload.keyVersion === "v1", "keyVersion is v1");
  assert(typeof result!.payload.encryptedAt === "string", "encryptedAt is string");
}

// ── T12 — engine: decrypt text (key must be set) ─────────────────────────────

async function t12(): Promise<void> {
  if (!encryptionKeyAvailable()) {
    throw new Error("SKIP: AGENTIK_ENCRYPTION_KEY not set");
  }
  const { encryptData, decryptData } = await import("@/lib/security/encryption/server");
  const plaintext = "hello-decryption-test-" + Date.now();
  const encrypted = encryptData({ plaintext, orgSlug: "test-org" });
  assert(encrypted !== null, "encrypt succeeded");
  const decrypted = decryptData({ payload: encrypted!.payload, orgSlug: "test-org" });
  assert(decrypted !== null, "decrypt succeeded");
  assert(decrypted!.plaintext === plaintext, "decrypted plaintext matches original");
}

// ── T13 — engine: tampered payload fails decryption ──────────────────────────

async function t13(): Promise<void> {
  if (!encryptionKeyAvailable()) {
    throw new Error("SKIP: AGENTIK_ENCRYPTION_KEY not set");
  }
  const { encryptData, decryptData } = await import("@/lib/security/encryption/server");
  const encrypted = encryptData({ plaintext: "tamper-test", orgSlug: "test-org" });
  assert(encrypted !== null, "encrypt succeeded");
  // Tamper the ciphertext
  const tampered = {
    ...encrypted!.payload,
    ciphertext: encrypted!.payload.ciphertext.replace("a", "b").replace("0", "1"),
  };
  const result = decryptData({ payload: tampered, orgSlug: "test-org" });
  assert(result === null, "tampered payload returns null (GCM auth tag fails)");
}

// ── T14 — engine: empty plaintext returns null ────────────────────────────────

async function t14(): Promise<void> {
  if (!encryptionKeyAvailable()) {
    throw new Error("SKIP: AGENTIK_ENCRYPTION_KEY not set");
  }
  const { encryptData } = await import("@/lib/security/encryption/server");
  const result = encryptData({ plaintext: "", orgSlug: "test-org" });
  assert(result === null, "empty plaintext returns null");
}

// ── T15 — engine: unique IVs per call ────────────────────────────────────────

async function t15(): Promise<void> {
  if (!encryptionKeyAvailable()) {
    throw new Error("SKIP: AGENTIK_ENCRYPTION_KEY not set");
  }
  const { encryptData } = await import("@/lib/security/encryption/server");
  const a = encryptData({ plaintext: "same-text", orgSlug: "test-org" });
  const b = encryptData({ plaintext: "same-text", orgSlug: "test-org" });
  assert(a !== null && b !== null, "both encryptions succeed");
  assert(a!.payload.iv !== b!.payload.iv, "IVs are unique per call");
  assert(a!.payload.ciphertext !== b!.payload.ciphertext, "ciphertexts differ (different IVs)");
}

// ── T16 — service: singleton pattern ─────────────────────────────────────────

async function t16(): Promise<void> {
  const { getEncryptionService } = await import("@/lib/security/encryption/server");
  const s1 = getEncryptionService();
  const s2 = getEncryptionService();
  assert(s1 === s2, "same instance returned");
  assert(typeof s1.encrypt === "function", "encrypt method exists");
  assert(typeof s1.decrypt === "function", "decrypt method exists");
  assert(typeof s1.validate === "function", "validate method exists");
}

// ── T17 — service: encrypt + decrypt round-trip ───────────────────────────────

async function t17(): Promise<void> {
  if (!encryptionKeyAvailable()) {
    throw new Error("SKIP: AGENTIK_ENCRYPTION_KEY not set");
  }
  const { getEncryptionService } = await import("@/lib/security/encryption/server");
  const svc = getEncryptionService();
  const plaintext = "service-round-trip-" + Date.now();
  const encResult = svc.encrypt({
    plaintext,
    orgSlug:   "test-org",
    assetType: "COPILOT_MEMORY",
  });
  assert(encResult !== null, "service.encrypt returns result");
  assert(typeof encResult!.keyVersion === "string", "keyVersion is string");
  assert(encResult!.envelope.meta.tenantId === "test-org", "tenantId set in envelope");
  assert(encResult!.envelope.meta.assetType === "COPILOT_MEMORY", "assetType set");

  const decResult = svc.decrypt({
    envelope: encResult!.envelope,
    orgSlug:  "test-org",
  });
  assert(decResult !== null, "service.decrypt returns result");
  assert(decResult!.plaintext === plaintext, "plaintext matches after round-trip");
}

// ── T18 — service: tenant isolation — wrong orgSlug ──────────────────────────

async function t18(): Promise<void> {
  if (!encryptionKeyAvailable()) {
    throw new Error("SKIP: AGENTIK_ENCRYPTION_KEY not set");
  }
  const { getEncryptionService } = await import("@/lib/security/encryption/server");
  const svc = getEncryptionService();
  const encResult = svc.encrypt({
    plaintext: "tenant-isolation-test",
    orgSlug:   "org-a",
    assetType: "COPILOT_MEMORY",
  });
  assert(encResult !== null, "encrypt succeeds");
  // Attempt to decrypt with a different tenant
  const decResult = svc.decrypt({
    envelope: encResult!.envelope,
    orgSlug:  "org-b",
  });
  assert(decResult === null, "wrong tenant cannot decrypt (fail-closed)");
}

// ── T19 — service: invalid payload returns null ───────────────────────────────

async function t19(): Promise<void> {
  const { getEncryptionService } = await import("@/lib/security/encryption/server");
  const svc = getEncryptionService();
  const { createEnvelope } = await import("@/lib/security/encryption");
  const invalidPayload = {
    algorithm:   "AES_256_GCM" as const,
    ciphertext:  "not-even-hex!!!",
    iv:          "bad-iv",
    authTag:     "bad-tag",
    keyVersion:  "v1",
    encryptedAt: "2026-01-01T00:00:00.000Z",
  };
  const envelope = createEnvelope(invalidPayload, "test-org", "CONFIDENTIAL");
  const result = svc.decrypt({ envelope, orgSlug: "test-org" });
  assert(result === null, "invalid payload returns null");
}

// ── T20 — service: classify non-encrypting asset returns null ─────────────────

async function t20(): Promise<void> {
  const { getEncryptionService } = await import("@/lib/security/encryption/server");
  const svc = getEncryptionService();
  const result = svc.encrypt({
    plaintext: "public-data",
    orgSlug:   "test-org",
    assetType: "PUBLIC_CONTENT",
  });
  assert(result === null, "PUBLIC_CONTENT asset not encrypted (policy enforced)");
}

// ── T21 — service: empty orgSlug returns null ─────────────────────────────────

async function t21(): Promise<void> {
  const { getEncryptionService } = await import("@/lib/security/encryption/server");
  const svc = getEncryptionService();
  const result = svc.encrypt({
    plaintext: "test",
    orgSlug:   "",
    assetType: "COPILOT_MEMORY",
  });
  assert(result === null, "empty orgSlug returns null");
}

// ── T22 — audit: globalEncryptionAuditLog ────────────────────────────────────

async function t22(): Promise<void> {
  const { globalEncryptionAuditLog, createEncryptionAuditEvent } = await import(
    "@/lib/security/encryption/server"
  );
  globalEncryptionAuditLog._reset();
  const event = createEncryptionAuditEvent({
    type:       "DATA_ENCRYPTED",
    orgSlug:    "test-org",
    assetType:  "COPILOT_MEMORY",
    keyVersion: "v1",
    success:    true,
    durationMs: 5,
  });
  globalEncryptionAuditLog.push(event);
  const byTenant = globalEncryptionAuditLog.getByTenant("test-org");
  assert(byTenant.length === 1, "event recorded for tenant");
  assert(byTenant[0].type === "DATA_ENCRYPTED", "event type correct");
  assert(byTenant[0].orgSlug === "test-org", "orgSlug correct");
  assert(!("plaintext" in byTenant[0]), "no plaintext in audit event");
  assert(!("ciphertext" in byTenant[0]), "no ciphertext in audit event");
}

// ── T23 — audit: failure events recorded ──────────────────────────────────────

async function t23(): Promise<void> {
  const { globalEncryptionAuditLog, createEncryptionAuditEvent } = await import(
    "@/lib/security/encryption/server"
  );
  globalEncryptionAuditLog._reset();
  globalEncryptionAuditLog.push(createEncryptionAuditEvent({
    type:       "DECRYPTION_DENIED",
    orgSlug:    "test-org",
    assetType:  "PLAYBOOK",
    keyVersion: "v1",
    success:    false,
    reason:     "tenant_mismatch",
    durationMs: 2,
  }));
  const failures = globalEncryptionAuditLog.getFailures();
  assert(failures.length === 1, "failure recorded");
  assert(failures[0].success === false, "success is false");
  assert(failures[0].reason === "tenant_mismatch", "reason preserved");
}

// ── T24 — health: check results shape ────────────────────────────────────────

async function t24(): Promise<void> {
  const { checkEncryptionHealth } = await import("@/lib/security/encryption/server");
  let threw = false;
  let report: any;
  try {
    report = checkEncryptionHealth();
  } catch {
    threw = true;
  }
  assert(!threw, "checkEncryptionHealth never throws");
  assert(typeof report === "object" && report !== null, "report is object");
  assert(["HEALTHY", "DEGRADED", "UNAVAILABLE"].includes(report.status), "status is valid");
  assert(Array.isArray(report.checks), "checks is array");
  assert(report.checks.length >= 4, "at least 4 health checks");
  assert(typeof report.checkedAt === "string", "checkedAt is string");
  assert(typeof report.durationMs === "number", "durationMs is number");
  assert(typeof report.keySummary === "object", "keySummary is object");
  assert(typeof report.registryTotal === "number", "registryTotal is number");
}

// ── T25 — health: key available → HEALTHY round-trip check ───────────────────

async function t25(): Promise<void> {
  if (!encryptionKeyAvailable()) {
    throw new Error("SKIP: key not set");
  }
  const { checkEncryptionHealth } = await import("@/lib/security/encryption/server");
  const report = checkEncryptionHealth();
  assert(report.status === "HEALTHY", "status HEALTHY when key is set");
  const roundTrip = report.checks.find((c: any) => c.name === "engine_round_trip");
  assert(roundTrip !== undefined, "engine_round_trip check present");
  assert((roundTrip as any)?.status === "HEALTHY", "engine_round_trip is HEALTHY");
}

// ── T26 — memory adapter: singleton and API ───────────────────────────────────

async function t26(): Promise<void> {
  const { getMemoryEncryptionAdapter, MemoryEncryptionAdapter } = await import(
    "@/lib/security/encryption/server"
  );
  const a1 = getMemoryEncryptionAdapter();
  const a2 = getMemoryEncryptionAdapter();
  assert(a1 === a2, "same instance");
  assert(a1 instanceof MemoryEncryptionAdapter, "is MemoryEncryptionAdapter");
  assert(typeof a1.encryptContent === "function", "encryptContent exists");
  assert(typeof a1.decryptContent === "function", "decryptContent exists");
  assert(typeof a1.isEncrypted === "function", "isEncrypted exists");
  assert(typeof a1.requiresEncryption === "function", "requiresEncryption exists");
}

// ── T27 — memory adapter: requiresEncryption policy ──────────────────────────

async function t27(): Promise<void> {
  const { getMemoryEncryptionAdapter } = await import("@/lib/security/encryption/server");
  const adapter = getMemoryEncryptionAdapter();
  assert(adapter.requiresEncryption("STRATEGIC"), "STRATEGIC requires encryption");
  assert(adapter.requiresEncryption("LEARNING"), "LEARNING requires encryption");
  assert(!adapter.requiresEncryption("OPERATIONAL"), "OPERATIONAL does not require encryption");
  assert(!adapter.requiresEncryption("PREFERENCE"), "PREFERENCE does not require encryption");
}

// ── T28 — memory adapter: encrypt/decrypt round-trip ─────────────────────────

async function t28(): Promise<void> {
  if (!encryptionKeyAvailable()) {
    throw new Error("SKIP: key not set");
  }
  const { getMemoryEncryptionAdapter } = await import("@/lib/security/encryption/server");
  const adapter   = getMemoryEncryptionAdapter();
  const plaintext = "Strategic memory: key vendor is ACME Corp";
  const encrypted = adapter.encryptContent(plaintext, "test-org");
  assert(encrypted !== null, "encryptContent returns string");
  assert(adapter.isEncrypted(encrypted!), "result is recognized as encrypted");

  const decrypted = adapter.decryptContent(encrypted!, "test-org");
  assert(decrypted !== null, "decryptContent succeeds");
  assert(decrypted === plaintext, "plaintext matches after round-trip");
}

// ── T29 — memory adapter: wrong tenant fails ──────────────────────────────────

async function t29(): Promise<void> {
  if (!encryptionKeyAvailable()) {
    throw new Error("SKIP: key not set");
  }
  const { getMemoryEncryptionAdapter } = await import("@/lib/security/encryption/server");
  const adapter   = getMemoryEncryptionAdapter();
  const encrypted = adapter.encryptContent("sensitive memory", "org-a");
  assert(encrypted !== null, "encrypt succeeds");
  const decrypted = adapter.decryptContent(encrypted!, "org-b");
  assert(decrypted === null, "wrong tenant cannot decrypt");
}

// ── T30 — playbook adapter: encrypt/decrypt round-trip ───────────────────────

async function t30(): Promise<void> {
  if (!encryptionKeyAvailable()) {
    throw new Error("SKIP: key not set");
  }
  const { getPlaybookEncryptionAdapter } = await import("@/lib/security/encryption/server");
  const adapter   = getPlaybookEncryptionAdapter();
  const plaintext = "Collections playbook: escalate after 3 calls";
  const encrypted = adapter.encryptContent(plaintext, "test-org");
  assert(encrypted !== null, "encryptContent returns string");
  assert(adapter.isEncrypted(encrypted!), "result is encrypted");

  const decrypted = adapter.decryptContent(encrypted!, "test-org");
  assert(decrypted === plaintext, "plaintext matches after round-trip");
}

// ── T31 — playbook adapter: category policy ───────────────────────────────────

async function t31(): Promise<void> {
  const { getPlaybookEncryptionAdapter } = await import("@/lib/security/encryption/server");
  const adapter = getPlaybookEncryptionAdapter();
  assert(adapter.requiresEncryption("FINANCE"), "FINANCE requires encryption");
  assert(adapter.requiresEncryption("EXECUTIVE"), "EXECUTIVE requires encryption");
  assert(!adapter.requiresEncryption("MARKETING"), "MARKETING does not require encryption");
  assert(!adapter.requiresEncryption("HR"), "HR does not require encryption");
}

// ── T32 — executive adapter: encrypt/decrypt round-trip ──────────────────────

async function t32(): Promise<void> {
  if (!encryptionKeyAvailable()) {
    throw new Error("SKIP: key not set");
  }
  const { getExecutiveEncryptionAdapter } = await import("@/lib/security/encryption/server");
  const adapter   = getExecutiveEncryptionAdapter();
  const context   = JSON.stringify({ revenue: 1200000, alerts: ["low-cash"] });
  const encrypted = adapter.encryptContext(context, "test-org");
  assert(encrypted !== null, "encryptContext returns string");
  assert(adapter.isEncrypted(encrypted!), "result is encrypted");

  const decrypted = adapter.decryptContext(encrypted!, "test-org");
  assert(decrypted === context, "context matches after round-trip");
}

// ── T33 — executive adapter: wrong tenant fails ───────────────────────────────

async function t33(): Promise<void> {
  if (!encryptionKeyAvailable()) {
    throw new Error("SKIP: key not set");
  }
  const { getExecutiveEncryptionAdapter } = await import("@/lib/security/encryption/server");
  const adapter   = getExecutiveEncryptionAdapter();
  const encrypted = adapter.encryptContext("{}", "org-a");
  assert(encrypted !== null, "encrypt succeeds");
  const decrypted = adapter.decryptContext(encrypted!, "org-b");
  assert(decrypted === null, "wrong tenant cannot decrypt");
}

// ── T34 — compatibility: isEncrypted / detectFormat ──────────────────────────

async function t34(): Promise<void> {
  const { isEncrypted, isLegacyUnencrypted, detectFormat } = await import(
    "@/lib/security/encryption/encryption-compatibility"
  );
  // Not encrypted
  assert(!isEncrypted("plain text"), "plain text is not encrypted");
  assert(!isEncrypted(""), "empty string is not encrypted");
  assert(isLegacyUnencrypted("plain text"), "plain text is legacy");
  assert(detectFormat("plain text") === "legacy", "plain text is legacy format");
  assert(detectFormat("") === "unknown", "empty string is unknown format");

  // Encrypted (mock envelope JSON)
  const mockEnvelope = JSON.stringify({
    payload: {
      algorithm: "AES_256_GCM",
      ciphertext: "abc",
      iv: "def",
      authTag: "ghi",
      keyVersion: "v1",
      encryptedAt: "2026-01-01T00:00:00.000Z",
    },
    meta: {
      keyVersion: "v1",
      tenantId: "test-org",
      classification: "CONFIDENTIAL",
      algorithm: "AES_256_GCM",
      encryptedAt: "2026-01-01T00:00:00.000Z",
    },
  });
  assert(isEncrypted(mockEnvelope), "envelope JSON is detected as encrypted");
  assert(detectFormat(mockEnvelope) === "encrypted", "envelope format is 'encrypted'");
}

// ── T35 — compatibility: analyzeCompatibilityStats ───────────────────────────

async function t35(): Promise<void> {
  const { analyzeCompatibilityStats } = await import(
    "@/lib/security/encryption/encryption-compatibility"
  );
  const mockEnvelope = JSON.stringify({
    payload: { algorithm: "AES_256_GCM", ciphertext: "abc", iv: "def",
               authTag: "ghi", keyVersion: "v1", encryptedAt: "2026-01-01T00:00:00.000Z" },
    meta: { keyVersion: "v1", tenantId: "org", classification: "CONFIDENTIAL",
            algorithm: "AES_256_GCM", encryptedAt: "2026-01-01T00:00:00.000Z" },
  });
  const stats = analyzeCompatibilityStats(["legacy1", "legacy2", mockEnvelope, mockEnvelope]);
  assert(stats.total === 4, "total is 4");
  assert(stats.encrypted === 2, "encrypted is 2");
  assert(stats.legacy === 2, "legacy is 2");
  assert(stats.pctEncrypted === 50, "pctEncrypted is 50%");
}

// ── T36 — migration planner: all 7 candidates present ────────────────────────

async function t36(): Promise<void> {
  const { ENCRYPTION_MIGRATION_PLAN, getMigrationPlanSummary, getReadyCandidates,
          getPendingCandidates } = await import(
    "@/lib/security/encryption/encryption-migration-planner"
  );
  assert(ENCRYPTION_MIGRATION_PLAN.length >= 7, "At least 7 candidates");
  const ids = ENCRYPTION_MIGRATION_PLAN.map(c => c.id);
  assert(ids.includes("COPILOT_MEMORY"), "COPILOT_MEMORY candidate");
  assert(ids.includes("EMPLOYEE_RECORD"), "EMPLOYEE_RECORD candidate");

  const summary = getMigrationPlanSummary();
  assert(summary.total >= 7, "summary.total >= 7");
  assert(summary.ready >= 3, "at least 3 READY candidates");
  assert(summary.notStarted >= 4, "at least 4 NOT_STARTED candidates");

  const ready = getReadyCandidates();
  assert(ready.every(c => c.adapterPath !== null), "READY candidates have adapter path");

  const pending = getPendingCandidates();
  assert(pending.every(c => c.adapterPath === null), "NOT_STARTED candidates have no adapter");
}

// ── T37 — key reference: canDecryptWithVersion ───────────────────────────────

async function t37(): Promise<void> {
  const { canDecryptWithVersion } = await import("@/lib/security/encryption");
  assert(canDecryptWithVersion("v1"), "v1 can decrypt (ACTIVE)");
  assert(!canDecryptWithVersion("nonexistent"), "unknown version cannot decrypt");
}

// ── T38 — provider: LocalAesGcmProvider singleton ────────────────────────────

async function t38(): Promise<void> {
  const { getLocalAesGcmProvider, LocalAesGcmProvider } = await import(
    "@/lib/security/encryption/server"
  );
  const p1 = getLocalAesGcmProvider();
  const p2 = getLocalAesGcmProvider();
  assert(p1 === p2, "same provider instance");
  assert(p1 instanceof LocalAesGcmProvider, "is LocalAesGcmProvider");
  assert(p1.isLocal, "isLocal is true");
  assert(p1.isActive, "isActive is true");
  assert(typeof p1.canDecrypt === "function", "canDecrypt exists");
  assert(typeof p1.validatePayload === "function", "validatePayload exists");
}

// ── T39 — provider: canDecrypt ───────────────────────────────────────────────

async function t39(): Promise<void> {
  const { getLocalAesGcmProvider } = await import("@/lib/security/encryption/server");
  const provider = getLocalAesGcmProvider();
  const validPayload = {
    algorithm:   "AES_256_GCM" as const,
    ciphertext:  "deadbeef",
    iv:          "112233445566778899001122",
    authTag:     "00112233445566778899001122334455",
    keyVersion:  "v1",
    encryptedAt: "2026-06-06T00:00:00.000Z",
  };
  assert(provider.canDecrypt(validPayload), "valid v1 payload can decrypt");
  const unknownVersion = { ...validPayload, keyVersion: "v99" };
  assert(!provider.canDecrypt(unknownVersion), "unknown key version cannot decrypt");
}

// ── T40 — serialization: round-trip with associated data ─────────────────────

async function t40(): Promise<void> {
  if (!encryptionKeyAvailable()) {
    throw new Error("SKIP: key not set");
  }
  const { encryptData, decryptData } = await import("@/lib/security/encryption/server");
  const plaintext      = "associated-data-test";
  const associatedData = "test-org::COPILOT_MEMORY::v1";
  const encrypted = encryptData({ plaintext, orgSlug: "test-org", associatedData });
  assert(encrypted !== null, "encrypt with AAD succeeds");
  // Correct AAD
  const decrypted = decryptData({ payload: encrypted!.payload, orgSlug: "test-org", associatedData });
  assert(decrypted !== null, "decrypt with correct AAD succeeds");
  assert(decrypted!.plaintext === plaintext, "plaintext matches");
  // Wrong AAD
  const wrongAad = decryptData({ payload: encrypted!.payload, orgSlug: "test-org", associatedData: "wrong" });
  assert(wrongAad === null, "wrong AAD fails decryption (GCM integrity)");
}

// ── T41 — client barrel: safe exports only ────────────────────────────────────

async function t41(): Promise<void> {
  const clientBarrel = await import("@/lib/security/encryption");
  // Safe exports must be present
  assert("isEncryptedPayload" in clientBarrel, "isEncryptedPayload exported");
  assert("requiresEncryption" in clientBarrel, "requiresEncryption exported");
  assert("ENCRYPTION_REGISTRY" in clientBarrel, "ENCRYPTION_REGISTRY exported");
  assert("KEY_VERSION_REGISTRY" in clientBarrel, "KEY_VERSION_REGISTRY exported");
  // Engine must NOT be present
  assert(!("encryptData" in clientBarrel), "encryptData NOT in client barrel");
  assert(!("decryptData" in clientBarrel), "decryptData NOT in client barrel");
  assert(!("LocalAesGcmProvider" in clientBarrel), "provider NOT in client barrel");
}

// ── Runner ────────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  if (!ALLOWED) {
    return NextResponse.json(
      { error: "Integration tests are disabled in this environment." },
      { status: 403 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (EXPECTED_TOKEN && token !== EXPECTED_TOKEN) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const tests: Array<[string, string, () => Promise<void>]> = [
    ["T01", "types: isEncryptedPayload and serialize round-trip",           t01],
    ["T02", "types: CURRENT_ENCRYPTION_ALGORITHM",                          t02],
    ["T03", "metadata: createEnvelope shape and validation",                t03],
    ["T04", "metadata: serialize/deserialize envelope",                     t04],
    ["T05", "classification: requiresEncryption policy",                    t05],
    ["T06", "classification: asset classification map",                     t06],
    ["T07", "classification: elevation and ranking",                        t07],
    ["T08", "registry: all 7 entries present",                              t08],
    ["T09", "key-management: active key reference",                         t09],
    ["T10", "engine: validate payload structure",                            t10],
    ["T11", "engine: encrypt text",                                         t11],
    ["T12", "engine: decrypt text round-trip",                              t12],
    ["T13", "engine: tampered payload fails decryption",                    t13],
    ["T14", "engine: empty plaintext returns null",                         t14],
    ["T15", "engine: unique IVs per call",                                  t15],
    ["T16", "service: singleton pattern",                                   t16],
    ["T17", "service: encrypt + decrypt round-trip",                        t17],
    ["T18", "service: tenant isolation — wrong orgSlug rejected",           t18],
    ["T19", "service: invalid payload returns null",                        t19],
    ["T20", "service: non-encrypting asset returns null",                   t20],
    ["T21", "service: empty orgSlug returns null",                          t21],
    ["T22", "audit: globalEncryptionAuditLog records events",               t22],
    ["T23", "audit: failure events recorded",                               t23],
    ["T24", "health: check results shape",                                  t24],
    ["T25", "health: HEALTHY when key is available",                        t25],
    ["T26", "memory adapter: singleton and API",                            t26],
    ["T27", "memory adapter: requiresEncryption policy",                    t27],
    ["T28", "memory adapter: encrypt/decrypt round-trip",                   t28],
    ["T29", "memory adapter: wrong tenant fails",                           t29],
    ["T30", "playbook adapter: encrypt/decrypt round-trip",                 t30],
    ["T31", "playbook adapter: category policy",                            t31],
    ["T32", "executive adapter: encrypt/decrypt round-trip",                t32],
    ["T33", "executive adapter: wrong tenant fails",                        t33],
    ["T34", "compatibility: isEncrypted and detectFormat",                  t34],
    ["T35", "compatibility: analyzeCompatibilityStats",                     t35],
    ["T36", "migration planner: all 7 candidates present",                  t36],
    ["T37", "key reference: canDecryptWithVersion",                         t37],
    ["T38", "provider: LocalAesGcmProvider singleton",                      t38],
    ["T39", "provider: canDecrypt",                                         t39],
    ["T40", "serialization: round-trip with associated data",               t40],
    ["T41", "client barrel: safe exports only",                             t41],
  ];

  const results: TestResult[] = [];
  for (const [id, label, fn] of tests) {
    results.push(await runTest(id, label, fn));
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

  return NextResponse.json(report, { status: failed > 0 ? 207 : 200 });
}
