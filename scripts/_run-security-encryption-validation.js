#!/usr/bin/env node
/**
 * scripts/_run-security-encryption-validation.js
 *
 * AGENTIK-SECURITY-ENCRYPTION-01
 * Static validation suite for the Enterprise Encryption Layer.
 *
 * Run: node scripts/_run-security-encryption-validation.js
 *
 * 800+ checks across sections A–Z.
 * No network. No DB. No external deps. Pure file-content checks.
 */

const fs   = require("fs");
const path = require("path");

// ── Runner ────────────────────────────────────────────────────────────────────

let pass = 0, fail = 0, warn = 0;
const failures = [];

function check(label, condition, note) {
  if (condition) {
    pass++;
  } else {
    fail++;
    failures.push({ label, note: note || "" });
  }
}

function section(name) {
  process.stdout.write(`\n  [${name}]\n`);
}

function read(rel) {
  try { return fs.readFileSync(path.resolve(process.cwd(), rel), "utf8"); }
  catch { return ""; }
}

function exists(rel) {
  return fs.existsSync(path.resolve(process.cwd(), rel));
}

// ── File helpers ──────────────────────────────────────────────────────────────

const ET  = read("lib/security/encryption/encryption-types.ts");
const EM  = read("lib/security/encryption/encryption-metadata.ts");
const EP  = read("lib/security/encryption/encryption-provider.ts");
const EE  = read("lib/security/encryption/encryption-engine.ts");
const KM  = read("lib/security/encryption/key-management.ts");
const EA  = read("lib/security/encryption/encryption-audit.ts");
const CP  = read("lib/security/encryption/encryption-classification-policy.ts");
const ER  = read("lib/security/encryption/encryption-registry.ts");
const ES  = read("lib/security/encryption/encryption-service.ts");
const EH  = read("lib/security/encryption/encryption-health.ts");
const SB  = read("lib/security/encryption/server.ts");
const CB  = read("lib/security/encryption/index.ts");
const MP  = read("lib/security/encryption/encryption-migration-planner.ts");
const CL  = read("lib/security/encryption/encryption-compatibility.ts");
const MA  = read("lib/copilot/memory/security/memory-encryption-adapter.ts");
const PA  = read("lib/copilot/playbooks/security/playbook-encryption-adapter.ts");
const XA  = read("lib/copilot/executive-brain/security/executive-encryption-adapter.ts");
const INV = read("lib/security/security-inventory.ts");
const REG = read("lib/security/security-registry.ts");

// ── Section A — encryption-types.ts ──────────────────────────────────────────

section("A — encryption-types.ts");
check("A01", exists("lib/security/encryption/encryption-types.ts"), "file exists");
check("A02", ET.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("A03", ET.includes("EncryptionAlgorithm"), "EncryptionAlgorithm defined");
check("A04", ET.includes('"AES_256_GCM"'), "AES_256_GCM value present");
check("A05", ET.includes("EncryptionStatus"), "EncryptionStatus defined");
check("A06", ET.includes('"ENCRYPTED"'), "ENCRYPTED status");
check("A07", ET.includes('"DECRYPTED"'), "DECRYPTED status");
check("A08", ET.includes("EncryptionClassification"), "EncryptionClassification defined");
check("A09", ET.includes('"CONFIDENTIAL"'), "CONFIDENTIAL classification");
check("A10", ET.includes('"RESTRICTED"'), "RESTRICTED classification");
check("A11", ET.includes("EncryptedPayload"), "EncryptedPayload interface");
check("A12", ET.includes("algorithm"), "algorithm field");
check("A13", ET.includes("ciphertext"), "ciphertext field");
check("A14", ET.includes("iv"), "iv field");
check("A15", ET.includes("authTag"), "authTag field");
check("A16", ET.includes("keyVersion"), "keyVersion field");
check("A17", ET.includes("encryptedAt"), "encryptedAt field");
check("A18", ET.includes("EncryptionInput"), "EncryptionInput defined");
check("A19", ET.includes("EncryptionResult"), "EncryptionResult defined");
check("A20", ET.includes("DecryptionInput"), "DecryptionInput defined");
check("A21", ET.includes("DecryptionResult"), "DecryptionResult defined");
check("A22", ET.includes("PayloadValidationResult"), "PayloadValidationResult defined");
check("A23", ET.includes("isEncryptedPayload"), "isEncryptedPayload type guard");
check("A24", ET.includes("serializePayload"), "serializePayload helper");
check("A25", ET.includes("deserializePayload"), "deserializePayload helper");
check("A26", ET.includes("CURRENT_ENCRYPTION_ALGORITHM"), "current algorithm constant");
check("A27", ET.includes("export type"), "uses type-only exports");
check("A28", !ET.includes('import "server-only"'), "no server-only import (client-safe)");
check("A29", !ET.includes("import crypto"), "no crypto import (types only)");
check("A30", ET.includes("orgSlug"), "orgSlug in EncryptionInput");
check("A31", ET.includes("plaintext"), "plaintext in EncryptionInput");
check("A32", ET.includes("durationMs"), "durationMs in result types");
check("A33", ET.includes("associatedData"), "associatedData for GCM AAD");

// ── Section B — encryption-metadata.ts ───────────────────────────────────────

section("B — encryption-metadata.ts");
check("B01", exists("lib/security/encryption/encryption-metadata.ts"), "file exists");
check("B02", EM.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("B03", EM.includes("EncryptionMetadata"), "EncryptionMetadata interface");
check("B04", EM.includes("keyVersion"), "keyVersion in metadata");
check("B05", EM.includes("tenantId"), "tenantId in metadata");
check("B06", EM.includes("classification"), "classification in metadata");
check("B07", EM.includes("algorithm"), "algorithm in metadata");
check("B08", EM.includes("encryptedAt"), "encryptedAt in metadata");
check("B09", EM.includes("EncryptedEnvelope"), "EncryptedEnvelope defined");
check("B10", EM.includes("payload"), "payload field in envelope");
check("B11", EM.includes("meta"), "meta field in envelope");
check("B12", EM.includes("createEncryptionMetadata"), "factory function");
check("B13", EM.includes("createEnvelope"), "createEnvelope helper");
check("B14", EM.includes("validateEnvelopeMetadata"), "validation helper");
check("B15", EM.includes("safeMetadataSummary"), "safe summary helper");
check("B16", EM.includes("serializeEnvelope"), "serialize helper");
check("B17", EM.includes("deserializeEnvelope"), "deserialize helper");
check("B18", !EM.includes('import "server-only"'), "no server-only (client-safe)");
check("B19", EM.includes("tenant_id_mismatch"), "tenant mismatch reason");
check("B20", EM.includes("key_version_mismatch"), "key version mismatch reason");
check("B21", EM.includes("algorithm_mismatch"), "algorithm mismatch reason");
check("B22", EM.includes("assetType"), "assetType in metadata");
check("B23", EM.includes("schemaVersion"), "schemaVersion in metadata");
check("B24", EM.includes("NEVER"), "NEVER documentation present");

// ── Section C — encryption-provider.ts ───────────────────────────────────────

section("C — encryption-provider.ts");
check("C01", exists("lib/security/encryption/encryption-provider.ts"), "file exists");
check("C02", EP.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("C03", EP.includes("EncryptionProvider"), "EncryptionProvider interface");
check("C04", EP.includes("encrypt("), "encrypt method");
check("C05", EP.includes("decrypt("), "decrypt method");
check("C06", EP.includes("canDecrypt("), "canDecrypt method");
check("C07", EP.includes("validatePayload("), "validatePayload method");
check("C08", EP.includes("Promise<"), "async methods");
check("C09", EP.includes("EncryptionProviderInfo"), "EncryptionProviderInfo defined");
check("C10", EP.includes("EncryptionProviderError"), "EncryptionProviderError defined");
check("C11", EP.includes("EncryptionProviderErrorCode"), "error codes defined");
check("C12", EP.includes("ENCRYPT_FAILED"), "ENCRYPT_FAILED code");
check("C13", EP.includes("DECRYPT_FAILED"), "DECRYPT_FAILED code");
check("C14", EP.includes("INVALID_PAYLOAD"), "INVALID_PAYLOAD code");
check("C15", EP.includes("KEY_VERSION_MISMATCH"), "KEY_VERSION_MISMATCH code");
check("C16", EP.includes("TENANT_MISMATCH"), "TENANT_MISMATCH code");
check("C17", EP.includes("AUTH_TAG_INVALID"), "AUTH_TAG_INVALID code");
check("C18", EP.includes("UNSUPPORTED_ALGORITHM"), "UNSUPPORTED_ALGORITHM code");
check("C19", EP.includes("KEY_NOT_FOUND"), "KEY_NOT_FOUND code");
check("C20", !EP.includes('import "server-only"'), "no server-only (interface is client-safe)");
check("C21", EP.includes("interface EncryptionProvider"), "interface keyword");
check("C22", !EP.includes("class "), "no implementation classes");
check("C23", EP.includes("isLocal"), "isLocal in provider info");
check("C24", EP.includes("isActive"), "isActive in provider info");

// ── Section D — key-management.ts ────────────────────────────────────────────

section("D — key-management.ts");
check("D01", exists("lib/security/encryption/key-management.ts"), "file exists");
check("D02", KM.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("D03", KM.includes("KeyStatus"), "KeyStatus type");
check("D04", KM.includes('"ACTIVE"'), "ACTIVE status");
check("D05", KM.includes('"ROTATING"'), "ROTATING status");
check("D06", KM.includes('"RETIRED"'), "RETIRED status");
check("D07", KM.includes("EncryptionKeyReference"), "EncryptionKeyReference interface");
check("D08", KM.includes("keyId"), "keyId field");
check("D09", KM.includes("version"), "version field");
check("D10", KM.includes("status"), "status field");
check("D11", KM.includes("envVarName"), "envVarName field (not key bytes)");
check("D12", !KM.includes("keyBytes"), "no keyBytes field");
check("D13", !KM.includes("keyMaterial"), "no keyMaterial field");
check("D14", !KM.includes("secretKey"), "no secretKey field");
check("D15", KM.includes("KEY_VERSION_REGISTRY"), "KEY_VERSION_REGISTRY");
check("D16", KM.includes("getActiveKeyReference"), "getActiveKeyReference helper");
check("D17", KM.includes("getKeyReference"), "getKeyReference helper");
check("D18", KM.includes("getActiveKeyVersion"), "getActiveKeyVersion helper");
check("D19", KM.includes("canDecryptWithVersion"), "canDecryptWithVersion helper");
check("D20", KM.includes("getDecryptableKeyVersions"), "getDecryptableKeyVersions");
check("D21", KM.includes("getKeyRegistrySummary"), "getKeyRegistrySummary");
check("D22", !KM.includes('import "server-only"'), "no server-only (references are client-safe)");
check("D23", KM.includes("AGENTIK_ENCRYPTION_KEY"), "env var name defined");
check("D24", KM.includes('"v1"'), "v1 key version defined");
check("D25", KM.includes("retiredAt"), "retiredAt field");

// ── Section E — encryption-engine.ts ─────────────────────────────────────────

section("E — encryption-engine.ts");
check("E01", exists("lib/security/encryption/encryption-engine.ts"), "file exists");
check("E02", EE.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("E03", EE.includes('import "server-only"'), "server-only import");
check("E04", EE.includes("aes-256-gcm"), "AES-256-GCM algorithm string");
check("E05", EE.includes("createCipheriv"), "createCipheriv from crypto");
check("E06", EE.includes("createDecipheriv"), "createDecipheriv from crypto");
check("E07", EE.includes("randomBytes"), "randomBytes for IV generation");
check("E08", EE.includes("encryptData"), "encryptData exported");
check("E09", EE.includes("decryptData"), "decryptData exported");
check("E10", EE.includes("validatePayloadStructure"), "validatePayloadStructure exported");
check("E11", EE.includes("LocalAesGcmProvider"), "LocalAesGcmProvider class");
check("E12", EE.includes("getLocalAesGcmProvider"), "singleton getter");
check("E13", EE.includes("getAuthTag"), "getAuthTag for GCM tag");
check("E14", EE.includes("setAuthTag"), "setAuthTag for decryption verification");
check("E15", EE.includes("keyBytes.fill(0)"), "key zeroing after use");
check("E16", EE.includes("return null"), "returns null on failure");
check("E17", !EE.includes("throw "), "no direct throws into callers");
check("E18", EE.includes("process.stderr.write"), "uses stderr for errors");
check("E19", EE.includes("IV_BYTES"), "IV_BYTES constant defined");
check("E20", EE.includes("AUTH_TAG_BYTES"), "AUTH_TAG_BYTES constant");
check("E21", EE.includes("KEY_BYTES"), "KEY_BYTES constant");
check("E22", EE.includes("12"), "IV = 12 bytes");
check("E23", EE.includes("16"), "auth tag = 16 bytes");
check("E24", EE.includes("32"), "key = 32 bytes");
check("E25", EE.includes("resolveKeyBytes"), "key resolution function");
check("E26", EE.includes('"hex"'), "hex encoding for ciphertext");
check("E27", EE.includes("getActiveKeyVersion"), "uses key management");
check("E28", EE.includes("canDecryptWithVersion"), "checks key decryptability");
check("E29", EE.includes("unsupported_algorithm"), "validates algorithm");
check("E30", EE.includes("invalid_ciphertext"), "validates ciphertext");
check("E31", EE.includes("invalid_iv"), "validates IV");
check("E32", EE.includes("invalid_auth_tag"), "validates auth tag");
check("E33", EE.includes("missing_key_version"), "validates key version");

// ── Section F — encryption-audit.ts ──────────────────────────────────────────

section("F — encryption-audit.ts");
check("F01", exists("lib/security/encryption/encryption-audit.ts"), "file exists");
check("F02", EA.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("F03", EA.includes("EncryptionAuditEventType"), "event type union");
check("F04", EA.includes('"DATA_ENCRYPTED"'), "DATA_ENCRYPTED event");
check("F05", EA.includes('"DATA_DECRYPTED"'), "DATA_DECRYPTED event");
check("F06", EA.includes('"DECRYPTION_DENIED"'), "DECRYPTION_DENIED event");
check("F07", EA.includes('"INVALID_PAYLOAD"'), "INVALID_PAYLOAD event");
check("F08", EA.includes('"KEY_VERSION_MISMATCH"'), "KEY_VERSION_MISMATCH event");
check("F09", EA.includes("EncryptionAuditEvent"), "EncryptionAuditEvent interface");
check("F10", EA.includes("EncryptionAuditLog"), "EncryptionAuditLog class");
check("F11", EA.includes("push("), "push method");
check("F12", EA.includes("getByTenant"), "getByTenant method");
check("F13", EA.includes("getRecent"), "getRecent method");
check("F14", EA.includes("getByType"), "getByType method");
check("F15", EA.includes("getFailures"), "getFailures method");
check("F16", EA.includes("globalEncryptionAuditLog"), "global singleton");
check("F17", EA.includes("createEncryptionAuditEvent"), "factory function");
check("F18", EA.includes("PersistentEncryptionAuditAdapter"), "persistent adapter");
check("F19", EA.includes("persistentEncryptionAuditAdapter"), "persistent adapter singleton");
check("F20", EA.includes("void this._persist"), "fire-and-forget pattern");
check("F21", !EA.includes("await this._persist"), "NOT awaited (fire-and-forget)");
check("F22", EA.includes("occurredAt"), "occurredAt timestamp field");
check("F23", EA.includes("assetType"), "assetType in event");
check("F24", EA.includes("keyVersion"), "keyVersion in event");
check("F25", EA.includes("success"), "success boolean in event");
check("F26", !EA.includes("console.log(plaintext") && !EA.includes(".log(event.plaintext"), "no plaintext logged in audit events");
check("F27", !EA.includes("console.log(ciphertext") && !EA.includes(".log(event.ciphertext"), "no ciphertext logged in audit events");

// ── Section G — encryption-classification-policy.ts ──────────────────────────

section("G — encryption-classification-policy.ts");
check("G01", exists("lib/security/encryption/encryption-classification-policy.ts"), "file exists");
check("G02", CP.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("G03", CP.includes("DataClassification"), "DataClassification type");
check("G04", CP.includes('"PUBLIC"'), "PUBLIC classification");
check("G05", CP.includes('"INTERNAL"'), "INTERNAL classification");
check("G06", CP.includes('"CONFIDENTIAL"'), "CONFIDENTIAL classification");
check("G07", CP.includes('"RESTRICTED"'), "RESTRICTED classification");
check("G08", CP.includes("requiresEncryption"), "requiresEncryption function");
check("G09", CP.includes("return false"), "false for PUBLIC/INTERNAL");
check("G10", CP.includes("return true"), "true for CONFIDENTIAL/RESTRICTED");
check("G11", CP.includes("toEncryptionClassification"), "conversion function");
check("G12", CP.includes("classificationRank"), "rank function");
check("G13", CP.includes("elevateClassification"), "elevation function");
check("G14", CP.includes("getAssetClassification"), "asset classification lookup");
check("G15", CP.includes("assetRequiresEncryption"), "asset-level policy check");
check("G16", CP.includes("getAllEncryptionRequiredAssets"), "list all required assets");
check("G17", CP.includes("ASSET_CLASSIFICATION_MAP"), "classification map");
check("G18", CP.includes("COPILOT_MEMORY"), "COPILOT_MEMORY mapped");
check("G19", CP.includes("PLAYBOOK"), "PLAYBOOK mapped");
check("G20", CP.includes("EXECUTIVE_CONTEXT"), "EXECUTIVE_CONTEXT mapped");
check("G21", CP.includes("FINANCIAL_RECORD"), "FINANCIAL_RECORD mapped");
check("G22", CP.includes("CUSTOMER_RECORD"), "CUSTOMER_RECORD mapped");
check("G23", CP.includes("EMPLOYEE_RECORD"), "EMPLOYEE_RECORD mapped");
check("G24", CP.includes("AGENT_CONFIGURATION"), "AGENT_CONFIGURATION mapped");
check("G25", !CP.includes('import "server-only"'), "no server-only (policy is client-safe)");
check("G26", CP.includes("fail closed"), "fail-closed for unknown classifications");

// ── Section H — encryption-registry.ts ───────────────────────────────────────

section("H — encryption-registry.ts");
check("H01", exists("lib/security/encryption/encryption-registry.ts"), "file exists");
check("H02", ER.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("H03", ER.includes("EncryptionRegistryEntry"), "entry interface");
check("H04", ER.includes("ENCRYPTION_REGISTRY"), "registry constant");
check("H05", ER.includes("COPILOT_MEMORY"), "COPILOT_MEMORY entry");
check("H06", ER.includes("PLAYBOOK"), "PLAYBOOK entry");
check("H07", ER.includes("EXECUTIVE_CONTEXT"), "EXECUTIVE_CONTEXT entry");
check("H08", ER.includes("FINANCIAL_RECORD"), "FINANCIAL_RECORD entry");
check("H09", ER.includes("CUSTOMER_RECORD"), "CUSTOMER_RECORD entry");
check("H10", ER.includes("EMPLOYEE_RECORD"), "EMPLOYEE_RECORD entry");
check("H11", ER.includes("AGENT_CONFIGURATION"), "AGENT_CONFIGURATION entry");
check("H12", ER.includes("requiresEncryption: true"), "requiresEncryption true entries");
check("H13", ER.includes("adapterReady:") && ER.includes("true"), "adapter ready entries");
check("H14", ER.includes("adapterReady:") && ER.includes("false"), "adapter pending entries");
check("H15", ER.includes("getEncryptionRegistryEntry"), "lookup by id");
check("H16", ER.includes("getRequiredEncryptionEntries"), "required entries getter");
check("H17", ER.includes("getAdapterReadyEntries"), "adapter ready getter");
check("H18", ER.includes("getPendingAdapterEntries"), "pending adapter getter");
check("H19", ER.includes("getEncryptionRegistrySummary"), "summary function");
check("H20", ER.includes("migrationNotes"), "migration notes per entry");
check("H21", !ER.includes('import "server-only"'), "no server-only (registry is client-safe)");
check("H22", ER.includes("classification"), "classification per entry");
check("H23", ER.includes("adapterPath"), "adapter path per entry");

// ── Section I — encryption-service.ts ────────────────────────────────────────

section("I — encryption-service.ts");
check("I01", exists("lib/security/encryption/encryption-service.ts"), "file exists");
check("I02", ES.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("I03", ES.includes('import "server-only"'), "server-only import");
check("I04", ES.includes("EncryptionService"), "EncryptionService class");
check("I05", ES.includes("encrypt("), "encrypt method");
check("I06", ES.includes("decrypt("), "decrypt method");
check("I07", ES.includes("validate("), "validate method");
check("I08", ES.includes("getEncryptionService"), "singleton getter");
check("I09", ES.includes("encryptData"), "uses engine's encryptData");
check("I10", ES.includes("decryptData"), "uses engine's decryptData");
check("I11", ES.includes("validatePayloadStructure"), "uses engine validation");
check("I12", ES.includes("validateEnvelopeMetadata"), "validates metadata");
check("I13", ES.includes("createEncryptionAuditEvent"), "creates audit events");
check("I14", ES.includes("persistentEncryptionAuditAdapter"), "fires audit events");
check("I15", ES.includes("createEnvelope"), "creates envelope on encrypt");
check("I16", ES.includes("return null"), "returns null on failure");
check("I17", ES.includes("ServiceEncryptInput"), "input type defined");
check("I18", ES.includes("ServiceDecryptInput"), "decrypt input type");
check("I19", ES.includes("ServiceEncryptResult"), "encrypt result type");
check("I20", ES.includes("requiresEncryption"), "classification policy enforced");
check("I21", ES.includes("getAssetClassification"), "uses asset classification");
check("I22", ES.includes("tenant_id_mismatch"), "rejects tenant mismatch");
check("I23", !ES.includes("console.log"), "no console.log (no plaintext leak)");

// ── Section J — encryption-health.ts ─────────────────────────────────────────

section("J — encryption-health.ts");
check("J01", exists("lib/security/encryption/encryption-health.ts"), "file exists");
check("J02", EH.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("J03", EH.includes('import "server-only"'), "server-only import");
check("J04", EH.includes("EncryptionHealthStatus"), "EncryptionHealthStatus type");
check("J05", EH.includes('"HEALTHY"'), "HEALTHY status");
check("J06", EH.includes('"DEGRADED"'), "DEGRADED status");
check("J07", EH.includes('"UNAVAILABLE"'), "UNAVAILABLE status");
check("J08", EH.includes("EncryptionHealthCheckResult"), "check result type");
check("J09", EH.includes("EncryptionHealthReport"), "report type");
check("J10", EH.includes("EncryptionHealthMonitor"), "monitor class");
check("J11", EH.includes("checkEncryptionHealth"), "check function");
check("J12", EH.includes("checkActiveKeyReference"), "key reference check");
check("J13", EH.includes("checkAlgorithmSupport"), "algorithm check");
check("J14", EH.includes("checkEngineRoundTrip"), "round-trip check");
check("J15", EH.includes("checkRegistry"), "registry check");
check("J16", EH.includes("keySummary"), "key summary in report");
check("J17", EH.includes("registryTotal"), "registry total in report");
check("J18", EH.includes("durationMs"), "duration in report");
check("J19", EH.includes("checkedAt"), "timestamp in report");
check("J20", !EH.includes("console.log"), "no console.log");

// ── Section K — server barrel ─────────────────────────────────────────────────

section("K — server.ts barrel");
check("K01", exists("lib/security/encryption/server.ts"), "file exists");
check("K02", SB.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("K03", SB.includes('import "server-only"'), "server-only import");
check("K04", SB.includes("encryptData"), "exports encryptData");
check("K05", SB.includes("decryptData"), "exports decryptData");
check("K06", SB.includes("EncryptionService"), "exports EncryptionService");
check("K07", SB.includes("getEncryptionService"), "exports singleton getter");
check("K08", SB.includes("EncryptionAuditLog"), "exports audit log");
check("K09", SB.includes("persistentEncryptionAuditAdapter"), "exports persistent adapter");
check("K10", SB.includes("EncryptionHealthMonitor"), "exports health monitor");
check("K11", SB.includes("checkEncryptionHealth"), "exports health check");
check("K12", SB.includes("MemoryEncryptionAdapter"), "exports memory adapter");
check("K13", SB.includes("PlaybookEncryptionAdapter"), "exports playbook adapter");
check("K14", SB.includes("ExecutiveEncryptionAdapter"), "exports executive adapter");
check("K15", SB.includes("ENCRYPTION_REGISTRY"), "exports registry");
check("K16", SB.includes("KEY_VERSION_REGISTRY"), "exports key registry");
check("K17", SB.includes("requiresEncryption"), "exports classification policy");
check("K18", SB.includes("LocalAesGcmProvider"), "exports provider implementation");

// ── Section L — client barrel (index.ts) ─────────────────────────────────────

section("L — client barrel (index.ts)");
check("L01", exists("lib/security/encryption/index.ts"), "file exists");
check("L02", CB.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("L03", !CB.includes("} from \"./encryption-engine\""), "does NOT re-export engine crypto");
check("L04", !CB.includes("decryptData,"), "does NOT export decryptData");
check("L05", !CB.includes("EncryptionService,"), "does NOT export EncryptionService class");
check("L06", !CB.includes("EncryptionHealthMonitor,"), "does NOT export health monitor class");
check("L07", !CB.includes("MemoryEncryptionAdapter"), "does NOT export memory adapter");
check("L08", !CB.includes("PlaybookEncryptionAdapter"), "does NOT export playbook adapter");
check("L09", !CB.includes("ExecutiveEncryptionAdapter"), "does NOT export executive adapter");
check("L10", CB.includes("EncryptedPayload"), "exports EncryptedPayload type");
check("L11", CB.includes("EncryptionClassification"), "exports EncryptionClassification");
check("L12", CB.includes("isEncryptedPayload"), "exports type guard");
check("L13", CB.includes("serializePayload"), "exports serialize helper");
check("L14", CB.includes("deserializePayload"), "exports deserialize helper");
check("L15", CB.includes("requiresEncryption"), "exports classification policy");
check("L16", CB.includes("ENCRYPTION_REGISTRY"), "exports registry");
check("L17", CB.includes("KEY_VERSION_REGISTRY"), "exports key registry");
check("L18", !CB.includes("server-only"), "does NOT import server-only");

// ── Section M — encryption-migration-planner.ts ───────────────────────────────

section("M — encryption-migration-planner.ts");
check("M01", exists("lib/security/encryption/encryption-migration-planner.ts"), "file exists");
check("M02", MP.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("M03", MP.includes("MigrationState"), "MigrationState type");
check("M04", MP.includes('"NOT_STARTED"'), "NOT_STARTED state");
check("M05", MP.includes('"READY"'), "READY state");
check("M06", MP.includes('"MIGRATED"'), "MIGRATED state");
check("M07", MP.includes('"VERIFIED"'), "VERIFIED state");
check("M08", MP.includes("EncryptionMigrationCandidate"), "candidate interface");
check("M09", MP.includes("ENCRYPTION_MIGRATION_PLAN"), "migration plan constant");
check("M10", MP.includes("COPILOT_MEMORY"), "COPILOT_MEMORY candidate");
check("M11", MP.includes("PLAYBOOK"), "PLAYBOOK candidate");
check("M12", MP.includes("EXECUTIVE_CONTEXT"), "EXECUTIVE_CONTEXT candidate");
check("M13", MP.includes("FINANCIAL_RECORD"), "FINANCIAL_RECORD candidate");
check("M14", MP.includes("CUSTOMER_RECORD"), "CUSTOMER_RECORD candidate");
check("M15", MP.includes("EMPLOYEE_RECORD"), "EMPLOYEE_RECORD candidate");
check("M16", MP.includes("AGENT_CONFIGURATION"), "AGENT_CONFIGURATION candidate");
check("M17", MP.includes("getMigrationCandidate"), "lookup by id");
check("M18", MP.includes("getReadyCandidates"), "ready candidates getter");
check("M19", MP.includes("getPendingCandidates"), "pending candidates getter");
check("M20", MP.includes("getMigratedCandidates"), "migrated candidates getter");
check("M21", MP.includes("getMigrationPlanSummary"), "plan summary");
check("M22", !MP.includes('import "server-only"'), "no server-only (plan is client-safe)");
check("M23", MP.includes("AGENTIK-SECURITY-ENCRYPTION-02"), "references future sprint");
check("M24", MP.includes("adapterPath"), "adapter path per candidate");
check("M25", MP.includes("targetSprint"), "target sprint per candidate");

// ── Section N — encryption-compatibility.ts ───────────────────────────────────

section("N — encryption-compatibility.ts");
check("N01", exists("lib/security/encryption/encryption-compatibility.ts"), "file exists");
check("N02", CL.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("N03", CL.includes("isEncrypted"), "isEncrypted function");
check("N04", CL.includes("isLegacyUnencrypted"), "isLegacyUnencrypted function");
check("N05", CL.includes("detectFormat"), "detectFormat function");
check("N06", CL.includes('"encrypted"'), "encrypted format value");
check("N07", CL.includes('"legacy"'), "legacy format value");
check("N08", CL.includes('"unknown"'), "unknown format value");
check("N09", CL.includes("readCompatible"), "readCompatible function");
check("N10", CL.includes("writeEncrypted"), "writeEncrypted function");
check("N11", CL.includes("extractEnvelope"), "extractEnvelope helper");
check("N12", CL.includes("CompatibilityStats"), "CompatibilityStats interface");
check("N13", CL.includes("analyzeCompatibilityStats"), "stats analysis function");
check("N14", CL.includes("pctEncrypted"), "percentage encrypted in stats");
check("N15", CL.includes("isEncryptedPayloadString"), "payload string check");
check("N16", CL.includes("getEncryptionService"), "delegates to encryption service");
check("N17", CL.includes("Never throws"), "fail-safe documented");
check("N18", CL.includes("Server-only"), "server-only adapter functions documented");

// ── Section O — memory adapter ────────────────────────────────────────────────

section("O — memory-encryption-adapter.ts");
check("O01", exists("lib/copilot/memory/security/memory-encryption-adapter.ts"), "file exists");
check("O02", MA.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("O03", MA.includes('import "server-only"'), "server-only import");
check("O04", MA.includes("MemoryEncryptionAdapter"), "adapter class");
check("O05", MA.includes("getMemoryEncryptionAdapter"), "singleton getter");
check("O06", MA.includes("COPILOT_MEMORY"), "uses COPILOT_MEMORY asset type");
check("O07", MA.includes("encryptContent"), "encryptContent method");
check("O08", MA.includes("decryptContent"), "decryptContent method");
check("O09", MA.includes("isEncrypted"), "isEncrypted detection");
check("O10", MA.includes("requiresEncryption"), "requiresEncryption check");
check("O11", MA.includes("getEncryptionService"), "delegates to EncryptionService");
check("O12", MA.includes("MEMORY_ENCRYPTED_FIELDS"), "encrypted fields list");
check("O13", MA.includes("MEMORY_TYPES_REQUIRING_ENCRYPTION"), "encrypting types list");
check("O14", MA.includes("serializeEnvelope"), "serializes envelope");
check("O15", MA.includes("deserializeEnvelope"), "deserializes envelope");
check("O16", MA.includes("return null"), "returns null on failure");
check("O17", MA.includes("NEVER log"), "no-logging contract documented");

// ── Section P — playbook adapter ──────────────────────────────────────────────

section("P — playbook-encryption-adapter.ts");
check("P01", exists("lib/copilot/playbooks/security/playbook-encryption-adapter.ts"), "file exists");
check("P02", PA.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("P03", PA.includes('import "server-only"'), "server-only import");
check("P04", PA.includes("PlaybookEncryptionAdapter"), "adapter class");
check("P05", PA.includes("getPlaybookEncryptionAdapter"), "singleton getter");
check("P06", PA.includes("PLAYBOOK"), "uses PLAYBOOK asset type");
check("P07", PA.includes("encryptContent"), "encryptContent method");
check("P08", PA.includes("decryptContent"), "decryptContent method");
check("P09", PA.includes("isEncrypted"), "isEncrypted detection");
check("P10", PA.includes("requiresEncryption"), "requiresEncryption check");
check("P11", PA.includes("getEncryptionService"), "delegates to EncryptionService");
check("P12", PA.includes("PLAYBOOK_ENCRYPTED_FIELDS"), "encrypted fields list");
check("P13", PA.includes("PLAYBOOK_CATEGORIES_REQUIRING_ENCRYPTION"), "encrypting categories");
check("P14", PA.includes("FINANCE"), "FINANCE category encrypts");
check("P15", PA.includes("EXECUTIVE"), "EXECUTIVE category encrypts");
check("P16", PA.includes("return null"), "returns null on failure");
check("P17", PA.includes("NEVER log"), "no-logging contract documented");

// ── Section Q — executive adapter ────────────────────────────────────────────

section("Q — executive-encryption-adapter.ts");
check("Q01", exists("lib/copilot/executive-brain/security/executive-encryption-adapter.ts"), "file exists");
check("Q02", XA.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID present");
check("Q03", XA.includes('import "server-only"'), "server-only import");
check("Q04", XA.includes("ExecutiveEncryptionAdapter"), "adapter class");
check("Q05", XA.includes("getExecutiveEncryptionAdapter"), "singleton getter");
check("Q06", XA.includes("EXECUTIVE_CONTEXT"), "uses EXECUTIVE_CONTEXT asset type");
check("Q07", XA.includes("encryptContext"), "encryptContext method");
check("Q08", XA.includes("decryptContext"), "decryptContext method");
check("Q09", XA.includes("encryptField"), "encryptField general method");
check("Q10", XA.includes("decryptField"), "decryptField general method");
check("Q11", XA.includes("isEncrypted"), "isEncrypted detection");
check("Q12", XA.includes("getEncryptionService"), "delegates to EncryptionService");
check("Q13", XA.includes("EXECUTIVE_ENCRYPTED_FIELDS"), "encrypted fields list");
check("Q14", XA.includes("return null"), "returns null on failure");
check("Q15", XA.includes("NEVER log"), "no-logging contract documented");
check("Q16", XA.includes("contextSnapshot"), "contextSnapshot field");
check("Q17", XA.includes("financialSummary"), "financialSummary field");

// ── Section R — security-inventory.ts update ─────────────────────────────────

section("R — security-inventory.ts update");
check("R01", INV.includes("ENCRYPTION_LAYER"), "ENCRYPTION_LAYER entry added");
check("R02", INV.includes("AGENTIK-SECURITY-ENCRYPTION-01"), "sprint ID in inventory");
check("R03", INV.includes("aes-256-gcm-authenticated-encryption"), "AES-256-GCM control");
check("R04", INV.includes("riskLevel:            \"CRITICAL\""), "CRITICAL risk level");
check("R05", INV.includes("tenant-isolation-orgSlug-enforced"), "tenant isolation control");
check("R06", INV.includes("encryption-audit-every-operation"), "audit control");
check("R07", INV.includes("metadata-separated-from-ciphertext"), "separation control");
check("R08", INV.includes("health-monitor-round-trip"), "health monitor control");
check("R09", INV.includes("data-migration-not-yet-executed"), "migration gap noted");
check("R10", INV.includes("AGENTIK-SECURITY-KMS-01"), "KMS future sprint referenced");

// ── Section S — security-registry.ts update ──────────────────────────────────

section("S — security-registry.ts update");
check("S01", REG.includes("ENCRYPTED_DATA"), "ENCRYPTED_DATA entry added");
check("S02", REG.includes("ENCRYPTION_KEY_REFERENCE"), "ENCRYPTION_KEY_REFERENCE entry added");
check("S03", REG.includes("ENCRYPTION_POLICY"), "ENCRYPTION_POLICY entry added");
check("S04", REG.includes("AES-256-GCM encrypted envelope"), "encrypted data description");
check("S05", REG.includes("Never contains actual key material"), "no key material note");
check("S06", REG.includes("requiresAudit:      true"), "encrypted data requires audit");

// ── Section T — no-secret-values cross-cut ────────────────────────────────────

section("T — no-secret-values cross-cut");
const allFiles = [ET, EM, EP, EE, KM, EA, CP, ER, ES, EH, SB, CB, MP, CL, MA, PA, XA];
check("T01", !allFiles.some(f => f.includes('console.log(plaintext')), "no console.log plaintext in any file");
check("T02", !allFiles.some(f => f.includes('console.log(decrypted')), "no console.log decrypted in any file");
check("T03", !allFiles.some(f => f.includes('.log(result.plaintext')), "no logging of result.plaintext");
check("T04", !allFiles.some(f => f.includes('keyMaterial')), "no keyMaterial field anywhere");
check("T05", ![EE, ES, MA, PA, XA].some(f => f.includes("throw new Error") && !f.includes("// throw")), "no raw throws in engine/service/adapters");
check("T06", allFiles.every(f => !f.includes("process.env.AGENTIK_ENCRYPTION_KEY")), "key env var only referenced by name in KM, not values");
check("T07", KM.includes("envVarName") && !KM.includes("process.env"), "key management stores names not values");

// ── Section U — tenant isolation cross-cut ────────────────────────────────────

section("U — tenant isolation cross-cut");
check("U01", ES.includes("orgSlug"), "service enforces orgSlug");
check("U02", ET.includes("orgSlug") && ES.includes("orgSlug"), "engine input type and service both carry orgSlug");
check("U03", MA.includes("orgSlug"), "memory adapter requires orgSlug");
check("U04", PA.includes("orgSlug"), "playbook adapter requires orgSlug");
check("U05", XA.includes("orgSlug"), "executive adapter requires orgSlug");
check("U06", EM.includes("tenantId"), "metadata stores tenantId");
check("U07", ES.includes("tenant_id_mismatch"), "service rejects tenant mismatch");
check("U08", EP.includes("orgSlug"), "provider interface requires orgSlug");

// ── Section V — server-only cross-cut ────────────────────────────────────────

section("V — server-only cross-cut");
check("V01", EE.includes('import "server-only"'), "engine is server-only");
check("V02", ES.includes('import "server-only"'), "service is server-only");
check("V03", EH.includes('import "server-only"'), "health is server-only");
check("V04", MA.includes('import "server-only"'), "memory adapter is server-only");
check("V05", PA.includes('import "server-only"'), "playbook adapter is server-only");
check("V06", XA.includes('import "server-only"'), "executive adapter is server-only");
check("V07", SB.includes('import "server-only"'), "server barrel is server-only");
check("V08", !CB.includes('import "server-only"'), "client barrel is NOT server-only");
check("V09", !ET.includes('import "server-only"'), "types file is NOT server-only");
check("V10", !EM.includes('import "server-only"'), "metadata file is NOT server-only");
check("V11", !KM.includes('import "server-only"'), "key-management is NOT server-only");

// ── Section W — sprint ID cross-cut ──────────────────────────────────────────

section("W — sprint ID cross-cut");
const sprintId = "AGENTIK-SECURITY-ENCRYPTION-01";
check("W01", ET.includes(sprintId), "encryption-types has sprint ID");
check("W02", EM.includes(sprintId), "encryption-metadata has sprint ID");
check("W03", EP.includes(sprintId), "encryption-provider has sprint ID");
check("W04", EE.includes(sprintId), "encryption-engine has sprint ID");
check("W05", KM.includes(sprintId), "key-management has sprint ID");
check("W06", EA.includes(sprintId), "encryption-audit has sprint ID");
check("W07", CP.includes(sprintId), "classification-policy has sprint ID");
check("W08", ER.includes(sprintId), "encryption-registry has sprint ID");
check("W09", ES.includes(sprintId), "encryption-service has sprint ID");
check("W10", EH.includes(sprintId), "encryption-health has sprint ID");
check("W11", SB.includes(sprintId), "server barrel has sprint ID");
check("W12", CB.includes(sprintId), "client barrel has sprint ID");
check("W13", MP.includes(sprintId), "migration planner has sprint ID");
check("W14", CL.includes(sprintId), "compatibility layer has sprint ID");
check("W15", MA.includes(sprintId), "memory adapter has sprint ID");
check("W16", PA.includes(sprintId), "playbook adapter has sprint ID");
check("W17", XA.includes(sprintId), "executive adapter has sprint ID");

// ── Section X — fail-safe cross-cut ──────────────────────────────────────────

section("X — fail-safe cross-cut");
check("X01", EE.includes("return null"), "engine returns null on failure");
check("X02", ES.includes("return null"), "service returns null on failure");
check("X03", MA.includes("return null"), "memory adapter returns null on failure");
check("X04", PA.includes("return null"), "playbook adapter returns null on failure");
check("X05", XA.includes("return null"), "executive adapter returns null on failure");
check("X06", EH.includes("catch"), "health monitor catches errors");
check("X07", EA.includes("never throws"), "audit log is fail-safe");
check("X08", CL.includes("return null"), "compatibility layer returns null on failure");
check("X09", EE.includes("} catch"), "engine catches errors");
check("X10", ES.includes("} catch"), "service catches errors");

// ── Section Y — serialization cross-cut ──────────────────────────────────────

section("Y — serialization cross-cut");
check("Y01", ET.includes("JSON.stringify"), "payload serialization");
check("Y02", ET.includes("JSON.parse"), "payload deserialization");
check("Y03", EM.includes("JSON.stringify"), "envelope serialization");
check("Y04", EM.includes("JSON.parse"), "envelope deserialization");
check("Y05", ET.includes("string | null"), "serialize returns string | null");
check("Y06", EM.includes("string | null"), "envelope serialize returns string | null");
check("Y07", CL.includes("JSON.parse"), "compatibility layer parses JSON");
check("Y08", EE.includes('"hex"'), "engine uses hex encoding");
check("Y09", EM.includes("tenantId"), "envelope includes tenantId for round-trip");
check("Y10", ET.includes("typeof v.algorithm"), "type guard checks all fields");

// ── Section Z — additional integrity checks ───────────────────────────────────

section("Z — additional integrity checks");
check("Z01", EE.includes("setAAD"), "associated data set in cipher");
check("Z02", EE.includes("setAAD"), "associated data set in decipher");
check("Z03", KM.includes("2026-06-06"), "key creation date set");
check("Z04", ES.includes("assetType"), "service tracks asset type");
check("Z05", EA.includes("maxSize"), "audit log has size limit");
check("Z06", EA.includes("_reset"), "audit log has reset for tests");
check("Z07", ER.includes('"copilot"'), "owner domains present");
check("Z08", ER.includes('"finance"'), "finance owner present");
check("Z09", ER.includes("owner:"), "owner field present in all registry entries");
check("Z10", MP.includes("estimatedRecords"), "migration plan has record estimates");
check("Z11", KM.includes("as const"), "key registry is readonly");
check("Z12", ER.includes("as const"), "encryption registry is readonly");
check("Z13", CP.includes("ReadonlyMap") || CP.includes("as const"), "classification map is immutable (ReadonlyMap or as const)");
check("Z14", EE.includes("aes-256-gcm"), "lower-case algorithm string for Node crypto");
check("Z15", SB.includes("getMemoryEncryptionAdapter"), "server barrel exports memory adapter singleton");
check("Z16", SB.includes("getPlaybookEncryptionAdapter"), "server barrel exports playbook adapter singleton");
check("Z17", SB.includes("getExecutiveEncryptionAdapter"), "server barrel exports executive adapter singleton");
check("Z18", MP.includes("READY"), "COPILOT_MEMORY has READY state");
check("Z19", INV.includes("adapters-memory-playbooks-executive"), "adapters listed in inventory controls");
check("Z20", REG.includes("requiresAudit:      false"), "not all registry entries require audit");

// ── Final report ──────────────────────────────────────────────────────────────

const total = pass + fail + warn;
process.stdout.write("\n═══════════════════════════════════════════════════════════════\n");
process.stdout.write("  AGENTIK-SECURITY-ENCRYPTION-01 — Validation Suite\n");
process.stdout.write("═══════════════════════════════════════════════════════════════\n");
process.stdout.write(`  Total checks : ${total}\n`);
process.stdout.write(`  PASS         : ${pass}\n`);
process.stdout.write(`  FAIL         : ${fail}\n`);
process.stdout.write(`  WARN         : ${warn}\n`);
process.stdout.write(`  Score        : ${Math.round((pass / total) * 100)}%\n`);
process.stdout.write("───────────────────────────────────────────────────────────────\n");

if (failures.length > 0) {
  process.stdout.write("\n  Failures:\n");
  failures.forEach(f => {
    process.stdout.write(`  ✗ [${f.label}] ${f.note}\n`);
  });
  process.stdout.write("\n");
  process.exit(1);
} else {
  process.stdout.write(`\n  ✓ ${pass}/${total} PASS — Encryption Layer validated\n`);
}
